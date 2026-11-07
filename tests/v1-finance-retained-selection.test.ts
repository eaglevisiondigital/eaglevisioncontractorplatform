import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  assertRecordedCostRequirementsCurrent,
  readRecordedCostRequirements,
} from '../src/lib/workflows/recorded-cost-requirements';
import { assertCostCorrectionReviewAccess } from '../src/lib/workflows/cost-correction-review';
import { compareCostSavedRevisions } from '../src/lib/workflows/cost-saved-revisions';
import {
  continueCostCoverageAction,
  refreshCostCoverageActionSelection,
  validateCostCoverageAction,
} from '../src/lib/workflows/cost-coverage-actions';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const observations: unknown[] = [];
afterAll(() => {
  mkdirSync('test-results/v1-finance-retained-selection', {
    recursive: true,
  });
  writeFileSync(
    'test-results/v1-finance-retained-selection/observations.json',
    JSON.stringify(observations, null, 2) + '\n',
  );
});

async function fixture(brand: number) {
  const sourceGate = { enabled: true, confirmed: true },
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      sourceGate,
    ),
    entry = sources.entries[0],
    org = sources.company.id,
    job = entry.target.job_id!,
    beforeGate = { enabled: true, confirmed: true },
    currentGate = { enabled: true, confirmed: true };
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-retained-finance-backup-owner',
  );
  const read = () => readRecordedCostRequirements(sources, job, currentGate),
    before = await readRecordedCostRequirements(sources, job, beforeGate),
    row = before.original.rows.find((r) => r.kind === 'time');
  if (!row) throw Error('Original recorded time source required');
  return {
    sources,
    entry,
    org,
    job,
    beforeGate,
    currentGate,
    read,
    before,
    row,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Change = 'unrelated_material_review' | 'unrelated_forecast';
async function change(f: Fixture, kind: Change) {
  if (kind === 'unrelated_material_review') {
    const id = f.before.original.original.material.expense_id;
    if (!id) throw Error('Original pending native expense required');
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      id,
      'approved',
      'Explicit original unrelated material review',
    );
  } else {
    const job = f.sources.estimates.syntheticJob(f.org, f.job)!;
    await f.sources.estimates.projection(f.org, job, {
      ...job.projection,
      remaining: {
        ...job.projection.remaining,
        other: job.projection.remaining.other + 1250,
      },
    });
  }
}
function writers(f: Fixture) {
  return [
    vi.spyOn(f.sources.estimates, 'save'),
    vi.spyOn(f.sources.estimates, 'issue'),
    vi.spyOn(f.sources.estimates, 'approveJob'),
    vi.spyOn(f.sources.estimates, 'assignJob'),
    vi.spyOn(f.sources.estimates, 'recordTime'),
    vi.spyOn(f.sources.estimates, 'submitExpense'),
    vi.spyOn(f.sources.estimates, 'reviewExpense'),
    vi.spyOn(f.sources.estimates, 'projection'),
    vi.spyOn(f.sources.property, 'savePlan'),
    vi.spyOn(f.sources.property, 'saveVisit'),
    vi.spyOn(f.sources.property, 'publish'),
    vi.spyOn(f.sources.operations, 'recordConsent'),
    vi.spyOn(f.sources.operations, 'assignIntake'),
    vi.spyOn(f.entry.release, 'command'),
    vi.spyOn(globalThis, 'fetch'),
  ];
}

