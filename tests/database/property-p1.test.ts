import { executionPackage } from '../helpers/p1-execution';
import { acceptanceJournal } from '../../server/property/acceptance-journal';
import { executeP1 } from '../../server/property/execution/executor';
import {
  assertOriginalRows,
  p1ReadOnlyVerification,
  type P1Reference,
} from '../../server/property/execution/verification';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createTestDatabase } from './engine';
import { p1Evidence, p1Now } from '../helpers/property-p1-fixture';
import { prepareP1, featureSql } from '../../server/property/p1-readiness';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import {
  compareSuppliers,
  type SupplierQuote,
} from '../../src/domain/property/comparison';
import type { EstimateBundle } from '../../src/domain/estimating/types';
const db = createTestDatabase(),
  e = p1Evidence(),
  sessions = new Map<string, string>();
async function actor(id: string, aal = 'aal2') {
  await db.exec('reset role');
  let sid = sessions.get(id);
  if (!sid) {
    sid = crypto.randomUUID();
    sessions.set(id, sid);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
      sid,
      id,
    ]);
  }
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: id,
      session_id: sid,
      aal,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await db.exec('set role authenticated');
}
async function rpc(name: string, args: Record<string, unknown>) {
  return (
    await db.query<{ v: unknown }>(
      `select public.${name}(${Object.keys(args)
        .map((_, i) => '$' + (i + 1))
        .join(',')}) v`,
      Object.values(args),
    )
  ).rows[0].v;
}
beforeAll(async () => {
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  await db.exec(
    'create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[])',
  );
  for (const f of readdirSync('supabase/migrations').sort()) {
    await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
    await db.query(
      'insert into supabase_migrations.schema_migrations values($1)',
      [f.split('_')[0]],
    );
  }
  for (const a of e.actors)
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [a.user_id, a.alias + '@example.test'],
    );
  await db.exec(
    'create table auth.mfa_factors(id uuid primary key,user_id uuid, factor_type text,status text);',
  );
  for (const a of e.actors.filter((a) => a.role === 'owner'))
    await db.query(
      "insert into auth.mfa_factors values($1,$2,'totp','verified')",
      [crypto.randomUUID(), a.user_id],
    );
  await db.query(
    "insert into auth.mfa_factors values($1,$2,'totp','verified')",
    [crypto.randomUUID(), e.actors[0].user_id],
  );
  for (let i = 0; i < 4; i++)
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [crypto.randomUUID(), `extra-${i}@example.test`],
    );
  for (const [i, b] of e.bindings.entries()) {
    await db.query(
      "insert into organizations(id,name,slug,industry,status) values($1,$2,$3,'construction','active')",
      [b.organization_id, e.resources[i].company, 'p1-' + i],
    );
    for (const a of e.actors.filter(
      (a) => a.organization_id === b.organization_id && a.role,
    ))
      await db.query(
        'insert into memberships(organization_id,user_id,role,staff_type,active) values($1,$2,$3,$4,$5)',
        [
          a.organization_id,
          a.user_id,
          a.role,
          a.staff_type,
          a.active_membership,
        ],
      );
    await db.query(
      "insert into customers(id,organization_id,display_name) values($1,$2,'Synthetic P1')",
      [b.customer_id, b.organization_id],
    );
    await db.query(
      "insert into service_locations(id,organization_id,customer_id,address_line1,city,region,postal_code,country_code) values($1,$2,$3,'Synthetic','Example','FL','00000','US')",
      [b.location_id, b.organization_id, b.customer_id],
    );
    const tax = crypto.randomUUID();
    await db.query(
      "insert into estimate_tax_policies(id,organization_id,name,reference,jurisdiction,contract_type,rate_bps,status) values($1,$2,'Test','Synthetic','Test','Test',0,'reviewed')",
      [tax, b.organization_id],
    );
    const owner = e.actors.find((a) => a.alias === `pilot-${i + 1}-owner`)!;
    await actor(owner.user_id);
    const input = blankEstimate(b.customer_id);
    input.tax_policy_id = tax;
    input.expires_on = '2030-01-01';
    input.lines[0] = {
      ...input.lines[0],
      kind: 'material',
      description: 'Synthetic materials',
      unit: 'each',
      quantity_milli: 12000,
      unit_cost_minor: 1000,
      unit_price_minor: 2000,
    };
    let v = (await rpc('create_estimate', {
      p_org: b.organization_id,
      p: input,
      p_key: crypto.randomUUID(),
    })) as EstimateBundle;
    v = (await rpc('issue_estimate', {
      p_org: b.organization_id,
      p_estimate: v.estimate.id,
      p_version: v.version.id,
      p_lock: v.version.lock_revision,
    })) as EstimateBundle;
    b.job_id = (await rpc('approve_job', {
      p_org: b.organization_id,
      p_version: v.version.id,
    })) as string;
    b.estimate_version_id = v.version.id;
    b.material_line_id = v.version.payload.lines[0].id;
    await db.exec('reset role');
    const j = (
      await db.query<{
        lock_revision: number;
        baseline: Record<string, unknown>;
      }>('select lock_revision,baseline from jobs where id=$1', [b.job_id])
    ).rows[0];
    b.job_revision = j.lock_revision;
    Object.assign(e.resources[i], b, {
      line: {
        id: b.material_line_id,
        kind: 'material',
        quantity_milli: 12000,
        unit: 'each',
      },
      original_revenue_minor: String(j.baseline.revenue_minor),
    });
    const field = e.actors.find(
      (a) => a.alias === `pilot-${i + 1}-assigned-field`,
    )!;
    await db.query(
      'insert into job_assignments(organization_id,job_id,user_id,active) values($1,$2,$3,true)',
      [b.organization_id, b.job_id, field.user_id],
    );
  }
  e.originalRows = e.bindings.map((b) => ({
    table_name: 'public.jobs',
    row_key: b.job_id,
    stable_digest: 'a'.repeat(32),
    full_digest: 'b'.repeat(32),
    original_revision: b.job_revision,
  }));
  e.originalRows = (
    await db.query<
      import('../../server/property/p1-readiness').P1Evidence['originalRows'][number]
    >(
      "select 'public.jobs' table_name,t.id::text row_key,md5(to_jsonb(t)::text) full_digest,t.lock_revision original_revision,md5((to_jsonb(t)-'lock_revision')::text) stable_digest from public.jobs t order by id",
    )
  ).rows;
  e.originalRows.push(
    ...(
      await db.query<
        import('../../server/property/p1-readiness').P1Evidence['originalRows'][number]
      >(
        "select 'public.activity_events' table_name,t.id::text row_key,md5(to_jsonb(t)::text) full_digest,null::integer original_revision,md5(to_jsonb(t)::text) stable_digest from public.activity_events t order by id",
      )
    ).rows,
  );
  await db.exec('reset role;delete from auth.sessions');
  sessions.clear();
});
afterAll(() => db.close());
it('executes all75 proposed fixture steps and69 probes locally with exact57 rows, arithmetic and zero customer debt', async () => {
  const bundle = executionPackage(e),
    p = bundle.plan,
    sql = featureSql(p);
  const protectedTables = [
    'customers',
    'service_locations',
    'estimates',
    'estimate_versions',
    'jobs',
    'memberships',
    'worker_profiles',
    'time_entries',
    'payroll_periods',
  ];
  const fingerprints = async () => {
    const values = [];
    for (const t of protectedTables)
      values.push(
        (
          await db.query(
            `select md5(coalesce(string_agg(md5((to_jsonb(x)${t === 'jobs' ? "-'lock_revision'" : ''})::text),'' order by md5((to_jsonb(x)${t === 'jobs' ? "-'lock_revision'" : ''})::text)),'')) digest from public.${t} x`,
          )
        ).rows[0].digest,
      );
    return values;
  };
  const originals = await fingerprints();
  const auditStart = Number(
    (await db.query('select count(*) n from activity_events')).rows[0].n,
  );
  const domains = [
    'inspection_plans',
    'inspection_visits',
    'inspection_reports',
    'supplier_comparisons',
    'unbilled_decisions',
    'supplemental_invoice_drafts',
  ];
  const q = async (sql: string) => (await db.query(sql)).rows;
  const reference: P1Reference = {
    identityRoster: (await q(
      'select id,email_confirmed_at is not null as confirmed from auth.users order by id',
    )) as unknown as P1Reference['identityRoster'],
    factorRoster: (await q(
      'select id,user_id,factor_type,status from auth.mfa_factors order by id',
    )) as unknown as P1Reference['factorRoster'],
    history: await q(
      'select version,name,statements from supabase_migrations.schema_migrations order by version',
    ),
    catalog: await q(
      readFileSync('server/property/execution/catalog.sql', 'utf8'),
    ),
    columnAcl: await q(
      readFileSync('server/property/execution/column-acl.sql', 'utf8'),
    ),
    defaults: await q(
      'select pg_get_userbyid(d.defaclrole)::text owner,n.nspname schema,d.defaclobjtype kind,d.defaclacl::text acl from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace order by 1,2,3',
    ),
    schema: await q(
      "select nspname,nspacl::text from pg_namespace where nspname in ('auth','private','public','storage') order by nspname",
    ),
    tableCounts: [],
    authSettingsHash: 'local-contract-only',
    apiSettingsHash: 'local-contract-only',
  };
  const property = new Set([
    'property_features',
    'inspection_plans',
    'inspection_visits',
    'inspection_reports',
    'property_media',
    'supplier_comparisons',
    'unbilled_decisions',
    'supplemental_invoice_drafts',
    'property_report_access',
  ]);
  for (const r of reference.catalog as { kind: string; name: string }[])
    if (r.kind === 'table' && !property.has(r.name.split('.')[1]))
      reference.tableCounts.push({
        table_name: r.name,
        row_count: Number((await q('select count(*) n from ' + r.name))[0].n),
      });
  const verifier = p1ReadOnlyVerification(
    bundle.frozen,
    reference,
    q,
    async () => ({
      authSettingsHash: 'local-contract-only',
      apiSettingsHash: 'local-contract-only',
    }),
  );
  const journal = acceptanceJournal(join(bundle.root, 'journal'), bundle.hash);
  const allReceipts = new Map<string, Map<string, { id: string } | string>>();
  let verificationFailure: string | null = null;
  const execution = await executeP1({
    frozen: bundle.frozen,
    journal,
    signal: new AbortController().signal,
    now: () => p1Now,
    actors: {
      verifyAll: async () => {},
      get: (org, role) => {
        const c = p.companies.find((c) => c.organization_id === org)!;
        const low = role === 'owner-original-aal1';
        const a =
          c.actorBindings[
            low
              ? 'owner'
              : role === 'assigned-field-signed-out-same-jwt'
                ? 'assigned-field'
                : role
          ];
        return {
          verify: async () => ({
            userId: a.user_id,
            aal: low ? 'aal1' : role === 'owner' ? 'aal2' : 'aal1',
            sessionId: sessions.get(a.user_id) ?? crypto.randomUUID(),
          }),
          signOut: async () => {
            await db.exec('reset role');
            await db.query('delete from auth.sessions where id=$1', [
              sessions.get(a.user_id),
            ]);
          },
          rpc: async (name, args) => {
            await actor(
              a.user_id,
              low ? 'aal1' : role === 'owner' ? 'aal2' : 'aal1',
            );
            try {
              const value = await rpc(name, args);
              if (role === 'owner' && name === 'property_workspace') {
                const q = value as {
                  comparisons: { snapshot: { quotes: SupplierQuote[] } }[];
                };
                expect(
                  compareSuppliers(
                    c.requirements,
                    q.comparisons[0].snapshot.quotes,
                    'USD',
                    p1Now,
                  ).vendors.map((v) => v.total_minor),
                ).toEqual(c.comparison.vendors.map((v) => v.total_minor));
              }
              return { data: value, code: null, status: 200 };
            } catch (e) {
              return {
                data: null,
                code: (e as { code: string }).code,
                status: (e as { code: string }).code === '23505' ? 409 : 403,
              };
            }
          },
        };
      },
    },
    control: {
      ready: async () => {},
      check: async () => {},
      activate: async () => {
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claims','{}',false)");
        await db.exec(sql.activation);
      },
      close: async () => {
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claims','{}',false)");
        await db.exec(sql.cleanup);
        await db.exec('delete from auth.sessions');
        sessions.clear();
        const active = Number(
          (
            await db.query(
              'select count(*) n from private.property_features where enabled',
            )
          ).rows[0].n,
        );
        return {
          status: active === 0 ? 'VERIFIED' : 'CONTAINMENT_REQUIRED',
          deactivation: 'CONFIRMED',
          sessions: 'CONFIRMED',
          observation: null,
        };
      },
    },
    verification: {
      before: async () => {
        assertOriginalRows(bundle.frozen, e.originalRows, false);
        try {
          await verifier.before();
        } catch (err) {
          verificationFailure = (err as Error).message;
          throw err;
        }
      },
      after: async (receipts) => {
        for (const [org, ids] of receipts) allReceipts.set(org, new Map(ids));
        // Full reference verifier checks all captured original rows, exact budgets and audit/financial provenance.
        try {
          await verifier.after(receipts);
        } catch (err) {
          verificationFailure = (err as Error).message;
          throw err;
        }
      },
    },
  });
  try {
    expect(execution.status, verificationFailure ?? undefined).toBe('VERIFIED');
    expect(execution.fixtureSteps).toBe(75);
    expect(execution.assertionProbes).toBe(69);
    expect(allReceipts.size).toBe(3);
  } finally {
    rmSync(bundle.root, { recursive: true, force: true });
  }
  const probes = execution.assertionProbes;
  expect(probes).toBe(69);
  await db.exec('reset role');
  expect(await fingerprints()).toEqual(originals);
  await db.exec('reset role');
  let total = 0;
  for (const t of domains)
    total += Number(
      (await db.query(`select count(*) n from private.${t}`)).rows[0].n,
    );
  for (const t of ['job_expenses', 'job_expense_reviews', 'job_change_orders'])
    total += Number(
      (await db.query(`select count(*) n from public.${t}`)).rows[0].n,
    );
  expect(total).toBe(57);
  expect(
    Number(
      (await db.query('select sum(amount_minor) n from job_expenses')).rows[0]
        .n,
    ),
  ).toBe(30003);
  expect(
    Number(
      (await db.query('select count(*) n from job_change_approvals')).rows[0].n,
    ),
  ).toBe(0);
  expect(
    Number(
      (await db.query('select count(*) n from release_ledger_entries')).rows[0]
        .n,
    ),
  ).toBe(0);
  await expect(db.exec(sql.activation)).rejects.toThrow();
  await db.exec('rollback');
  await db.exec(sql.cleanup);
  await db.exec(sql.cleanup);
  expect(
    Number(
      (
        await db.query(
          'select count(*) n from private.property_features where enabled',
        )
      ).rows[0].n,
    ),
  ).toBe(0);
  expect(
    Number(
      (await db.query('select count(*) n from private.property_features'))
        .rows[0].n,
    ),
  ).toBe(3);
  expect(
    Number(
      (await db.query('select count(*) n from activity_events')).rows[0].n,
    ) - auditStart,
  ).toBe(114);
  expect(
    Number(
      (await db.query('select count(*) n from private.property_report_access'))
        .rows[0].n,
    ),
  ).toBe(0);
  expect(
    Number(
      (await db.query('select count(*) n from portal_identities')).rows[0].n,
    ),
  ).toBe(0);
});
it('partial/error cleanup disables exact approved tenants without touching unexpected tenant controls', async () => {
  await db.exec('reset role');
  const p = prepareP1(e, 'p1-native-review', p1Now),
    sql = featureSql(p),
    other = crypto.randomUUID();
  await db.query(
    "insert into organizations(id,name,slug,industry) values($1,'Other test tenant','p1-other','construction')",
    [other],
  );
  await db.query('insert into private.property_features values($1,true)', [
    other,
  ]);
  await db.query(
    'update private.property_features set enabled=true where organization_id=$1',
    [e.bindings[0].organization_id],
  );
  await db.exec(sql.cleanup);
  expect(
    (
      await db.query(
        'select enabled from private.property_features where organization_id=$1',
        [other],
      )
    ).rows[0].enabled,
  ).toBe(true);
  expect(
    (
      await db.query(
        'select enabled from private.property_features where organization_id=$1',
        [e.bindings[0].organization_id],
      )
    ).rows[0].enabled,
  ).toBe(false);
});
it.skipIf(!db.fork)(
  'native P1 cleanup lock timeout preserves state until supervised exact retry after verified rollback',
  async () => {
    await db.exec('reset role');
    const p = prepareP1(e, 'p1-native-review', p1Now),
      sql = featureSql(p),
      peer = await db.fork!();
    try {
      await db.query(
        'update private.property_features set enabled=true where organization_id=$1',
        [e.bindings[0].organization_id],
      );
      await peer.exec('begin');
      await peer.query(
        'select * from private.property_features where organization_id=$1 for update',
        [e.bindings[0].organization_id],
      );
      await expect(db.exec(sql.cleanup)).rejects.toThrow(/lock timeout/);
      await db.exec('rollback');
      await peer.exec('rollback');
      await db.exec(sql.cleanup);
      expect(
        (
          await db.query(
            'select enabled from private.property_features where organization_id=$1',
            [e.bindings[0].organization_id],
          )
        ).rows[0].enabled,
      ).toBe(false);
    } finally {
      await peer.exec('rollback');
      await peer.close();
    }
  },
);
it('local administrator SQL path also requires AAL2 without creating hosted administrator memberships', async () => {
  await db.exec('reset role');
  const org = e.bindings[0].organization_id,
    a = e.actors.find((a) => a.alias === 'pilot-1-estimator')!;
  await db.query(
    "update memberships set role='admin' where organization_id=$1 and user_id=$2",
    [org, a.user_id],
  );
  await db.query(
    'update private.property_features set enabled=true where organization_id=$1',
    [org],
  );
  await actor(a.user_id, 'aal1');
  await expect(rpc('property_workspace', { p_org: org })).rejects.toThrow();
  await actor(a.user_id, 'aal2');
  expect(await rpc('property_workspace', { p_org: org })).toHaveProperty(
    'material_reviews',
  );
  await db.exec('reset role');
  await db.query(
    "update memberships set role='staff' where organization_id=$1 and user_id=$2",
    [org, a.user_id],
  );
  await db.exec(featureSql(prepareP1(e, 'p1-native-review', p1Now)).cleanup);
});
