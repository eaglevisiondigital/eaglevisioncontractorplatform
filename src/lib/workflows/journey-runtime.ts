import { sampleCompanies, type CompanyProfile } from '../../domain/platform';
import { industryEstimate } from '../../domain/estimating/fixtures';
import { ReleasePreview } from '../../domain/release/preview';
import { Operations } from '../operations';
import { Phase3Repository } from '../phase3';
import { PropertyRepository } from '../property';
import { CustomerPortalPreviewModel } from '../customer-preview';
import {
  prototypeFields,
  type PrototypeTarget,
} from '../program/prototype-source';

export interface JourneyAdmission {
  enabled: boolean;
  confirmed: boolean;
}
export function journeyEnabled(environment: {
  development: boolean;
  flag?: string;
  hostname: string;
  protocol: string;
}) {
  return (
    environment.development === true &&
    environment.flag === 'true' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(environment.hostname) &&
    environment.protocol === 'http:'
  );
}
function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Explicit local synthetic journey confirmation required');
}
export type LocalJourney = Awaited<ReturnType<typeof prepareLocalJourney>>;
/** Explicit, disposable demonstration using the original engines. Not a business store,
 * durable orchestration, legal approval, dispatch, payroll or financial execution. */
export async function prepareLocalJourney(
  company: CompanyProfile,
  gate: JourneyAdmission,
) {
  admit(gate);
  const approved = sampleCompanies.find((c) => c.id === company.id);
  if (!approved || JSON.stringify(approved) !== JSON.stringify(company))
    throw Error('Approved synthetic company required');
  const operations = new Operations(true);
  const estimates = new Phase3Repository(operations);
  await estimates.initialize(approved);
  const property = new PropertyRepository(operations, estimates);
  await property.initialize(company);
  admit(gate);
  const previous = new Set(
    (await operations.listIntake(company.id)).rows.map((r) => r.id),
  );
  admit(gate);
  await operations.sampleSubmit(company.slug, {
    name: 'Synthetic Journey Customer',
    email: `journey-${crypto.randomUUID()}@example.invalid`,
    phone: '5550100100',
    address: '300 Synthetic Journey Lane',
    city: 'Example',
    region: 'IL',
    postal_code: '00000',
    country_code: 'US',
    property_type: 'residential',
    service_category: 'Property maintenance',
    description:
      'Inspect and document the proposed property maintenance scope.',
    preferred_appointment: 'Human review required',
    contact_preference: 'email',
    email_consent: true,
    sms_consent: false,
    consent_version: 'contact-v1',
  });
  admit(gate);
  const created = (await operations.listIntake(company.id)).rows.filter(
    (r) => !previous.has(r.id),
  );
  if (
    created.length !== 1 ||
    !created[0].customer_id ||
    !created[0].service_location_id
  )
    throw Error('Exact created intake source unavailable');
  const lead = created[0],
    customer = lead.customer_id!,
    location = lead.service_location_id!;
  operations.syntheticIntakeRequest(company.id, customer, location, lead.id);
  const input = industryEstimate(company, customer);
  input.location_id = location;
  input.expires_on = '2099-12-31';
  input.tax_policy_id = (await estimates.taxes(company.id))[0].id;
  admit(gate);
  const draft = await estimates.create(company, input);
  admit(gate);
  const issued = await estimates.issue(company.id, draft);
  admit(gate);
  const release = new ReleasePreview(company.id, issued.version);
  await release.command('staff', 'publish_offer', {
    version_id: issued.version.id,
  });
  admit(gate);
  const offer = release.read('staff').release_offers;
  if (offer.length !== 1) throw Error('Exact local offer required');
  await release.command('customer', 'decide_offer', {
    offer_id: offer[0].id,
    decision: 'accepted',
    note: 'Explicit LOCAL TEST preference; no contract authority.',
    consent: true,
  });
  admit(gate);
  const receipts = release.read('staff').release_decisions;
  if (receipts.length !== 1) throw Error('Exact local test receipt required');
  // A separate explicit engineering fixture, never permission derived from a preference/contract packet.
  const jobId = await estimates.approveJob(company.id, issued);
  admit(gate);
  // Existing internal cost-review evidence only: no payment, purchase order or ledger.
  const commitment = await estimates.submitExpense(company.id, jobId, {
    purchase_key: crypto.randomUUID(),
    supplier: 'Synthetic planning supplier',
    reference: 'LOCAL-COMMITMENT-ONLY',
    category: 'materials',
    kind: 'commitment',
    amount_minor: 12500,
    description:
      'Local assumed material commitment for cost review; no purchase executed.',
    estimate_line_id: null,
    quantity_milli: null,
    unit: null,
    unit_cost_minor: null,
    document_ids: [],
    material_approval_id: null,
  });
  admit(gate);
  await estimates.reviewExpense(
    company.id,
    jobId,
    commitment,
    'approved',
    'Explicit synthetic engineering fixture; no payment authority.',
  );
  admit(gate);
  const actor = `${company.id}-owner`;
  const workforce = await estimates.workforce(company.id);
  const worker = workforce.workers.find(
    (w) => w.user_id === `${company.id}-field` && w.active,
  );
  if (!worker?.user_id)
    throw Error('Exact existing synthetic field worker unavailable');
  const job = (await estimates.jobs(company.id)).find((j) => j.id === jobId)!;
  admit(gate);
  await estimates.assignJob(company.id, jobId, worker.user_id, true, {
    reviewer: actor,
    job_revision: job.lock_revision,
    issued_version_id: issued.version.id,
    expected_active: null,
    assertCurrent: () => admit(gate),
  });
  admit(gate);
  await property.refreshContexts(company.id);
  admit(gate);
  const context = property
    .read(company.id)
    .contexts.find(
      (c) =>
        c.customer_id === customer &&
        c.location_id === location &&
        c.job_id === jobId,
    );
  if (!context) throw Error('Exact existing property/job context unavailable');
  const day = '2026-12-07';
  const plan = property.createPlan(
    company.id,
    context,
    'Synthetic journey maintenance review',
  );
  property.savePlan(company.id, { ...plan, cadence: 'weekly', starts_on: day });
  let visit = property.addVisit(company.id, plan.id, day, 'after');
  property.saveVisit(company.id, visit, {
    summary:
      'Recorded synthetic after-stage documentation. Physical completion has not been verified.',
    internal_notes: 'PRIVATE staff scheduling and supplier details',
    checklist: [
      {
        id: crypto.randomUUID(),
        label: 'Condition observations documented',
        required: true,
        completed: true,
      },
    ],
    findings: [
      {
        id: crypto.randomUUID(),
        category: 'Maintenance',
        location: 'Exterior joint',
        severity: 'moderate',
        description: 'A weathered exterior joint was documented.',
        recommendation: 'Plan a separate maintenance assessment.',
        customer_visible: true,
      },
      {
        id: crypto.randomUUID(),
        category: 'Office',
        location: 'Private',
        severity: 'low',
        description: 'PRIVATE workforce margin note',
        recommendation: 'PRIVATE review',
        customer_visible: false,
      },
    ],
  });
  visit = property.read(company.id).visits.find((v) => v.id === visit.id)!;
  property.submit(company.id, visit);
  visit = property.read(company.id).visits.find((v) => v.id === visit.id)!;
  const report = property.publish(company.id, visit);
  // Retain a separate actual scheduling draft; a date-only visit is not dispatch.
  const scheduledVisit = property.addVisit(
    company.id,
    plan.id,
    '2026-12-28',
    'during',
  );
  const target: PrototypeTarget = {
    organization_id: company.id,
    actor_id: actor,
    customer_id: customer,
    location_id: location,
    estimate_id: issued.estimate.id,
    version_id: issued.version.id,
    job_id: jobId,
  };
  const customerModel = new CustomerPortalPreviewModel(company, property);
  customerModel.admitLocalJourney(target, gate);
  admit(gate);
  estimates.readSyntheticPrototypeSources(target);
  operations.syntheticIntakeRequest(company.id, customer, location, lead.id);
  const final = release.read('staff');
  if (
    final.release_contracts.length ||
    final.release_signatures.length ||
    final.release_invoices.length ||
    final.release_ledger_entries.length ||
    final.release_payment_events.length
  )
    throw Error('Unexpected financial/contract side effect');
  return {
    company,
    operations,
    estimates,
    property,
    release,
    customerModel,
    target,
    intake_request_id: lead.id,
    offer_id: offer[0].id,
    receipt_id: receipts[0].id,
    day: scheduledVisit.visited_on,
    timezone: 'America/Chicago',
    worker_id: worker.id,
    plan_id: plan.id,
    visit_id: visit.id,
    scheduled_visit_id: scheduledVisit.id,
    report_id: report.id,
    published_version: report.version,
    issued,
    gate,
  };
}
