import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const orgA = '10000000-0000-4000-8000-000000000001';
const orgB = '10000000-0000-4000-8000-000000000002';
const admin = '20000000-0000-4000-8000-000000000001';
const staff = '20000000-0000-4000-8000-000000000002';
const outsider = '20000000-0000-4000-8000-000000000003';
const platform = '20000000-0000-4000-8000-000000000004';
const customerA = '30000000-0000-4000-8000-000000000001';
const customerB = '30000000-0000-4000-8000-000000000002';
const docA = '40000000-0000-4000-8000-000000000001';
const docB = '40000000-0000-4000-8000-000000000002';
const docQ = '40000000-0000-4000-8000-000000000003';
const tables = [
  'customers',
  'service_locations',
  'intake_requests',
  'documents',
  'activity_events',
];
async function asUser(id: string | null, aal = 'aal2') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(
      id ? { sub: id, aal, user_metadata: { role: 'super_admin' } } : {},
    ),
  ]);
  await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
}
async function rows(sql: string) {
  return (await db.query(sql)).rows;
}
async function denied(sql: string) {
  await expect(db.exec(sql)).rejects.toThrow();
}

beforeAll(async () => {
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const file of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(`
    insert into auth.users values('${admin}'),('${staff}'),('${outsider}'),('${platform}');
    insert into public.organizations(id,name,slug,industry) values
    ('${orgA}','Company A','company-a','construction'),('${orgB}','Company B','company-b','roofing');
    insert into public.memberships(organization_id,user_id,role) values
    ('${orgA}','${admin}','admin'),('${orgA}','${staff}','staff');
    insert into private.platform_admins(user_id) values('${platform}');
    insert into public.customers(id,organization_id,display_name) values
    ('${customerA}','${orgA}','Customer A'),('${customerB}','${orgB}','Customer B');
    insert into public.service_locations(organization_id,customer_id,address_line1,city,region,postal_code,country_code) values
    ('${orgA}','${customerA}','A street','City','IL','00000','US'),('${orgB}','${customerB}','B street','City','IL','00000','US');
    insert into public.intake_requests(organization_id,summary) values('${orgA}','A request'),('${orgB}','B request');
    insert into public.documents(id,organization_id,object_name,display_name,content_type,byte_size,scan_status) values
    ('${docA}','${orgA}','${orgA}/${docA}','A.pdf','application/pdf',100,'clean'),
    ('${docB}','${orgB}','${orgB}/${docB}','B.pdf','application/pdf',100,'clean'),
    ('${docQ}','${orgA}','${orgA}/${docQ}','Q.pdf','application/pdf',100,'quarantined');
    insert into storage.objects(bucket_id,name) values
    ('company-documents','${orgA}/${docA}'),('company-documents','${orgB}/${docB}'),('company-documents','${orgA}/${docQ}');
  `);
});
beforeEach(async () => {
  await asUser(admin);
});
afterAll(async () => {
  await db.close();
});

