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

import type { JourneyAdmission, LocalJourney } from './journey-runtime';

/** Target handles over one existing repository set, never a second business store. */
export interface OperatingSources {
  company: CompanyProfile;
  operations: Operations;
  estimates: Phase3Repository;
  property: PropertyRepository;
  entries: readonly LocalJourney[];
  gate: JourneyAdmission;
}
const targetKeys = [
  'organization_id',
  'actor_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'version_id',
  'job_id',
];
/** Reconstruct only own data before serialization. Never invoke caller getters,
 * toJSON, coercion hooks, sparse array accessors or cyclic/executable evidence. */
function dataSignature(value: unknown) {
  const active = new Set<object>();
  const data = (v: unknown): unknown => {
    if (
      v === null ||
      v === undefined ||
      typeof v === 'string' ||
      typeof v === 'boolean'
    )
      return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (!v || typeof v !== 'object' || active.has(v))
      throw Error('Primitive data-only source evidence required');
    if (
      ![null, Object.prototype, Array.prototype].includes(
        Object.getPrototypeOf(v),
      )
    )
      throw Error('Plain source evidence required');
    active.add(v);
    // Capture each descriptor once in the same ownKeys/descriptor/ownKeys order.
    // Ordinary objects retain the indexed fast path; reordered Proxy keys use
    // the captured map. No original values, descriptors or checks are cached.
    const capturedKeys = Reflect.ownKeys(v);
    const captured = capturedKeys.map((key) =>
      Object.getOwnPropertyDescriptor(v, key),
    );
    const keys = Reflect.ownKeys(v);
    let reordered: Map<PropertyKey, PropertyDescriptor | undefined> | undefined;
    const descriptor = (key: PropertyKey, index: number) => {
      if (capturedKeys[index] === key) return captured[index];
      reordered ??= new Map(capturedKeys.map((k, i) => [k, captured[i]]));
      return reordered.get(key);
    };
    for (let i = 0; i < keys.length; i++) {
      const d = descriptor(keys[i], i);
      if (typeof keys[i] !== 'string' || !d || !Object.hasOwn(d, 'value'))
        throw Error('Own-data source evidence required');
    }
    let result: unknown;
    if (Array.isArray(v)) {
      if (
        keys.length !== v.length + 1 ||
        Array.from({ length: v.length }, (_, i) =>
          descriptor(String(i), i),
        ).some((d) => !d)
      )
        throw Error('Dense source data required');
      result = Array.from({ length: v.length }, (_, i) =>
        data(descriptor(String(i), i)!.value),
      );
    } else {
      const plain = Object.create(null) as Record<string, unknown>;
      for (let i = 0; i < keys.length; i++)
        plain[keys[i] as string] = data(descriptor(keys[i], i)!.value);
      result = plain;
    }
    active.delete(v);
    return result;
  };
  return JSON.stringify(data(value));
}
function approvedCompany(value: unknown) {
  const p = prototypeFields(value, Object.keys(sampleCompanies[0]));
  if (Object.keys(p).length !== Object.keys(sampleCompanies[0]).length)
    throw Error('Exact approved company fields required');
  const signature = dataSignature(p);
  if (!sampleCompanies.some((c) => dataSignature(c) === signature))
    throw Error('Exact approved synthetic company required');
  return p;
}
/** Capture live source handles and a private exact read fence. Never serialize this
 * closure/repository set into a customer projection or treat it as authentication. */