for (const brand of [0, 1, 2]) {
  for (const kind of [
    'unrelated_material_review',
    'unrelated_forecast',
  ] as const) {
    it(`brand ${brand}: ${kind} retains only the unchanged exact time selection for fresh reverification`, async () => {
      const f = await fixture(brand),
        original = JSON.stringify(f.before),
        beforeTime = f.before.original.original.costs.evidence.time.find(
          (r) => r.id === f.row.id,
        );
      await change(f, kind);
      const calls = writers(f),
        current = await f.read(),
        currentRow = current.original.rows.find((r) => r.key === f.row.key),
        currentTime = current.original.original.costs.evidence.time.find(
          (r) => r.id === f.row.id,
        ),
        identity = current.original.original.costs.identity,
        native = f.sources.estimates.readSyntheticPrototypeSources(
          f.entry.target,
        ),
        canonical = jobFinancials(native.job!),
        property = f.sources.property.read(f.org),
        release = f.entry.release.read('staff');
      expect(currentRow).toBeDefined();
      expect(JSON.stringify(currentRow)).toBe(JSON.stringify(f.row));
      expect(currentTime).toEqual(beforeTime);
      expect(identity).toEqual(f.before.original.original.costs.identity);
      expect(identity).toMatchObject({
        organization_id: f.org,
        customer_id: f.entry.target.customer_id,
        location_id: f.entry.target.location_id,
        estimate_id: f.entry.target.estimate_id,
        version_id: f.entry.target.version_id,
        job_id: f.job,
      });
      expect(
        current.original.original.costs.evidence.job_revision,
      ).toBeGreaterThan(f.before.original.original.costs.evidence.job_revision);
      expect(() => assertRecordedCostRequirementsCurrent(f.before)).toThrow();
      expect(() =>
        assertRecordedCostRequirementsCurrent(current),
      ).not.toThrow();
      expect(() =>
        assertCostCorrectionReviewAccess(f.before.original.original),
      ).not.toThrow();
      expect(() =>
        compareCostSavedRevisions(
          f.before.original.original.costs,
          current.original.original.costs,
        ),
      ).not.toThrow();
      const retained = refreshCostCoverageActionSelection(
        f.before,
        current,
        f.row.key,
      );
      observations.push({
        brand,
        change: kind,
        same_exact_canonical_time_row:
          JSON.stringify(currentRow) === JSON.stringify(f.row),
        same_exact_time_evidence:
          JSON.stringify(currentTime) === JSON.stringify(beforeTime),
        same_original_identity:
          JSON.stringify(identity) ===
          JSON.stringify(f.before.original.original.costs.identity),
        native_member_active: f.sources.operations
          .syntheticMemberships(f.org)
          .find((r) => r.user_id === f.entry.target.actor_id)!.active,
        previous_job_revision:
          f.before.original.original.costs.evidence.job_revision,
        current_job_revision:
          current.original.original.costs.evidence.job_revision,
        retained_status: retained.status,
        selection_key: retained.selection_key,
        confirmation_retained: retained.previous_confirmation_retained,
      });
      expect(retained.status).toBe('UNCHANGED_SOURCE_REVERIFY_REQUIRED');
      expect(retained.selection_key).toBe(f.row.key);
      expect(retained.input).toEqual({
        kind: f.row.kind,
        id: f.row.id,
        expected_job_revision:
          current.original.original.costs.evidence.job_revision,
        purpose: 'cost_review',
      });
      expect(retained.requires_verification).toBe(true);
      expect(retained.previous_confirmation_retained).toBe(false);
      expect(retained).not.toHaveProperty('inspection');
      const verified = validateCostCoverageAction(current, retained.input!);
      expect(verified.source).toBe(currentRow);
      expect(verified.canonical_totals.categories).toEqual(
        canonical.categories,
      );
      expect(verified.canonical_totals.projected_cost_minor).toBe(
        canonical.projected_cost_minor,
      );
      expect(verified.canonical_totals.projected_profit_minor).toBe(
        canonical.projected_profit_minor,
      );
      expect(verified.cost_coverage).toBe('UNKNOWN');
      expect(verified.invoice_overall).toBe('NO_GO');
      expect(verified.invoice_prepared).toBe(false);
      expect(verified.financial_execution).toBe(false);
      const callback = vi.fn();
      expect(
        await continueCostCoverageAction(
          current,
          retained.input!,
          false,
          callback,
          { current: callback, generation: 0 },
        ),
      ).toMatchObject({ status: 'WITHHELD_NO_DISPATCH' });
      expect(callback).not.toHaveBeenCalled();
      expect(JSON.stringify(f.before)).toBe(original);
      expect(
        f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
      ).toEqual(native);
      expect(f.sources.property.read(f.org)).toEqual(property);
      expect(f.entry.release.read('staff')).toEqual(release);
      for (const call of calls) expect(call).not.toHaveBeenCalled();
    });
  }

  it(`brand ${brand}: a changed selected material row still clears presentation and original confirmation`, async () => {
    const f = await fixture(brand),
      id = f.before.original.original.material.expense_id!,
      row = f.before.original.rows.find(
        (r) => r.kind === 'material' && r.id === id,
      )!;
    await change(f, 'unrelated_material_review');
    const calls = writers(f),
      current = await f.read();
    expect(current.original.rows.find((r) => r.key === row.key)).not.toEqual(
      row,
    );
    expect(
      refreshCostCoverageActionSelection(f.before, current, row.key),
    ).toMatchObject({
      status: 'STALE_SOURCE_RESELECT_REQUIRED',
      selection_key: null,
      input: null,
      requires_verification: true,
      previous_confirmation_retained: false,
    });
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: actual native owner revocation denies historical refresh and exposes no retained selection`, async () => {
    const f = await fixture(brand),
      current = await f.read();
    await f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
    expect(
      f.sources.operations
        .syntheticMemberships(f.org)
        .find((r) => r.user_id === f.entry.target.actor_id)!.active,
    ).toBe(false);
    expect(() =>
      refreshCostCoverageActionSelection(f.before, current, f.row.key),
    ).toThrow();
    expect(() =>
      assertCostCorrectionReviewAccess(f.before.original.original),
    ).toThrow();
  });

  it(`brand ${brand}: withdrawn earlier admission cannot borrow a separately admitted current view`, async () => {
    const f = await fixture(brand),
      current = await f.read();
    f.beforeGate.confirmed = false;
    expect(() => assertRecordedCostRequirementsCurrent(current)).not.toThrow();
    expect(
      refreshCostCoverageActionSelection(f.before, current, f.row.key),
    ).toMatchObject({
      status: 'STALE_SOURCE_RESELECT_REQUIRED',
      selection_key: null,
      input: null,
      previous_confirmation_retained: false,
    });
  });

  it(`brand ${brand}: another same-property job and a foreign company cannot replace historical source context`, async () => {
    const f = await fixture(brand),
      sibling = f.sources.entries[3];
    expect(sibling.target.customer_id).toBe(f.entry.target.customer_id);
    expect(sibling.target.location_id).toBe(f.entry.target.location_id);
    expect(sibling.target.job_id).not.toBe(f.job);
    const otherJob = await readRecordedCostRequirements(
      f.sources,
      sibling.target.job_id!,
      f.currentGate,
    );
    expect(() =>
      refreshCostCoverageActionSelection(f.before, otherJob, f.row.key),
    ).toThrow();
    const other = await fixture((brand + 1) % 3);
    expect(() =>
      refreshCostCoverageActionSelection(f.before, other.before, f.row.key),
    ).toThrow();
  });

  it(`brand ${brand}: copied opaque historical or current wrappers cannot retain a selected source`, async () => {
    const f = await fixture(brand),
      current = await f.read();
    expect(
      refreshCostCoverageActionSelection({ ...f.before }, current, f.row.key)
        .selection_key,
    ).toBeNull();
    expect(() =>
      refreshCostCoverageActionSelection(f.before, { ...current }, f.row.key),
    ).toThrow();
  });

  it(`brand ${brand}: OFF admission remains closed before source capture or historical refresh`, async () => {
    const accessed = vi.fn(() => {
        throw Error('OFF source must not be read');
      }),
      sources = new Proxy(
        {},
        { get: accessed, getOwnPropertyDescriptor: accessed },
      );
    await expect(
      readRecordedCostRequirements(sources as never, 'unadmitted-job'),
    ).rejects.toThrow('OFF');
    expect(accessed).not.toHaveBeenCalled();
    const f = await fixture(brand),
      current = await f.read();
    f.currentGate.confirmed = false;
    expect(() =>
      refreshCostCoverageActionSelection(f.before, current, f.row.key),
    ).toThrow();
  });

  it(`brand ${brand}: UNKNOWN original navigation is never reopened by refreshing or regranting confirmation`, async () => {
    const f = await fixture(brand),
      current = await f.read(),
      input = {
        kind: f.row.kind,
        id: f.row.id,
        expected_job_revision:
          current.original.original.costs.evidence.job_revision,
        purpose: 'cost_review' as const,
      },
      callback = vi.fn(() => {
        throw Error('Unknown original callback acknowledgment');
      });
    expect(
      await continueCostCoverageAction(current, input, true, callback, {
        current: callback,
        generation: 0,
      }),
    ).toMatchObject({ status: 'UNKNOWN' });
    expect(callback).toHaveBeenCalledTimes(1);
    await expect(f.read()).rejects.toThrow();
    expect(() =>
      refreshCostCoverageActionSelection(f.before, current, f.row.key),
    ).toThrow();
    f.currentGate.confirmed = false;
    f.currentGate.confirmed = true;
    await expect(f.read()).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
}
