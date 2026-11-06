import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  planCancellationOccurrenceFacts,
  readPlanCancellationReview,
  selectPlanCancellationOccurrence,
} from '../src/lib/workflows/plan-cancellation-review';
import {
  assertVerifiedOwnerBriefingCurrent,
  assertVerifiedOwnerComparisonCurrent,
  readVerifiedOwnerBriefing,
} from '../src/lib/workflows/verified-owner-briefing';
import { compareOwnerActionRefresh } from '../src/lib/workflows/owner-action-verification';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([0, 1, 2])(
  'brand %i: selected maintenance and owner refresh retain one original job and deny withdrawn observations without writing canonical state',
  async (brand) => {
    const gate = { enabled: true, confirmed: true },
      all = await prepareCorrectionPreviewSources(sampleCompanies[brand], gate),
      entry = all.entries[2],
      sources = { ...all, entries: [entry] },
      org = sources.company.id,
      job = entry.target.job_id!,
      beforeGate = { ...gate },
      currentGate = { ...gate },
      maintenanceGate = { ...gate },
      before = await readVerifiedOwnerBriefing(sources, job, beforeGate),
      current = await readVerifiedOwnerBriefing(sources, job, currentGate),
      review = await readPlanCancellationReview(
        sources,
        job,
        'recurring_maintenance',
        maintenanceGate,
      ),
      row = review.desk.rows[0];
    if (!row) throw Error('Original maintenance occurrence required');
    const selected = await selectPlanCancellationOccurrence(review, row.key),
      canonical = sources.estimates.readSyntheticPrototypeSources(entry.target),
      property = sources.property.read(org),
      writes = [
        vi.spyOn(sources.estimates, 'recordTime'),
        vi.spyOn(sources.estimates, 'reviewExpense'),
        vi.spyOn(sources.property, 'savePlan'),
        vi.spyOn(sources.property, 'saveVisit'),
        vi.spyOn(sources.property, 'publish'),
        vi.spyOn(sources.operations, 'recordConsent'),
        vi.spyOn(entry.release, 'command'),
        vi.spyOn(globalThis, 'fetch'),
      ],
      facts = planCancellationOccurrenceFacts(selected),
      source = before.rows.find((r) => r.source.kind === 'issued');
    if (!source) throw Error('Original issued owner source required');
    const selection = { key: source.key, ...source.source },
      refresh = compareOwnerActionRefresh(before, current, selection);
    expect(facts.identity).toMatchObject({
      organization_id: org,
      customer_id: entry.target.customer_id,
      location_id: entry.target.location_id,
      job_id: job,
    });
    expect(facts.plan.id).toBe(row.plan_reference.id);
    expect(facts.plan.revision).toBe(row.plan_reference.revision);
    expect(facts).toMatchObject({ send: false, renew: false });
    expect(refresh).toMatchObject({
      selection,
      status: 'UNCHANGED_REVERIFY_REQUIRED',
      requires_verification: true,
      previous_confirmation_retained: false,
      operational_authority: false,
    });
    expect(() =>
      assertVerifiedOwnerComparisonCurrent(refresh.comparison),
    ).not.toThrow();
    beforeGate.confirmed = false;
    expect(() =>
      compareOwnerActionRefresh(before, current, selection),
    ).toThrow();
    expect(() =>
      assertVerifiedOwnerComparisonCurrent(refresh.comparison),
    ).toThrow();
    expect(() => assertVerifiedOwnerBriefingCurrent(current)).not.toThrow();
    // Separate local review gates neither revoke the canonical person nor grant
    // operational authority. Maintenance retains its own original admission.
    expect(planCancellationOccurrenceFacts(selected)).toEqual(facts);
    maintenanceGate.confirmed = false;
    expect(() => planCancellationOccurrenceFacts(selected)).toThrow();
    expect(() => assertVerifiedOwnerBriefingCurrent(current)).not.toThrow();
    expect(
      sources.estimates.readSyntheticPrototypeSources(entry.target),
    ).toEqual(canonical);
    expect(sources.property.read(org)).toEqual(property);
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  },
);
