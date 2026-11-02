import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import {
  readCompletionReview,
  prepareCompletionReview,
  reconcileCompletionReview,
  openCompletionSource,
  type CompletionReviewConfirmation,
} from '../src/lib/workflows/completion-review';
afterEach(() => vi.restoreAllMocks());
const confirmation = (): CompletionReviewConfirmation => ({
  confirmed: true,
  checks: { scope: true, documentation: true, limitations: true },
});
async function fixture(index = 0) {
  const sources = await prepareLocalJourney(sampleCompanies[index], {
    enabled: true,
    confirmed: true,
  });
  return {
    sources,
    selection: {
      report_id: sources.report_id,
      published_version: sources.published_version,
    },
    gate: { enabled: true, confirmed: true },
  };
}
it.each([0, 1, 2])(
  'brand %s compares exact safe job and report, creates existing-engine immutable proof without side effects',
  async (index) => {
    const { sources: f, selection, gate } = await fixture(index),
      before = f.property.read(f.company.id),
      release = f.release.read('staff');
    const writers = [
      vi.spyOn(f.release, 'command'),
      vi.spyOn(f.property, 'publish'),
      vi.spyOn(f.property, 'saveVisit'),
      vi.spyOn(f.estimates, 'issue'),
      vi.spyOn(f.estimates, 'approveJob'),
      vi.spyOn(f.customerModel, 'prepareHistory'),
    ];
    const view = await readCompletionReview(f, selection, gate);
    expect(view.contractor.name).toBe(f.company.name);
    expect(view.job.reference.issued_version_id).toBe(f.target.version_id);
    expect(view.report.reference).toMatchObject({
      report_id: f.report_id,
      published_version: f.published_version,
    });
    expect(
      view.job.lines.every((l) => l.documentation_match === 'NOT_ESTABLISHED'),
    ).toBe(true);
    expect(view.coverage).toMatchObject({
      history_completeness: 'UNKNOWN',
      after_phase_recorded: true,
      checklist_recorded: 1,
      checklist_recorded_checked: 1,
      media: 'UNAVAILABLE',
      line_to_finding_links: 'NOT_RECORDED',
    });
    expect(view.report.observations).toHaveLength(1);
    expect(view.report.observations[0]).toMatchObject({
      observation: 'A weathered exterior joint was documented.',
      recommendation: 'Plan a separate maintenance assessment.',
    });
    const packet = await prepareCompletionReview(view, confirmation());
    expect(packet.proof_of_work.snapshot.events).toHaveLength(2);
    expect(packet.proof_of_work.reference.pack_id).toMatch(/^synthetic-proof-/);
    expect(packet.integrity.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(packet.physical_completion).toBe('UNVERIFIED');
    expect(packet.customer_acceptance).toBe('UNVERIFIED');
    expect(packet.delivery).toBe('NOT_SENT');
    expect(Object.isFrozen(packet.review.report.observations)).toBe(true);
    expect((await reconcileCompletionReview(packet)).status).toBe(
      'CURRENT_REVIEW_ONLY',
    );
    expect(await openCompletionSource(view)).toEqual(view.report);
    expect(JSON.stringify(packet)).not.toMatch(
      /PRIVATE|unit_cost_minor|amount_minor|internal_notes|profit_margin|payroll|actor_id|worker_id|supplier|staff_type/,
    );
    expect(f.property.read(f.company.id)).toEqual(before);
    expect(f.release.read('staff')).toEqual(release);
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
  },
);
it('is OFF before any source read', async () => {
  const { sources, selection } = await fixture();
  const reader = vi.spyOn(sources.customerModel, 'read');
  await expect(readCompletionReview(sources, selection)).rejects.toThrow(/OFF/);
  expect(reader).not.toHaveBeenCalled();
});
it.each([
  'organization_id',
  'actor_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'version_id',
  'job_id',
] as const)('rejects foreign %s', async (key) => {
  const { sources, selection, gate } = await fixture();
  sources.target[key] = 'foreign';
  await expect(
    readCompletionReview(sources, selection, gate),
  ).rejects.toThrow();
});
it.each([0, -1, 1.5, 2, Number.NaN])(
  'rejects missing or invalid exact report version %s without choosing latest',
  async (version) => {
    const { sources, selection, gate } = await fixture();
    selection.published_version = version;
    await expect(
      readCompletionReview(sources, selection, gate),
    ).rejects.toThrow();
  },
);
it('rejects wrong report and a foreign customer model instance', async () => {
  const { sources, selection, gate } = await fixture(),
    other = await fixture();
  await expect(
    readCompletionReview(
      sources,
      { ...selection, report_id: crypto.randomUUID() },
      gate,
    ),
  ).rejects.toThrow();
  await expect(
    readCompletionReview(
      { ...sources, customerModel: other.sources.customerModel },
      selection,
      gate,
    ),
  ).rejects.toThrow();
});
it('never treats matching textual descriptions as evidence that a scoped line was completed', async () => {
  const { sources, selection, gate } = await fixture();
  const view = await readCompletionReview(sources, selection, gate);
  expect(
    view.job.lines.every((l) => l.documentation_match === 'NOT_ESTABLISHED'),
  ).toBe(true);
  expect(view.interpretation).toMatchObject({
    physical_completion: 'UNVERIFIED',
    repair_status: 'NOT_INFERRED',
  });
});
it('requires current staff after the initial customer-safe read', async () => {
  const { sources: f, selection, gate } = await fixture(),
    view = await readCompletionReview(f, selection, gate);
  await f.operations.configure(
    f.company.id,
    'active',
    'starter',
    {},
    f.company.id + '-backup-owner',
  );
  await f.operations.revokeOwner(f.company.id, f.target.actor_id);
  await expect(prepareCompletionReview(view, confirmation())).rejects.toThrow();
  await expect(openCompletionSource(view)).rejects.toThrow();
});
it('freezes historical summary when a later report extends available history', async () => {
  const { sources: f, selection, gate } = await fixture(),
    view = await readCompletionReview(f, selection, gate),
    packet = await prepareCompletionReview(view, confirmation()),
    saved = JSON.stringify(packet);
  let visit = f.property.addVisit(
    f.company.id,
    f.plan_id,
    '2026-12-14',
    'after',
  );
  f.property.saveVisit(f.company.id, visit, {
    summary: 'A separate later published observation.',
    internal_notes: 'PRIVATE',
    findings: [],
    checklist: [],
  });
  visit = f.property.read(f.company.id).visits.find((v) => v.id === visit.id)!;
  f.property.submit(f.company.id, visit);
  visit = f.property.read(f.company.id).visits.find((v) => v.id === visit.id)!;
  f.property.publish(f.company.id, visit);
  expect((await reconcileCompletionReview(packet)).status).toBe('UNKNOWN');
  expect((await reconcileCompletionReview(packet)).status).toBe('UNKNOWN');
  expect(JSON.stringify(packet)).toBe(saved);
  await expect(openCompletionSource(view)).rejects.toThrow();
});
it('prevents concurrent duplicate and replacement-view preparation', async () => {
  const { sources, selection, gate } = await fixture(),
    view = await readCompletionReview(sources, selection, gate),
    outcomes = await Promise.allSettled([
      prepareCompletionReview(view, confirmation()),
      prepareCompletionReview(view, confirmation()),
    ]);
  expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  const fresh = await readCompletionReview(sources, selection, gate);
  await expect(prepareCompletionReview(fresh, confirmation())).rejects.toThrow(
    /already attempted/,
  );
});
it('losing final packet acknowledgment permanently withholds retry on a new read', async () => {
  const { sources, selection, gate } = await fixture(),
    view = await readCompletionReview(sources, selection, gate),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'IMMUTABLE_COMPLETION_DOCUMENTATION_REVIEW') {
      reached = true;
      throw Error('Lost result');
    }
    return digest(...args);
  });
  await expect(prepareCompletionReview(view, confirmation())).rejects.toThrow();
  expect(reached).toBe(true);
  vi.restoreAllMocks();
  const fresh = await readCompletionReview(sources, selection, gate);
  await expect(prepareCompletionReview(fresh, confirmation())).rejects.toThrow(
    /already attempted/,
  );
});
it.each(['selection', 'target', 'gate', 'confirmation', 'logout'] as const)(
  'rechecks original %s after the final immutable packet hash',
  async (change) => {
    const { sources, selection, gate } = await fixture(),
      view = await readCompletionReview(sources, selection, gate),
      confirm = confirmation(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.mode === 'IMMUTABLE_COMPLETION_DOCUMENTATION_REVIEW') {
        reached = true;
        if (change === 'selection') selection.published_version = 2;
        if (change === 'target') sources.target.location_id = 'foreign';
        if (change === 'gate') gate.confirmed = false;
        if (change === 'confirmation') confirm.confirmed = false;
        if (change === 'logout') sources.customerModel.logout();
      }
      return result;
    });
    await expect(prepareCompletionReview(view, confirm)).rejects.toThrow();
    expect(reached).toBe(true);
  },
);
it('does not invoke accessor or coercive selection input', async () => {
  const { sources, selection, gate } = await fixture();
  let invoked = false;
  const evil = Object.defineProperty({ ...selection }, 'report_id', {
    enumerable: true,
    get() {
      invoked = true;
      return sources.report_id;
    },
  });
  await expect(readCompletionReview(sources, evil, gate)).rejects.toThrow();
  await expect(
    readCompletionReview(
      sources,
      {
        ...selection,
        published_version: {
          valueOf() {
            invoked = true;
            return 1;
          },
        },
      } as never,
      gate,
    ),
  ).rejects.toThrow();
  expect(invoked).toBe(false);
});
it('requires all explicit review sections before consuming the sole preparation attempt', async () => {
  const { sources, selection, gate } = await fixture(),
    view = await readCompletionReview(sources, selection, gate);
  for (const bad of [
    { ...confirmation(), confirmed: false },
    {
      ...confirmation(),
      checks: { scope: false, documentation: true, limitations: true },
    },
    {
      ...confirmation(),
      checks: { scope: true, documentation: true, limitations: false },
    },
  ])
    await expect(prepareCompletionReview(view, bad)).rejects.toThrow();
  expect((await prepareCompletionReview(view, confirmation())).delivery).toBe(
    'NOT_SENT',
  );
});
it('rejects imported snapshots and reconciling a reconstructed packet', async () => {
  const { sources, selection, gate } = await fixture(),
    view = await readCompletionReview(sources, selection, gate);
  await expect(
    prepareCompletionReview(JSON.parse(JSON.stringify(view)), confirmation()),
  ).rejects.toThrow();
  const packet = await prepareCompletionReview(view, confirmation());
  expect(
    (await reconcileCompletionReview(JSON.parse(JSON.stringify(packet))))
      .status,
  ).toBe('UNKNOWN');
});
