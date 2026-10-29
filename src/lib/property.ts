import type {
  RepairReview,
  RepairAttempt,
  RepairProvenance,
} from '../domain/property/repair-draft';
import type { Operations } from './operations';
import { phase3Repository, type Phase3Repository } from './phase3';
import type { CompanyProfile } from '../domain/platform';
import type { EstimateBundle } from '../domain/estimating/types';
import { blankEstimate, blankLine } from '../domain/estimating/calculation';
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
  compareSuppliers,
  draftCostLines,
  type SupplierQuote,
} from '../domain/property/comparison';
import {
  prepareMaterialDecision,
  type MaterialDecision,
} from '../domain/property/unbilled';
import { buildPropertyAttention } from '../domain/property/attention';
import { projectPublishedHistory } from '../domain/property/report-page';
import {
  blankMaintenance,
  maintenanceKey,
  maintenanceStatus,
  editMaintenance,
  maintenanceDate,
  type MaintenanceRecord,
  type MaintenanceSource,
  type MaintenanceEdit,
  type MaintenanceItem,
} from '../domain/property/maintenance';
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
  private repairReviews = new Map<string, RepairReview>();
  private repairAttempts = new Map<string, RepairAttempt>();
  private maintenanceRecords = new Map<string, MaintenanceRecord>();
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
    const sourceCustomers = new Map<string, string>();
    for (const estimate of await this.estimates.list(org))
      for (const version of await this.estimates.history(org, estimate.id))
        if (version.status === 'issued')
          sourceCustomers.set(version.id, version.payload.customer_id);
    for (const c of customers.rows) {
      const locations = await this.operations.listLocations(org, c.id);
      for (const l of locations) {
        const matching = jobs.filter(
          (j) => sourceCustomers.get(j.baseline.issued_version_id) === c.id,
        );
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
  private repairGuard(
    org: string,
    actor: string,
    review: RepairReview,
    checkRevision: boolean,
  ) {
    this.maintenanceAuthority(org, actor);
    const bound = this.maintenanceSource(org, review.source);
    this.operations.syntheticProperty(
      org,
      review.source.customer_id,
      review.source.location_id,
    );
    if (
      review.actor !== actor ||
      bound.plan.job_id !== review.job_id ||
      (checkRevision && bound.plan.revision !== review.plan_revision) ||
      JSON.stringify(bound.report) !== review.evidence
    )
      throw Error(
        'Repair source or plan changed. Review exact evidence again.',
      );
    if (
      checkRevision &&
      (
        this.maintenanceRecords.get(maintenanceKey(review.source)) ??
        blankMaintenance()
      ).revision !== review.maintenance_revision
    )
      throw Error('Maintenance item changed. Review again before preparing.');
    if (review.job_id) {
      const job = this.estimates.syntheticJob(org, review.job_id);
      if (!job) throw Error('Linked job unavailable.');
      // The baseline relationship was checked during review; it is immutable.
      if (job.baseline.issued_version_id !== review.job_baseline_version_id)
        throw Error('Linked job baseline changed.');
    }
    return bound;
  }
  async reviewRepair(
    company: CompanyProfile,
    actor: string,
    source: MaintenanceSource,
    revision: number,
  ) {
    company = clone(company);
    source = clone(source);
    const org = company.id;
    this.maintenanceAuthority(org, actor);
    const bound = clone(this.maintenanceSource(org, source));
    if (
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      (
        this.maintenanceRecords.get(maintenanceKey(source)) ??
        blankMaintenance()
      ).revision !== revision
    )
      throw Error('Maintenance item changed. Reload before review.');
    if (this.repairAttempts.has(maintenanceKey(source)))
      throw Error(
        'Repair preparation already attempted. Open or reconcile the retained attempt.',
      );
    const baseline = bound.plan.job_id
      ? (this.estimates.syntheticJob(org, bound.plan.job_id)?.baseline
          .issued_version_id ?? null)
      : null;
    if (bound.plan.job_id) await this.maintenanceWork(org, actor, source);
    const settings = await this.estimates.defaults(org);
    const payload = blankEstimate(source.customer_id, settings.currency);
    payload.location_id = source.location_id;
    payload.project.name = ('Repair review · ' + bound.finding.location).slice(
      0,
      200,
    );
    payload.project.description =
      'Proposed scope only; all quantities and pricing require contractor review.';
    payload.lines = [
      {
        ...blankLine('service'),
        description:
          bound.finding.recommendation || 'Prepare repair scope after review',
        quantity_milli: 1000,
        unit_price_minor: 0,
      },
    ];
    // Existing engine requires a positive quantity; one unit is an unmeasured placeholder.
    const review: RepairReview = {
      id: crypto.randomUUID(),
      source: clone(source),
      maintenance_revision: revision,
      plan_revision: bound.plan.revision,
      job_baseline_version_id: baseline,
      job_id: bound.plan.job_id,
      actor,
      evidence: JSON.stringify(bound.report),
      payload,
    };
    this.repairGuard(org, actor, review, true);
    this.repairReviews.set(review.id, clone(review));
    return clone(review);
  }
  async findingEstimate(
    company: CompanyProfile,
    actor: string,
    source: MaintenanceSource,
    reviewId: string,
  ) {
    company = clone(company);
    source = clone(source);
    const org = company.id;
    this.maintenanceAuthority(org, actor);
    this.maintenanceSource(org, source);
    const key = maintenanceKey(source),
      prior = this.repairAttempts.get(key);
    if (prior) {
      if (prior.review.id !== reviewId || prior.review.actor !== actor)
        throw Error(
          'Repair already attempted for this exact source. Open or reconcile it.',
        );
      if (prior.status !== 'prepared')
        throw Error(
          'Preparation is interrupted or uncertain. Reconcile explicitly; do not retry.',
        );
      return (await this.openRepair(org, actor, source)).bundle;
    }
    const review = this.repairReviews.get(reviewId);
    if (!review || maintenanceKey(review.source) !== key)
      throw Error('Exact repair review required.');
    this.repairGuard(org, actor, review, true);
    const attempt: RepairAttempt = {
      review: clone(review),
      status: 'preparing',
      provenance: null,
    };
    this.repairAttempts.set(key, attempt); // Reserve before any awaited operation; never delete on uncertainty.
    try {
      const payload = clone(review.payload);
      payload.internal_notes = ''; // Relationships are structured metadata, not note text.
      const bundle = await this.estimates.createSyntheticRepair(
        company,
        payload,
        (candidate) => {
          this.repairGuard(org, actor, review, true);
          const origin: RepairProvenance = {
            source: clone(source),
            job_id: review.job_id,
            estimate_id: candidate.estimate.id,
            draft_version_id: candidate.version.id,
            draft_version_number: candidate.version.version_number,
            line_id: payload.lines[0].id,
            prepared_by: actor,
            prepared_at: new Date().toISOString(),
            preparation_id: review.id,
          };
          attempt.provenance = clone(origin);
          return {
            origin,
            authorize: () => {
              this.repairGuard(org, actor, review, false);
            },
            evidence: () => {
              if (attempt.status !== 'prepared')
                throw Error(
                  'Repair preparation is uncertain; reconcile before readiness review.',
                );
              const bound = this.repairGuard(org, actor, review, false);
              return clone({
                finding: bound.finding,
                visited_on: bound.report.visited_on,
                suggested_scope: review.payload.lines[0].description,
                job_baseline_version_id: review.job_baseline_version_id,
              });
            },
          };
        },
      );
      this.validateRepairBundle(org, source, attempt, bundle);
      attempt.status = 'prepared';
      return clone(bundle);
    } catch (e) {
      attempt.status = 'uncertain';
      throw Error(
        'Preparation stopped. Reconcile retained evidence; do not retry. ' +
          (e instanceof Error ? e.message : 'Unknown result.'),
        { cause: e },
      );
    }
  }
  private validateRepairBundle(
    org: string,
    source: MaintenanceSource,
    attempt: RepairAttempt,
    bundle: EstimateBundle,
  ) {
    const p = attempt.provenance;
    const origin =
      p && this.estimates.repairOrigin(org, p.estimate_id, p.draft_version_id);
    if (
      !p ||
      maintenanceKey(p.source) !== maintenanceKey(attempt.review.source) ||
      !origin ||
      JSON.stringify(origin) !== JSON.stringify(p) ||
      bundle.estimate.id !== p.estimate_id ||
      bundle.estimate.organization_id !== org ||
      bundle.estimate.customer_id !== source.customer_id ||
      bundle.estimate.status !== 'draft' ||
      bundle.estimate.current_version_id !== p.draft_version_id ||
      bundle.version.id !== p.draft_version_id ||
      bundle.version.estimate_id !== p.estimate_id ||
      bundle.version.organization_id !== org ||
      bundle.version.version_number !== p.draft_version_number ||
      bundle.version.status !== 'draft' ||
      bundle.version.payload.customer_id !== source.customer_id ||
      bundle.version.payload.location_id !== source.location_id ||
      bundle.version.payload.lines.filter((l) => l.id === p.line_id).length !==
        1
    )
      throw Error(
        'Exact repair draft binding unavailable. No substitute estimate selected.',
      );
  }
  repairAttempt(org: string, actor: string, source: MaintenanceSource) {
    this.maintenanceAuthority(org, actor);
    this.maintenanceSource(org, source);
    return clone(this.repairAttempts.get(maintenanceKey(source)) ?? null);
  }
  async openRepair(
    org: string,
    actor: string,
    source: MaintenanceSource,
    reconcile = false,
  ) {
    source = clone(source);
    this.maintenanceAuthority(org, actor);
    this.maintenanceSource(org, source);
    const attempt = this.repairAttempts.get(maintenanceKey(source));
    if (!attempt || (!reconcile && attempt.status !== 'prepared'))
      throw Error('No confirmed repair draft. Reconcile the retained attempt.');
    if (attempt.status === 'preparing')
      throw Error(
        'Preparation still running. Wait, then reconcile; do not retry.',
      );
    const p = attempt.provenance;
    if (!p)
      throw Error(
        'No committed draft identity was retained. No retry is permitted; inspect the disposable session.',
      );
    const bundle = await this.estimates.get(
      org,
      p.estimate_id,
      p.draft_version_id,
    );
    this.maintenanceAuthority(org, actor);
    this.maintenanceSource(org, source);
    this.validateRepairBundle(org, source, attempt, bundle);
    attempt.status = 'prepared';
    return { bundle, provenance: clone(p) };
  }
  private maintenanceAuthority(org: string, actor: string) {
    this.state(org); // Reject connected use before any membership adapter can run.
    const members = this.operations.syntheticMemberships(org);
    const member = members.find(
      (m) => m.organization_id === org && m.user_id === actor && m.active,
    );
    if (
      !member ||
      !(
        ['owner', 'admin'].includes(member.role) ||
        (member.role === 'staff' &&
          ['office_manager', 'estimator'].includes(member.staff_type))
      )
    )
      throw Error('Active contractor maintenance reviewer required.');
    return {
      members: members.filter(
        (m) =>
          m.organization_id === org &&
          m.active &&
          ['owner', 'admin', 'staff'].includes(m.role),
      ),
      admin: ['owner', 'admin'].includes(member.role),
    };
  }
  private maintenanceSource(org: string, source: MaintenanceSource) {
    const s = this.state(org);
    if (
      !source ||
      Object.keys(source).sort().join(',') !==
        'customer_id,finding_id,location_id,organization_id,report_id,report_version' ||
      source.organization_id !== org ||
      !Number.isSafeInteger(source.report_version) ||
      source.report_version < 1
    )
      throw Error('Published maintenance source unavailable.');
    const report = s.reports.find(
      (r) =>
        r.id === source.report_id &&
        r.version === source.report_version &&
        r.organization_id === org &&
        r.customer_id === source.customer_id &&
        r.location_id === source.location_id,
    );
    const visit =
      report &&
      s.visits.find(
        (v) => v.id === report.visit_id && v.organization_id === org,
      );
    const plan =
      visit &&
      s.plans.find(
        (p) =>
          p.id === visit.plan_id &&
          p.organization_id === org &&
          p.customer_id === source.customer_id &&
          p.location_id === source.location_id,
      );
    const context =
      plan &&
      s.contexts.find(
        (c) =>
          c.customer_id === plan.customer_id &&
          c.location_id === plan.location_id &&
          c.job_id === plan.job_id,
      );
    const finding = report?.findings.find((f) => f.id === source.finding_id);
    if (
      !report ||
      !visit ||
      !plan ||
      !context ||
      !finding ||
      s.reports.filter(
        (r) => r.id === source.report_id && r.version === source.report_version,
      ).length !== 1 ||
      report.findings.filter((f) => f.id === source.finding_id).length !== 1 ||
      s.visits.filter((v) => v.id === report.visit_id).length !== 1 ||
      s.plans.filter((p) => p.id === visit.plan_id).length !== 1 ||
      s.contexts.filter(
        (c) =>
          c.customer_id === source.customer_id &&
          c.location_id === source.location_id &&
          c.job_id === plan.job_id,
      ).length !== 1
    )
      throw Error('Published maintenance source unavailable.');
    projectPublishedHistory([report], source);
    return { report, visit, plan, context, finding };
  }
  private repairQueueReadiness(org: string, actor: string, key: string) {
    const attempt = this.repairAttempts.get(key),
      p = attempt?.provenance;
    if (attempt?.status !== 'prepared' || !p) return null;
    try {
      const readiness = this.estimates.repairReadiness(
        org,
        actor,
        p.estimate_id,
        p.draft_version_id,
      );
      return {
        confirmed: readiness.confirmed,
        revision: readiness.lock_revision,
      };
    } catch {
      // An unavailable/archived/changed draft cannot advertise cached readiness.
      return null;
    }
  }
  maintenance(org: string, actor: string) {
    const authority = this.maintenanceAuthority(org, actor),
      s = this.state(org);
    const items: MaintenanceItem[] = [];
    const properties = [
      ...new Map(s.contexts.map((c) => [c.location_id, c])).values(),
    ];
    for (const property of properties) {
      const reports = s.reports.filter(
        (r) => r.location_id === property.location_id,
      );
      const attention = buildPropertyAttention(
        {
          organization_id: org,
          customer_id: property.customer_id,
          location_id: property.location_id,
          company_name: '',
          primary_color: '',
          property_label: property.location_label,
          reports: true,
          version_ids: [],
        },
        reports,
      );
      for (const report of reports)
        for (const finding of report.findings) {
          const source: MaintenanceSource = {
            organization_id: org,
            customer_id: property.customer_id,
            location_id: property.location_id,
            report_id: report.id,
            report_version: report.version,
            finding_id: finding.id,
          };
          const bound = this.maintenanceSource(org, source),
            key = maintenanceKey(source);
          const record = clone(
            this.maintenanceRecords.get(key) ?? blankMaintenance(),
          );
          const evidence = attention.items.find((a) =>
            a.observations.some(
              (o) =>
                o.report_id === report.id &&
                o.report_version === report.version &&
                o.finding.id === finding.id,
            ),
          );
          if (!evidence) throw Error('Maintenance evidence unavailable.');
          const scheduled = record.scheduled_visit_id
            ? s.visits.find(
                (v) =>
                  v.id === record.scheduled_visit_id &&
                  s.plans.some(
                    (p) =>
                      p.id === v.plan_id &&
                      p.customer_id === property.customer_id &&
                      p.location_id === property.location_id,
                  ),
              )
            : null;
          if (record.scheduled_visit_id && !scheduled)
            throw Error('Follow-up draft binding unavailable.');
          items.push({
            key,
            source,
            property_label: bound.context.location_label,
            customer_name: bound.context.customer_name,
            report: clone(report),
            finding: clone(finding),
            plan_id: bound.plan.id,
            job_id: bound.plan.job_id,
            record,
            status: maintenanceStatus(record),
            recurring: evidence.recurring,
            inspection_dates: evidence.inspection_dates,
            uncertainties: evidence.uncertainties,
            repair_status: 'undetermined',
            scheduled_on: scheduled?.visited_on ?? null,
            repair: this.repairAttempts.has(key)
              ? {
                  status: this.repairAttempts.get(key)!.status,
                  draft_version_id:
                    this.repairAttempts.get(key)!.provenance
                      ?.draft_version_id ?? null,
                  readiness: this.repairQueueReadiness(org, actor, key),
                }
              : null,
          });
        }
    }
    return {
      items,
      members: authority.members.map((m) => ({
        user_id: m.user_id,
        label: m.role + ' · ' + m.staff_type,
        active: m.active,
      })),
      admin: authority.admin,
    };
  }
  async saveMaintenance(
    org: string,
    actor: string,
    source: MaintenanceSource,
    revision: number,
    input: MaintenanceEdit,
  ) {
    const authority = this.maintenanceAuthority(org, actor);
    this.maintenanceSource(org, source);
    const key = maintenanceKey(source),
      current = this.maintenanceRecords.get(key) ?? blankMaintenance();
    const next = editMaintenance(
      current,
      revision,
      input,
      actor,
      authority.members.map((m) => m.user_id),
    );
    this.maintenanceRecords.set(key, next);
    return clone(next);
  }
  async scheduleMaintenance(
    org: string,
    actor: string,
    source: MaintenanceSource,
    revision: number,
    planRef: { id: string; revision: number },
    date: string,
  ) {
    this.maintenanceAuthority(org, actor);
    this.maintenanceSource(org, source);
    const key = maintenanceKey(source),
      current = this.maintenanceRecords.get(key) ?? blankMaintenance();
    if (
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      current.revision !== revision ||
      current.revision >= Number.MAX_SAFE_INTEGER
    )
      throw Error('Maintenance item changed. Reload before scheduling.');
    if (current.scheduled_visit_id)
      throw Error(
        'A follow-up draft already exists. Open it in the inspection workflow.',
      );
    if (current.review === 'reviewed')
      throw Error('Reopen staff review before preparing a follow-up draft.');
    const plan = this.state(org).plans.find(
      (p) =>
        p.id === planRef.id &&
        p.organization_id === org &&
        p.customer_id === source.customer_id &&
        p.location_id === source.location_id &&
        p.revision === planRef.revision,
    );
    if (!plan)
      throw Error('Inspection plan changed or belongs to another property.');
    maintenanceDate(date);
    const visit = this.addVisit(org, plan.id, date);
    this.maintenanceRecords.set(key, {
      ...clone(current),
      revision: current.revision + 1,
      scheduled_visit_id: visit.id,
    });
    return clone(visit);
  }
  async maintenanceWork(org: string, actor: string, source: MaintenanceSource) {
    this.maintenanceAuthority(org, actor);
    const bound = this.maintenanceSource(org, source);
    if (!bound.plan.job_id)
      throw Error('No job explicitly linked to this inspection plan.');
    const job = (await this.estimates.jobs(org)).find(
      (j) => j.id === bound.plan.job_id && j.organization_id === org,
    );
    if (!job) throw Error('Linked job unavailable.');
    const bundle = await this.estimates.sourceEstimate(
      org,
      job.baseline.issued_version_id,
    );
    const freshAuthority = this.maintenanceAuthority(org, actor);
    this.maintenanceSource(org, source);
    if (
      bundle.estimate.organization_id !== org ||
      bundle.version.status !== 'issued' ||
      bundle.version.id !== job.baseline.issued_version_id ||
      bundle.version.estimate_id !== bundle.estimate.id ||
      bundle.version.organization_id !== org ||
      bundle.version.payload.customer_id !== source.customer_id ||
      (bundle.version.payload.location_id &&
        bundle.version.payload.location_id !== source.location_id)
    )
      throw Error('Linked estimate belongs to another property.');
    return { job_id: job.id, bundle, admin: freshAuthority.admin };
  }
  saveQuotes(org: string, quotes: SupplierQuote[]) {
    const s = this.state(org);
    compareSuppliers(
      requirementsFromLines(s.bundle.version.payload.lines),
      quotes,
      s.bundle.version.payload.currency,
    );
    s.quotes.push(clone(quotes));
  }
  async applyCosts(
    org: string,
    quotes: SupplierQuote[],
    assignments: { line_id: string; quote_id: string }[],
  ) {
    const s = this.state(org);
    compareSuppliers(
      requirementsFromLines(s.bundle.version.payload.lines),
      quotes,
      s.bundle.version.payload.currency,
    );
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
