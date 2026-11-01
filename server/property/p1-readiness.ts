import { createHash } from 'node:crypto';
import {
  preparePropertyAcceptance,
  type PropertyFixtureBinding,
} from './acceptance-plan.ts';
import type {
  SupplierQuote,
  Requirement,
} from '../../src/domain/property/comparison.ts';

export interface P1Actor {
  alias: string;
  user_id: string;
  organization_id: string;
  role: string | null;
  staff_type: string | null;
  active_membership: boolean;
  assigned_job: boolean;
  active_customer_mapping: boolean;
}
export interface P1Resource {
  company: string;
  organization_id: string;
  customer_id: string;
  location_id: string;
  job_id: string;
  estimate_version_id: string;
  job_revision: number;
  original_revenue_minor: string;
  original_baseline_digest: string;
  estimate_version_digest: string;
  version_status: string;
  currency: string;
  line: { id: string; kind: string; quantity_milli: number; unit: string };
  existing_material_reviews: number;
  duplicate_run_expenses: number;
}
export interface P1Evidence {
  capturedAt: string;
  historyCount: number;
  identities: number;
  verifiedTotp: number;
  sessions: number;
  featureRows: number;
  mappings: number;
  reportLeases: number;
  activePlatformGrants: number;
  releaseGrants: number;
  providerWorkloads: number;
  bindings: PropertyFixtureBinding[];
  resources: P1Resource[];
  actors: P1Actor[];
  originalRows: {
    table_name: string;
    row_key: string;
    stable_digest: string;
    full_digest: string;
    original_revision: number | null;
  }[];
}
export function canonical(value: unknown): string {
  const sort = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(sort)
      : x && typeof x === 'object'
        ? Object.fromEntries(
            Object.entries(x)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, sort(v)]),
          )
        : x;
  return JSON.stringify(sort(value));
}
export const digest = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
const uid = (x: string) =>
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x);
const md5 = (x: string) => /^[a-f0-9]{32}$/.test(x);
const companies = [
  'Straight Edge Property Services',
  'Cunningham Construction',
  'Sample Roofing Contractor',
];
/** Offline, deterministic proposal only: no network, credential reader, session or hosted executor. */
export function prepareP1(e: P1Evidence, runKey: string, now: number) {
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(Date.parse(e.capturedAt)) ||
    now - Date.parse(e.capturedAt) < 0 ||
    now - Date.parse(e.capturedAt) > 600000
  )
    throw Error('Fresh read-only evidence required');
  if (
    e.historyCount !== 13 ||
    e.identities !== 22 ||
    e.verifiedTotp !== 4 ||
    [
      e.sessions,
      e.featureRows,
      e.mappings,
      e.reportLeases,
      e.activePlatformGrants,
      e.releaseGrants,
      e.providerWorkloads,
    ].some((x) => x !== 0)
  )
    throw Error('Dormant baseline required');
  if (
    e.resources.length !== 3 ||
    e.actors.length !== 18 ||
    new Set(e.actors.map((a) => a.alias)).size !== 18 ||
    new Set(e.actors.map((a) => a.user_id)).size !== 18 ||
    !e.originalRows.length ||
    e.originalRows.some(
      (r) =>
        !r.table_name.match(/^(public|private)\.[a-z_]+$/) ||
        !r.row_key ||
        !md5(r.stable_digest) ||
        !md5(r.full_digest) ||
        (r.table_name === 'public.jobs' &&
          (!Number.isSafeInteger(r.original_revision) ||
            Number(r.original_revision) < 1)),
    ) ||
    new Set(e.originalRows.map((r) => r.table_name + ':' + r.row_key)).size !==
      e.originalRows.length
  )
    throw Error('Incomplete row/actor evidence');
  const plan = preparePropertyAcceptance(e.bindings, runKey);
  const actorBindings = e.bindings.map((b, i) => {
    const r = e.resources.find((r) => r.organization_id === b.organization_id);
    if (
      !r ||
      r.company !== companies[i] ||
      r.customer_id !== b.customer_id ||
      r.location_id !== b.location_id ||
      r.job_id !== b.job_id ||
      r.estimate_version_id !== b.estimate_version_id ||
      r.job_revision !== b.job_revision ||
      r.line.id !== b.material_line_id ||
      !['material', 'product', 'allowance'].includes(r.line.kind) ||
      r.line.unit !== 'each' ||
      !Number.isSafeInteger(r.line.quantity_milli) ||
      r.line.quantity_milli <= 0 ||
      r.line.quantity_milli > 100000 ||
      r.currency !== 'USD' ||
      b.currency !== r.currency ||
      r.version_status !== 'issued' ||
      r.existing_material_reviews !== 0 ||
      r.duplicate_run_expenses !== 0 ||
      b.expense_id !== null ||
      b.net_approved_cost_minor !== 10001 ||
      !md5(r.original_baseline_digest) ||
      !md5(r.estimate_version_digest) ||
      !/^\d+$/.test(r.original_revenue_minor) ||
      !Number.isSafeInteger(Number(r.original_revenue_minor)) ||
      Date.parse(b.quoted_at) > now ||
      Date.parse(b.quote_expires_at) <= now + 1800000
    )
      throw Error('Resource/revision/duplicate/quotation drift');
    if (
      !e.originalRows.some(
        (x) =>
          x.table_name === 'public.jobs' &&
          x.row_key === b.job_id &&
          x.original_revision === b.job_revision,
      )
    )
      throw Error('Original job revision guard missing');
    const roles = [
      'owner',
      'estimator',
      'assigned-field',
      'unassigned-field',
      'revoked-staff',
      'customer',
    ];
    return Object.fromEntries(
      roles.map((role) => {
        const a = e.actors.find((a) => a.alias === `pilot-${i + 1}-${role}`);
        if (
          !a ||
          !uid(a.user_id) ||
          a.organization_id !== b.organization_id ||
          a.active_customer_mapping
        )
          throw Error('Actor/tenant mismatch');
        if (role === 'owner' && (!a.active_membership || a.role !== 'owner'))
          throw Error('Owner authority absent');
        if (
          ['estimator', 'assigned-field', 'unassigned-field'].includes(role) &&
          (!a.active_membership ||
            a.role !== 'staff' ||
            a.staff_type !==
              (role === 'estimator' ? 'estimator' : 'field_staff'))
        )
          throw Error('Staff authority changed');
        if (
          a.assigned_job !== (role === 'assigned-field') ||
          (['customer', 'revoked-staff'].includes(role) && a.active_membership)
        )
          throw Error('Revocation/assignment changed');
        return [role, a];
      }),
    );
  });
  const preparedCompanies = plan.companies.map((c, i) => {
    const expense = c.steps.find((s) => s.id === 'fixture-expense')!;
    const payload = expense.args.p_expense as Record<string, unknown>;
    payload.purchase_key = 'p1-' + runKey;
    payload.supplier = 'Synthetic P1 supplier';
    payload.reference = `P1 ${runKey} unmatched materials`;
    payload.description =
      'Unplanned synthetic P1 materials; not real procurement';
    const quote = c.steps.find((s) => s.id === 'four-vendors')!;
    const quotes = (quote.args.p as unknown as { quotes: SupplierQuote[] })
      .quotes;
    // One unknown shipping amount exercises a genuinely non-comparable basket without inventing a price.
    quotes[3].shipping_minor = null;
    const r = e.resources.find((r) => r.organization_id === c.organization_id)!;
    const requirement: Requirement = {
      line_id: r.line.id,
      description: 'Synthetic reviewed material',
      sku: '',
      specification: 'Reviewed equivalent synthetic material',
      quantity_milli: r.line.quantity_milli,
      unit: r.line.unit,
    };
    // Independent fixture arithmetic, not a synthetic provider or server acceptance result.
    const packs = (BigInt(requirement.quantity_milli) + 999n) / 1000n;
    const comparison = {
      vendors: quotes.map((q) => ({
        quote_id: q.id,
        packs: Number(packs),
        goods_minor: Number(packs * BigInt(q.lines[0].pack_price_minor)),
        shipping_minor: q.shipping_minor,
        total_minor:
          q.shipping_minor === null
            ? null
            : Number(packs * BigInt(q.lines[0].pack_price_minor)) +
              q.shipping_minor,
      })),
      mixed: {
        total_minor: Number(packs * 1000n),
        assignments: [{ line_id: requirement.line_id, quote_id: 'vendor-1' }],
      },
      source:
        'independent expected arithmetic; verify authenticated snapshot with application comparison engine',
    };
    const proposed = c.steps.find((s) => s.id === 'decision-proposed')!;
    const p = proposed.args.p as { pricing: { mode: string; value: number } };
    p.pricing =
      i === 0
        ? { mode: 'percent', value: 1250 }
        : i === 1
          ? { mode: 'fixed', value: 1250 }
          : { mode: 'pass_through', value: 0 };
    c.expected.supplemental_selling_minor = i === 2 ? 10001 : 11251;
    return {
      ...c,
      originalRevenueMinor: Number(r.original_revenue_minor),
      originalBaselineDigest: r.original_baseline_digest,
      expectedJobRevision: r.job_revision + 5,
      actorBindings: actorBindings[i],
      comparison,
      probes: prepareProbes(c, e.bindings, r.job_revision + 5),
      requirements: [requirement],
      idempotency: {
        purchaseKey: payload.purchase_key,
        reference: payload.reference,
        stepPolicy:
          'single-attempt; journal exact result IDs; STOP/READ-ONLY on unknown; never replay create_plan/quote_snapshot',
        perStepDigests: c.steps.map((s) => ({ id: s.id, sha256: digest(s) })),
      },
    };
  });
  const blockedStaff = new Set([
    'expiry',
    'required-checklist',
    'quantity-substitution',
    'credits-overlaps',
  ]);
  const rows = plan.companies.flatMap((c) =>
    c.cases.map((x) => ({
      ...x,
      status:
        x.stage !== 'P1' || blockedStaff.has(x.id)
          ? ('BLOCKED' as const)
          : ('NOT RUN' as const),
      blocker:
        x.stage === 'P2'
          ? 'Separate exact customer-mapping/report-only lease approval'
          : x.stage === 'P3'
            ? 'No protected media runtime; ingestion/playback activation prohibited'
            : x.id === 'expiry'
              ? 'Natural JWT expiry cannot be assumed within bounded window; no token forging/Auth setting change'
              : blockedStaff.has(x.id)
                ? 'Additional controlled fixture/state transitions required beyond75 steps/57 rows; native-only coverage until separately reviewed expansion'
                : null,
      scopeLimit:
        x.id === 'role-revocation'
          ? 'Existing revoked membership and real session sign-out denial; no membership/assignment mutation'
          : x.id === 'credits-overlaps'
            ? 'Reconcile existing purchases/credits; synthetic new credit/overlap rows excluded from57-row budget'
            : x.id === 'immutable-report'
              ? 'Published snapshot mutation/replay denied; extra v2 publication excluded from75-step budget'
              : null,
    })),
  );
  if (plan.companies.some((c) => c.steps.length !== 25) || rows.length !== 72)
    throw Error('Operation budget changed');
  return {
    status: 'PREPARED_NOT_AUTHORIZED' as const,
    runKey,
    sourceCheckpoint: 'b63a9ef',
    capturedAt: e.capturedAt,
    maximumWindowSeconds: 1800,
    hostedExecutor: false,
    requiresGenuineAuth: true,
    syntheticClaimsPermittedHosted: false,
    positiveSteps: 75,
    domainRecords: 57,
    featureRowsProposed: 3,
    customerMappingsProposed: 0,
    reportLeasesProposed: 0,
    companies: preparedCompanies,
    scenarios: rows,
    stageCounts: { P1: 60, P2: 9, P3: 3 },
    tracking: {
      PASS: 0,
      FAIL: 0,
      BLOCKED: rows.filter((r) => r.status === 'BLOCKED').length,
      'NOT RUN': rows.filter((r) => r.status === 'NOT RUN').length,
    },
    originalRowCount: e.originalRows.length,
    originalRowsSha256: digest(e.originalRows),
    originalRows: e.originalRows,
    cleanup: {
      features:
        'update only the exact three created rows enabled=false; preserve rows/audit; no delete',
      sessions:
        'global sign-out every exercised identity; server-side verify zero sessions; same-JWT property RPC must deny after sign-out',
      onError:
        'stop writes; immediately deactivate exact features and close sessions under explicit future cleanup approval; independently verify; no automatic retry',
      deadline:
        'operator-enforced30minutes from activation; no database TTL; require supervised independent cleanup access',
      financial:
        'zero customer receivable/approved revenue delta; three synthetic10001 cost postings only; proposed changes have cost0 and no approvals; drafts nonpayable',
    },
    p2: {
      status: 'SEPARATE_APPROVAL_REQUIRED',
      mappings: e.bindings.map((b, i) => ({
        organization_id: b.organization_id,
        customer_id: b.customer_id,
        user_id: actorBindings[i].customer.user_id,
        active: true,
      })),
      leases: e.bindings.map((b, i) => ({
        organization_id: b.organization_id,
        customer_id: b.customer_id,
        location_id: b.location_id,
        user_id: actorBindings[i].customer.user_id,
        ttlSeconds: 900,
        renewable: false,
      })),
      featureReactivationRequiresSeparateApproval: true,
      financialReleaseGrants: 0,
      globalReleaseMode: false,
      cleanup:
        'revoke exact returned lease IDs; deactivate only created customer mappings and exact features; preserve audit; close sessions',
    },
  };
}

