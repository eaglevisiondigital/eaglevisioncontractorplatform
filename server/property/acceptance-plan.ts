import cases from '../../docs/PROPERTY_CONNECTED_TEST_CASES.json' with { type: 'json' };
import {
  occurrence,
  type InspectionPlan,
} from '../../src/domain/property/inspections.ts';
import type { Json } from '../../src/lib/database.types';
export interface PropertyFixtureBinding {
  organization_id: string;
  customer_id: string;
  location_id: string;
  job_id: string;
  estimate_version_id: string;
  material_line_id: string;
  expense_id: string | null;
  job_revision: number;
  existing_material_reviews: number;
  net_approved_cost_minor: number;
  currency: string;
  quoted_at: string;
  quote_expires_at: string;
  baseline_fingerprints: Record<string, string>;
}
interface Ref {
  result: string;
  field: 'id' | '$value';
}
interface Step {
  id: string;
  rpc: 'property_command' | 'submit_job_expense' | 'review_job_expense';
  args: Record<string, Json | Ref>;
  actor: 'owner' | 'assigned-field' | 'estimator';
}
const uuid = (s: string) =>
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(s);
/** Offline compiler: has no credential reader, network client or execution method. */
export function preparePropertyAcceptance(
  bindings: PropertyFixtureBinding[],
  runKey: string,
) {
  if (
    !/^[a-z0-9-]{8,36}$/.test(runKey) ||
    bindings.length !== 3 ||
    new Set(bindings.map((b) => b.organization_id)).size !== 3
  )
    throw Error('Three distinct companies and an explicit run key required');
  for (const key of [
    'customer_id',
    'location_id',
    'job_id',
    'estimate_version_id',
    'expense_id',
  ] as const)
    if (
      new Set(bindings.map((b) => b[key]).filter(Boolean)).size !==
      bindings.filter((b) => b[key] !== null).length
    )
      throw Error('Foreign resource reused across tenant boundaries');
  const companies = bindings.map((b, index) => {
    for (const k of [
      'organization_id',
      'customer_id',
      'location_id',
      'job_id',
      'estimate_version_id',
      'material_line_id',
    ] as const)
      if (!uuid(b[k]))
        throw Error('Read-only verified resource bindings required');
    if (
      !Number.isSafeInteger(b.job_revision) ||
      b.job_revision < 1 ||
      b.existing_material_reviews !== 0 ||
      !Number.isSafeInteger(b.net_approved_cost_minor) ||
      b.net_approved_cost_minor <= 0 ||
      b.net_approved_cost_minor > 8_000_000_000_000 ||
      !/^[A-Z]{3}$/.test(b.currency) ||
      !Number.isFinite(Date.parse(b.quoted_at)) ||
      !Number.isFinite(Date.parse(b.quote_expires_at)) ||
      Date.parse(b.quote_expires_at) <= Date.parse(b.quoted_at) ||
      Object.keys(b.baseline_fingerprints).length === 0 ||
      Object.values(b.baseline_fingerprints).some(
        (s) => !/^[a-f0-9]{32,64}$/.test(s),
      )
    )
      throw Error('Unreviewed or conflicting fixture baseline');
    if (b.expense_id !== null && !uuid(b.expense_id))
      throw Error('Invalid expense binding');
    const steps: Step[] = [];
    const expenseRef: Json = b.expense_id ?? {
      result: 'fixture-expense',
      field: '$value',
    };
    const fixtureRevision = b.job_revision + (b.expense_id === null ? 1 : 0);
    if (b.expense_id === null) {
      steps.push({
        id: 'fixture-expense',
        actor: 'owner',
        rpc: 'submit_job_expense',
        args: {
          p_org: b.organization_id,
          p_job: b.job_id,
          p_expense: {
            purchase_key: 'p0-' + runKey,
            supplier: 'Synthetic P0 supplier',
            reference: 'Manual synthetic fixture; no uploaded receipt',
            category: 'materials',
            kind: 'payment',
            amount_minor: b.net_approved_cost_minor,
            description: 'Unplanned synthetic acceptance materials',
            estimate_line_id: null,
            quantity_milli: 1000,
            unit: 'each',
            unit_cost_minor: b.net_approved_cost_minor,
            document_ids: [],
            material_approval_id: null,
            adjusts_expense_id: null,
            labor_worker_id: null,
            material_import_line_ids: [],
          },
        },
      });
      steps.push({
        id: 'fixture-review',
        actor: 'owner',
        rpc: 'review_job_expense',
        args: {
          p_org: b.organization_id,
          p_job: b.job_id,
          p_expense: { result: 'fixture-expense', field: '$value' },
          p_decision: 'approved',
          p_reason: 'Proposed synthetic fixture review ' + runKey,
        },
      });
    }
    const add = (
      id: string,
      action: string,
      target: string | Ref | null,
      revision: number | null,
      p: Json,
    ) =>
      steps.push({
        id,
        rpc: 'property_command',
        actor: 'owner',
        args: {
          p_org: b.organization_id,
          p_action: action,
          p_id: target,
          p_lock: revision,
          p,
        },
      });
    const dates: Record<string, string[]> = {};
    for (const cadence of ['weekly', 'monthly'] as const) {
      const plan: InspectionPlan = {
        id: crypto.randomUUID(),
        organization_id: b.organization_id,
        customer_id: b.customer_id,
        location_id: b.location_id,
        job_id: b.job_id,
        name: `Synthetic ${runKey} ${cadence}`,
        cadence,
        interval_days: 7,
        timezone: 'America/Chicago',
        starts_on: cadence === 'monthly' ? '2026-10-31' : '2026-10-16',
        checklist: [
          {
            id: 'exterior',
            label: 'Exterior condition',
            required: true,
            completed: false,
          },
        ],
        revision: 1,
      };
      const payload = {
        customer_id: b.customer_id,
        location_id: b.location_id,
        job_id: b.job_id,
        name: plan.name,
        cadence,
        interval_days: 7,
        timezone: plan.timezone,
        starts_on: plan.starts_on,
        checklist: plan.checklist.map((x) => ({ ...x })),
      };
      add(cadence + '-plan', 'create_plan', null, null, payload);
      const first = occurrence(plan, 0),
        next = occurrence(plan, 1);
      if (!first || !next) throw Error('Recurring dates required');
      dates[cadence] = [first, next];
      for (let n = 0; n < 2; n++) {
        const prefix = `${cadence}-${n}`;
        add(
          prefix + '-visit',
          'create_visit',
          { result: cadence + '-plan', field: 'id' },
          null,
          { visited_on: dates[cadence][n], phase: 'before' },
        );
        add(
          prefix + '-save',
          'save_visit',
          { result: prefix + '-visit', field: 'id' },
          1,
          {
            summary: 'Synthetic damage inspection',
            internal_notes: 'INTERNAL synthetic management detail',
            checklist: [{ ...plan.checklist[0], completed: true }],
            findings: [
              {
                id: 'damage',
                category: 'Exterior',
                location: 'Synthetic surface',
                severity: 'moderate',
                description: 'Synthetic damage finding',
                recommendation: 'Prepare repair scope for review',
                customer_visible: true,
              },
              {
                id: 'internal',
                category: 'Office',
                location: 'Internal',
                severity: 'low',
                description: 'INTERNAL synthetic pricing review',
                recommendation: 'Management only',
                customer_visible: false,
              },
            ],
          },
        );
        add(
          prefix + '-submit',
          'submit_visit',
          { result: prefix + '-visit', field: 'id' },
          2,
          {},
        );
        add(
          prefix + '-publish',
          'publish_visit',
          { result: prefix + '-visit', field: 'id' },
          3,
          {},
        );
      }
    }
    add('four-vendors', 'quote_snapshot', b.estimate_version_id, null, {
      quotes: Array.from({ length: 4 }, (_, i) => ({
        id: `vendor-${i + 1}`,
        name: `Synthetic vendor ${i + 1}`,
        store: 'Manual quote fixture',
        account_price_note: 'Synthetic supplied data; not live retailer prices',
        source_reference: `fixture:${runKey}:${i}`,
        quoted_at: b.quoted_at,
        expires_at: b.quote_expires_at,
        currency: b.currency,
        shipping_minor: i * 100,
        pickup_minor: 0,
        tax_bps: 0,
        lines: [
          {
            line_id: b.material_line_id,
            sku: `TEST-${i}`,
            specification: 'Reviewed equivalent synthetic material',
            unit: 'each',
            pack_quantity_milli: 1000,
            pack_price_minor: 1000 + i * 25,
            available_packs: 100,
            equivalent_approved: true,
          },
        ],
      })),
    });
    for (const [i, disposition] of [
      'absorbed',
      'included',
      'deferred',
      'proposed',
    ].entries())
      add(
        'decision-' + disposition,
        'unbilled_review',
        b.job_id,
        fixtureRevision + i,
        {
          expense_id: expenseRef,
          disposition,
          reason: 'Synthetic scope review ' + runKey,
          scope_line_id: disposition === 'included' ? b.material_line_id : null,
          pricing: { mode: 'percent', value: 1250 },
          presentation: 'package',
          description:
            'Synthetic proposed additional materials; no customer debt',
        },
      );
    for (const step of steps) {
      if (/^weekly-0-(visit|save|submit)$/.test(step.id))
        step.actor = 'assigned-field';
      if (step.id === 'four-vendors') step.actor = 'estimator';
    }
    const selling = Number(
      BigInt(b.net_approved_cost_minor) +
        (BigInt(b.net_approved_cost_minor) * 1250n + 5000n) / 10000n,
    );
    return {
      company: cases.companies[index],
      organization_id: b.organization_id,
      dates,
      steps,
      baseline_fingerprints: b.baseline_fingerprints,
      expected: {
        inspection_plans: 2,
        inspection_visits: 4,
        inspection_reports: 4,
        supplier_comparisons: 1,
        unbilled_decisions: 4,
        supplemental_invoice_drafts: 1,
        job_change_orders: 1,
        job_revision_delta: b.expense_id === null ? 5 : 4,
        job_expenses: b.expense_id === null ? 1 : 0,
        job_expense_reviews: b.expense_id === null ? 1 : 0,
        synthetic_actual_cost_delta_minor:
          b.expense_id === null ? b.net_approved_cost_minor : 0,
        supplemental_selling_minor: selling,
        customer_receivable_delta_minor: 0,
        material_cost_postings: b.expense_id === null ? 1 : 0,
      },
      cases: cases.cases.map((c) => ({
        ...c,
        status: 'NOT RUN' as const,
        organization_id: b.organization_id,
        allForeignOrganizations: bindings
          .filter((x) => x.organization_id !== b.organization_id)
          .map((x) => x.organization_id),
        assertions: [
          c.expected,
          'Verified real caller UID/AAL and current tenant permissions',
          'Original customer/estimate/expense/workforce fingerprints unchanged; jobs revision delta only',
          'No financial execution, uploaded bytes or customer communications',
        ],
      })),
    };
  });
  return {
    status: 'PROPOSED_NOT_AUTHORIZED' as const,
    runKey,
    hostedExecution: false,
    plannedCases: 72,
    companies,
    cleanup: {
      deleteImmutableRecords: false,
      revokeOnlyReportLeases: true,
      disableExactFeatureRows: true,
      closeSessions: true,
      preserveAudit: true,
    },
    activation: {
      publicWrappers: false,
      featureRows: 0,
      reportLeases: 0,
      releaseGrants: 0,
      media: false,
      providers: false,
    },
  };
}
