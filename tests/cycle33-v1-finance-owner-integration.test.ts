import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  compareCostSavedRevisions,
  filterCostSavedRevisions,
  readCostSavedRevision,
} from '../src/lib/workflows/cost-saved-revisions';
import {
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
  createSavedRevisionSelection,
  readSavedRevisionSelection,
} from '../src/lib/workflows/saved-revision-runtime';
import {
  assertVerifiedOwnerBriefingCurrent,
  readVerifiedOwnerBriefing,
} from '../src/lib/workflows/verified-owner-briefing';
import {
  checkOwnerActionRequirements,
  compareOwnerActionRefresh,
  continueVerifiedOwnerAction,
  verifyOwnerActionRequirements,
} from '../src/lib/workflows/owner-action-verification';
import {
  inspectRecordedCostSource,
  readRecordedCostRequirements,
} from '../src/lib/workflows/recorded-cost-requirements';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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
    remainingOwner = org + '-finance-owner-integration-owner',
    beforeGate = { enabled: true, confirmed: true },
    currentGate = { enabled: true, confirmed: true },
    ownerGate = { enabled: true, confirmed: true };
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    remainingOwner,
  );
  const before = await readCostSavedRevision(sources, job, beforeGate),
    current = await readCostSavedRevision(sources, job, currentGate),
    comparison = compareCostSavedRevisions(before, current),
    owner = await readVerifiedOwnerBriefing(sources, job, ownerGate),
    row = owner.rows.find(
      (r) => r.source.kind === 'finance' && r.source.id === job,
    );
  if (!row) throw Error('Exact original job finance priority required');
  return {
    sources,
    sourceGate,
    entry,
    org,
    job,
    remainingOwner,
    beforeGate,
    currentGate,
    ownerGate,
    before,
    current,
    comparison,
    owner,
    row,
    selection: { key: row.key, ...row.source },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const clear = { query: '', changed_only: false };

function noBusinessWrites(f: Fixture) {
  return [
    vi.spyOn(f.sources.estimates, 'recordTime'),
    vi.spyOn(f.sources.estimates, 'submitTime'),
    vi.spyOn(f.sources.estimates, 'reviewTime'),
    vi.spyOn(f.sources.estimates, 'submitExpense'),
    vi.spyOn(f.sources.estimates, 'reviewExpense'),
    vi.spyOn(f.sources.estimates, 'projection'),
    vi.spyOn(f.sources.estimates, 'issue'),
    vi.spyOn(f.sources.property, 'saveVisit'),
    vi.spyOn(f.sources.property, 'publish'),
    vi.spyOn(f.entry.release, 'command'),
    vi.spyOn(globalThis, 'fetch'),
  ];
}

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: native owner revocation during Finance filtering withholds both private rows and Owner navigation`, async () => {
    const f = await fixture(brand),
      inspected = await verifyOwnerActionRequirements(f.owner, f.selection),
      canonical = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      property = f.sources.property.read(f.org),
      release = f.entry.release.read('staff'),
      writers = noBusinessWrites(f),
      callback = vi.fn(async () => {}),
      live = { current: callback, generation: 0 };
    expect(inspected.inspection).not.toBeNull();
    let revoked: Promise<void> | undefined,
      result: ReturnType<typeof filterCostSavedRevisions> | undefined;
    const input = new Proxy(
      { ...clear },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'query' && !revoked)
            revoked = f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    try {
      result = filterCostSavedRevisions(f.comparison, input);
    } catch {
      // The original native authorization must prevent the private return.
    }
    expect(revoked).toBeDefined();
    await revoked;
    expect(
      f.sources.operations
        .syntheticMemberships(f.org)
        .find((m) => m.user_id === f.entry.target.actor_id)!.active,
    ).toBe(false);
    expect(result).toBeUndefined();
    expect(() => assertSavedRevisionAccess(f.before)).toThrow();
    expect(() => checkOwnerActionRequirements(f.owner, f.selection)).toThrow();
    expect(
      await continueVerifiedOwnerAction(
        f.owner,
        f.selection,
        inspected.inspection!,
        true,
        callback,
        live,
      ),
    ).toEqual({ status: 'UNKNOWN', replay: 'FORBIDDEN' });
    expect(callback).not.toHaveBeenCalled();
    expect(
      f.sources.estimates.readSyntheticPrototypeSources({
        ...f.entry.target,
        actor_id: f.remainingOwner,
      }),
    ).toEqual(canonical);
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(f.entry.release.read('staff')).toEqual(release);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: earlier Finance review withdrawal is distinct from native Auth and separately admitted current Owner context`, async () => {
    const f = await fixture(brand),
      writers = noBusinessWrites(f),
      original = JSON.stringify(f.before);
    let captured = 0;
    const input = new Proxy(
      { ...clear },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'query') {
            captured++;
            f.beforeGate.confirmed = false;
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(() => filterCostSavedRevisions(f.comparison, input)).toThrow();
    expect(captured).toBe(1);
    expect(() => assertSavedRevisionAccess(f.before)).toThrow();
    expect(() => assertSavedRevisionCurrent(f.current)).not.toThrow();
    expect(() => assertVerifiedOwnerBriefingCurrent(f.owner)).not.toThrow();
    expect(checkOwnerActionRequirements(f.owner, f.selection)).toMatchObject({
      row: f.row,
      status: 'VERIFIED_ORIGINAL_REVIEW_DESTINATION',
      operational_authority: false,
    });
    expect(
      f.sources.operations
        .syntheticMemberships(f.org)
        .find((m) => m.user_id === f.entry.target.actor_id)!.active,
    ).toBe(true);
    expect(JSON.stringify(f.before)).toBe(original);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: exact recorded material and approved unposted time refresh Finance and Owner without inventing invoice or labor coverage`, async () => {
    const f = await fixture(brand),
      original = JSON.stringify(f.before),
      selected = createSavedRevisionSelection(f.before),
      expenseId = await f.sources.estimates.submitExpense(f.org, f.job, {
        purchase_key: crypto.randomUUID(),
        supplier: 'PRIVATE_FINANCE_OWNER_SUPPLIER',
        reference: crypto.randomUUID(),
        category: 'materials',
        kind: 'payment',
        amount_minor: 2300,
        description: 'PRIVATE_FINANCE_OWNER_EXPENSE',
        estimate_line_id: null,
        quantity_milli: 1000,
        unit: 'each',
        unit_cost_minor: 2300,
        document_ids: [],
        material_approval_id: null,
      });
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      expenseId,
      'approved',
      'PRIVATE_FINANCE_OWNER_REVIEW',
    );
    const nativeBeforeTime = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      started =
        Math.max(
          ...nativeBeforeTime.workforce.entries.map((t) =>
            Date.parse(t.ended_at ?? t.started_at),
          ),
        ) + 86400000,
      timeId = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
        job_id: f.job,
        overhead_center: null,
        task: 'PRIVATE_FINANCE_OWNER_TIME',
        kind: 'work',
        started_at: new Date(started).toISOString(),
        ended_at: new Date(started + 900000).toISOString(),
        billable: true,
        corrects_id: null,
      });
    if (typeof timeId !== 'string')
      throw Error('Original native time acknowledgment required');
    await f.sources.estimates.submitTime(f.org, timeId);
    await f.sources.estimates.reviewTime(
      f.org,
      timeId,
      'approved',
      'PRIVATE_FINANCE_OWNER_TIME_REVIEW',
    );
    const canonical = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      writers = noBusinessWrites(f);
    expect(() => assertSavedRevisionCurrent(f.current)).toThrow();
    expect(() => assertVerifiedOwnerBriefingCurrent(f.owner)).toThrow();
    expect(() => assertSavedRevisionAccess(f.before)).not.toThrow();
    const current = await readCostSavedRevision(
        f.sources,
        f.job,
        f.currentGate,
      ),
      comparison = compareCostSavedRevisions(f.before, current),
      material = filterCostSavedRevisions(comparison, {
        query: expenseId.toUpperCase(),
        changed_only: true,
      }),
      requirements = await readRecordedCostRequirements(
        f.sources,
        f.job,
        f.currentGate,
      ),
      owner = await readVerifiedOwnerBriefing(f.sources, f.job, f.ownerGate),
      finance = owner.rows.find(
        (r) => r.source.kind === 'finance' && r.source.id === f.job,
      )!;
    expect(material.rows).toContain(
      comparison.rows.find((r) => r.kind === 'expenses' && r.id === expenseId),
    );
    expect(
      current.evidence.expenses.find((r) => r.id === expenseId),
    ).toMatchObject({
      amount_minor: 2300,
      quantity_milli: 1000,
      unit: 'each',
    });
    expect(
      current.evidence.reviews.find((r) => r.submission_id === expenseId),
    ).toMatchObject({ decision: 'approved', submission_id: expenseId });
    expect(current.evidence.time.find((r) => r.id === timeId)).toMatchObject({
      submitted: true,
      review: 'approved',
      kind: 'work',
    });
    expect(current.evidence.facts.cost_coverage).toBe('UNKNOWN');
    expect(current.evidence.facts.costs).toBeNull();
    expect(current.evidence.labor_entry_ids).not.toContain(timeId);
    expect(requirements.labor.find((r) => r.entry_id === timeId)).toMatchObject(
      {
        recorded_review: 'approved',
        locked_labor_reference: false,
        requirement: 'UNPOSTED_OR_UNVERIFIED_NOT_ZERO_COST',
      },
    );
    expect(requirements.original.original.canonical).toEqual(
      jobFinancials(canonical.job!),
    );
    expect(requirements.invoice_overall).toBe(current.evidence.invoice.overall);
    expect(requirements.invoice_overall).toBe('NO_GO');
    expect(requirements.invoices).toEqual([]);
    expect(requirements.operational_ready).toBe(false);
    const time = inspectRecordedCostSource(requirements, {
      kind: 'time',
      id: timeId,
    });
    expect(time).toBe(
      requirements.original.rows.find(
        (r) => r.kind === 'time' && r.id === timeId,
      ),
    );
    expect(finance.state).toBe('RECORDED_FINANCE_REQUIREMENTS');
    expect(finance.facts).toContain('Original cost coverage: UNKNOWN');
    expect(finance.facts).toContain(
      'Original invoice requirement outcome: NO_GO',
    );
    expect(owner.original.costs.costs.identity).toEqual(current.identity);
    expect(owner.original.costs.costs.evidence.time).toEqual(
      current.evidence.time,
    );
    const refreshed = compareOwnerActionRefresh(f.owner, owner, f.selection);
    expect(refreshed.status).not.toBe('UNCHANGED_REVERIFY_REQUIRED');
    expect(refreshed.selection).toBeNull();
    expect(refreshed.requires_verification).toBe(true);
    expect(refreshed.previous_confirmation_retained).toBe(false);
    expect(refreshed.operational_authority).toBe(false);
    expect(readSavedRevisionSelection(selected)).toEqual({
      snapshot: f.before,
      generation: 0,
    });
    expect(JSON.stringify(f.before)).toBe(original);
    expect(JSON.stringify(material)).not.toContain('PRIVATE_FINANCE_OWNER');
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(canonical);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: same-property other jobs, copied handles and another company cannot substitute Finance or Owner sources`, async () => {
    const f = await fixture(brand),
      otherEntry = f.sources.entries[3],
      otherCost = await readCostSavedRevision(
        f.sources,
        otherEntry.target.job_id!,
        f.currentGate,
      ),
      otherOwner = await readVerifiedOwnerBriefing(
        f.sources,
        otherEntry.target.job_id!,
        f.ownerGate,
      ),
      foreign = await fixture((brand + 1) % 3);
    expect(otherEntry.target.location_id).toBe(f.entry.target.location_id);
    expect(otherEntry.target.customer_id).toBe(f.entry.target.customer_id);
    expect(otherEntry.target.job_id).not.toBe(f.job);
    expect(foreign.org).not.toBe(f.org);
    const writers = noBusinessWrites(f);
    expect(() => compareCostSavedRevisions(f.before, otherCost)).toThrow();
    expect(() =>
      compareCostSavedRevisions(f.before, foreign.current),
    ).toThrow();
    expect(() =>
      filterCostSavedRevisions({ ...f.comparison }, clear),
    ).toThrow();
    expect(() =>
      compareOwnerActionRefresh(f.owner, otherOwner, f.selection),
    ).toThrow();
    expect(() =>
      compareOwnerActionRefresh(f.owner, foreign.owner, f.selection),
    ).toThrow();
    expect(() =>
      checkOwnerActionRequirements({ ...f.owner }, f.selection),
    ).toThrow();
    expect(
      checkOwnerActionRequirements(f.owner, foreign.selection),
    ).toMatchObject({
      status: 'UNKNOWN_SOURCE_MISSING',
      can_open_original: false,
      row: null,
      operational_authority: false,
    });
    expect(
      filterCostSavedRevisions(f.comparison, {
        query: foreign.job,
        changed_only: false,
      }).matching,
    ).toBe(0);
    expect(checkOwnerActionRequirements(f.owner, f.selection).row).toBe(f.row);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: later canonical forecast withholds stale Finance rows and inspected Owner navigation without resetting UNKNOWN`, async () => {
    const f = await fixture(brand),
      inspected = await verifyOwnerActionRequirements(f.owner, f.selection),
      selected = createSavedRevisionSelection(f.before),
      original = JSON.stringify(f.before),
      job = f.sources.estimates.syntheticJob(f.org, f.job)!;
    expect(inspected.inspection).not.toBeNull();
    await f.sources.estimates.projection(f.org, job, {
      ...job.projection,
      remaining: {
        ...job.projection.remaining,
        other: job.projection.remaining.other + 1250,
      },
    });
    const canonical = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      writers = noBusinessWrites(f),
      captured = vi.fn(),
      callback = vi.fn(async () => {}),
      live = { current: callback, generation: 0 },
      input = new Proxy(
        { ...clear },
        {
          getOwnPropertyDescriptor(target, key) {
            captured();
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    expect(() => filterCostSavedRevisions(f.comparison, input)).toThrow();
    expect(captured).not.toHaveBeenCalled();
    const continueOriginal = () =>
      continueVerifiedOwnerAction(
        f.owner,
        f.selection,
        inspected.inspection!,
        true,
        callback,
        live,
      );
    expect(await continueOriginal()).toEqual({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
    });
    f.ownerGate.confirmed = false;
    f.ownerGate.confirmed = true;
    expect(await continueOriginal()).toEqual({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
    });
    expect(callback).not.toHaveBeenCalled();
    expect(readSavedRevisionSelection(selected)).toEqual({
      snapshot: f.before,
      generation: 0,
    });
    expect(JSON.stringify(f.before)).toBe(original);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(canonical);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: default-OFF Finance and Owner readers do not capture source handles or grant actions`, async () => {
    const read = vi.fn(() => {
        throw Error('Unadmitted source must stay unread');
      }),
      sources = new Proxy({}, { get: read, getOwnPropertyDescriptor: read });
    await expect(
      readCostSavedRevision(sources as never, sampleCompanies[brand].id),
    ).rejects.toThrow();
    await expect(
      readRecordedCostRequirements(sources as never, sampleCompanies[brand].id),
    ).rejects.toThrow('OFF');
    await expect(
      readVerifiedOwnerBriefing(sources as never, sampleCompanies[brand].id),
    ).rejects.toThrow('OFF');
    expect(read).not.toHaveBeenCalled();
  });
}