export function featureSql(p: ReturnType<typeof prepareP1>) {
  const tuples = p.companies
    .map((c) => `('${c.organization_id}'::uuid)`)
    .join(',');
  const checks = p.companies
    .map(
      (c) =>
        `if not exists(select 1 from public.jobs where organization_id='${c.organization_id}'::uuid and id='${c.steps[0].args.p_job}'::uuid and lock_revision=${c.expectedJobRevision - 5}) then raise exception 'P1 job revision drift';end if;`,
    )
    .join('\n');
  const activation = `-- PROPOSED ONLY. Exact P1 feature activation, not a migration. Target/owner genuine AAL2 preflight required.\nbegin;\nset local lock_timeout='2s';\nset local statement_timeout='10s';\ndo $$declare n integer;begin\nif (select count(*) from supabase_migrations.schema_migrations)<>13 or exists(select 1 from private.property_features) or exists(select 1 from private.property_report_access) or exists(select 1 from public.portal_identities) or exists(select 1 from private.platform_admins where active) or exists(select 1 from private.release_test_users) or exists(select 1 from private.provider_workloads) then raise exception 'P1 dormant baseline changed';end if;\n${checks}\ninsert into private.property_features(organization_id,enabled) select org,true from (values${tuples}) t(org);\nget diagnostics n=row_count;if n<>3 then raise exception 'P1 feature count mismatch';end if;\nend$$;\ncommit;\n`;
  const cleanup = `-- PROPOSED ONLY. Always deactivate only the approved tenants, including partial activation. Preserve unknown tenants for review.
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
update private.property_features set enabled=false where enabled and organization_id in (select org from (values${tuples}) t(org));
select count(*) filter(where enabled and organization_id in (select org from (values${tuples}) t(org))) approved_still_enabled,count(*) filter(where enabled and organization_id not in (select org from (values${tuples}) t(org))) unexpected_enabled from private.property_features;
commit;
`;
  return { activation, cleanup };
}

