import { readFileSync } from 'node:fs';
import { canonical, digest, requireFrozen, type FrozenP1 } from './package.ts';
import type { P1Verification } from './executor.ts';
type OriginalRow = FrozenP1['plan']['originalRows'][number];
export interface P1Reference {
  identityRoster: { id: string; confirmed: boolean }[];
  factorRoster: {
    id: string;
    user_id: string;
    factor_type: string;
    status: string;
  }[];
  history: unknown[];
  catalog: unknown[];
  columnAcl: unknown[];
  defaults: unknown[];
  schema: unknown[];
  tableCounts: { table_name: string; row_count: number }[];
  authSettingsHash: string;
  apiSettingsHash: string;
}
export interface P1Snapshot {
  identityRoster: { id: string; confirmed: boolean }[];
  factorRoster: {
    id: string;
    user_id: string;
    factor_type: string;
    status: string;
  }[];
  history: unknown[];
  catalog: unknown[];
  columnAcl: unknown[];
  defaults: unknown[];
  schema: unknown[];
  tableCounts: { table_name: string; row_count: number }[];
  originalRows: OriginalRow[];
  actors: {
    alias: string;
    user_id: string;
    organization_id: string;
    role: string | null;
    staff_type: string | null;
    active_membership: boolean;
    assigned_job: boolean;
    active_customer_mapping: boolean;
  }[];
  identities: number;
  verifiedTotp: number;
  authSettingsHash: string;
  apiSettingsHash: string;
  expenses: {
    id: string;
    organization_id: string;
    amount_minor: number;
    purchase_key: string;
    reference: string;
  }[];
  changes: {
    id: string;
    organization_id: string;
    selling_minor: number;
    cost_minor: number;
  }[];
  drafts: {
    id: string;
    organization_id: string;
    status: string;
    selling_minor: number;
    expense_id: string;
    decision_id: string;
    change_order_id: string;
  }[];
  audits: {
    organization_id: string;
    actor_id: string | null;
    entity_type: string;
    entity_id: string | null;
    action: string;
  }[];
}
export function assertOriginalRows(
  frozen: FrozenP1,
  actual: OriginalRow[],
  after: boolean,
) {
  const key = (r: OriginalRow) =>
    r.table_name +
    ':' +
    (r.row_key.startsWith('{') ? canonical(JSON.parse(r.row_key)) : r.row_key);
  const map = new Map(actual.map((r) => [key(r), r]));
  if (map.size !== actual.length)
    throw Error('Duplicate composite-key evidence');
  for (const r of frozen.plan.originalRows) {
    const x = map.get(key(r));
    if (!x) throw Error('Original composite-key row missing');
    const company = frozen.plan.companies.find(
      (c) => c.steps[0].args.p_job === r.row_key,
    );
    if (after && r.table_name === 'public.jobs' && company) {
      if (
        x.stable_digest !== r.stable_digest ||
        x.original_revision !== company.expectedJobRevision
      )
        throw Error('Job baseline/revision changed');
    } else if (x.full_digest !== r.full_digest)
      throw Error('Original business/financial row changed');
  }
}
const propertyCounts: Record<string, number> = {
  'private.property_features': 3,
  'private.inspection_plans': 6,
  'private.inspection_visits': 12,
  'private.inspection_reports': 12,
  'private.supplier_comparisons': 3,
  'private.unbilled_decisions': 12,
  'private.supplemental_invoice_drafts': 3,
  'private.property_report_access': 0,
  'private.property_media': 0,
};
export function assertP1Snapshot(
  frozen: FrozenP1,
  reference: P1Reference,
  s: P1Snapshot,
  after: boolean,
  receipts?: ReadonlyMap<string, ReadonlyMap<string, { id: string } | string>>,
) {
  requireFrozen(frozen);
  for (const k of [
    'history',
    'catalog',
    'columnAcl',
    'defaults',
    'schema',
    'identityRoster',
    'factorRoster',
  ] as const)
    if (digest(s[k]) !== digest(reference[k]))
      throw Error('Schema/history/ACL drift');
  if (
    s.history.length !== 13 ||
    s.identities !== 22 ||
    s.identityRoster.length !== 22 ||
    new Set(s.identityRoster.map((x) => x.id)).size !== 22 ||
    s.identityRoster.some((x) => !x.confirmed) ||
    s.factorRoster.length !== 4 ||
    new Set(s.factorRoster.map((x) => x.id)).size !== 4 ||
    s.factorRoster.some(
      (x) => x.factor_type !== 'totp' || x.status !== 'verified',
    ) ||
    s.verifiedTotp !== 4 ||
    s.authSettingsHash !== reference.authSettingsHash ||
    s.apiSettingsHash !== reference.apiSettingsHash
  )
    throw Error('Auth/API/identity drift');
  assertOriginalRows(frozen, s.originalRows, after);
  const expectedActors = frozen.plan.companies
    .flatMap((c) => Object.values(c.actorBindings))
    .sort((a, b) => a.alias.localeCompare(b.alias));
  if (
    canonical([...s.actors].sort((a, b) => a.alias.localeCompare(b.alias))) !==
    canonical(expectedActors)
  )
    throw Error('Actor/resource authority changed');
  const counts = new Map(
    s.tableCounts.map((r) => [r.table_name, Number(r.row_count)]),
  );
  const deltas: Record<string, number> = {
    'public.activity_events': 114,
    'public.job_expenses': 3,
    'public.job_expense_reviews': 3,
    'public.job_change_orders': 3,
    ...propertyCounts,
  };
  for (const r of reference.tableCounts)
    if (
      counts.get(r.table_name) !==
      Number(r.row_count) + (after ? (deltas[r.table_name] ?? 0) : 0)
    )
      throw Error('Unexpected table additions or financial execution');
  for (const [table, n] of Object.entries(propertyCounts))
    if (counts.get(table) !== (after ? n : 0))
      throw Error('Property record budget mismatch');
  if (!after) {
    if (
      s.expenses.length ||
      s.changes.length ||
      s.drafts.length ||
      s.audits.length
    )
      throw Error('Existing run fixtures/audits');
    return;
  }
  if (
    !receipts ||
    s.expenses.length !== 3 ||
    s.changes.length !== 3 ||
    s.drafts.length !== 3 ||
    s.audits.length !== 114
  )
    throw Error('Domain/audit budget mismatch');
  const auditEntities = new Map<string, Map<string, Map<string, number>>>();
  for (const c of frozen.plan.companies) {
    const ids = receipts.get(c.organization_id);
    if (!ids || ids.size !== 25) throw Error('Receipt coverage missing');
    const expense = ids.get('fixture-expense');
    const proposed = ids.get('decision-proposed');
    const x = s.expenses.find((x) => x.organization_id === c.organization_id),
      d = s.drafts.find((d) => d.organization_id === c.organization_id),
      change = s.changes.find((x) => x.organization_id === c.organization_id);
    if (
      !x ||
      !d ||
      !change ||
      x.id !== expense ||
      x.amount_minor !== 10001 ||
      x.purchase_key !== c.idempotency.purchaseKey ||
      x.reference !== c.idempotency.reference ||
      d.expense_id !== x.id ||
      d.decision_id !== (typeof proposed === 'object' ? proposed.id : null) ||
      d.change_order_id !== change.id ||
      d.status !== 'awaiting_customer_authorization' ||
      d.selling_minor !== c.expected.supplemental_selling_minor ||
      change.selling_minor !== d.selling_minor ||
      change.cost_minor !== 0
    )
      throw Error('Financial provenance/reconciliation mismatch');
    const receipt = (step: string) => {
      const r = ids.get(step);
      const id = typeof r === 'string' ? r : r?.id;
      if (!id) throw Error('Audit receipt missing');
      return id;
    };
    const entities = new Map<string, Map<string, number>>();
    const add = (type: string, values: string[], each = 1) =>
      entities.set(type, new Map(values.map((id) => [id, each])));
    add('property_features', [c.organization_id], 2);
    add('jobs', [String(c.steps[0].args.p_job)], 5);
    add('job_expenses', [receipt('fixture-expense')]);
    add('job_expense_reviews', [receipt('fixture-review')]);
    add('job_change_orders', [change.id]);
    add(
      'inspection_plans',
      ['weekly', 'monthly'].map((x) => receipt(x + '-plan')),
    );
    for (const type of ['inspection_visits', 'inspection_reports'])
      add(
        type,
        ['weekly', 'monthly'].flatMap((x) =>
          [0, 1].map((i) =>
            receipt(
              x +
                '-' +
                i +
                (type === 'inspection_visits' ? '-visit' : '-publish'),
            ),
          ),
        ),
        type === 'inspection_visits' ? 4 : 1,
      );
    add('supplier_comparisons', [receipt('four-vendors')]);
    add(
      'unbilled_decisions',
      ['absorbed', 'included', 'deferred', 'proposed'].map((x) =>
        receipt('decision-' + x),
      ),
    );
    add('supplemental_invoice_drafts', [d.id]);
    auditEntities.set(c.organization_id, entities);
  }
  const perTenant: Record<string, number> = {
    property_features: 2,
    job_expenses: 1,
    job_expense_reviews: 1,
    jobs: 5,
    job_change_orders: 1,
    inspection_plans: 2,
    inspection_visits: 16,
    inspection_reports: 4,
    supplier_comparisons: 1,
    unbilled_decisions: 4,
    supplemental_invoice_drafts: 1,
  };
  for (const c of frozen.plan.companies)
    for (const [entity, n] of Object.entries(perTenant))
      if (
        s.audits.filter(
          (a) =>
            a.organization_id === c.organization_id && a.entity_type === entity,
        ).length !== n
      )
        throw Error('Audit provenance count mismatch');
  for (const a of s.audits) {
    const c = frozen.plan.companies.find(
      (c) => c.organization_id === a.organization_id,
    );
    const actor =
      c &&
      Object.entries(c.actorBindings).find(
        ([, x]) => x.user_id === a.actor_id,
      )?.[0];
    const allowedActor =
      a.entity_type === 'property_features'
        ? a.actor_id === null
        : actor === 'owner' ||
          (actor === 'assigned-field' &&
            a.entity_type === 'inspection_visits') ||
          (actor === 'estimator' && a.entity_type === 'supplier_comparisons');
    if (
      !c ||
      !Object.hasOwn(perTenant, a.entity_type) ||
      !a.entity_id ||
      !auditEntities
        .get(c.organization_id)
        ?.get(a.entity_type)
        ?.has(a.entity_id) ||
      !['insert', 'update'].includes(a.action) ||
      !allowedActor
    )
      throw Error('Audit tenant/actor/entity mismatch');
  }
  for (const [organization, types] of auditEntities)
    for (const [entity, ids] of types)
      for (const [id, count] of ids)
        if (
          s.audits.filter(
            (a) =>
              a.organization_id === organization &&
              a.entity_type === entity &&
              a.entity_id === id,
          ).length !== count
        )
          throw Error('Audit receipt multiplicity mismatch');
}
/** Narrow read-only adapter: no caller tokens, no exposed tables, no generic mutation endpoint. */
export function p1ReadOnlyVerification(
  frozen: FrozenP1,
  reference: P1Reference,
  query: (sql: string) => Promise<unknown[]>,
  settings: () => Promise<{
    authSettingsHash: string;
    apiSettingsHash: string;
  }>,
): P1Verification {
  requireFrozen(frozen);
  const id = (x: string) => {
    if (!/^[a-f0-9-]{36}$/.test(x)) throw Error('Read identifier invalid');
    return "'" + x + "'::uuid";
  };
  const tables = [
    ...new Set([
      ...reference.tableCounts.map((r) => r.table_name),
      ...Object.keys(propertyCounts),
    ]),
  ].sort();
  if (tables.some((t) => !/^(public|private)\.[a-z_]+$/.test(t)))
    throw Error('Read table invalid');
  const catalog = reference.catalog as {
    kind: string;
    name: string;
    definition: { constraints?: { definition: string }[] };
  }[];
  const original =
    tables
      .map((t) => {
        const pk = catalog
          .find((x) => x.kind === 'table' && x.name === t)
          ?.definition.constraints?.find((x) =>
            x.definition.startsWith('PRIMARY KEY '),
          )
          ?.definition.match(/^PRIMARY KEY \(([^)]+)\)/)?.[1]
          .split(',')
          .map((c) => c.trim());
        if (!pk?.length || pk.some((c) => !/^[a-z_]+$/.test(c)))
          throw Error('Reviewed composite PK metadata required');
        const key =
          pk.length === 1 && pk[0] === 'id'
            ? 't.id::text'
            : 'jsonb_build_object(' +
              pk.map((c) => "'" + c + "',t." + c).join(',') +
              ')::text';
        return `select '${t}' table_name,${key} row_key,md5(to_jsonb(t)::text) full_digest,${t === 'public.jobs' ? 't.lock_revision' : 'null::integer'} original_revision,md5((to_jsonb(t)${t === 'public.jobs' ? "-'lock_revision'" : ''})::text) stable_digest from ${t} t`;
      })
      .join(' union all ') + ' order by table_name,row_key';
  const expected = frozen.plan.companies
    .flatMap((c) =>
      Object.values(c.actorBindings).map(
        (a) =>
          `('${a.alias}',${id(a.user_id)},${id(a.organization_id)},${id(String(c.steps[0].args.p_job))})`,
      ),
    )
    .join(',');
  const actors = `with expected(alias,user_id,organization_id,job) as (values${expected}) select e.alias,e.user_id,e.organization_id,m.role,m.staff_type,coalesce(m.active,false) active_membership,exists(select 1 from public.job_assignments a where a.organization_id=e.organization_id and a.job_id=e.job and a.user_id=e.user_id and a.active) assigned_job,exists(select 1 from public.portal_identities p where p.organization_id=e.organization_id and p.user_id=e.user_id and p.active) active_customer_mapping from expected e left join public.memberships m on m.organization_id=e.organization_id and m.user_id=e.user_id order by e.alias`;
  const auditOriginalIds = frozen.plan.originalRows
    .filter((r) => r.table_name === 'public.activity_events')
    .map((r) => r.row_key);
  const auditWhere = auditOriginalIds.length
    ? 'id not in (' + auditOriginalIds.map(id).join(',') + ')'
    : 'true';
  const snapshot = async (): Promise<P1Snapshot> => {
    const run = 'p1-' + frozen.plan.runKey;
    if (!/^[a-z0-9-]{1,80}$/.test(run)) throw Error('Run key invalid');
    const queries = {
      identityRoster:
        'select id,email_confirmed_at is not null as confirmed from auth.users order by id',
      factorRoster:
        'select id,user_id,factor_type,status from auth.mfa_factors order by id',
      history:
        'select version,name,statements from supabase_migrations.schema_migrations order by version',
      catalog: readFileSync(new URL('./catalog.sql', import.meta.url), 'utf8'),
      columnAcl: readFileSync(
        new URL('./column-acl.sql', import.meta.url),
        'utf8',
      ),
      defaults:
        'select pg_get_userbyid(d.defaclrole)::text owner,n.nspname schema,d.defaclobjtype kind,d.defaclacl::text acl from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace order by 1,2,3',
      schema:
        "select nspname,nspacl::text from pg_namespace where nspname in ('auth','private','public','storage') order by nspname",
      tableCounts:
        tables
          .map(
            (t) =>
              `select '${t}' table_name,count(*)::integer row_count from ${t}`,
          )
          .join(' union all ') + ' order by table_name',
      originalRows: original,
      actors,
      expenses: `select id,organization_id,amount_minor,purchase_key,reference from public.job_expenses where purchase_key='${run}' order by organization_id`,
      changes:
        'select id,organization_id,revenue_minor as selling_minor,cost_minor from public.job_change_orders where id in(select change_id from private.supplemental_invoice_drafts) order by organization_id',
      drafts:
        'select d.id,d.organization_id,d.status,d.selling_minor,d.decision_id,u.expense_id,d.change_id as change_order_id from private.supplemental_invoice_drafts d join private.unbilled_decisions u on u.organization_id=d.organization_id and u.id=d.decision_id order by d.organization_id',
      audits: `select organization_id,actor_id,entity_type,entity_id,action from public.activity_events where ${auditWhere} order by id`,
    };
    const values: Record<string, unknown> = {};
    for (const [k, sql] of Object.entries(queries))
      values[k] = await query(sql);
    const g = await query(
      "select (select count(*) from auth.users)::int identities,(select count(*) from auth.mfa_factors where factor_type='totp' and status='verified')::int verified_totp",
    );
    return {
      ...values,
      ...(await settings()),
      identities: (g[0] as { identities: number }).identities,
      verifiedTotp: (g[0] as { verified_totp: number }).verified_totp,
    } as P1Snapshot;
  };
  return {
    before: async () =>
      assertP1Snapshot(frozen, reference, await snapshot(), false),
    after: async (r) =>
      assertP1Snapshot(frozen, reference, await snapshot(), true, r),
  };
}
