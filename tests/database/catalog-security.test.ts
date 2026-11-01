import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createTestDatabase } from './engine';
import { tenantTables } from '../../server/staging/acceptance';
const db = createTestDatabase();
beforeAll(async () => {
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
}, 30000);
afterAll(async () => {
  await db.close();
});
it('every public tenant table is included in hosted isolation checks and has RLS', async () => {
  const { rows } = await db.query<{ name: string; secured: boolean }>(
    `select c.relname name, c.relrowsecurity secured from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='organization_id' and not a.attisdropped)`,
  );
  expect(rows.map((r) => r.name).sort()).toEqual([...tenantTables].sort());
  expect(rows.filter((r) => !r.secured)).toEqual([]);
});
it('every public RPC is invoker and every private definer has empty search path', async () => {
  const { rows } = await db.query(
    `select n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.prosecdef) or (n.nspname='private' and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false))`,
  );
  expect(rows).toEqual([]);
});
it('all application buckets are private and no client storage write policies exist', async () => {
  const { rows } = await db.query(
    `select id from storage.buckets where public=true`,
  );
  expect(rows).toEqual([]);
  const policies = await db.query(
    `select policyname from pg_policies where schemaname='storage' and tablename='objects' and cmd in ('ALL','INSERT','UPDATE','DELETE')`,
  );
  expect(policies.rows).toEqual([]);
});
it.each(['contracts', 'invoices', 'payments'])(
  'cannot enable unfinished %s even through an elevated table write',
  async (module) => {
    // Owner/operator-level check proves the constraint survives any client UI bypass.
    await db.exec('begin');
    try {
      await db.query(
        "insert into public.organizations(id,name,slug,industry) values('90000000-0000-4000-8000-000000000099','Synthetic release test','release-test','construction')",
      );
      await expect(
        db.query(
          'update public.company_modules set enabled=true where module=$1',
          [module],
        ),
      ).rejects.toThrow();
    } finally {
      await db.exec('rollback');
    }
  },
);
