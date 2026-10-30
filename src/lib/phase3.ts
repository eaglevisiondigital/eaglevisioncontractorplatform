import type { CustomerRevisionOrigin } from '../domain/estimating/change-request';
import {
  evaluateRepairReadiness,
  recordRepairReadiness,
  type RepairReadinessContext,
  type RepairReadinessEvidence,
  type RepairReadinessRequest,
  type RepairReadinessReview,
} from '../domain/property/repair-readiness';
import type { RepairProvenance } from '../domain/property/repair-draft';
import { supabase } from './supabase';
import type { Database, Json } from './database.types';
import type { Operations } from './operations';
import type { CompanyProfile } from '../domain/platform';
import type {
  EstimateBundle,
  EstimateInput,
  EstimateVersion,
  CatalogItem,
  TaxPolicy,
  EstimateTemplate,
  EstimateDefaults,
} from '../domain/estimating/types';
import { calculateEstimate } from '../domain/estimating/calculation';
import { industryEstimate } from '../domain/estimating/fixtures';
import {
  reviewTotals,
  approveReview,
  type Pricing,
  type MaterialReview,
} from '../domain/materials/import';
import {
  baselineFromEstimate,
  jobFinancials,
  type Job,
  type Expense,
  type ChangeOrder,
  type JobProjection,
  type LaborSummary,
} from '../domain/jobs/financials';
import {
  preparePayroll,
  validateTime,
  type Worker,
  type LaborRate,
  type TimeEntry,
  type TimeReview,
  type WorkforcePolicy,
  type PayrollRow,
} from '../domain/workforce/payroll';
const clone = <T>(v: T): T => structuredClone(v);
const now = () => new Date().toISOString();
function client() {
  if (!supabase) throw new Error('Connected service unavailable');
  return supabase;
}
function checked<T>(r: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> {
  if (r.error)
    throw new Error(
      'Operation denied, invalid, or changed. Reload and check your permissions and values.',
    );
  return r.data as NonNullable<T>;
}
async function rpc<T>(
  name: keyof Database['public']['Functions'],
  args: Record<string, unknown>,
): Promise<T> {
  return checked(await client().rpc(name, args as never)) as unknown as T;
}
export interface WorkforceData {
  workers: Worker[];
  rates: LaborRate[];
  entries: TimeEntry[];
  reviews: TimeReview[];
  policy: WorkforcePolicy | null;
  periods: {
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    snapshot: { rows: PayrollRow[]; deductions: Record<string, number> } | null;
  }[];
  payroll_admin: boolean;
  review_worker_ids: string[];
  jobs: { id: string; name: string }[];
}
interface SampleState {
  estimates: EstimateBundle[];
  history: EstimateVersion[];
  catalog: CatalogItem[];
  templates: EstimateTemplate[];
  taxes: TaxPolicy[];
  jobs: Job[];
  workforce: WorkforceData;
  counter: number;
  adjustments: Record<string, Json>[];
  importPricing: Pricing;
  approvals: Map<
    string,
    {
      estimateId: string;
      jobId?: string;
      lines: EstimateInput['lines'];
      review: MaterialReview;
    }
  >;
}
export class Phase3Repository {
  private states = new Map<string, SampleState>();
  private customerRequests = new Map<
    string,
    () => {
      version: EstimateVersion;
      offer_id: string;
      location_id: string;
      receipt: CustomerRevisionOrigin['receipt'];
    }[]
  >();
  private customerRevisions = new Map<
    string,
    {
      origin: CustomerRevisionOrigin;
      authorize: () => void;
    }
  >();
  bindSyntheticCustomerRequests(
    org: string,
    estimate: string,
    readRequests: () => {
      version: EstimateVersion;
      offer_id: string;
      location_id: string;
      receipt: CustomerRevisionOrigin['receipt'];
    }[],
  ) {
    this.state(org);
    if (!this.state(org).estimates.some((b) => b.estimate.id === estimate))
      throw Error('Estimate unavailable');
    this.customerRequests.set(estimate, readRequests);
  }
  private requireSyntheticEstimator(org: string, actor: string) {
    const member = this.operations
      .syntheticMemberships(org)
      .find((m) => m.user_id === actor && m.active);
    if (
      !member ||
      !(
        ['owner', 'admin'].includes(member.role) ||
        (member.role === 'staff' &&
          ['office_manager', 'estimator'].includes(member.staff_type))
      )
    )
      throw Error('Active estimating staff required');
  }
  customerRevisionOrigin(org: string, estimate: string) {
    this.state(org);
    const entry = this.customerRevisions.get(estimate);
    if (!entry) return null;
    if (entry.origin.organization_id !== org)
      throw Error('Revision unavailable');
    this.requireSyntheticEstimator(org, entry.origin.reviewed_by);
    entry.authorize();
    return clone(entry.origin);
  }
  /** Synchronous exact evidence for local packet CAS, never a connected adapter. */
  customerRevisionState(org: string, actor: string, estimate: string) {
    const state = this.state(org);
    this.requireSyntheticEstimator(org, actor);
    const origin = this.customerRevisionOrigin(org, estimate);
    const draft = state.estimates.find((b) => b.estimate.id === estimate);
    const source = state.history.find(
      (v) => v.id === origin?.source_version_id && v.estimate_id === estimate,
    );
    if (
      !origin ||
      !draft ||
      !source ||
      draft.version.id !== origin.draft_version_id ||
      draft.estimate.current_version_id !== draft.version.id ||
      draft.estimate.status !== 'draft' ||
      draft.version.status !== 'draft' ||
      source.status !== 'issued' ||
      source.organization_id !== org ||
      draft.version.organization_id !== org ||
      draft.version.supersedes_version_id !== source.id ||
      this.repairBindings.has(estimate) ||
      source.payload.customer_id !== origin.customer_id ||
      draft.version.payload.customer_id !== origin.customer_id ||
      source.payload.location_id !== origin.location_id ||
      draft.version.payload.location_id !== origin.location_id
    )
      throw Error('Exact current customer revision evidence unavailable');
    this.operations.syntheticProperty(
      org,
      origin.customer_id,
      origin.location_id,
    );
    return clone({ origin, source, draft });
  }
  async prepareSyntheticCustomerRevision(
    org: string,
    source: EstimateBundle,
    origin: Omit<CustomerRevisionOrigin, 'draft_version_id'>,
    authorize: () => void,
  ) {
    this.state(org);
    origin = clone(origin);
    const exact = this.customerRequests
      .get(source.estimate.id)?.()
      .find(
        (r) =>
          r.version.id === source.version.id &&
          r.offer_id === origin.offer_id &&
          r.location_id === origin.location_id &&
          JSON.stringify(r.receipt) === JSON.stringify(origin.receipt),
      );
    this.requireSyntheticEstimator(org, origin.reviewed_by);
    if (
      this.repairBindings.has(source.estimate.id) ||
      this.customerRevisions.has(source.estimate.id) ||
      !exact ||
      origin.organization_id !== org ||
      origin.estimate_id !== source.estimate.id ||
      origin.source_version_id !== source.version.id ||
      origin.source_version_number !== source.version.version_number ||
      origin.customer_id !== source.version.payload.customer_id ||
      origin.location_id !== source.version.payload.location_id ||
      origin.receipt.organization_id !== org ||
      origin.receipt.customer_id !== origin.customer_id ||
      origin.receipt.offer_id !== origin.offer_id ||
      origin.receipt.decision !== 'changes_requested'
    )
      throw Error(
        'Exact reviewed customer revision required; repair origins remain restricted',
      );
    return this.reviseWithGuard(org, source, (bundle) => {
      this.requireSyntheticEstimator(org, origin.reviewed_by);
      authorize();
      this.customerRevisions.set(bundle.estimate.id, {
        origin: { ...clone(origin), draft_version_id: bundle.version.id },
        authorize,
      });
    });
  }
  private repairBindings = new Map<
    string,
    {
      origin: RepairProvenance;
      authorize: () => void;
      evidence: () => RepairReadinessEvidence;
    }
  >();
  repairOrigin(org: string, estimate: string, version: string) {
    this.state(org);
    const binding = this.repairBindings.get(estimate);
    if (!binding) return null;
    if (
      binding.origin.source.organization_id !== org ||
      binding.origin.draft_version_id !== version
    )
      throw Error('Repair draft provenance mismatch');
    binding.authorize();
    return clone(binding.origin);
  }
  syntheticJob(org: string, id: string) {
    return clone(
      this.state(org).jobs.find(
        (j) => j.id === id && j.organization_id === org,
      ) ?? null,
    );
  }
  async createSyntheticRepair(
    company: CompanyProfile,
    payload: EstimateInput,
    commit: (bundle: EstimateBundle) => {
      origin: RepairProvenance;
      authorize: () => void;
      evidence: () => RepairReadinessEvidence;
    },
  ) {
    this.state(company.id); // No connected adapter or credential path.
    return this.createWithGuard(
      company,
      payload,
      crypto.randomUUID(),
      (bundle) => {
        const binding = commit(bundle);
        this.repairBindings.set(bundle.estimate.id, binding);
      },
    );
  }
  private readinessHistory = new Map<string, RepairReadinessReview[]>();
  syntheticReadinessReviewer(org: string) {
    this.state(org);
    const actor = this.operations
      .syntheticMemberships(org)
      .find((m) => m.active && ['owner', 'admin'].includes(m.role))?.user_id;
    if (!actor)
      throw Error('Current synthetic contractor reviewer unavailable.');
    return actor;
  }
  private readinessContext(
    org: string,
    actor: string,
    estimate: string,
    version: string,
  ): RepairReadinessContext {
    const state = this.state(org),
      binding = this.repairBindings.get(estimate);
    if (
      !binding ||
      binding.origin.source.organization_id !== org ||
      binding.origin.draft_version_id !== version
    )
      throw Error('Exact repair readiness source unavailable.');
    const member = this.operations
      .syntheticMemberships(org)
      .find(
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
      throw Error('Active contractor repair reviewer required.');
    binding.authorize();
    const bundle = state.estimates.find(
      (b) => b.estimate.id === estimate && b.version.id === version,
    );
    if (!bundle) throw Error('Exact current repair draft unavailable.');
    const policies = state.taxes.filter(
      (t) => t.id === bundle.version.payload.tax_policy_id,
    );
    if (policies.length > 1) throw Error('Ambiguous tax policy evidence.');
    const referenced = new Set(
      bundle.version.payload.lines
        .map((l) => l.catalog_item_id)
        .filter(Boolean),
    );
    return clone({
      bundle,
      origin: binding.origin,
      evidence: binding.evidence(),
      policy: policies[0] ?? null,
      catalog: state.catalog.filter((i) => referenced.has(i.id)),
      as_of: now().slice(0, 10),
    });
  }
  repairReadiness(
    org: string,
    actor: string,
    estimate: string,
    version: string,
  ) {
    const context = this.readinessContext(org, actor, estimate, version);
    return evaluateRepairReadiness(
      context,
      this.readinessHistory.get(estimate) ?? [],
    );
  }
  confirmRepairReadiness(
    org: string,
    actor: string,
    estimate: string,
    request: RepairReadinessRequest,
  ) {
    request = clone(request);
    const context = this.readinessContext(
      org,
      actor,
      estimate,
      request.draft_version_id,
    );
    const history = this.readinessHistory.get(estimate) ?? [];
    const result = recordRepairReadiness(context, history, actor, request);
    if (!result.duplicate)
      this.readinessHistory.set(estimate, [...history, clone(result.review)]);
    return clone(result);
  }
  private seeds = new Map<string, Promise<void>>();
  constructor(readonly operations: Operations) {}
  get sample() {
    return this.operations.sample;
  }
  async initialize(company: CompanyProfile) {
    if (!this.sample) return;
    if (!this.seeds.has(company.id))
      this.seeds.set(company.id, this.seed(company));
    await this.seeds.get(company.id);
  }
  private state(org: string) {
    const s = this.states.get(org);
    if (!this.sample || !s) throw new Error('Company workspace unavailable');
    return s;
  }
  private async seed(company: CompanyProfile) {
    const customer = (
      await this.operations.listCustomers(company.id, '', '', 0)
    ).rows[0];
    if (!customer) throw new Error('Create a customer first');
    const settings = await this.operations.getSettings(company.id);
    const p = industryEstimate(company, customer.id, settings.currency);
    const policy: WorkforcePolicy = {
      currency: settings.currency,
      timezone: 'America/Chicago',
      week_start: 7,
      overtime_after_seconds: 144000,
      overtime_multiplier_bps: 15000,
      review_reference: 'Synthetic example only; compliance not validated',
    };
    const workers: Worker[] = [
      {
        id: crypto.randomUUID(),
        organization_id: company.id,
        user_id: `${company.id}-owner`,
        display_name: 'Alex · owner / office',
        worker_type: 'owner',
        cost_source: 'imputed',
        active: true,
      },
      {
        id: crypto.randomUUID(),
        organization_id: company.id,
        user_id: `${company.id}-field`,
        display_name: 'Sam · field employee',
        worker_type: 'w2_hourly',
        cost_source: 'time',
        active: true,
      },
    ];
    const rates: LaborRate[] = workers.map((w, i) => ({
      id: crypto.randomUUID(),
      worker_id: w.id,
      effective_from: '2026-01-01T00:00:00Z',
      cash_hour_minor: i ? 2800 : 0,
      salary_week_minor: 0,
      burden_bps: i ? 2000 : 0,
      estimated_loaded_hour_minor: i ? 3600 : 4500,
      billing_hour_minor: i ? 6500 : 7500,
      imputed_hour_minor: i ? 0 : 4500,
      overtime_eligible: !!i,
      classification_review_reference:
        'Synthetic classification fixture, not legal proof',
    }));
    const s: SampleState = {
      estimates: [],
      history: [],
      catalog: p.lines.map((l) => ({
        ...l,
        id: crypto.randomUUID(),
        organization_id: company.id,
        name: l.description,
        category: l.kind === 'labor' ? 'Labor' : 'Materials',
        vendor: 'Example supplier',
        active: true,
      })),
      templates: [
        {
          id: crypto.randomUUID(),
          organization_id: company.id,
          name: `${p.project.type} starter`,
          content: clone(p),
          active: true,
        },
      ],
      taxes: [],
      jobs: [],
      workforce: {
        workers,
        rates,
        entries: [],
        reviews: [],
        policy,
        periods: [],
        payroll_admin: true,
        review_worker_ids: workers.map((w) => w.id),
        jobs: [],
      },
      counter: 1,
      adjustments: [],
      importPricing: { mode: 'percent', value: 2000 },
      approvals: new Map(),
    };
    this.states.set(company.id, s);
    const tax: TaxPolicy = {
      id: crypto.randomUUID(),
      organization_id: company.id,
      name: 'Synthetic zero-tax review',
      reference: 'Synthetic example only; not tax advice',
      jurisdiction: 'Synthetic jurisdiction',
      contract_type: p.project.type,
      rate_bps: 0,
      status: 'reviewed',
      active: true,
      policy_version: 1,
    };
    s.taxes.push(tax);
    p.tax_policy_id = tax.id;
    const bundle = await this.create(company, p);
    const source = clone(bundle.version);
    source.status = 'issued';
    source.issued_at = now();
    s.history = s.history.map((v) => (v.id === source.id ? source : v));
    const current = s.estimates.find(
      (b) => b.estimate.id === bundle.estimate.id,
    )!;
    current.version = {
      ...clone(source),
      id: crypto.randomUUID(),
      status: 'draft',
      issued_at: null,
      version_number: 2,
      supersedes_version_id: source.id,
    };
    current.estimate.current_version_id = current.version.id;
    s.history.push(current.version);
    const baseline = baselineFromEstimate(
      bundle.version.id,
      p,
      bundle.version.calculation,
    );
    const job: Job = {
      id: crypto.randomUUID(),
      organization_id: company.id,
      name: p.project.name,
      baseline,
      projection: {
        remaining: clone(baseline.costs),
        overrun_bps: 1000,
        erosion_bps: 500,
        costs_complete: false,
      },
      lock_revision: 1,
      expenses: [],
      events: [],
      changes: [],
      labor: {
        seconds: 0,
        billable_seconds: 0,
        cash_minor: 0,
        burden_minor: 0,
        imputed_minor: 0,
        billing_minor: 0,
      },
    };
    // Separate synthetic baseline fixture: never claims a connected customer acceptance.
    s.jobs.push(job);
    s.workforce.jobs.push({ id: job.id, name: job.name });
    const amount = Math.min(125000, baseline.costs.materials);
    if (amount) {
      const expense: Expense = {
        id: crypto.randomUUID(),
        job_id: job.id,
        purchase_key: 'demo-po-001',
        supplier: 'Example Building Supply',
        reference: 'SYNTHETIC-INV-001',
        category: 'materials',
        kind: 'payment',
        amount_minor: amount,
        description: p.lines[0].description,
        estimate_line_id: p.lines[0].id,
        quantity_milli: 1000,
        unit: p.lines[0].unit,
        unit_cost_minor: p.lines[0].unit_cost_minor,
        document_ids: [],
        material_approval_id: null,
        submitted_at: now(),
      };
      job.expenses.push(expense);
      job.events.push({
        id: crypto.randomUUID(),
        submission_id: expense.id,
        decision: 'approved',
        reason: 'Synthetic review fixture',
        created_at: now(),
      });
      job.projection.remaining.materials -= amount;
    }
    for (let day = 5; day <= 9; day++) {
      const entry: TimeEntry = {
        id: crypto.randomUUID(),
        worker_id: workers[1].id,
        job_id: job.id,
        overhead_center: null,
        task: 'Synthetic installation',
        kind: 'work',
        started_at: `2026-10-0${day}T13:00:00Z`,
        ended_at: `2026-10-0${day}T21:30:00Z`,
        submitted: true,
        billable: true,
        corrects_id: null,
      };
      s.workforce.entries.push(entry);
      s.workforce.reviews.push({
        entry_id: entry.id,
        decision: 'approved',
        reason: 'Synthetic supervisor review',
      });
    }
  }
  async list(org: string) {
    if (this.sample)
      return clone(this.state(org).estimates.map((b) => b.estimate));
    return checked(
      await client()
        .from('estimates')
        .select('*')
        .eq('organization_id', org)
        .order('updated_at', { ascending: false })
        .limit(200),
    );
  }
  async get(
    org: string,
    id: string,
    versionId?: string,
  ): Promise<EstimateBundle> {
    if (this.sample) {
      const b = this.state(org).estimates.find((b) => b.estimate.id === id);
      if (!b) throw new Error('Estimate unavailable');
      const v = versionId
        ? this.state(org).history.find(
            (v) => v.id === versionId && v.estimate_id === id,
          )
        : b.version;
      if (!v) throw new Error('Version unavailable');
      return clone({ estimate: b.estimate, version: v });
    }
    const e = checked(
      await client()
        .from('estimates')
        .select('*')
        .eq('organization_id', org)
        .eq('id', id)
        .single(),
    );
    const v = checked(
      await client()
        .from('estimate_versions')
        .select('*')
        .eq('organization_id', org)
        .eq('estimate_id', id)
        .eq('id', versionId ?? e.current_version_id!)
        .single(),
    );
    return { estimate: e, version: v } as unknown as EstimateBundle;
  }
  async defaults(org: string): Promise<EstimateDefaults> {
    if (this.sample) return this.operations.getSettings(org);
    return rpc('estimate_defaults', { p_org: org });
  }
  async create(
    company: CompanyProfile,
    payload: EstimateInput,
    key = crypto.randomUUID(),
  ): Promise<EstimateBundle> {
    return this.createWithGuard(company, payload, key);
  }
  private async createWithGuard(
    company: CompanyProfile,
    payload: EstimateInput,
    key: string,
    beforeCommit?: (bundle: EstimateBundle) => void,
  ): Promise<EstimateBundle> {
    if (!this.sample)
      return rpc('create_estimate', {
        p_org: company.id,
        p_payload: payload,
        p_key: key,
      });
    const s = this.state(company.id);
    const calc = calculateEstimate(
      payload,
      s.taxes.find((t) => t.id === payload.tax_policy_id)?.rate_bps ?? 0,
    );
    if (payload.lines.some((l) => l.import_approval_id))
      throw new Error('Create a draft before importing');
    const settings = await this.operations.getSettings(company.id);
    const customer = (
      await this.operations.listCustomers(company.id, '', '', 0)
    ).rows.find((c) => c.id === payload.customer_id);
    if (!customer) throw new Error('Customer unavailable');
    const id = crypto.randomUUID(),
      vid = crypto.randomUUID();
    const bundle: EstimateBundle = {
      estimate: {
        id,
        organization_id: company.id,
        estimate_number: `${settings.estimate_prefix}-${String(s.counter).padStart(5, '0')}`,
        project_name: payload.project.name,
        customer_id: payload.customer_id,
        current_version_id: vid,
        status: 'draft',
        total_minor: calc.total_minor,
        currency: payload.currency,
        created_at: now(),
        updated_at: now(),
      },
      version: {
        id: vid,
        organization_id: company.id,
        estimate_id: id,
        version_number: 1,
        lock_revision: 1,
        status: 'draft',
        payload: clone(payload),
        calculation: calc,
        company_snapshot: {
          name: company.name,
          primary_color: company.primary_color,
          accent_color: company.accent_color,
          business_address: settings.business_address,
          contact_email: settings.contact_email,
          contact_phone: settings.contact_phone,
          website: settings.website,
          logo_document_id: company.logo_document_id,
        },
        customer_snapshot: {
          id: customer.id,
          display_name: customer.display_name,
          email: customer.email,
          phone: customer.phone,
        },
        location_snapshot: null,
        tax_policy_snapshot: clone(
          s.taxes.find((t) => t.id === payload.tax_policy_id) ?? null,
        ),
        attachment_snapshots: [],
        supersedes_version_id: null,
        created_at: now(),
        issued_at: null,
      },
    };
    beforeCommit?.(clone(bundle));
    s.counter++;
    s.estimates.unshift(bundle);
    s.history.push(bundle.version);
    return clone(bundle);
  }
  async save(
    org: string,
    b: EstimateBundle,
    payload: EstimateInput,
  ): Promise<EstimateBundle> {
    if (!this.sample)
      return rpc('save_estimate', {
        p_org: org,
        p_estimate: b.estimate.id,
        p_version: b.version.id,
        p_lock: b.version.lock_revision,
        p_payload: payload,
      });
    const s = this.state(org),
      current = s.estimates.find((x) => x.estimate.id === b.estimate.id);
    if (
      !current ||
      current.version.id !== b.version.id ||
      current.version.lock_revision !== b.version.lock_revision ||
      current.version.status !== 'draft' ||
      current.estimate.status === 'archived'
    )
      throw new Error('Draft changed or immutable; reload');
    const change = this.customerRevisions.get(b.estimate.id);
    if (change) {
      this.requireSyntheticEstimator(org, change.origin.reviewed_by);
      change.authorize();
      if (
        change.origin.draft_version_id !== b.version.id ||
        payload.customer_id !== change.origin.customer_id ||
        payload.location_id !== change.origin.location_id
      )
        throw Error('Customer revision customer/property/version is immutable');
    }
    const repair = this.repairBindings.get(b.estimate.id);
    if (repair) {
      repair.authorize();
      const origin = repair.origin;
      if (
        origin.draft_version_id !== b.version.id ||
        payload.customer_id !== origin.source.customer_id ||
        payload.location_id !== origin.source.location_id ||
        payload.lines.filter((l) => l.id === origin.line_id).length !== 1
      )
        throw Error(
          'Repair customer, property, version and source line are immutable',
        );
    }
    for (const line of payload.lines.filter((l) => l.import_approval_id)) {
      const approval = s.approvals.get(line.import_approval_id!);
      const expected = approval?.lines.find((l) => l.id === line.id);
      if (
        !approval ||
        approval.estimateId !== b.estimate.id ||
        !expected ||
        JSON.stringify({
          ...line,
          description: '',
          internal_note: '',
          taxable: false,
        }) !==
          JSON.stringify({
            ...expected,
            description: '',
            internal_note: '',
            taxable: false,
          }) ||
        payload.lines.filter(
          (l) => l.import_approval_id === line.import_approval_id,
        ).length !== approval.lines.length
      )
        throw new Error('Imported pricing changed; review again');
    }
    const calc = calculateEstimate(
      payload,
      s.taxes.find((t) => t.id === payload.tax_policy_id)?.rate_bps ?? 0,
    );
    current.version = {
      ...current.version,
      payload: clone(payload),
      calculation: calc,
      lock_revision: current.version.lock_revision + 1,
      tax_policy_snapshot: clone(
        s.taxes.find((t) => t.id === payload.tax_policy_id) ?? null,
      ),
    };
    current.estimate = {
      ...current.estimate,
      total_minor: calc.total_minor,
      project_name: payload.project.name,
      updated_at: now(),
    };
    s.history = s.history.map((v) =>
      v.id === current.version.id ? current.version : v,
    );
    return clone(current);
  }
  async issue(org: string, b: EstimateBundle) {
    if (this.customerRevisions.has(b.estimate.id))
      throw Error(
        'Customer revision issuance requires a separate reviewed handoff',
      );
    if (this.repairBindings.has(b.estimate.id))
      throw Error(
        'Maintenance repair drafts require separate issuance review; issuance is disabled',
      );
    if (!this.sample)
      return rpc<EstimateBundle>('issue_estimate', {
        p_org: org,
        p_estimate: b.estimate.id,
        p_version: b.version.id,
        p_lock: b.version.lock_revision,
      });
    const current = this.state(org).estimates.find(
      (x) => x.estimate.id === b.estimate.id,
    );
    if (
      !current ||
      current.version.lock_revision !== b.version.lock_revision ||
      current.version.status !== 'draft'
    )
      throw new Error('Draft changed; reload');
    if (current.version.payload.expires_on < now().slice(0, 10))
      throw new Error('Estimate expired');
    if (
      !current.version.payload.tax_policy_id ||
      current.version.tax_policy_snapshot?.status !== 'reviewed'
    )
      throw new Error('Review the tax policy first');
    current.version = {
      ...current.version,
      status: 'issued',
      issued_at: now(),
    };
    current.estimate.status = 'issued';
    this.state(org).history = this.state(org).history.map((v) =>
      v.id === current.version.id ? current.version : v,
    );
    return clone(current);
  }
  async revise(org: string, b: EstimateBundle) {
    if (
      this.customerRequests.get(b.estimate.id)?.().length ||
      this.customerRevisions.has(b.estimate.id)
    )
      throw Error(
        'Review the exact customer request before preparing a revision',
      );
    return this.reviseWithGuard(org, b);
  }
  private async reviseWithGuard(
    org: string,
    b: EstimateBundle,
    beforeCommit?: (bundle: EstimateBundle) => void,
  ) {
    if (this.repairBindings.has(b.estimate.id))
      throw Error(
        'Maintenance repair revision requires separate source review',
      );
    if (!this.sample)
      return rpc<EstimateBundle>('revise_estimate', {
        p_org: org,
        p_estimate: b.estimate.id,
        p_source: b.version.id,
      });
    const state = this.state(org);
    const current = state.estimates.find(
      (x) => x.estimate.id === b.estimate.id,
    );
    if (
      !current ||
      current.estimate.status !== 'issued' ||
      current.version.status !== 'issued' ||
      current.version.id !== b.version.id ||
      current.version.lock_revision !== b.version.lock_revision ||
      current.version.organization_id !== org ||
      JSON.stringify(current.version) !== JSON.stringify(b.version)
    )
      throw Error('Current exact issued version required; reload');
    const next = clone(current);
    next.version = {
      ...clone(current.version),
      id: crypto.randomUUID(),
      status: 'draft',
      version_number: current.version.version_number + 1,
      lock_revision: 1,
      supersedes_version_id: current.version.id,
      issued_at: null,
      created_at: now(),
    };
    next.estimate.current_version_id = next.version.id;
    next.estimate.status = 'draft';
    next.estimate.updated_at = now();
    beforeCommit?.(clone(next)); // Last synchronous check before the existing engine commits.
    Object.assign(current, next);
    state.history.push(current.version);
    return clone(current);
  }
  async duplicate(company: CompanyProfile, b: EstimateBundle) {
    if (
      this.customerRevisions.has(b.estimate.id) ||
      this.customerRequests.get(b.estimate.id)?.().length
    )
      throw Error('Customer request revisions cannot be duplicated');
    if (this.repairBindings.has(b.estimate.id))
      throw Error('Prepare a separate exact-source repair through maintenance');
    if (!this.sample)
      return rpc<EstimateBundle>('duplicate_estimate', {
        p_org: company.id,
        p_source: b.version.id,
        p_key: crypto.randomUUID(),
      });
    const p = clone(b.version.payload);
    p.project.name += ' (copy)';
    return this.create(company, p);
  }
  async archive(org: string, id: string, archived: boolean) {
    if (!this.sample)
      return rpc('archive_estimate', {
        p_org: org,
        p_estimate: id,
        p_archived: archived,
      });
    const b = this.state(org).estimates.find((b) => b.estimate.id === id);
    if (!b) throw new Error('Unavailable');
    b.estimate.status = archived ? 'archived' : b.version.status;
  }
  async history(org: string, id: string): Promise<EstimateVersion[]> {
    if (this.sample)
      return clone(this.state(org).history.filter((v) => v.estimate_id === id));
    return checked(
      await client()
        .from('estimate_versions')
        .select('*')
        .eq('organization_id', org)
        .eq('estimate_id', id)
        .order('version_number', { ascending: false }),
    ) as unknown as EstimateVersion[];
  }
  async catalog(org: string): Promise<CatalogItem[]> {
    if (this.sample) return clone(this.state(org).catalog);
    return checked(
      await client()
        .from('catalog_items')
        .select('*')
        .eq('organization_id', org)
        .order('name'),
    ) as CatalogItem[];
  }
  async saveCatalog(
    org: string,
    item: Omit<CatalogItem, 'id' | 'organization_id'>,
    id?: string,
  ) {
    if (this.sample) {
      const s = this.state(org);
      if (id && !s.catalog.some((c) => c.id === id))
        throw new Error('Catalog unavailable');
      s.catalog = s.catalog.filter((c) => c.id !== id);
      s.catalog.push({
        ...item,
        id: id ?? crypto.randomUUID(),
        organization_id: org,
      });
      return;
    }
    if (id)
      checked(
        await client()
          .from('catalog_items')
          .update(item)
          .eq('organization_id', org)
          .eq('id', id)
          .select('id')
          .single(),
      );
    else
      checked(
        await client()
          .from('catalog_items')
          .insert({ ...item, organization_id: org })
          .select('id')
          .single(),
      );
  }
  async templates(org: string): Promise<EstimateTemplate[]> {
    if (this.sample) return clone(this.state(org).templates);
    return checked(
      await client()
        .from('estimate_templates')
        .select('*')
        .eq('organization_id', org)
        .eq('active', true),
    ) as unknown as EstimateTemplate[];
  }
  async saveTemplate(org: string, name: string, p: EstimateInput) {
    if (!this.sample)
      return rpc('save_estimate_template', {
        p_org: org,
        p_name: name,
        p_payload: p,
      });
    if (p.lines.some((l) => l.import_approval_id))
      throw new Error('Imported source costs cannot become generic templates');
    this.state(org).templates.push({
      id: crypto.randomUUID(),
      organization_id: org,
      name,
      content: clone(p),
      active: true,
    });
  }
  async taxes(org: string): Promise<TaxPolicy[]> {
    if (this.sample) return clone(this.state(org).taxes);
    return checked(
      await client()
        .from('estimate_tax_policies')
        .select('*')
        .eq('organization_id', org),
    ) as TaxPolicy[];
  }
  async saveTax(
    org: string,
    tax: Omit<TaxPolicy, 'id' | 'organization_id' | 'policy_version'>,
  ) {
    if (this.sample)
      this.state(org).taxes.push({
        ...tax,
        id: crypto.randomUUID(),
        organization_id: org,
        policy_version: 1,
      });
    else
      checked(
        await client()
          .from('estimate_tax_policies')
          .insert({ ...tax, organization_id: org })
          .select('id')
          .single(),
      );
  }
  async cleanDocuments(org: string) {
    if (this.sample) return [];
    return checked(
      await client()
        .from('documents')
        .select('*')
        .eq('organization_id', org)
        .eq('scan_status', 'clean'),
    );
  }
  async materialPricing(org: string): Promise<Pricing> {
    if (this.sample) return clone(this.state(org).importPricing);
    const row = checked(
      await client()
        .from('material_import_preferences')
        .select('*')
        .eq('organization_id', org)
        .maybeSingle(),
    );
    if (row) return { mode: row.mode as Pricing['mode'], value: row.value };
    const defaults = await this.defaults(org);
    return {
      mode: defaults.material_markup_bps ? 'percent' : 'pass_through',
      value: defaults.material_markup_bps,
    };
  }
  async saveMaterialPricing(org: string, p: Pricing) {
    if (this.sample) {
      this.state(org).importPricing = clone(p);
      return;
    }
    const result = await client()
      .from('material_import_preferences')
      .select('organization_id')
      .eq('organization_id', org)
      .maybeSingle();
    if (result.error) throw new Error('Preferences unavailable');
    if (result.data)
      checked(
        await client()
          .from('material_import_preferences')
          .update(p)
          .eq('organization_id', org)
          .select('organization_id')
          .single(),
      );
    else
      checked(
        await client()
          .from('material_import_preferences')
          .insert({ organization_id: org, ...p })
          .select('organization_id')
          .single(),
      );
  }
  async importBatches(org: string, estimateId: string, jobId?: string) {
    if (this.sample) return [];
    let q = client()
      .from('material_import_batches')
      .select('*')
      .eq('organization_id', org)
      .eq('estimate_id', estimateId)
      .eq('purpose', jobId ? 'purchase' : 'estimate')
      .eq('status', 'review');
    if (jobId) q = q.eq('job_id', jobId);
    return checked(await q);
  }
  async sourceEstimate(org: string, versionId: string) {
    if (this.sample) {
      const v = this.state(org).history.find((v) => v.id === versionId);
      if (!v) throw new Error('Source unavailable');
      return this.get(org, v.estimate_id, versionId);
    }
    const v = checked(
      await client()
        .from('estimate_versions')
        .select('estimate_id')
        .eq('organization_id', org)
        .eq('id', versionId)
        .single(),
    );
    return this.get(org, v.estimate_id, versionId);
  }
  async recordPurchasedMaterials(
    org: string,
    job: Job,
    bundle: EstimateBundle,
    review: MaterialReview,
    kind: 'commitment' | 'payment',
    batchId?: string,
    lock = 1,
  ) {
    if (!this.sample) {
      if (!batchId) throw new Error('Scan-approved purchase batch required');
      return rpc('record_reviewed_purchase', {
        p_org: org,
        p_job: job.id,
        p_batch: batchId,
        p_lock: lock,
        p_review: review,
        p_kind: kind,
      });
    }
    if (
      [...this.state(org).approvals.values()].some(
        (a) =>
          a.jobId === job.id &&
          a.review.sources.some((s) =>
            review.sources.some((r) => r.sha256 === s.sha256),
          ),
      )
    )
      throw new Error('This supplier source was already imported for this job');
    const approvalId = crypto.randomUUID();
    const canonical = approveReview(review, approvalId);
    const totals = reviewTotals(review);
    const state = this.state(org);
    const before = clone(state.jobs);
    state.approvals.set(approvalId, {
      estimateId: bundle.estimate.id,
      jobId: job.id,
      lines: canonical,
      review: clone(review),
    });
    try {
      for (const l of totals.lines) {
        const source = review.sources.find((s) => s.id === l.source_id)!;
        await this.submitExpense(org, job.id, {
          purchase_key: source.sha256,
          supplier: l.vendor,
          reference: `${source.sha256}:${l.original.id}`,
          category: 'materials',
          kind,
          amount_minor: l.cost_minor,
          description: l.description,
          estimate_line_id: l.estimate_line_id ?? null,
          quantity_milli: l.quantity_milli,
          unit: l.unit,
          unit_cost_minor: l.unit_cost_minor,
          document_ids: [],
          material_approval_id: approvalId,
          material_import_line_ids: [l.id],
          adjusts_expense_id: null,
        });
      }
    } catch (e) {
      state.jobs = before;
      state.approvals.delete(approvalId);
      throw e;
    }
  }
  async importSources(org: string, batchId: string) {
    return checked(
      await client()
        .from('material_import_sources')
        .select('*')
        .eq('organization_id', org)
        .eq('batch_id', batchId),
    );
  }
  async applyImport(
    org: string,
    b: EstimateBundle,
    review: MaterialReview,
    batchId?: string,
    batchLock = 1,
  ) {
    if (!this.sample) {
      if (!batchId) throw new Error('No scan-approved connected import');
      return rpc<EstimateBundle>('approve_and_apply_material_import', {
        p_org: org,
        p_batch: batchId,
        p_batch_lock: batchLock,
        p_estimate: b.estimate.id,
        p_version: b.version.id,
        p_lock: b.version.lock_revision,
        p_review: review,
      });
    }
    const id = crypto.randomUUID();
    const lines = approveReview(review, id);
    this.state(org).approvals.set(id, {
      estimateId: b.estimate.id,
      lines: clone(lines),
      review: clone(review),
    });
    return this.save(org, b, {
      ...b.version.payload,
      lines: [...b.version.payload.lines, ...lines],
    });
  }
  async jobs(org: string): Promise<Job[]> {
    if (this.sample) return clone(this.state(org).jobs);
    const base = checked(
      await client()
        .from('jobs')
        .select('*')
        .eq('organization_id', org)
        .order('created_at', { ascending: false }),
    );
    return Promise.all(
      base.map(async (j) => {
        const expenses = checked(
          await client()
            .from('job_expenses')
            .select('*')
            .eq('organization_id', org)
            .eq('job_id', j.id)
            .order('submitted_at'),
        );
        const events = checked(
          await client()
            .from('job_expense_reviews')
            .select('*')
            .eq('organization_id', org)
            .eq('job_id', j.id),
        );
        const changes = checked(
          await client()
            .from('job_change_orders')
            .select('*')
            .eq('organization_id', org)
            .eq('job_id', j.id),
        );
        const approvals = checked(
          await client()
            .from('job_change_approvals')
            .select('*')
            .eq('organization_id', org),
        );
        const labor = await rpc<LaborSummary>('job_labor_summary', {
          p_org: org,
          p_job: j.id,
        });
        return {
          ...j,
          baseline: j.baseline,
          projection: j.projection,
          expenses,
          events,
          changes: changes.map((c) => ({
            ...c,
            status: approvals.some((a) => a.change_id === c.id)
              ? 'approved'
              : c.status,
            authorization_reference:
              approvals.find((a) => a.change_id === c.id)
                ?.authorization_reference ?? null,
          })),
          labor,
        } as unknown as Job;
      }),
    );
  }
  async approveJob(org: string, b: EstimateBundle) {
    if (
      this.customerRevisions.has(b.estimate.id) ||
      this.customerRequests.get(b.estimate.id)?.().length
    )
      throw Error('Customer change requests do not authorize a job baseline');
    if (!this.sample)
      return rpc<string>('approve_job', {
        p_org: org,
        p_version: b.version.id,
      });
    if (b.version.status !== 'issued')
      throw new Error('Issue internally first');
    const s = this.state(org);
    if (
      s.jobs.some(
        (j) =>
          this.state(org).history.find(
            (v) => v.id === j.baseline.issued_version_id,
          )?.estimate_id === b.estimate.id,
      )
    )
      throw new Error('Baseline already captured');
    const baseline = baselineFromEstimate(
      b.version.id,
      b.version.payload,
      b.version.calculation,
    );
    const j: Job = {
      id: crypto.randomUUID(),
      organization_id: org,
      name: b.version.payload.project.name,
      baseline,
      projection: {
        remaining: clone(baseline.costs),
        overrun_bps: 1000,
        erosion_bps: 500,
        costs_complete: false,
      },
      lock_revision: 1,
      expenses: [],
      events: [],
      changes: [],
    };
    s.jobs.push(j);
    s.workforce.jobs.push({ id: j.id, name: j.name });
    return j.id;
  }
  async submitExpense(
    org: string,
    jobId: string,
    e: Omit<Expense, 'id' | 'job_id' | 'submitted_at'> & {
      adjusts_expense_id?: string | null;
    },
  ) {
    if (!this.sample)
      return rpc<string>('submit_job_expense', {
        p_org: org,
        p_job: jobId,
        p_expense: e,
      });
    const job = this.state(org).jobs.find((j) => j.id === jobId);
    if (!job) throw new Error('Job unavailable');
    if (e.material_approval_id) {
      const approval = this.state(org).approvals.get(e.material_approval_id);
      if (
        !approval ||
        approval.jobId !== jobId ||
        job.expenses.some(
          (x) =>
            x.material_approval_id === e.material_approval_id &&
            x.material_import_line_ids?.some((id) =>
              e.material_import_line_ids?.includes(id),
            ),
        )
      )
        throw new Error(
          'Purchase approval unavailable or source already recorded',
        );
    }
    if (e.category === 'labor')
      throw new Error('Use approved workforce costing for labor');
    if (
      job.expenses.some(
        (x) =>
          x.supplier.toLowerCase().trim() === e.supplier.toLowerCase().trim() &&
          x.reference.toLowerCase().trim() === e.reference.toLowerCase().trim(),
      )
    )
      throw new Error('Duplicate supplier document');
    const id = crypto.randomUUID();
    job.expenses.push({ ...clone(e), id, job_id: jobId, submitted_at: now() });
    return id;
  }
  async reviewExpense(
    org: string,
    jobId: string,
    expenseId: string,
    decision: 'approved' | 'rejected',
    reason: string,
  ) {
    if (!this.sample)
      return rpc('review_job_expense', {
        p_org: org,
        p_job: jobId,
        p_expense: expenseId,
        p_decision: decision,
        p_reason: reason,
      });
    const j = this.state(org).jobs.find((j) => j.id === jobId);
    if (
      !j ||
      !j.expenses.some((e) => e.id === expenseId) ||
      j.events.some((e) => e.submission_id === expenseId)
    )
      throw new Error('Review unavailable');
    const event = {
      id: crypto.randomUUID(),
      submission_id: expenseId,
      decision,
      reason,
      created_at: now(),
    };
    const copy = clone(j);
    copy.events.push(event);
    jobFinancials(copy);
    j.events.push(event);
    j.lock_revision++;
  }
  async projection(org: string, job: Job, projection: JobProjection) {
    if (!this.sample)
      return rpc('update_job_projection', {
        p_org: org,
        p_job: job.id,
        p_lock: job.lock_revision,
        p_projection: projection,
      });
    const j = this.state(org).jobs.find((j) => j.id === job.id);
    if (!j || j.lock_revision !== job.lock_revision)
      throw new Error('Job changed; reload');
    jobFinancials({ ...clone(j), projection });
    j.projection = clone(projection);
    j.lock_revision++;
  }
  async proposeChange(
    org: string,
    jobId: string,
    c: Omit<ChangeOrder, 'id' | 'authorization_reference'>,
  ) {
    if (!this.sample)
      return rpc('propose_job_change', {
        p_org: org,
        p_job: jobId,
        p_change: c,
      });
    if (
      c.status === 'approved' ||
      (c.status === 'internal' && c.revenue_minor !== 0)
    )
      throw new Error('Explicit customer billing authorization required');
    const j = this.state(org).jobs.find((j) => j.id === jobId);
    if (!j) throw new Error('Job unavailable');
    j.changes.push({
      ...c,
      id: crypto.randomUUID(),
      authorization_reference: null,
    });
  }
  async approveChange(
    org: string,
    jobId: string,
    id: string,
    reference: string,
  ) {
    if (!reference.trim())
      throw new Error('Customer authorization reference required');
    if (!this.sample)
      return rpc('approve_job_change', {
        p_org: org,
        p_change: id,
        p_authorization: reference,
      });
    const j = this.state(org).jobs.find((j) => j.id === jobId),
      c = j?.changes.find((c) => c.id === id);
    if (!j || !c || c.status !== 'proposed')
      throw new Error('Proposed change unavailable');
    c.status = 'approved';
    c.authorization_reference = reference;
    j.projection.remaining[c.category] += c.cost_minor;
    j.lock_revision++;
  }
  async workforce(org: string): Promise<WorkforceData> {
    if (this.sample) return clone(this.state(org).workforce);
    const [workers, rates, entries, reviews, policy, periods, jobs] =
      await Promise.all([
        client().from('worker_profiles').select('*').eq('organization_id', org),
        client().from('labor_rates').select('*').eq('organization_id', org),
        client()
          .from('time_entries')
          .select('*')
          .eq('organization_id', org)
          .order('started_at'),
        client().from('time_reviews').select('*').eq('organization_id', org),
        client()
          .from('workforce_policies')
          .select('*')
          .eq('organization_id', org)
          .maybeSingle(),
        client().from('payroll_periods').select('*').eq('organization_id', org),
        rpc<{ id: string; name: string }[]>('assigned_job_labels', {
          p_org: org,
        }),
      ]);
    const access = await this.operations.companyAccess(org);
    const ws = checked(workers);
    const supervisors = checked(
      await client()
        .from('worker_supervisors')
        .select('*')
        .eq('organization_id', org),
    );
    return {
      workers: ws,
      rates: checked(rates),
      entries: checked(entries),
      reviews: checked(reviews),
      policy: policy.error ? null : policy.data,
      periods: access.settings
        ? checked(periods)
        : await rpc('time_period_labels', { p_org: org }),
      payroll_admin: access.settings,
      review_worker_ids: access.settings
        ? ws.map((w) => w.id)
        : supervisors.map((s) => s.worker_id),
      jobs,
    } as unknown as WorkforceData;
  }
  async configureWorkforce(
    org: string,
    policy: WorkforcePolicy & { overhead_centers: string[] },
  ) {
    if (!this.sample)
      return rpc('configure_workforce', { p_org: org, p_policy: policy });
    if (this.state(org).workforce.entries.length)
      throw new Error(
        'Policy changes require versioned review after time exists',
      );
    this.state(org).workforce.policy = clone(policy);
  }
  async saveWorker(
    org: string,
    w: Omit<Worker, 'id' | 'organization_id'>,
    r: Omit<LaborRate, 'id' | 'worker_id'>,
    id?: string,
  ) {
    if (!this.sample)
      return rpc('save_worker', {
        p_org: org,
        p_worker: { ...w, id: id ?? null },
        p_rate: r,
      });
    const data = this.state(org).workforce;
    const workerId = id ?? crypto.randomUUID();
    if (id && !data.workers.some((w) => w.id === id))
      throw new Error('Worker unavailable');
    if (!id && data.workers.some((x) => x.user_id === w.user_id))
      throw new Error('Member already has a worker profile');
    data.workers = data.workers.filter((w) => w.id !== workerId);
    data.workers.push({ ...w, id: workerId, organization_id: org });
    data.rates.push({ ...r, id: crypto.randomUUID(), worker_id: workerId });
    return workerId;
  }
  private validateUnlocked(data: WorkforceData, e: TimeEntry) {
    if (
      data.periods.some(
        (p) =>
          p.status === 'locked' &&
          p.starts_at < (e.ended_at ?? '9999') &&
          p.ends_at > e.started_at,
      )
    )
      throw new Error('Payroll period locked');
  }
  async recordTime(
    org: string,
    workerId: string,
    e: Omit<TimeEntry, 'id' | 'worker_id' | 'submitted'>,
  ) {
    if (!this.sample)
      return rpc('record_time', { p_org: org, p_worker: workerId, p_entry: e });
    const d = this.state(org).workforce;
    const entry = {
      ...e,
      id: crypto.randomUUID(),
      worker_id: workerId,
      submitted: false,
    };
    this.validateUnlocked(d, entry);
    const superseded = new Set(
      d.entries
        .filter(
          (x) =>
            d.reviews.some(
              (r) => r.entry_id === x.id && r.decision === 'approved',
            ) && x.corrects_id,
        )
        .map((x) => x.corrects_id),
    );
    validateTime([
      ...d.entries.filter(
        (e) =>
          !d.reviews.some(
            (r) => r.entry_id === e.id && r.decision === 'rejected',
          ) && !superseded.has(e.id),
      ),
      entry,
    ]);
    d.entries.push(entry);
    return entry.id;
  }
  async clock(
    org: string,
    workerId: string,
    action: string,
    target: {
      job_id: string | null;
      overhead_center: string | null;
      task: string;
      billable: boolean;
    },
  ) {
    if (!this.sample)
      return rpc('time_clock', {
        p_org: org,
        p_worker: workerId,
        p_action: action,
        p_target: target,
      });
    const d = this.state(org).workforce;
    const open = d.entries.find((e) => e.worker_id === workerId && !e.ended_at);
    const timestamp = new Date(
      Math.floor(Date.now() / 1000) * 1000,
    ).toISOString();
    if ((action === 'start' && open) || (action !== 'start' && !open))
      throw new Error('Clock changed; reload');
    if (open) {
      this.validateUnlocked(d, open);
      if (Date.parse(timestamp) <= Date.parse(open.started_at))
        throw new Error('Wait one second before changing the clock');
      open.ended_at = timestamp;
    }
    if (action === 'stop') return;
    const dest =
      (action === 'break' || action === 'break_paid' || action === 'resume') &&
      open
        ? {
            job_id: open.job_id,
            overhead_center: open.overhead_center,
            task: open.task,
            billable: open.billable,
          }
        : target;
    try {
      return await this.recordTime(org, workerId, {
        ...dest,
        kind:
          action === 'break'
            ? 'break'
            : action === 'break_paid'
              ? 'break_paid'
              : 'work',
        billable:
          action === 'break' || action === 'break_paid' ? false : dest.billable,
        started_at: timestamp,
        ended_at: null,
        corrects_id: null,
      });
    } catch (e) {
      if (open) open.ended_at = null;
      throw e;
    }
  }
  async resolveClock(
    org: string,
    workerId: string,
    end: string,
    reason: string,
  ) {
    if (!this.sample)
      return rpc('resolve_clock', {
        p_org: org,
        p_worker: workerId,
        p_end: end,
        p_reason: reason,
      });
    const d = this.state(org).workforce;
    const e = d.entries.find((e) => e.worker_id === workerId && !e.ended_at);
    if (!e || !reason.trim() || Date.parse(end) > Date.now())
      throw new Error('Open clock, valid end and reason required');
    const corrected = { ...e, ended_at: end, submitted: true };
    this.validateUnlocked(d, corrected);
    validateTime(d.entries.map((t) => (t.id === e.id ? corrected : t)));
    Object.assign(e, corrected);
    d.reviews.push({
      entry_id: e.id,
      decision: 'approved',
      reason: `Clock correction: ${reason}`,
    });
  }
  async submitTime(org: string, id: string) {
    if (!this.sample) return rpc('submit_time', { p_org: org, p_entry: id });
    const d = this.state(org).workforce;
    const e = d.entries.find((e) => e.id === id);
    if (!e || !e.ended_at || e.submitted)
      throw new Error('Closed unsubmitted time required');
    this.validateUnlocked(d, e);
    e.submitted = true;
  }
  async reviewTime(
    org: string,
    id: string,
    decision: 'approved' | 'rejected',
    reason: string,
  ) {
    if (!this.sample)
      return rpc('review_time', {
        p_org: org,
        p_entry: id,
        p_decision: decision,
        p_reason: reason,
      });
    const d = this.state(org).workforce;
    const e = d.entries.find((e) => e.id === id);
    if (!e?.submitted || d.reviews.some((r) => r.entry_id === id))
      throw new Error('Submitted time required');
    this.validateUnlocked(d, e);
    d.reviews.push({ entry_id: id, decision, reason });
  }
  async payroll(
    org: string,
    start: string,
    end: string,
    deductions: Record<string, number>,
    lock: boolean,
  ): Promise<{ rows: PayrollRow[]; deductions: Record<string, number> }> {
    if (!this.sample)
      return rpc('prepare_payroll', {
        p_org: org,
        p_start: start,
        p_end: end,
        p_deductions: deductions,
        p_lock: lock,
      });
    const d = this.state(org).workforce;
    if (!d.policy) throw new Error('Employer policy required');
    if (
      d.periods.some(
        (p) => p.status === 'locked' && p.starts_at < end && p.ends_at > start,
      )
    )
      throw new Error('Payroll period locked');
    if (Date.parse(end) > Date.now())
      throw new Error('Pay period has not ended');
    const entries = d.entries.filter(
      (e) => e.started_at < end && (e.ended_at ?? '9999') > start,
    );
    if (
      entries.some(
        (e) =>
          !e.ended_at ||
          e.started_at < start ||
          e.ended_at > end ||
          !e.submitted ||
          !d.reviews.some((r) => r.entry_id === e.id),
      )
    )
      throw new Error('Close, submit and review all period time');
    const rows = preparePayroll(
      d.workers,
      d.rates,
      entries,
      d.reviews,
      d.policy,
    );
    for (const a of this.state(org).adjustments.filter(
      (a) => String(a.effective_at) >= start && String(a.effective_at) < end,
    )) {
      const e = d.entries.find((e) => e.id === a.entry_id)!;
      rows.push({
        entry_id: e.id,
        worker_id: e.worker_id,
        job_id: e.job_id,
        week: String(a.effective_at),
        regular_seconds: 0,
        overtime_seconds: 0,
        cash_minor: Number(a.cash_minor),
        burden_minor: Number(a.burden_minor),
        imputed_minor: Number(a.imputed_minor),
        billing_minor: 0,
        estimated_loaded_minor: 0,
        billable_seconds: 0,
        rate_id: null,
      });
    }
    const result = { rows, deductions };
    if (lock) {
      d.periods.push({
        id: crypto.randomUUID(),
        starts_at: start,
        ends_at: end,
        status: 'locked',
        snapshot: clone(result),
      });
      for (const j of this.state(org).jobs) {
        const own = rows.filter((r) => r.job_id === j.id);
        const sum = (key: keyof PayrollRow) =>
          own.reduce((s, r) => s + Number(r[key]), 0);
        const previous = j.labor ?? {
          seconds: 0,
          billable_seconds: 0,
          cash_minor: 0,
          burden_minor: 0,
          imputed_minor: 0,
          billing_minor: 0,
        };
        j.labor = {
          seconds:
            previous.seconds + sum('regular_seconds') + sum('overtime_seconds'),
          billable_seconds: previous.billable_seconds + sum('billable_seconds'),
          cash_minor: previous.cash_minor + sum('cash_minor'),
          burden_minor: previous.burden_minor + sum('burden_minor'),
          imputed_minor: previous.imputed_minor + sum('imputed_minor'),
          billing_minor: previous.billing_minor + sum('billing_minor'),
        };
        j.lock_revision++;
      }
    }
    return clone(result);
  }
  async assignJob(org: string, jobId: string, userId: string, active: boolean) {
    if (!this.sample)
      return rpc('assign_job', {
        p_org: org,
        p_job: jobId,
        p_user: userId,
        p_active: active,
      });
    const member = (await this.operations.listMembers(org)).find(
      (m) => m.user_id === userId && m.active,
    );
    if (!member || !this.state(org).jobs.some((j) => j.id === jobId))
      throw new Error('Active member and job required');
  }
  async assignSupervisor(
    org: string,
    workerId: string,
    userId: string,
    active: boolean,
  ) {
    if (!this.sample)
      return rpc('assign_supervisor', {
        p_org: org,
        p_worker: workerId,
        p_user: userId,
        p_active: active,
      });
  }
  async adjustPayroll(org: string, adjustment: Record<string, Json>) {
    if (!this.sample)
      return rpc('adjust_payroll', { p_org: org, p_adjustment: adjustment });
    const data = this.state(org);
    const period = data.workforce.periods.find(
      (p) => p.id === adjustment.source_period_id && p.status === 'locked',
    );
    const entry = data.workforce.entries.find(
      (e) => e.id === adjustment.entry_id,
    );
    if (
      !period ||
      !entry ||
      !period.snapshot?.rows.some((r) => r.entry_id === entry.id) ||
      String(adjustment.effective_at) < period.ends_at ||
      data.workforce.periods.some(
        (p) =>
          p.status === 'locked' &&
          p.starts_at <= String(adjustment.effective_at) &&
          p.ends_at > String(adjustment.effective_at),
      ) ||
      !String(adjustment.reason).trim()
    )
      throw new Error(
        'Choose an original locked entry and later unlocked adjustment date',
      );
    for (const key of ['cash_minor', 'burden_minor', 'imputed_minor'])
      if (
        !Number.isSafeInteger(adjustment[key]) ||
        Math.abs(Number(adjustment[key])) > 9e12
      )
        throw new Error('Invalid adjustment');
    data.adjustments.push(clone(adjustment));
  }
}
const repositories = new WeakMap<Operations, Phase3Repository>();
export function phase3Repository(operations: Operations) {
  let repo = repositories.get(operations);
  if (!repo) {
    repo = new Phase3Repository(operations);
    repositories.set(operations, repo);
  }
  return repo;
}