export function captureOperatingSources(
  sources: OperatingSources,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const root = prototypeFields(sources, [
    'company',
    'operations',
    'estimates',
    'property',
    'entries',
    'gate',
  ]);
  if (
    Object.keys(root).length !== 6 ||
    !(root.operations instanceof Operations) ||
    !(root.estimates instanceof Phase3Repository) ||
    !(root.property instanceof PropertyRepository) ||
    !root.operations.sample ||
    root.estimates.operations !== root.operations ||
    root.property.operations !== root.operations ||
    root.property.estimates !== root.estimates ||
    !Array.isArray(root.entries) ||
    root.entries.length < 1 ||
    root.entries.length > 20
  )
    throw Error('One exact bounded synthetic operating source set required');
  const list = root.entries as LocalJourney[];
  const descriptors = Object.getOwnPropertyDescriptors(list);
  if (
    Reflect.ownKeys(list).length !== list.length + 1 ||
    Array.from({ length: list.length }, (_, i) => descriptors[String(i)]).some(
      (d) => !d || !Object.hasOwn(d, 'value'),
    )
  )
    throw Error('Dense own-data source handles required');
  const entries = Array.from(
    { length: list.length },
    (_, i) => descriptors[String(i)].value as LocalJourney,
  );
  const company = approvedCompany(root.company);
  if (
    typeof company.id !== 'string' ||
    !sampleCompanies.some(
      (c) => c.id === company.id && dataSignature(c) === dataSignature(company),
    )
  )
    throw Error('Exact approved synthetic company required');
  const organization_id = company.id;
  const entryPins = entries.map((entry) =>
    prototypeFields(entry, Object.keys(entry)),
  );
  const firstTarget = prototypeFields(entryPins[0].target, targetKeys);
  const actor_id = firstTarget.actor_id as string;
  const operations = root.operations as Operations,
    estimates = root.estimates as Phase3Repository,
    property = root.property as PropertyRepository;
  const snapshot = () => {
    const current = prototypeFields(sources, [
      'company',
      'operations',
      'estimates',
      'property',
      'entries',
      'gate',
    ]);
    if (
      Object.keys(current).length !== 6 ||
      Object.keys(root).some((k) => current[k] !== root[k]) ||
      dataSignature(approvedCompany(current.company)) !== dataSignature(company)
    )
      throw Error('Operating source container changed');
    admit(gate);
    admit(current.gate as JourneyAdmission);
    const ownList = Object.getOwnPropertyDescriptors(list);
    if (
      Reflect.ownKeys(list).length !== entries.length + 1 ||
      list.length !== entries.length ||
      entries.some(
        (e, i) =>
          !Object.hasOwn(ownList[String(i)] ?? {}, 'value') ||
          ownList[String(i)].value !== e,
      )
    )
      throw Error('Operating source selection changed');
    const jobs = new Set<string>();
    const selected = entries.map((entry, index) => {
      const v = prototypeFields(entry, Object.keys(entry));
      for (const key of [
        'intake_request_id',
        'offer_id',
        'receipt_id',
        'day',
        'timezone',
        'worker_id',
        'plan_id',
        'visit_id',
        'scheduled_visit_id',
        'report_id',
      ])
        if (
          typeof v[key] !== 'string' ||
          !(v[key] as string).length ||
          (v[key] as string).length > 200
        )
          throw Error('Exact primitive operating selectors required');
      if (
        !Number.isSafeInteger(v.published_version) ||
        Number(v.published_version) < 1
      )
        throw Error('Exact published source version required');
      dataSignature(v.issued);
      if (
        [
          'company',
          'operations',
          'estimates',
          'property',
          'release',
          'customerModel',
          'target',
          'issued',
          'gate',
        ].some((k) => v[k] !== entryPins[index][k])
      )
        throw Error('Original operating handle changed');
      if (
        v.company !== root.company ||
        v.operations !== root.operations ||
        v.estimates !== root.estimates ||
        v.property !== root.property ||
        v.gate !== root.gate
      )
        throw Error('Foreign or substituted operating source set');
      const t = prototypeFields(v.target, targetKeys);
      if (
        Object.keys(t).length !== targetKeys.length ||
        targetKeys.some(
          (k) =>
            typeof t[k] !== 'string' ||
            !(t[k] as string).length ||
            (t[k] as string).length > 200,
        ) ||
        t.organization_id !== organization_id ||
        t.actor_id !== actor_id ||
        jobs.has(t.job_id as string)
      )
        throw Error(
          'Exact unique company/job/customer/property handles required',
        );
      jobs.add(t.job_id as string);
      const target = t as unknown as PrototypeTarget;
      const canonical = estimates.readSyntheticPrototypeSources(target);
      const crm = operations.syntheticEstimateCrm(
        organization_id,
        target.customer_id,
        target.location_id,
      );
      const lead = operations.syntheticIntakeRequest(
        organization_id,
        target.customer_id,
        target.location_id,
        v.intake_request_id as string,
      );
      const state = property.read(organization_id);
      const issued = prototypeFields(v.issued, ['estimate', 'version']);
      const issuedEstimate = prototypeFields(
        issued.estimate,
        Object.keys(issued.estimate as object),
      );
      if (
        Object.keys(issued).length !== 2 ||
        issuedEstimate.id !== target.estimate_id ||
        issuedEstimate.organization_id !== organization_id ||
        issuedEstimate.customer_id !== target.customer_id ||
        dataSignature(issued.version) !==
          dataSignature(canonical.bundle.version)
      )
        throw Error('Exact immutable issued handle/version required');
      const plan = state.plans.filter(
        (p) =>
          p.id === v.plan_id &&
          p.organization_id === organization_id &&
          p.customer_id === target.customer_id &&
          p.location_id === target.location_id &&
          p.job_id === target.job_id,
      );
      const publishedVisit = state.visits.filter(
        (x) =>
          x.id === v.visit_id &&
          x.organization_id === organization_id &&
          x.plan_id === v.plan_id &&
          x.status === 'published',
      );
      const scheduledVisit = state.visits.filter(
        (x) =>
          x.id === v.scheduled_visit_id &&
          x.organization_id === organization_id &&
          x.plan_id === v.plan_id &&
          x.visited_on === v.day,
      );
      const report = state.reports.filter(
        (r) =>
          r.id === v.report_id &&
          r.version === v.published_version &&
          r.organization_id === organization_id &&
          r.customer_id === target.customer_id &&
          r.location_id === target.location_id &&
          r.visit_id === v.visit_id,
      );
      const worker = canonical.workforce.workers.filter(
        (w) =>
          w.id === v.worker_id &&
          w.active &&
          w.organization_id === organization_id &&
          w.user_id,
      );
      if (
        plan.length !== 1 ||
        plan[0].timezone !== v.timezone ||
        publishedVisit.length !== 1 ||
        scheduledVisit.length !== 1 ||
        report.length !== 1 ||
        worker.length !== 1 ||
        !estimates
          .syntheticJobAssignments(organization_id, actor_id)
          .some(
            (a) =>
              a.job_id === target.job_id &&
              a.user_id === worker[0].user_id &&
              a.active,
          )
      )
        throw Error('Exact plan/visit/report/assigned-worker binding required');
      if (
        !state.contexts.some(
          (c) =>
            c.customer_id === target.customer_id &&
            c.location_id === target.location_id &&
            c.job_id === target.job_id,
        ) ||
        canonical.bundle.version.status !== 'issued' ||
        !canonical.job
      )
        throw Error('Exact issued property/job source unavailable');
      if (
        !(v.release instanceof ReleasePreview) ||
        v.release.organizationId !== organization_id
      )
        throw Error('Exact local release source required');
      const release = v.release.read('staff');
      if (
        !release.release_offers.some(
          (o) => o.id === v.offer_id && o.version_id === target.version_id,
        ) ||
        !release.release_decisions.some(
          (d) => d.id === v.receipt_id && d.offer_id === v.offer_id,
        )
      )
        throw Error('Exact original offer/receipt required');
      return {
        target: t,
        lead,
        canonical,
        crm,
        release,
        selectors: {
          intake_request_id: v.intake_request_id,
          offer_id: v.offer_id,
          receipt_id: v.receipt_id,
          day: v.day,
          timezone: v.timezone,
          worker_id: v.worker_id,
          plan_id: v.plan_id,
          visit_id: v.visit_id,
          scheduled_visit_id: v.scheduled_visit_id,
          report_id: v.report_id,
          published_version: v.published_version,
        },
        issued: v.issued,
      };
    });
    const members = operations.syntheticMemberships(organization_id);
    const value = dataSignature({
      selected,
      members,
      property: property.read(organization_id),
      assignments: estimates.syntheticJobAssignments(organization_id, actor_id),
    });
    const terminal = prototypeFields(sources, [
      'company',
      'operations',
      'estimates',
      'property',
      'entries',
      'gate',
    ]);
    if (
      Object.keys(terminal).length !== 6 ||
      Object.keys(root).some((k) => terminal[k] !== root[k])
    )
      throw Error('Operating source container changed');
    admit(gate);
    admit(terminal.gate as JourneyAdmission);
    return value;
  };
  const pinned = snapshot();
  const check = () => {
    if (snapshot() !== pinned)
      throw Error('Operating source changed; exact read-only refresh required');
  };
  return { entries, organization_id, actor_id, check };
}
function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Explicit local operating-center confirmation required');
}
/** Four jobs / three customers and properties, including two jobs at one exact property.
 * Explicit engineering fixtures only: local issue/preferences/assignments/cost review
 * are not contract approval, dispatch, physical work, invoices, payment or messages. */