describe('PostgreSQL RLS tenant and role boundaries', () => {
  it('enables RLS on every application table, including private tables', async () => {
    await db.exec('reset role');
    expect(
      await rows(
        "select tablename from pg_tables where schemaname in ('public','private') and not rowsecurity",
      ),
    ).toEqual([]);
  });
  it.each(tables)('hides all company B rows in %s', async (table) => {
    const visible = await rows(`select organization_id from public.${table}`);
    expect(visible.length).toBeGreaterThan(0);
    expect(
      visible.every(
        (r) => (r as { organization_id: string }).organization_id === orgA,
      ),
    ).toBe(true);
  });
  it('allows authorized creation and audits it atomically', async () => {
    await db.exec(
      `insert into customers(organization_id,display_name) values('${orgA}','Authorized customer')`,
    );
    expect(
      (
        await rows(
          "select * from activity_events where entity_type='customers' and action='insert'",
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each(['customers', 'intake_requests'])(
    'rejects cross-company inserts in %s',
    async (table) => {
      await denied(
        table === 'customers'
          ? `insert into customers(organization_id,display_name) values('${orgB}','Attack')`
          : `insert into intake_requests(organization_id,summary) values('${orgB}','Attack')`,
      );
    },
  );
  it('rejects a forged tenant ID on an update', async () => {
    await denied(
      `update customers set organization_id='${orgB}' where id='${customerA}'`,
    );
  });
  it('denies moving records even when the user belongs to both tenants', async () => {
    await db.exec('reset role');
    await db.exec(
      `insert into memberships(organization_id,user_id,role) values('${orgB}','${staff}','staff')`,
    );
    await asUser(staff);
    await denied(
      `update customers set organization_id='${orgB}' where id='${customerA}'`,
    );
    await db.exec('reset role');
    await db.exec(
      `delete from memberships where organization_id='${orgB}' and user_id='${staff}'`,
    );
  });
  it('cannot update or delete rows of another tenant', async () => {
    expect(
      await rows(
        `update customers set display_name='Attack' where id='${customerB}' returning id`,
      ),
    ).toEqual([]);
    expect(
      await rows(`delete from customers where id='${customerB}' returning id`),
    ).toEqual([]);
  });
  it('blocks a cross-tenant customer foreign key even with an authorized row tenant', async () => {
    await denied(
      `insert into service_locations(organization_id,customer_id,address_line1,city,region,postal_code,country_code) values('${orgA}','${customerB}','Attack','City','IL','00000','US')`,
    );
    await denied(
      `insert into intake_requests(organization_id,customer_id,summary) values('${orgA}','${customerB}','Attack')`,
    );
  });
  it('blocks cross-company location assignment and staff assignment', async () => {
    await db.exec('reset role');
    const location = (
      await db.query<{ id: string }>(
        `select id from service_locations where organization_id='${orgB}'`,
      )
    ).rows[0].id;
    await asUser(admin);
    await denied(
      `insert into intake_requests(organization_id,service_location_id,summary) values('${orgA}','${location}','Attack')`,
    );
    await denied(
      `insert into intake_requests(organization_id,assigned_to,summary) values('${orgA}','${outsider}','Attack')`,
    );
  });
  it('denies membership self-promotion and creation', async () => {
    await denied(
      `update memberships set role='owner' where user_id='${admin}'`,
    );
    await denied(
      `insert into memberships values('${orgB}','${admin}','owner',true,now())`,
    );
  });
  it('requires AAL2 for company administrators', async () => {
    await asUser(admin, 'aal1');
    expect(await rows('select * from organizations')).toEqual([]);
    expect(await rows('select * from customers')).toEqual([]);
  });
  it('allows staff reads and inserts, but denies deletes, profile changes and audit reads', async () => {
    await asUser(staff, 'aal1');
    expect((await rows('select * from customers')).length).toBeGreaterThan(0);
    await db.exec(
      `insert into intake_requests(organization_id,summary) values('${orgA}','Staff request')`,
    );
    expect(
      await rows(
        `delete from intake_requests where organization_id='${orgA}' returning id`,
      ),
    ).toEqual([]);
    expect(
      await rows(
        `update organizations set name='Attack' where id='${orgA}' returning id`,
      ),
    ).toEqual([]);
    expect(await rows('select * from activity_events')).toEqual([]);
  });
  it('denies users without membership despite forged user_metadata', async () => {
    await asUser(outsider);
    for (const table of ['organizations', 'memberships', ...tables])
      expect(await rows(`select * from ${table}`)).toEqual([]);
    expect(await rows('select public.platform_access() as allowed')).toEqual([
      { allowed: false },
    ]);
  });
  it('immediately revokes tenant access when membership is disabled', async () => {
    await db.exec('reset role');
    await db.exec(
      `update memberships set active=false where user_id='${staff}'`,
    );
    await asUser(staff);
    expect(await rows('select * from customers')).toEqual([]);
    await db.exec('reset role');
    await db.exec(
      `update memberships set active=true where user_id='${staff}'`,
    );
  });
  it('limits platform access to company profiles, with MFA', async () => {
    await asUser(platform, 'aal1');
    expect(await rows('select public.platform_access() as allowed')).toEqual([
      { allowed: false },
    ]);
    await asUser(platform);
    expect(await rows('select public.platform_access() as allowed')).toEqual([
      { allowed: true },
    ]);
    expect((await rows('select * from organizations')).length).toBe(2);
    for (const table of tables)
      expect(await rows(`select * from ${table}`)).toEqual([]);
  });
  it('never exposes merchant configurations through authenticated SQL', async () => {
    await denied('select * from private.merchant_configurations');
    await denied('select * from private.platform_admins');
  });
  it('prevents audit insertion, modification, deletion and truncate', async () => {
    await denied(
      `insert into activity_events(organization_id,action,entity_type,entity_id) values('${orgA}','fake','fake','${customerA}')`,
    );
    await denied("update activity_events set action='fake'");
    await denied('delete from activity_events');
    await db.exec('reset role');
    await denied('update activity_events set action=action');
    await denied('truncate activity_events');
  });
  it('exposes only clean documents of the current company', async () => {
    expect(await rows('select name from storage.objects')).toEqual([
      { name: `${orgA}/${docA}` },
    ]);
    await denied(
      `insert into storage.objects(bucket_id,name) values('company-documents','${orgA}/forged')`,
    );
    expect(
      await rows("update storage.objects set name='forged' returning id"),
    ).toEqual([]);
    expect(await rows('delete from storage.objects returning id')).toEqual([]);
    await denied("update documents set scan_status='clean'");
  });
  it('denies anonymous access to tenant tables and documents', async () => {
    await asUser(null);
    for (const table of ['organizations', 'memberships', ...tables])
      await denied(`select * from ${table}`);
    expect(await rows('select * from storage.objects')).toEqual([]);
    await denied(
      `insert into customers(organization_id,display_name) values('${orgA}','Anonymous')`,
    );
    await denied('select public.platform_access()');
  });
});
