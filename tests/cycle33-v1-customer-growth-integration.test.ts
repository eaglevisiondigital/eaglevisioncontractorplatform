import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readServiceSourceContinuity,
  assertServiceSourceContinuityCurrentNow,
  openServiceSourceReport,
  selectServiceSourceJob,
} from '../src/lib/workflows/service-source-continuity';
import {
  readPlanCancellationReview,
  selectPlanCancellationOccurrence,
  planCancellationOccurrenceFacts,
  preparePlanCancellationReview,
  closePlanCancellationReview,
  reconcilePlanCancellationReview,
} from '../src/lib/workflows/plan-cancellation-review';
import {
  readAdvancedHandoffRequirements,
  assertAdvancedRequirementsCurrentNow,
  prepareAdvancedHandoff,
  reconcileAdvancedHandoff,
} from '../src/lib/workflows/advanced-handoffs';
import {
  readAddonReadinessGuide,
  openAddonReadinessControls,
  navigateAddonReadinessJob,
} from '../src/lib/workflows/addon-readiness-guide';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture(brand: number) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[2],
    org = sources.company.id,
    job = entry.target.job_id!,
    serviceInput = { job_id: job },
    advancedInput = {
      job_id: job,
      kind: 'voice' as const,
      note: 'Literal staff review of this same issued scope; no issuance.',
      review_on: '2026-12-28',
      manual_priority: 'normal' as const,
      edition: 'property_services' as const,
    };
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-customer-growth-remaining-owner',
  );
  const [service, maintenance, advanced] = await Promise.all([
      readServiceSourceContinuity(sources, serviceInput, gate),
      readPlanCancellationReview(sources, job, 'recurring_maintenance', gate),
      readAdvancedHandoffRequirements(sources, advancedInput, gate),
    ]),
    row = maintenance.desk.rows.find((r) => r.context.job_id === job),
    report = service.customer_safe.documentation.find(
      (r) => r.report.reference.report_id === entry.report_id,
    );
  if (!row || !report) throw Error('Exact original occurrence/report required');
  const selected = await selectPlanCancellationOccurrence(maintenance, row.key);
  return {
    gate,
    sources,
    entry,
    org,
    job,
    serviceInput,
    advancedInput,
    service,
    maintenance,
    advanced,
    row,
    report,
    selected,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const confirmation = (f: Fixture) => ({
  confirmed: true,
  reviewed_requirements_sha256: f.advanced.integrity.sha256,
});
function writers(f: Fixture) {
  return [
    vi.spyOn(f.sources.estimates, 'save'),
    vi.spyOn(f.sources.estimates, 'issue'),
    vi.spyOn(f.sources.estimates, 'approveJob'),
    vi.spyOn(f.sources.estimates, 'assignJob'),
    vi.spyOn(f.sources.estimates, 'recordTime'),
    vi.spyOn(f.sources.estimates, 'submitExpense'),
    vi.spyOn(f.sources.property, 'savePlan'),
    vi.spyOn(f.sources.property, 'saveVisit'),
    vi.spyOn(f.sources.property, 'publish'),
    vi.spyOn(f.sources.operations, 'recordConsent'),
    vi.spyOn(f.entry.release, 'command'),
    vi.spyOn(globalThis, 'fetch'),
  ];
}
function privateKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...([
      'email',
      'phone',
      'internal_notes',
      'unit_cost_minor',
      'supplier',
      'payroll',
      'actor_id',
      'worker_id',
      'staff_type',
    ].includes(key)
      ? [key]
      : []),
    ...privateKeys(child),
  ]);
}

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: one canonical job joins exact published history, selected maintenance and reviewed Advanced scope without authority promotion`, async () => {
    const f = await fixture(brand),
      property = f.sources.property.read(f.org),
      native = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      release = f.entry.release.read('staff'),
      calls = writers(f),
      facts = planCancellationOccurrenceFacts(f.selected),
      handoff = await prepareAdvancedHandoff(f.advanced, confirmation(f));
    expect(f.service.customer_safe.property).toMatchObject({
      organization_id: f.org,
      customer_id: f.entry.target.customer_id,
      location_id: f.entry.target.location_id,
    });
    expect(f.service.customer_safe.scope).toMatchObject({
      job_id: f.job,
      estimate_id: f.entry.target.estimate_id,
      issued_version_id: f.entry.target.version_id,
    });
    expect(facts.identity).toBe(f.maintenance.view.identity);
    expect(facts.identity).toMatchObject({
      organization_id: f.org,
      customer_id: f.entry.target.customer_id,
      location_id: f.entry.target.location_id,
      job_id: f.job,
      estimate_id: f.entry.target.estimate_id,
      version_id: f.entry.target.version_id,
    });
    expect(handoff.requirements).toBe(f.advanced);
    expect(f.advanced.source).toMatchObject({
      organization_id: f.org,
      customer_id: facts.identity.customer_id,
      location_id: facts.identity.location_id,
      job_id: facts.identity.job_id,
      estimate_id: facts.identity.estimate_id,
      issued_version_id: facts.identity.version_id,
    });
    expect(
      await openServiceSourceReport(f.service, f.report.report.reference),
    ).toEqual(f.report.report);
    expect(selectServiceSourceJob(f.service)).toBe(f.job);
    expect(f.service.customer_safe.physical_completion).toBe('UNKNOWN');
    expect(f.service.customer_safe.customer_acceptance).toBe('UNKNOWN');
    expect(
      f.service.customer_safe.required_proof.every(
        (r) => r.status === 'UNKNOWN',
      ),
    ).toBe(true);
    expect(f.service.request_scope_relationship).toBe(
      'EXPLICIT_STAFF_SELECTION_NOT_RECORDED_REQUEST_ESTIMATE_FK',
    );
    expect(privateKeys(f.service.customer_safe)).toEqual([]);
    expect(JSON.stringify(f.service.customer_safe)).not.toContain(
      'PRIVATE staff scheduling and supplier details',
    );
    expect(facts).toMatchObject({
      requested_purpose_is: 'REVIEW_CONTEXT_NOT_CONSENT',
      purpose_consent: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      renewal_terms: 'UNKNOWN',
      native_plan_cancellation: 'UNSUPPORTED',
      send: false,
      renew: false,
    });
    expect(handoff.operational_ready).toBe(false);
    expect(handoff.delivery).toBe('NOT_SENT');
    expect(await reconcileAdvancedHandoff(handoff)).toMatchObject({
      status: 'CURRENT_REVIEW_ONLY',
      replay: false,
      replacement: null,
    });
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(native);
    expect(f.entry.release.read('staff')).toEqual(release);
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: current native revocation withdraws every retained private path and invokes no Advanced navigation callback`, async () => {
    const f = await fixture(brand),
      task = await readAddonReadinessGuide(
        f.sources,
        {
          job_id: f.job,
          kind: 'voice',
          edition: 'property_services',
        },
        f.gate,
      ),
      controls = openAddonReadinessControls(task),
      reference = controls.selection.references.find(
        (r) => r.kind === 'report',
      ),
      handoff = await prepareAdvancedHandoff(f.advanced, confirmation(f)),
      callback = vi.fn(),
      calls = writers(f);
    if (!reference) throw Error('Exact report navigation reference required');
    await f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
    expect(() => assertServiceSourceContinuityCurrentNow(f.service)).toThrow();
    expect(() => planCancellationOccurrenceFacts(f.selected)).toThrow();
    expect(() => assertAdvancedRequirementsCurrentNow(f.advanced)).toThrow();
    await expect(
      openServiceSourceReport(f.service, f.report.report.reference),
    ).rejects.toThrow();
    await expect(
      navigateAddonReadinessJob(task, reference, callback, {
        current: callback,
        generation: 0,
      }),
    ).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();
    expect(await reconcileAdvancedHandoff(handoff)).toEqual({
      status: 'UNKNOWN',
      replay: false,
      replacement: null,
    });
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: another selected job cannot substitute the retained service, occurrence or Advanced source`, async () => {
    const f = await fixture(brand),
      calls = writers(f),
      original = planCancellationOccurrenceFacts(f.selected),
      other = f.sources.entries[0];
    expect(other.target.customer_id).not.toBe(f.entry.target.customer_id);
    f.serviceInput.job_id = other.target.job_id!;
    f.advancedInput.job_id = other.target.job_id!;
    expect(() => assertServiceSourceContinuityCurrentNow(f.service)).toThrow();
    await expect(
      prepareAdvancedHandoff(f.advanced, confirmation(f)),
    ).rejects.toThrow();
    expect(planCancellationOccurrenceFacts(f.selected)).toEqual(original);
    expect(original.identity.job_id).toBe(f.job);
    expect(() => selectServiceSourceJob(f.service)).toThrow();
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: actual contact withdrawal makes the original prepared maintenance review UNKNOWN without native cancellation or published-history changes`, async () => {
    const f = await fixture(brand),
      property = f.sources.property.read(f.org),
      originalReport = JSON.stringify(f.report.report),
      proposal = {
        proposed_on: f.row.recorded_due_on,
        plan_kind: 'follow_up' as const,
      };
    await preparePlanCancellationReview(f.selected, proposal, true);
    // Explicit local fixture update through the sole existing consent owner.
    await f.sources.operations.recordConsent(
      f.org,
      f.entry.target.customer_id,
      false,
      false,
    );
    const calls = writers(f);
    expect(() => planCancellationOccurrenceFacts(f.selected)).toThrow();
    expect(await reconcilePlanCancellationReview(f.selected)).toMatchObject({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
      send: false,
      consent_mutation: false,
      plan_mutation_performed: false,
    });
    await expect(
      closePlanCancellationReview(f.selected, 'CANCEL', true),
    ).rejects.toThrow();
    await expect(
      preparePlanCancellationReview(f.selected, proposal, true),
    ).rejects.toThrow();
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(JSON.stringify(f.report.report)).toBe(originalReport);
    expect(f.service.customer_safe.customer_acceptance).toBe('UNKNOWN');
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: foreign company and wrong-customer report handoffs fail closed while local OFF remains denied`, async () => {
    const f = await fixture(brand),
      calls = writers(f),
      otherCompany = sampleCompanies[(brand + 1) % 3],
      other = f.sources.entries[0],
      foreign = { ...f.sources, company: otherCompany };
    await expect(
      readServiceSourceContinuity(foreign, f.serviceInput, f.gate),
    ).rejects.toThrow();
    await expect(
      readPlanCancellationReview(
        foreign,
        f.job,
        'recurring_maintenance',
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      readAdvancedHandoffRequirements(foreign, f.advancedInput, f.gate),
    ).rejects.toThrow();
    await expect(
      openServiceSourceReport(f.service, {
        kind: 'report',
        organization_id: f.org,
        customer_id: other.target.customer_id,
        location_id: other.target.location_id,
        report_id: other.report_id,
        published_version: other.published_version,
      }),
    ).rejects.toThrow();
    await expect(
      readServiceSourceContinuity(f.sources, f.serviceInput),
    ).rejects.toThrow();
    await expect(
      readPlanCancellationReview(f.sources, f.job, 'marketing'),
    ).rejects.toThrow();
    await expect(
      readAdvancedHandoffRequirements(f.sources, f.advancedInput),
    ).rejects.toThrow();
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: ambiguous Advanced confirmation retains its original one-use hold without inventing service completion or maintenance consent`, async () => {
    const f = await fixture(brand),
      calls = writers(f),
      originalFacts = planCancellationOccurrenceFacts(f.selected),
      originalService = JSON.stringify(f.service.customer_safe);
    let captures = 0;
    const input = new Proxy(confirmation(f), {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'reviewed_requirements_sha256' && ++captures === 3)
          f.gate.confirmed = false;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    await expect(prepareAdvancedHandoff(f.advanced, input)).rejects.toThrow();
    expect(captures).toBe(3);
    f.gate.confirmed = true;
    const fresh = await readAdvancedHandoffRequirements(
      f.sources,
      f.advancedInput,
      f.gate,
    );
    expect(fresh.prior_attempt).toBe('EXACT_READ_ONLY_PREVIOUS_ATTEMPT');
    await expect(
      prepareAdvancedHandoff(fresh, {
        confirmed: true,
        reviewed_requirements_sha256: fresh.integrity.sha256,
      }),
    ).rejects.toThrow(/no replay/);
    // Unrelated exact source reads remain observations, not renewed command authority.
    expect(planCancellationOccurrenceFacts(f.selected)).toEqual(originalFacts);
    assertServiceSourceContinuityCurrentNow(f.service);
    expect(JSON.stringify(f.service.customer_safe)).toBe(originalService);
    expect(f.service.customer_safe.physical_completion).toBe('UNKNOWN');
    expect(originalFacts.purpose_consent).toBe('UNVERIFIED');
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });
}
