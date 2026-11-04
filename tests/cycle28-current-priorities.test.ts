import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const ui = vi.hoisted(() => ({ index: 0, seeds: new Map<number, unknown>() }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: ((initial: unknown) => {
      const index = ui.index++;
      return actual.useState(
        ui.seeds.has(index) ? ui.seeds.get(index) : initial,
      );
    }) as typeof actual.useState,
  };
});
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { readVerifiedOwnerBriefing } from '../src/lib/workflows/verified-owner-briefing';
import {
  verifyOwnerActionRequirements,
  continueVerifiedOwnerAction,
  compareOwnerActionRefresh,
  type OwnerActionVerificationResult,
} from '../src/lib/workflows/owner-action-verification';
import { OwnerActionVerification } from '../src/components/workflows/OwnerActionVerification';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  ui.index = 0;
  ui.seeds.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareCorrectionPreviewSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!,
    org = all.company.id;
  const read = () => readVerifiedOwnerBriefing(sources, job, gate);
  return { gate, all, entry, sources, job, org, read, view: await read() };
}
type F = Awaited<ReturnType<typeof fixture>>;
function selected(f: F, kind = 'finance') {
  const row = f.view.rows.find((r) => r.source.kind === kind)!;
  return { key: row.key, ...row.source };
}
function markup(f: F, result: OwnerActionVerificationResult) {
  ui.index = 0;
  ui.seeds = new Map([
    [1, f.view],
    [2, result.row ? { key: result.row.key, ...result.row.source } : undefined],
    [4, result],
  ] as [number, unknown][]);
  return renderToStaticMarkup(
    createElement(OwnerActionVerification, {
      sources: f.sources,
      selectedJobId: f.job,
      enabled: true,
    }),
  );
}
it.each([0, 1, 2])(
  'brand %i verified owner result shows the exact native workflow state and original suggested review',
  async (brand) => {
    const f = await fixture(brand),
      result = await verifyOwnerActionRequirements(f.view, selected(f)),
      row = f.view.rows.find((r) => r.key === selected(f).key)!;
    expect(result.row).toBe(row);
    const html = markup(f, result);
    expect(html).toContain('Original suggested human review');
    expect(html).toContain(row.suggested_human_review);
    expect(html).toContain(row.state);
    expect(html).toContain('Recommendations are not recorded actions.');
    expect(result.operational_authority).toBe(false);
  },
);
it.each([0, 1, 2])(
  'brand %i saved native material approval updates current owner facts while the original review instruction never becomes completion',
  async (brand) => {
    const f = await fixture(brand),
      selection = selected(f),
      before = await verifyOwnerActionRequirements(f.view, selection),
      old = JSON.stringify(before);
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      f.view.original.costs.material.expense_id!,
      'approved',
      'Explicit native internal review',
    );
    expect(markup(f, before)).not.toContain('Original suggested human review');
    const view = await f.read(),
      refresh = compareOwnerActionRefresh(f.view, view, selection);
    expect(refresh.selection).toBeNull();
    const current = await verifyOwnerActionRequirements(
        view,
        selected({ ...f, view }),
      ),
      html = markup({ ...f, view }, current);
    expect(current.row!.facts).not.toEqual(before.row!.facts);
    expect(html).toContain(current.row!.suggested_human_review);
    expect(html).toContain('RECORDED_FINANCE_REQUIREMENTS');
    expect(html).toContain('NO_GO');
    expect(current.operational_authority).toBe(false);
    expect(JSON.stringify(before)).toBe(old);
  },
);
it.each([0, 1, 2])(
  'brand %i revised native visit never substitutes its previous priority or suggests completed work',
  async (brand) => {
    const f = await fixture(brand),
      selection = selected(f, 'visit'),
      visit = f.sources.property
        .read(f.org)
        .visits.find((v) => v.id === selection.id)!;
    f.sources.property.saveVisit(f.org, visit, {
      ...visit.content,
      summary: 'Explicit later recorded visit',
    });
    const view = await f.read(),
      result = await verifyOwnerActionRequirements(view, selection),
      html = markup({ ...f, view }, result);
    expect(result.status).toBe('UNKNOWN_SOURCE_MISSING');
    expect(result.inspection).toBeNull();
    expect(html).not.toContain('Original suggested human review');
    expect(html).toContain(
      'No completion, resolution or replacement is inferred.',
    );
    const row = view.rows.find((r) => r.source.id === selection.id)!;
    expect(row.source.revision).toBe(selection.revision! + 1);
  },
);
it.each([0, 1, 2])(
  'brand %i revoked staff cannot retain a previous priority review instruction or source state',
  async (brand) => {
    const f = await fixture(brand),
      result = await verifyOwnerActionRequirements(f.view, selected(f)),
      original = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      );
    vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
      (org) =>
        original(org).map((m) =>
          m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
        ),
    );
    const html = markup(f, result);
    expect(html).not.toContain(result.row!.suggested_human_review);
    expect(html).not.toContain(result.row!.state);
    expect(html).toContain('Exact owner source or staff access changed.');
  },
);
it('foreign and sibling sources cannot borrow this company current review instruction', async () => {
  const f = await fixture(),
    other = await fixture(1),
    result = await verifyOwnerActionRequirements(f.view, selected(other));
  expect(result.row).toBeNull();
  expect(result.inspection).toBeNull();
  expect(result.can_open_original).toBe(false);
  const sibling = await readVerifiedOwnerBriefing(
    { ...f.all, entries: [f.all.entries[1]] },
    f.all.entries[1].target.job_id!,
    f.gate,
  );
  const otherRow = sibling.rows.find((r) => r.source.kind === 'finance')!;
  expect(
    (
      await verifyOwnerActionRequirements(f.view, {
        key: otherRow.key,
        ...otherRow.source,
      })
    ).row,
  ).toBeNull();
});
it('current visible instructions cannot renew confirmation or UNKNOWN original navigation during competing opens', async () => {
  const f = await fixture(),
    selection = selected(f),
    result = await verifyOwnerActionRequirements(f.view, selection),
    callback = vi.fn(() => {
      throw Error('Lost exact ACK');
    }),
    live = { current: callback, generation: 0 };
  expect(
    (
      await continueVerifiedOwnerAction(
        f.view,
        selection,
        result.inspection!,
        false,
        callback,
        live,
      )
    ).status,
  ).toBe('WITHHELD_NO_DISPATCH');
  expect(callback).not.toHaveBeenCalled();
  const outcomes = await Promise.all([
    continueVerifiedOwnerAction(
      f.view,
      selection,
      result.inspection!,
      true,
      callback,
      live,
    ),
    continueVerifiedOwnerAction(
      f.view,
      selection,
      result.inspection!,
      true,
      callback,
      live,
    ),
  ]);
  expect(outcomes.some((r) => r.status === 'UNKNOWN')).toBe(true);
  expect(callback).toHaveBeenCalledTimes(1);
  await expect(f.read()).rejects.toThrow();
  expect(result.operational_authority).toBe(false);
});
it('default OFF remains source-free and has no suggestion authority', () => {
  const getter = vi.fn(() => {
      throw Error('Private access');
    }),
    sources = Object.defineProperty({}, 'company', { get: getter });
  ui.index = 0;
  ui.seeds.clear();
  expect(
    renderToStaticMarkup(
      createElement(OwnerActionVerification, {
        sources: sources as never,
        enabled: false,
      }),
    ),
  ).toContain('Owner action verification is OFF.');
  expect(getter).not.toHaveBeenCalled();
});