export async function prepareOperatingSources(
  company: CompanyProfile,
  gate: JourneyAdmission,
): Promise<OperatingSources> {
  admit(gate);
  approvedCompany(company);
  const checkedCompany = approvedCompany(company);
  const approved = sampleCompanies.find((c) => c.id === checkedCompany.id);
  if (!approved) throw Error('Approved synthetic company required');
  const operations = new Operations(true);
  const estimates = new Phase3Repository(operations);
  await estimates.initialize(approved);
  admit(gate);
  approvedCompany(company);
  const property = new PropertyRepository(operations, estimates);
  await property.initialize(approved);
  const entries: LocalJourney[] = [];
  for (let index = 0; index < 4; index++) {
    admit(gate);
    approvedCompany(company);
    entries.push(
      await prepareEntry(
        company,
        gate,
        operations,
        estimates,
        property,
        index,
        index === 3 ? entries[0] : undefined,
      ),
    );
  }
  const result = { company, operations, estimates, property, entries, gate };
  captureOperatingSources(result, gate).check();
  return result;
}
async function prepareEntry(
  company: CompanyProfile,
  gate: JourneyAdmission,
  operations: Operations,
  estimates: Phase3Repository,
  property: PropertyRepository,
  index: number,
  reuse?: LocalJourney,
): Promise<LocalJourney> {
  admit(gate);
  approvedCompany(company);
  const checkedCompany = approvedCompany(company);
  const approved = sampleCompanies.find((c) => c.id === checkedCompany.id);
  if (!approved) throw Error('Approved synthetic company required');
  let lead: ReturnType<Operations['syntheticIntakeRequest']>;
  if (reuse) {
    lead = operations.syntheticIntakeRequest(
      company.id,
      reuse.target.customer_id,
      reuse.target.location_id,
      reuse.intake_request_id,
    );
  } else {
    const previous = new Set(
      (await operations.listIntake(company.id)).rows.map((r) => r.id),
    );
    admit(gate);
    approvedCompany(company);
    await operations.sampleSubmit(company.slug, {
      name: `Synthetic Operating Customer ${index + 1}`,
      email: `journey-${crypto.randomUUID()}@example.invalid`,
      phone: '5550100100',
      address: `${300 + index} Synthetic Operating Lane`,
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
    approvedCompany(company);
    const created = (await operations.listIntake(company.id)).rows.filter(
      (r) => !previous.has(r.id),
    );
    if (
      created.length !== 1 ||
      !created[0].customer_id ||
      !created[0].service_location_id
    )
      throw Error('Exact created intake source unavailable');
    lead = created[0];
  }
  const customer = lead.customer_id!,
    location = lead.service_location_id!;
  operations.syntheticIntakeRequest(company.id, customer, location, lead.id);
  const input = industryEstimate(company, customer);
  input.location_id = location;
  input.expires_on = '2099-12-31';
  input.tax_policy_id = (await estimates.taxes(company.id))[0].id;
  admit(gate);
  approvedCompany(company);
  const draft = await estimates.create(company, input);
  admit(gate);
  approvedCompany(company);
  const issued = await estimates.issue(company.id, draft);
  admit(gate);
  approvedCompany(company);
  const release = new ReleasePreview(company.id, issued.version);
  await release.command('staff', 'publish_offer', {
    version_id: issued.version.id,
  });
  admit(gate);
  approvedCompany(company);
  const offer = release.read('staff').release_offers;
  if (offer.length !== 1) throw Error('Exact local offer required');
  await release.command('customer', 'decide_offer', {
    offer_id: offer[0].id,
    decision: 'accepted',
    note: 'Explicit LOCAL TEST preference; no contract authority.',
    consent: true,
  });
  admit(gate);
  approvedCompany(company);
  const receipts = release.read('staff').release_decisions;
  if (receipts.length !== 1) throw Error('Exact local test receipt required');
  // A separate explicit engineering fixture, never permission derived from a preference/contract packet.
  const jobId = await estimates.approveJob(company.id, issued);
  admit(gate);
  approvedCompany(company);
  // Existing internal cost-review evidence only: no payment, purchase order or ledger.
  const commitment = await estimates.submitExpense(company.id, jobId, {
    purchase_key: crypto.randomUUID(),
    supplier: 'Synthetic planning supplier',
    reference: 'LOCAL-COMMITMENT-ONLY',
    category: 'materials',
    kind: 'commitment',
    amount_minor: 12500 * (index + 1),
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
  approvedCompany(company);
  await estimates.reviewExpense(
    company.id,
    jobId,
    commitment,
    'approved',
    'Explicit synthetic engineering fixture; no payment authority.',
  );
  admit(gate);
  approvedCompany(company);
  const actor = `${company.id}-owner`;
  const workforce = await estimates.workforce(company.id);
  const worker = workforce.workers.find(
    (w) =>
      w.user_id === `${company.id}-${index % 2 ? 'owner' : 'field'}` &&
      w.active,
  );
  if (!worker?.user_id)
    throw Error('Exact existing synthetic field worker unavailable');
  const job = (await estimates.jobs(company.id)).find((j) => j.id === jobId)!;
  admit(gate);
  approvedCompany(company);
  await estimates.assignJob(company.id, jobId, worker.user_id, true, {
    reviewer: actor,
    job_revision: job.lock_revision,
    issued_version_id: issued.version.id,
    expected_active: null,
    assertCurrent: () => admit(gate),
  });
  admit(gate);
  approvedCompany(company);
  await property.refreshContexts(company.id);
  admit(gate);
  approvedCompany(company);
  const context = property
    .read(company.id)
    .contexts.find(
      (c) =>
        c.customer_id === customer &&
        c.location_id === location &&
        c.job_id === jobId,
    );
  if (!context) throw Error('Exact existing property/job context unavailable');
  const day = index % 2 ? '2026-12-08' : '2026-12-07';
  const plan = property.createPlan(
    company.id,
    context,
    `Synthetic operating review ${index + 1}`,
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
    index % 2 ? '2026-12-29' : '2026-12-28',
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
  approvedCompany(company);
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
