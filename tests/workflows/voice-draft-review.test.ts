import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VoiceDraftReview } from '../../src/components/phase3/VoiceDraftReview';
import { sampleCompanies } from '../../src/domain/platform';
import { prototypeFixture } from '../program/prototype-fixture';
import { prepareLocalJourney } from '../../src/lib/workflows/journey-runtime';
import {
  prepareVoiceDraftReview,
  selectedVoiceDraftLines,
} from '../../src/components/phase3/voice-draft-review';

afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const f = await prototypeFixture(sampleCompanies[index]);
  const item = (await f.repo.catalog(f.company.id))[0];
  const input = {
    transcript: `  2.125 ${item.unit} ${item.name}; measurements missing\n`,
  };
  const form = structuredClone(f.bundle.version.payload);
  form.internal_notes = 'Keep unfinished private notes';
  form.project.description = 'Keep the manual scope description';
  const context = { target: f.target, input, gate: f.gate };
  const gate = { enabled: true, confirmed: true };
  return {
    ...f,
    item,
    input,
    form,
    context,
    gate,
    prepare: () =>
      prepareVoiceDraftReview(f.repo, context, f.bundle, () => form, gate),
  };
}
it.each([0, 1, 2])(
  'brand %i: exact literal scope becomes editor lines without saving or replacing unfinished inputs',
  async (brand) => {
    const f = await fixture(brand);
    const before = await f.repo.history(f.company.id, f.target.estimate_id);
    const original = JSON.stringify(f.form);
    const review = await f.prepare();
    const lines = await selectedVoiceDraftLines(review, [0], true);
    expect(review.originalText).toBe(f.input.transcript);
    expect(review.expected).toBe(original);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: f.item.kind,
      catalog_item_id: f.item.id,
      description: f.item.description,
      unit: f.item.unit,
      quantity_milli: 2125,
      unit_cost_minor: f.item.unit_cost_minor,
      unit_price_minor: f.item.unit_price_minor,
      markup_bps: f.item.markup_bps,
    });
    expect(review.review.snapshot.clauses[1].suggestion).toBeNull();
    expect(review.review.snapshot.clauses[1].warning).toContain('no inference');
    expect(JSON.stringify(f.form)).toBe(original);
    expect(await f.repo.history(f.company.id, f.target.estimate_id)).toEqual(
      before,
    );
    expect(Object.values(review.review.snapshot.authority)).not.toContain(true);
  },
);
it('never applies missing quantities, unmatched clauses, duplicate selections or unconfirmed scope', async () => {
  const f = await fixture();
  const review = await f.prepare();
  for (const [selected, confirmed] of [
    [[1], true],
    [[0, 0], true],
    [[], true],
    [[0], false],
    [[-1], true],
    [[999], true],
  ] as const)
    await expect(
      selectedVoiceDraftLines(review, selected, confirmed),
    ).rejects.toThrow();
});
it.each(['transcript', 'form', 'review gate', 'context gate'])(
  'denies changed %s and retains the original native one-use review',
  async (kind) => {
    const f = await fixture();
    const review = await f.prepare();
    if (kind === 'transcript') f.input.transcript += ' changed';
    if (kind === 'form') f.form.internal_notes += ' changed';
    if (kind === 'review gate') f.gate.confirmed = false;
    if (kind === 'context gate') f.context.gate.enabled = false;
    await expect(selectedVoiceDraftLines(review, [0], true)).rejects.toThrow();
    expect(review.originalText).toContain('measurements missing');
  },
);
it('edits made while exact voice inspection awaits are preserved and cannot be overwritten', async () => {
  const f = await fixture();
  const review = await f.prepare();
  const pending = selectedVoiceDraftLines(review, [0], true);
  f.form.project.description = 'New manual input during inspection';
  await expect(pending).rejects.toThrow();
  expect(f.form.project.description).toBe('New manual input during inspection');
  expect(f.form.lines).toHaveLength(f.bundle.version.payload.lines.length);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'actor_id',
] as const)(
  'denies another %s instead of inferring a relationship',
  async (key) => {
    const f = await fixture();
    f.context.target[key] = 'foreign-source';
    await expect(f.prepare()).rejects.toThrow();
  },
);
it('revoked staff cannot use retained transcript or catalog pricing', async () => {
  const f = await fixture();
  const review = await f.prepare();
  const members = f.ops.syntheticMemberships.bind(f.ops);
  vi.spyOn(f.ops, 'syntheticMemberships').mockImplementation((org) =>
    members(org).map((m) =>
      m.user_id === f.target.actor_id ? { ...m, active: false } : m,
    ),
  );
  expect(review.catalog).toThrow();
  await expect(selectedVoiceDraftLines(review, [0], true)).rejects.toThrow();
});
it('current catalog price changes invalidate the original proposal without substituting prices', async () => {
  const f = await fixture();
  const review = await f.prepare();
  const read = f.repo.readSyntheticPrototypeSources.bind(f.repo);
  vi.spyOn(f.repo, 'readSyntheticPrototypeSources').mockImplementation(
    (target) => {
      const data = read(target);
      data.catalog.find((item) => item.id === f.item.id)!.unit_price_minor =
        987654;
      return data;
    },
  );
  await expect(selectedVoiceDraftLines(review, [0], true)).rejects.toThrow();
});
it('refuses issued versions; the existing explicit revision preserves the original issued job baseline', async () => {
  const j = await prepareLocalJourney(sampleCompanies[0], {
    enabled: true,
    confirmed: true,
  });
  const item = (await j.estimates.catalog(j.company.id))[0];
  const context = {
    target: j.target,
    input: { transcript: `2 ${item.unit} ${item.name}` },
    gate: j.gate,
  };
  const gate = { enabled: true, confirmed: true };
  await expect(
    prepareVoiceDraftReview(
      j.estimates,
      context,
      j.issued,
      () => j.issued.version.payload,
      gate,
    ),
  ).rejects.toThrow(/editable/);
  const issued = JSON.stringify(j.issued.version);
  const draft = await j.estimates.revise(j.company.id, j.issued);
  const form = structuredClone(draft.version.payload);
  const review = await prepareVoiceDraftReview(
    j.estimates,
    context,
    draft,
    () => form,
    gate,
  );
  const lines = await selectedVoiceDraftLines(review, [0], true);
  expect(lines).toHaveLength(1);
  expect(review.review.snapshot.target.version_id).toBe(draft.version.id);
  expect(review.review.snapshot.target.job_id).toBeNull();
  expect(
    j.estimates.syntheticJob(j.company.id, j.target.job_id!)?.baseline
      .issued_version_id,
  ).toBe(j.issued.version.id);
  expect(JSON.stringify(j.issued.version)).toBe(issued);
});
it('default-deny and executable transcript objects cannot read source data or acquire a review', async () => {
  const f = await fixture();
  f.gate.confirmed = false;
  await expect(f.prepare()).rejects.toThrow(/confirmation/);
  f.gate.confirmed = true;
  const getter = vi.fn(() => f.input.transcript);
  await expect(
    prepareVoiceDraftReview(
      f.repo,
      {
        ...f.context,
        input: {
          get transcript() {
            return getter();
          },
        },
      },
      f.bundle,
      () => f.form,
      f.gate,
    ),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('copied review handles cannot substitute catalog values or bypass source checks', async () => {
  const f = await fixture();
  const review = await f.prepare();
  expect(Object.isFrozen(review)).toBe(true);
  await expect(
    selectedVoiceDraftLines(
      {
        ...review,
        check: () => {},
        catalog: () => [{ ...f.item, unit_price_minor: 1 }],
      },
      [0],
      true,
    ),
  ).rejects.toThrow(/Original prepared/);
});
it('executable target values and gate accessors are rejected without invocation', async () => {
  const f = await fixture();
  const serialize = vi.fn(() => f.target.version_id);
  const target = { ...f.target, version_id: { toJSON: serialize } };
  await expect(
    prepareVoiceDraftReview(
      f.repo,
      { ...f.context, target: target as unknown as typeof f.target },
      f.bundle,
      () => f.form,
      f.gate,
    ),
  ).rejects.toThrow();
  expect(serialize).not.toHaveBeenCalled();
  const getter = vi.fn(() => true);
  await expect(
    prepareVoiceDraftReview(f.repo, f.context, f.bundle, () => f.form, {
      enabled: true,
      get confirmed() {
        return getter();
      },
    }),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('unconfirmed rendering does not execute transcript accessors', async () => {
  const f = await fixture();
  const getter = vi.fn(() => 'PRIVATE getter value');
  const context = {
    ...f.context,
    input: {
      get transcript() {
        return getter();
      },
    },
  };
  const html = renderToStaticMarkup(
    createElement(VoiceDraftReview, {
      repo: f.repo,
      context,
      bundle: f.bundle,
      liveDraft: () => f.form,
      onAppend: () => {
        throw Error('No append authorized');
      },
    }),
  );
  expect(getter).not.toHaveBeenCalled();
  expect(html).not.toContain('PRIVATE getter value');
});
