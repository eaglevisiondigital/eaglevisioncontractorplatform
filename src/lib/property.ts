import type { Operations } from './operations';
import { phase3Repository, type Phase3Repository } from './phase3';
import type { CompanyProfile } from '../domain/platform';
import type { EstimateBundle } from '../domain/estimating/types';
import { blankLine } from '../domain/estimating/calculation';
import { ReleasePreview } from '../domain/release/preview';
import { Temporal } from '@js-temporal/polyfill';
import {
  publishVisit,
  validateVisit,
  occurrence,
  type InspectionPlan,
  type Visit,
  type VisitContent,
  type PublishedReport,
} from '../domain/property/inspections';
import {
  requirementsFromLines,
  draftCostLines,
  type SupplierQuote,
} from '../domain/property/comparison';
import {
  prepareMaterialDecision,
  type MaterialDecision,
} from '../domain/property/unbilled';
const clone = <T>(x: T): T => structuredClone(x);
export interface PropertyState {
  contexts: {
    customer_id: string;
    customer_name: string;
    location_id: string;
    location_label: string;
    job_id: string | null;
  }[];
  plans: InspectionPlan[];
  visits: Visit[];
  reports: PublishedReport[];
  quotes: SupplierQuote[][];
  decisions: MaterialDecision[];
  bundle: EstimateBundle;
  customer_name: string;
  location_label: string;
}
/** Explicit in-memory laboratory. Connected routes cannot instantiate this service. */
export class PropertyRepository {
  private states = new Map<string, PropertyState>();
  private initializing = new Map<string, Promise<void>>();
  private financial = new Map<string, ReleasePreview>();
  private reviewing = new Set<string>();
  constructor(
    readonly operations: Operations,
    readonly estimates: Phase3Repository = phase3Repository(operations),
  ) {}
  private state(org: string) {
    const s = this.states.get(org);
    if (!this.operations.sample || !s)
      throw Error(
        'Property operations unavailable; connected activation is not approved',
      );
    return s;
  }
  async initialize(c: CompanyProfile) {
    let pending = this.initializing.get(c.id);
    if (!pending) {
      pending = this.initializeOnce(c);
      this.initializing.set(c.id, pending);
      pending.catch(() => this.initializing.delete(c.id));
    }
    return pending;
  }
  private async initializeOnce(c: CompanyProfile) {
    if (!this.operations.sample)
      throw Error('Connected property operations disabled');
    if (this.states.has(c.id)) return;
    await this.estimates.initialize(c);
    const summary = (await this.estimates.list(c.id))[0];
    const job = (await this.estimates.jobs(c.id))[0];
    const bundle = summary
      ? await this.estimates.get(
          c.id,
          summary.id,
          job?.baseline.issued_version_id,
        )
      : null;
    if (!bundle) throw Error('Estimate context required');
    const customers = (await this.operations.listCustomers(c.id, '', '', 0))
      .rows;
    const customer = customers.find(
      (x) => x.id === bundle.version.payload.customer_id,
    );
    if (!customer) throw Error('Customer unavailable');
    let locations = await this.operations.listLocations(c.id, customer.id);
    if (!locations.length) {
      await this.operations.saveLocation(c.id, customer.id, {
        address_line1: '100 Synthetic Property Lane',
        address_line2: '',
        city: 'Example City',
        region: 'FL',
        postal_code: '00000',
        country_code: 'US',
      });
      locations = await this.operations.listLocations(c.id, customer.id);
    }
    const checklist = [
      {
        id: crypto.randomUUID(),
        label:
          c.industry === 'roofing'
            ? 'Roof surface and flashing'
            : 'Exterior condition and safety',
        required: true,
        completed: false,
      },
      {
        id: crypto.randomUUID(),
        label: 'Repair completion evidence',
        required: false,
        completed: false,
      },
    ];
    const plan: InspectionPlan = {
      revision: 1,
      id: crypto.randomUUID(),
      organization_id: c.id,
      customer_id: customer.id,
      location_id: locations[0].id,
      job_id: job?.id ?? null,
      name:
        c.industry === 'roofing'
          ? 'Roof condition survey'
          : c.industry === 'construction'
            ? 'Renovation progress inspection'
            : 'Recurring property care',
      cadence: 'monthly',
      interval_days: 14,
      timezone: 'America/Chicago',
      starts_on: '2026-10-16',
      checklist,
    };
    const visit: Visit = {
      id: crypto.randomUUID(),
      organization_id: c.id,
      plan_id: plan.id,
      visited_on: plan.starts_on,
      phase: 'before',
      revision: 1,
      status: 'draft',
      content: {
        summary:
          'Synthetic site survey. Exterior work area inspected; repair recommendations await contractor review.',
        internal_notes: 'INTERNAL supplier access and crew scheduling details',
        checklist: clone(checklist),
        findings: [
          {
            id: crypto.randomUUID(),
            category: 'Exterior',
            location:
              c.industry === 'roofing' ? 'North roof slope' : 'Rear entry',
            severity: 'moderate',
            description:
              c.industry === 'roofing'
                ? 'Worn flashing around roof penetration'
                : 'Weathered material at exterior joint',
            recommendation:
              'Inspect underlying surface and prepare a repair estimate.',
            customer_visible: true,
          },
          {
            id: crypto.randomUUID(),
            category: 'Office',
            location: 'Internal',
            severity: 'low',
            description: 'INTERNAL margin and purchasing review',
            recommendation: 'Internal management review only',
            customer_visible: false,
          },
        ],
      },
    };
    this.financial.set(c.id, new ReleasePreview(c.id, bundle.version));
    this.states.set(c.id, {
      contexts: [
        {
          customer_id: customer.id,
          customer_name: customer.display_name,
          location_id: locations[0].id,
          location_label: locations[0].address_line1,
          job_id: job?.id ?? null,
        },
      ],
      plans: [plan],
      visits: [visit],
      reports: [],
      quotes: [],
      decisions: [],
      bundle,
      customer_name: customer.display_name,
      location_label: locations[0].address_line1,
    });
  }
  async refreshContexts(org: string) {
    const s = this.state(org),
      customers = await this.operations.listCustomers(org, '', '', 0),
      jobs = await this.estimates.jobs(org);
    const contexts: PropertyState['contexts'] = [];
    for (const c of customers.rows) {
      const locations = await this.operations.listLocations(org, c.id);
      for (const l of locations) {
        const matching = [];
        for (const j of jobs) {
          const b = await this.estimates
            .get(org, s.bundle.estimate.id, j.baseline.issued_version_id)
            .catch(() => null);
          if (b?.version.payload.customer_id === c.id) matching.push(j);
        }
        if (matching.length)
          for (const j of matching)
            contexts.push({
              customer_id: c.id,
              customer_name: c.display_name,
              location_id: l.id,
              location_label: l.address_line1,
              job_id: j.id,
            });
        else
          contexts.push({
            customer_id: c.id,
            customer_name: c.display_name,
            location_id: l.id,
            location_label: l.address_line1,
            job_id: null,
          });
      }
    }
    s.contexts = contexts;
  }
  createPlan(
    org: string,
    context: PropertyState['contexts'][number],
    name: string,
  ) {
    const s = this.state(org);
    if (!name.trim() || name.length > 200) throw Error('Invalid plan name');
    if (
      !s.contexts.some(
        (x) =>
          x.customer_id === context.customer_id &&
          x.location_id === context.location_id &&
          x.job_id === context.job_id,
      )
    )
      throw Error('CRM/property/job context unavailable');
    const p: InspectionPlan = {
      id: crypto.randomUUID(),
      revision: 1,
      organization_id: org,
      customer_id: context.customer_id,
      location_id: context.location_id,
      job_id: context.job_id,
      name,
      cadence: 'once',
      interval_days: 14,
      timezone: 'America/Chicago',
      starts_on: Temporal.Now.plainDateISO('America/Chicago').toString(),
      checklist: [
        {
          id: crypto.randomUUID(),
          label: 'Inspect property condition',
          required: true,
          completed: false,
        },
      ],
    };
    validateVisit({
      summary: name,
      internal_notes: '',
      checklist: p.checklist,
      findings: [],
    });
    s.plans.push(p);
    return clone(p);
  }
  read(org: string) {
    return clone(this.state(org));
  }
  saveVisit(org: string, v: Visit, content: VisitContent) {
    const s = this.state(org),
      current = s.visits.find((x) => x.id === v.id);
    if (
      !current ||
      current.revision !== v.revision ||
      current.status !== 'draft'
    )
      throw Error('Visit changed or locked');
    current.content = validateVisit(content);
    current.revision++;
  }
  submit(org: string, v: Visit) {
    const current = this.state(org).visits.find((x) => x.id === v.id);
    if (
      !current ||
      current.revision !== v.revision ||
      current.status !== 'draft'
    )
      throw Error('Visit changed');
    validateVisit(current.content);
    current.status = 'submitted';
    current.revision++;
  }
  publish(org: string, v: Visit) {
    const s = this.state(org),
      current = s.visits.find((x) => x.id === v.id),
      plan = s.plans.find((x) => x.id === v.plan_id);
    if (!current || !plan || current.revision !== v.revision)
      throw Error('Visit changed');
    const version = s.reports.filter((r) => r.visit_id === v.id).length + 1;
    const report = publishVisit(plan, current, version);
    s.reports.push(clone(report));
    current.status = 'published';
    current.revision++;
    return clone(report);
  }
  revise(org: string, v: Visit) {
    const current = this.state(org).visits.find((x) => x.id === v.id);
    if (
      !current ||
      current.revision !== v.revision ||
      current.status !== 'published'
    )
      throw Error('Published report required');
    current.status = 'draft';
    current.revision++;
  }
  addVisit(
    org: string,
    planId: string,
    date: string,
    phase: Visit['phase'] = 'during',
  ) {
    if (!['before', 'during', 'after'].includes(phase))
      throw Error('Invalid visit phase');
    Temporal.PlainDate.from(date, { overflow: 'reject' });
    const s = this.state(org),
      p = s.plans.find((x) => x.id === planId);
    if (
      !p ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      s.visits.some((v) => v.plan_id === p.id && v.visited_on === date)
    )
      throw Error('Visit date already scheduled or invalid');
    const v: Visit = {
      id: crypto.randomUUID(),
      organization_id: org,
      plan_id: p.id,
      visited_on: date,
      phase,
      revision: 1,
      status: 'draft',
      content: {
        summary: 'Scheduled property inspection',
        internal_notes: '',
        checklist: p.checklist.map((x) => ({ ...x, completed: false })),
        findings: [],
      },
    };
    s.visits.push(v);
    return clone(v);
  }
  savePlan(org: string, p: InspectionPlan) {
    const s = this.state(org),
      old = s.plans.find((x) => x.id === p.id);
    if (
      !old ||
      old.revision !== p.revision ||
      p.organization_id !== org ||
      p.customer_id !== old.customer_id ||
      p.location_id !== old.location_id ||
      p.job_id !== old.job_id ||
      !p.name.trim() ||
      p.name.length > 200
    )
      throw Error('Property binding is immutable');
    occurrence(p, 1);
    validateVisit({
      summary: p.name,
      internal_notes: '',
      checklist: p.checklist,
      findings: [],
    });
    Object.assign(old, clone(p), { revision: old.revision + 1 });
  }
  async findingEstimate(org: string, visitId: string, findingId: string) {
    const s = this.state(org),
      v = s.visits.find((x) => x.id === visitId),
      f = v?.content.findings.find((f) => f.id === findingId);
    if (!f) throw Error('Finding unavailable');
    let b = await this.estimates.get(org, s.bundle.estimate.id);
    if (
      b.version.payload.lines.some((l) =>
        l.internal_note.includes(`finding ${findingId};`),
      )
    )
      throw Error('Repair scope already drafted');
    if (b.version.status !== 'draft') b = await this.estimates.revise(org, b);
    const line = {
      ...blankLine(),
      description: f.recommendation,
      internal_note: `Inspection ${visitId}, finding ${findingId}; pricing requires review`,
      unit_cost_minor: 0,
    };
    const saved = await this.estimates.save(org, b, {
      ...b.version.payload,
      lines: [...b.version.payload.lines, line],
    });
    return clone(saved);
  }
  saveQuotes(org: string, quotes: SupplierQuote[]) {
    this.state(org).quotes.push(clone(quotes));
  }
  async applyCosts(
    org: string,
    quotes: SupplierQuote[],
    assignments: { line_id: string; quote_id: string }[],
  ) {
    const s = this.state(org);
    let b = await this.estimates.get(org, s.bundle.estimate.id);
    const lines = draftCostLines(
      b.version.payload.lines,
      requirementsFromLines(s.bundle.version.payload.lines),
      quotes,
      assignments,
    );
    if (b.version.status !== 'draft') b = await this.estimates.revise(org, b);
    await this.estimates.save(org, b, {
      ...b.version.payload,
      lines,
    });
    this.saveQuotes(org, quotes);
  }
  async decide(
    org: string,
    jobId: string,
    expenseId: string,
    revision: number,
    input: Parameters<typeof prepareMaterialDecision>[2],
  ) {
    this.state(org);
    if (this.reviewing.has(org)) throw Error('Review in progress');
    this.reviewing.add(org);
    try {
      const s = this.state(org),
        job = (await this.estimates.jobs(org)).find((x) => x.id === jobId);
      if (!job) throw Error('Job unavailable');
      const history = s.decisions.filter((d) => d.expense_id === expenseId);
      if (history.length !== revision || history.some((d) => d.change_id))
        throw Error('Review changed or already proposed');
      const d = prepareMaterialDecision(job, expenseId, input);
      let changeId: string | null = null;
      if (d.disposition === 'proposed') {
        await this.estimates.proposeChange(org, jobId, {
          description: d.description,
          revenue_minor: d.selling_minor,
          cost_minor: 0,
          category: 'materials',
          status: 'proposed',
        });
        const refreshed = (await this.estimates.jobs(org)).find(
          (x) => x.id === jobId,
        )!;
        changeId = refreshed.changes.at(-1)!.id;
      }
      const result = {
        ...d,
        id: crypto.randomUUID(),
        revision: revision + 1,
        change_id: changeId,
      };
      s.decisions.push(result);
      return clone(result);
    } finally {
      this.reviewing.delete(org);
    }
  }
  async demonstrateFinancials(org: string) {
    this.state(org);
    const f = this.financial.get(org)!;
    if (f.read('staff').release_invoices.length) return;
    await f.command('staff', 'publish_offer', { version_id: f.version.id });
    const offer = f.read('staff').release_offers[0];
    await f.command('customer', 'decide_offer', {
      offer_id: offer.id,
      decision: 'accepted',
      note: 'Explicit synthetic local demonstration',
      consent: true,
    });
    await f.command('staff', 'create_contract', {
      offer_id: offer.id,
      terms:
        'Synthetic internal demonstration only. No legal agreement is executed.',
      legal_reference: 'Synthetic local preview',
    });
    const contract = f.read('staff').release_contracts[0];
    await f.command('customer', 'sign_contract', {
      contract_id: contract.id,
      document_hash: contract.document_hash,
      typed_name: 'Synthetic Customer',
      consent: true,
    });
    await f.command('staff', 'create_invoice', { contract_id: contract.id });
  }
  portal(org: string, customerId: string) {
    const s = this.state(org);
    if (!s.contexts.some((c) => c.customer_id === customerId))
      throw Error('Customer property unavailable');
    const financial = this.financial.get(org)!.read('customer');
    return {
      reports: s.reports.filter((r) => r.customer_id === customerId).map(clone),
      estimates: financial.release_offers
        .filter((x) => x.customer_id === customerId)
        .map((x) => clone(x.snapshot)),
      contracts: financial.release_contracts
        .filter((x) => x.customer_id === customerId)
        .map((x) => ({
          id: x.id,
          document: clone(x.document),
          internal_test: true,
        })),
      media: [] as never[],
      invoices: financial.release_invoices
        .filter((x) => x.customer_id === customerId)
        .map((x) => ({
          id: x.id,
          number: x.invoice_number,
          snapshot: clone(x.snapshot),
        })),
    };
  }
}
const repos = new WeakMap<Operations, PropertyRepository>();
export function propertyRepository(o: Operations) {
  let r = repos.get(o);
  if (!r) {
    r = new PropertyRepository(o);
    repos.set(o, r);
  }
  return r;
}