function prepareProbes(
  c: ReturnType<typeof preparePropertyAcceptance>['companies'][number],
  bindings: PropertyFixtureBinding[],
  finalRevision: number,
) {
  const command = (
    id: string,
    actor: string,
    after: string,
    action: string,
    target: unknown,
    lock: number | null,
    p: unknown,
    codes: string[],
  ) => ({
    id,
    actor,
    after,
    rpc: 'property_command',
    args: {
      p_org: c.organization_id,
      p_action: action,
      p_id: target,
      p_lock: lock,
      p,
    },
    expect: { codes, rowsCreated: 0, originalRowsUnchanged: true },
  });
  const ref = (result: string) => ({ result, field: 'id' });
  const save = c.steps.find((s) => s.id === 'weekly-0-save')!;
  const quote = c.steps.find((s) => s.id === 'four-vendors')!;
  const proposed = c.steps.find((s) => s.id === 'decision-proposed')!;
  const job = bindings.find(
    (b) => b.organization_id === c.organization_id,
  )!.job_id;
  const probes = [
    command(
      'owner-aal1-publish',
      'owner-original-aal1',
      'weekly-0-submit',
      'publish_visit',
      ref('weekly-0-visit'),
      3,
      {},
      ['42501'],
    ),
    command(
      'field-publish',
      'assigned-field',
      'weekly-0-submit',
      'publish_visit',
      ref('weekly-0-visit'),
      3,
      {},
      ['P0001', '42501'],
    ),
    command(
      'estimator-publish',
      'estimator',
      'weekly-0-submit',
      'publish_visit',
      ref('weekly-0-visit'),
      3,
      {},
      ['P0001', '42501'],
    ),
    command(
      'unassigned-visit',
      'unassigned-field',
      'weekly-plan',
      'create_visit',
      ref('weekly-plan'),
      null,
      { visited_on: c.dates.weekly[0], phase: 'before' },
      ['42501'],
    ),
    command(
      'stale-visit',
      'owner',
      'weekly-0-save',
      'save_visit',
      ref('weekly-0-visit'),
      1,
      save.args.p,
      ['P0001'],
    ),
    command(
      'null-revision',
      'owner',
      'weekly-0-save',
      'save_visit',
      ref('weekly-0-visit'),
      null,
      save.args.p,
      ['P0001'],
    ),
    command(
      'duplicate-visit',
      'assigned-field',
      'weekly-0-visit',
      'create_visit',
      ref('weekly-plan'),
      null,
      { visited_on: c.dates.weekly[0], phase: 'before' },
      ['23505'],
    ),
    command(
      'published-save',
      'owner',
      'weekly-0-publish',
      'save_visit',
      ref('weekly-0-visit'),
      4,
      save.args.p,
      ['P0001'],
    ),
    command(
      'published-republish',
      'owner',
      'weekly-0-publish',
      'publish_visit',
      ref('weekly-0-visit'),
      4,
      {},
      ['P0001'],
    ),
    command(
      'estimator-review',
      'estimator',
      'four-vendors',
      'unbilled_review',
      job,
      finalRevision - 4,
      proposed.args.p,
      ['P0001', '42501'],
    ),
    command(
      'field-review',
      'assigned-field',
      'four-vendors',
      'unbilled_review',
      job,
      finalRevision - 4,
      proposed.args.p,
      ['P0001', '42501'],
    ),
    command(
      'duplicate-proposal',
      'owner',
      'decision-proposed',
      'unbilled_review',
      job,
      finalRevision,
      proposed.args.p,
      ['P0001'],
    ),
  ];
  for (const b of bindings.filter(
    (b) => b.organization_id !== c.organization_id,
  )) {
    probes.push(
      command(
        'foreign-version-' + b.organization_id,
        'estimator',
        'four-vendors',
        'quote_snapshot',
        b.estimate_version_id,
        null,
        quote.args.p,
        ['P0001'],
      ),
    );
    probes.push({
      ...command(
        'foreign-tenant-' + b.organization_id,
        'owner',
        'weekly-plan',
        'create_plan',
        null,
        null,
        c.steps.find((s) => s.id === 'weekly-plan')!.args.p,
        ['42501'],
      ),
      args: {
        p_org: b.organization_id,
        p_action: 'create_plan',
        p_id: null,
        p_lock: null,
        p: c.steps.find((s) => s.id === 'weekly-plan')!.args.p,
      },
    });
  }
  const wrongCurrency = structuredClone(quote.args.p) as unknown as {
    quotes: SupplierQuote[];
  };
  wrongCurrency.quotes[0].currency = 'EUR';
  probes.push(
    command(
      'wrong-currency',
      'estimator',
      'four-vendors',
      'quote_snapshot',
      quote.args.p_id,
      null,
      wrongCurrency,
      ['P0001'],
    ),
  );
  return [
    ...probes,
    {
      id: 'duplicate-expense',
      actor: 'owner',
      after: 'fixture-expense',
      rpc: 'submit_job_expense',
      args: c.steps[0].args,
      expect: { codes: ['23505'], rowsCreated: 0, originalRowsUnchanged: true },
    },
    {
      id: 'revoked-workspace',
      actor: 'revoked-staff',
      after: 'weekly-plan',
      rpc: 'property_workspace',
      args: { p_org: c.organization_id },
      expect: { codes: ['42501'], rowsCreated: 0, originalRowsUnchanged: true },
    },
    {
      id: 'field-private-costs',
      actor: 'assigned-field',
      after: 'decision-proposed',
      rpc: 'property_workspace',
      args: { p_org: c.organization_id },
      expect: {
        success: true,
        forbiddenKeys: [
          'reports',
          'comparisons',
          'material_reviews',
          'supplemental_drafts',
        ],
        keysMustBeAbsent: true,
      },
    },
    {
      id: 'signed-out-session',
      actor: 'assigned-field-signed-out-same-jwt',
      after: 'all-positive-steps',
      rpc: 'property_workspace',
      args: { p_org: c.organization_id },
      expect: { codes: ['42501'], rowsCreated: 0, originalRowsUnchanged: true },
    },
    {
      id: 'owner-workspace',
      actor: 'owner',
      after: 'decision-proposed',
      rpc: 'property_workspace',
      args: { p_org: c.organization_id },
      expect: {
        success: true,
        requiredKeys: [
          'reports',
          'comparisons',
          'material_reviews',
          'supplemental_drafts',
        ],
        counts: {
          plans: 2,
          visits: 4,
          reports: 4,
          comparisons: 1,
          material_reviews: 4,
          supplemental_drafts: 1,
        },
      },
    },
    {
      id: 'estimator-private-management',
      actor: 'estimator',
      after: 'decision-proposed',
      rpc: 'property_workspace',
      args: { p_org: c.organization_id },
      expect: {
        success: true,
        forbiddenKeys: ['material_reviews', 'supplemental_drafts'],
        keysMustBeAbsent: true,
      },
    },
  ];
}
