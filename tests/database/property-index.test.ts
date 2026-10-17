import { beforeAll, afterAll, it, expect } from 'vitest';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createTestDatabase } from './engine';
const db = createTestDatabase(),
  orgs = [crypto.randomUUID(), crypto.randomUUID()],
  customers = [crypto.randomUUID(), crypto.randomUUID()];
let location = '';
const cleanup = () =>
  readFileSync(
    'supabase/migrations/20261017024328_property_duplicate_index_cleanup.sql',
    'utf8',
  );
beforeAll(async () => {
  if (!db.fork) return;
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations')
    .sort()
    .filter((f) => !f.includes('duplicate_index_cleanup')))
    await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
  for (let i = 0; i < 2; i++) {
    await db.query(
      "insert into organizations(id,name,slug,industry) values($1,'Synthetic index benchmark',$2,'construction')",
      [orgs[i], 'index-' + i],
    );
    await db.query(
      "insert into customers(id,organization_id,display_name) values($1,$2,'Synthetic benchmark')",
      [customers[i], orgs[i]],
    );
    await db.query(
      "insert into service_locations(organization_id,customer_id,address_line1,city,region,postal_code,country_code) select $1,$2,'Synthetic benchmark','Example','FL','00000','US' from generate_series(1,2500)",
      [orgs[i], customers[i]],
    );
  }
  location = String(
    (
      await db.query(
        'select id from service_locations where organization_id=$1 limit 1',
        [orgs[0]],
      )
    ).rows[0].id,
  );
  await db.exec('vacuum analyze service_locations');
});
afterAll(() => db.close());
it.skipIf(!db.fork)(
  'native duplicate cleanup preserves representative lookup plans, valid FKs and all5000 rows',
  async () => {
    const query =
        'select id from public.service_locations where organization_id=$1 and id=$2 and customer_id=$3',
      args = [orgs[0], location, customers[0]];
    const before = (
      await db.query('explain(analyze,buffers,format json) ' + query, args)
    ).rows;
    const data = (await db.query(query, args)).rows;
    await db.exec(cleanup());
    const after = (
      await db.query('explain(analyze,buffers,format json) ' + query, args)
    ).rows;
    expect((await db.query(query, args)).rows).toEqual(data);
    expect(JSON.stringify(after)).toContain('location_customer_unique');
    expect(JSON.stringify(after)).not.toContain('property_location_customer');
    expect(
      Number(
        (await db.query('select count(*) n from service_locations')).rows[0].n,
      ),
    ).toBe(5000);
    expect(
      (
        await db.query(
          "select conname from pg_constraint where conindid=to_regclass('public.location_customer_unique')",
        )
      ).rows.length,
    ).toBeGreaterThanOrEqual(5);
    await expect(
      db.query(
        "insert into private.inspection_plans(organization_id,customer_id,location_id,name,cadence,interval_days,timezone,starts_on,checklist) values($1,$2,$3,'Synthetic','once',1,'UTC','2026-10-16','[]')",
        [orgs[1], customers[1], location],
      ),
    ).rejects.toThrow();
    if (existsSync('.staging/property-p0'))
      writeFileSync(
        '.staging/property-p0/index-plan.private.json',
        JSON.stringify(
          {
            rows: 5000,
            before,
            after,
            resultRows: data.length,
            retainedFkDependencies: true,
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
  },
);
it.skipIf(!db.fork)(
  'native cleanup fails closed under a lock wait and preserves the redundant index on rollback',
  async () => {
    await db.exec(
      'create unique index property_location_customer on public.service_locations(organization_id,id,customer_id)',
    );
    await db.exec('begin');
    await db.query('select id from service_locations where id=$1 for update', [
      location,
    ]);
    const peer = await db.fork!();
    try {
      await expect(peer.exec(cleanup())).rejects.toThrow(/lock timeout/);
      await peer.exec('rollback');
      await db.exec('commit');
      expect(
        (
          await db.query(
            "select to_regclass('public.property_location_customer') present",
          )
        ).rows[0].present,
      ).not.toBeNull();
      await db.exec(cleanup());
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'native FK insert still serializes against parent row locks after cleanup',
  async () => {
    await db.exec('begin');
    await db.query('select id from service_locations where id=$1 for update', [
      location,
    ]);
    const peer = await db.fork!();
    try {
      const pid = Number(
        (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      const pending = peer.query(
        "insert into private.inspection_plans(organization_id,customer_id,location_id,name,cadence,interval_days,timezone,starts_on,checklist) values($1,$2,$3,'Synthetic FK wait','once',1,'UTC','2026-10-16','[]') returning id",
        [orgs[0], customers[0], location],
      );
      let waiting = false;
      for (let n = 0; n < 50; n++) {
        waiting =
          (
            await db.query(
              "select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",
              [pid],
            )
          ).rows[0]?.waiting === true;
        if (waiting) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(waiting).toBe(true);
      await db.exec('commit');
      expect((await pending).rows).toHaveLength(1);
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
