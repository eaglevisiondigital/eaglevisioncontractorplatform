import { createTestDatabase } from './engine';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest';
const db = createTestDatabase();
const id = (n: number) =>
  `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const platform = id(1),
  ownerA = id(2),
  ownerB = id(3),
  ownerC = id(4),
  estimator = id(5),
  field = id(6),
  customerUser = id(7),
  invitee = id(8),
  admin = id(9);
const orgs: string[] = [];
const gateway = 'synthetic-gateway-key-for-local-tests-only-0000';
const payload = {
  name: 'Taylor Synthetic',
  email: 'taylor@example.test',
  phone: '555-0199',
  address: '100 Test Street',
  city: 'Test City',
  region: 'IL',
  postal_code: '00000',
  country_code: 'US',
  property_type: 'residential',
  service_category: 'General inquiry',
  description: 'Please inspect and repair the synthetic entryway.',
  preferred_appointment: 'Weekday morning',
  contact_preference: 'email',
  email_consent: true,
  sms_consent: false,
  consent_version: 'contact-v1',
};
async function asUser(
  user: string | null,
  aal = 'aal2',
  extra: Record<string, unknown> = {},
) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(user ? { sub: user, aal, ...extra } : {}),
  ]);
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
}
async function call<T = unknown>(name: string, args: unknown[] = []) {
  const r = await db.query<{ value: T }>(
    `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`,
    args,
  );
  return r.rows[0].value;
}
async function denied(sql: string, params: unknown[] = []) {
  await db.exec('savepoint attack');
  try {
    await expect(db.query(sql, params)).rejects.toThrow();
  } finally {
    await db.exec('rollback to savepoint attack; release savepoint attack');
  }
}
async function submit(
  slug = 'straight-edge',
  key = crypto.randomUUID(),
  data: unknown = payload,
  secret = gateway,
) {
  return call<{ status: string }>('submit_intake_gateway', [
    secret,
    slug,
    data,
    'a'.repeat(64),
    key,
  ]);
}
beforeAll(async () => {
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9])
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
      [id(n), `user${n}@example.test`],
    );
  await db.query('insert into private.platform_admins(user_id) values($1)', [
    platform,
  ]);
  await asUser(platform);
  for (const [name, slug, industry, owner] of [
    [
      'Straight Edge Property Services',
      'straight-edge',
      'property_services',
      ownerA,
    ],
    ['Cunningham Construction', 'cunningham', 'construction', ownerB],
    ['Synthetic Roofing', 'roofing', 'roofing', ownerC],
  ]) {
    const org = await call<string>('provision_company', [
      name,
      slug,
      industry,
      owner,
    ]);
    orgs.push(org);
    await call('configure_company', [org, 'active', 'pilot', {}, null]);
  }
  await db.exec('reset role');
  await db.query(
    "insert into memberships(organization_id,user_id,role,staff_type) values($1,$2,'staff','estimator'),($1,$3,'staff','field_staff'),($1,$4,'admin','office_manager')",
    [orgs[0], estimator, field, admin],
  );
  await db.query(
    "insert into private.intake_gateway_keys(key_hash) values(sha256(convert_to($1,'UTF8')))",
    [gateway],
  );
  await db.exec('update company_settings set intake_enabled=true');
});
beforeEach(async () => {
  await db.exec('reset role; begin');
  await asUser(ownerA);
});
afterEach(async () => {
  await db.exec('reset role; rollback');
});
afterAll(async () => {
  await db.close();
});

it('provisions three independent brands and owners with atomic bootstrap', async () => {
  await asUser(platform);
  const rows = (
    await db.query<{ name: string; slug: string; status: string }>(
      'select name,slug,status from organizations order by name',
    )
  ).rows;
  expect(rows).toHaveLength(3);
  expect(rows.map((r) => r.name)).toContain('Cunningham Construction');
  expect((await call<unknown[]>('company_metrics')).length).toBe(3);
  await asUser(ownerA);
  expect((await db.query('select * from organizations')).rows).toHaveLength(1);
  expect((await db.query('select * from company_modules')).rows).toHaveLength(
    9,
  );
});
it('accepts synthetic public requests only into the server-resolved company and preserves consent', async () => {
  await asUser(null);
  for (const slug of ['straight-edge', 'cunningham', 'roofing'])
    expect(await submit(slug)).toEqual({ status: 'accepted' });
  expect(await call('intake_profile', ['straight-edge'])).toMatchObject({
    name: 'Straight Edge Property Services',
    slug: 'straight-edge',
  });
  await asUser(ownerA);
  expect((await db.query('select * from customers')).rows).toHaveLength(1);
  expect(
    (await db.query('select * from intake_requests')).rows[0],
  ).toMatchObject({
    organization_id: orgs[0],
    source: 'website',
    status: 'new',
  });
  expect(
    (await db.query('select * from communication_consents')).rows[0],
  ).toMatchObject({
    email_allowed: true,
    sms_allowed: false,
    source: 'website',
    recorded_by: null,
  });
  expect(
    (await db.query('select * from lead_notifications')).rows,
  ).toHaveLength(1);
});
it('denies forged organization fields, gateway secrets, unknown routes and direct anonymous data reads', async () => {
  await asUser(null);
  await denied('select public.submit_intake_gateway($1,$2,$3,$4,$5)', [
    gateway,
    'straight-edge',
    { ...payload, organization_id: orgs[1] },
    'a'.repeat(64),
    crypto.randomUUID(),
  ]);
  await denied('select public.submit_intake_gateway($1,$2,$3,$4,$5)', [
    'wrong',
    'straight-edge',
    payload,
    'a'.repeat(64),
    crypto.randomUUID(),
  ]);
  expect(await submit('unknown-company')).toEqual({ status: 'unavailable' });
  await denied('select * from customers');
  await denied('select * from private.intake_gateway_keys');
});
it('deduplicates retries and rejects idempotency-key payload changes', async () => {
  await asUser(null);
  const key = crypto.randomUUID();
  await submit('straight-edge', key);
  await submit('straight-edge', key);
  await denied('select public.submit_intake_gateway($1,$2,$3,$4,$5)', [
    gateway,
    'straight-edge',
    { ...payload, name: 'Changed' },
    'a'.repeat(64),
    key,
  ]);
  await asUser(ownerA);
  expect((await db.query('select * from customers')).rows).toHaveLength(1);
});
it('enforces durable per-company fingerprint rate limits', async () => {
  await asUser(null);
  for (let i = 0; i < 5; i++) expect((await submit()).status).toBe('accepted');
  expect((await submit()).status).toBe('rate_limited');
  expect((await submit('cunningham')).status).toBe('accepted');
});
it('does not auto-merge unverified public identity matches', async () => {
  await asUser(null);
  await submit();
  await submit();
  await asUser(ownerA);
  expect(
    (await db.query('select * from customers where email=$1', [payload.email]))
      .rows,
  ).toHaveLength(2);
});
it('lets a contractor review and assign its inquiry while denying other companies and customers', async () => {
  await asUser(null);
  await submit();
  await asUser(ownerA);
  const request = (
    await db.query<{ id: string }>('select id from intake_requests')
  ).rows[0].id;
  await call('assign_intake', [orgs[0], request, field, 'reviewing']);
  await asUser(ownerB);
  expect((await db.query('select * from intake_requests')).rows).toEqual([]);
  await denied('select public.assign_intake($1,$2,$3,$4)', [
    orgs[0],
    request,
    ownerB,
    'closed',
  ]);
  await asUser(customerUser);
  expect((await db.query('select * from intake_requests')).rows).toEqual([]);
  expect((await db.query('select * from customers')).rows).toEqual([]);
  await asUser(field, 'aal1');
  expect((await db.query('select * from intake_requests')).rows).toHaveLength(
    1,
  );
  expect((await db.query('select * from customers')).rows).toEqual([]);
  await denied('select public.assign_intake($1,$2,$3,$4)', [
    orgs[0],
    request,
    field,
    'closed',
  ]);
});
it('denies cross-tenant and revoked assignees', async () => {
  await asUser(null);
  await submit();
  await asUser(ownerA);
  const request = (
    await db.query<{ id: string }>('select id from intake_requests')
  ).rows[0].id;
  await denied('select public.assign_intake($1,$2,$3,$4)', [
    orgs[0],
    request,
    ownerB,
    'reviewing',
  ]);
  await call('manage_member', [orgs[0], field, false, 'staff', 'field_staff']);
  await denied('select public.assign_intake($1,$2,$3,$4)', [
    orgs[0],
    request,
    field,
    'reviewing',
  ]);
});
it('blocks direct assignment/status spoofing and tenant reparenting', async () => {
  await asUser(null);
  await submit();
  await asUser(ownerA);
  await denied("update intake_requests set assigned_to=$1,status='qualified'", [
    field,
  ]);
  await denied('update customers set organization_id=$1', [orgs[1]]);
});
it('requires AAL2 and platform grants for provisioning/configuration/metrics', async () => {
  for (const user of [ownerA, admin, estimator, customerUser]) {
    await asUser(user);
    await denied('select public.company_metrics()');
    await denied('select public.configure_company($1,$2,$3,$4,$5)', [
      orgs[0],
      'suspended',
      'pilot',
      {},
      null,
    ]);
  }
  await asUser(platform, 'aal1');
  await denied('select public.company_metrics()');
  await asUser(ownerA, 'aal1');
  await denied('select public.create_invitation($1,$2,$3,$4)', [
    orgs[0],
    'user8@example.test',
    'staff',
    'estimator',
  ]);
});
it('permits aggregate platform metrics without private customer records', async () => {
  await asUser(null);
  await submit();
  await asUser(platform);
  expect(await call('company_metrics')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        organization_id: orgs[0],
        customers: 1,
        new_requests: 1,
      }),
    ]),
  );
  for (const t of [
    'customers',
    'service_locations',
    'intake_requests',
    'customer_notes',
    'communication_consents',
    'documents',
  ])
    expect((await db.query(`select * from ${t}`)).rows).toEqual([]);
});
it('disables access and public intake immediately on company suspension or module deactivation', async () => {
  await asUser(platform);
  await call('configure_company', [
    orgs[0],
    'active',
    'standard',
    { crm: false, intake: false },
    null,
  ]);
  await asUser(ownerA);
  expect((await db.query('select * from customers')).rows).toEqual([]);
  await denied(
    "insert into customers(organization_id,display_name) values($1,'Blocked')",
    [orgs[0]],
  );
  await asUser(null);
  expect(await call('intake_profile', ['straight-edge'])).toBeNull();
  expect((await submit()).status).toBe('unavailable');
  await asUser(platform);
  await call('configure_company', [orgs[0], 'suspended', 'standard', {}, null]);
  await asUser(ownerA);
  expect((await db.query('select * from organizations')).rows).toEqual([]);
});
it('never enables payment/invoice execution through module configuration', async () => {
  await asUser(platform);
  await denied('select public.configure_company($1,$2,$3,$4,$5)', [
    orgs[0],
    'active',
    'pilot',
    { payments: true },
    null,
  ]);
  await denied('select public.configure_company($1,$2,$3,$4,$5)', [
    orgs[0],
    'active',
    'pilot',
    { invoices: true },
    null,
  ]);
});
it('creates single-use email-bound invitations without sending external messages', async () => {
  const invitation = await call<{ token: string }>('create_invitation', [
    orgs[0],
    'user8@example.test',
    'staff',
    'estimator',
  ]);
  await asUser(customerUser, 'aal2', { email: 'user8@example.test' });
  await denied('select public.accept_invitation($1)', [invitation.token]);
  await asUser(invitee, 'aal1');
  expect(await call('accept_invitation', [invitation.token])).toBe(orgs[0]);
  expect(
    (await db.query('select * from memberships where user_id=$1', [invitee]))
      .rows[0],
  ).toMatchObject({ role: 'staff', staff_type: 'estimator' });
  await denied('select public.accept_invitation($1)', [invitation.token]);
});
it('blocks administrator role escalation and privileged invite acceptance without MFA', async () => {
  await asUser(admin);
  await denied('select public.create_invitation($1,$2,$3,$4)', [
    orgs[0],
    'user8@example.test',
    'admin',
    'office_manager',
  ]);
  await denied('select public.manage_member($1,$2,$3,$4,$5)', [
    orgs[0],
    estimator,
    true,
    'admin',
    'office_manager',
  ]);
  await asUser(ownerA);
  const invite = await call<{ token: string }>('create_invitation', [
    orgs[0],
    'user8@example.test',
    'admin',
    'office_manager',
  ]);
  await asUser(invitee, 'aal1');
  await denied('select public.accept_invitation($1)', [invite.token]);
  await asUser(invitee);
  await call('accept_invitation', [invite.token]);
});
it('revokes invitation links and validates expiry and current creator authorization', async () => {
  const invite = await call<{ id: string; token: string }>(
    'create_invitation',
    [orgs[0], 'user8@example.test', 'staff', 'estimator'],
  );
  await call('revoke_invitation', [orgs[0], invite.id]);
  await asUser(invitee);
  await denied('select public.accept_invitation($1)', [invite.token]);
  await asUser(admin);
  const second = await call<{ token: string }>('create_invitation', [
    orgs[0],
    'user8@example.test',
    'staff',
    'estimator',
  ]);
  await asUser(ownerA);
  await call('manage_member', [
    orgs[0],
    admin,
    false,
    'admin',
    'office_manager',
  ]);
  await asUser(invitee);
  await denied('select public.accept_invitation($1)', [second.token]);
});
it('restricts settings to privileged company members and validates atomic profile saves', async () => {
  await asUser(estimator);
  expect((await db.query('select * from company_settings')).rows).toEqual([]);
  await denied('select public.save_company_profile($1,$2,$3)', [
    orgs[0],
    { name: 'Attack' },
    {},
  ]);
  await asUser(ownerA);
  await call('save_company_profile', [
    orgs[0],
    { name: 'Straight Edge Test Branding', primary_color: '#126644' },
    {
      service_areas: 'Synthetic region',
      expiration_days: 45,
      estimate_prefix: 'TEST',
      labor_rate_minor: 12500,
    },
  ]);
  expect(
    (await db.query('select name from organizations')).rows[0],
  ).toMatchObject({ name: 'Straight Edge Test Branding' });
  await denied('select public.save_company_profile($1,$2,$3)', [
    orgs[0],
    { name: 'Must roll back' },
    { currency: 'invalid' },
  ]);
  expect(
    (await db.query('select name from organizations')).rows[0],
  ).toMatchObject({ name: 'Straight Edge Test Branding' });
  await denied('select public.save_company_profile($1,$2,$3)', [
    orgs[0],
    { status: 'active' },
    {},
  ]);
});
it('protects notes and consent provenance across companies and against mutation', async () => {
  await asUser(null);
  await submit();
  await asUser(ownerA);
  const customer = (await db.query<{ id: string }>('select id from customers'))
    .rows[0].id;
  await db.query(
    "insert into customer_notes(organization_id,customer_id,body) values($1,$2,'Local note')",
    [orgs[0], customer],
  );
  await call('record_consent', [orgs[0], customer, false, false]);
  await denied('update communication_consents set email_allowed=true');
  await denied(
    'insert into customer_notes(organization_id,customer_id,body,created_by) values($1,$2,$3,$4)',
    [orgs[0], customer, 'Spoof', ownerB],
  );
  await asUser(ownerB);
  expect((await db.query('select * from customer_notes')).rows).toEqual([]);
  await denied('select public.record_consent($1,$2,$3,$4)', [
    orgs[0],
    customer,
    true,
    true,
  ]);
});
it('protects private tables, append-only platform audit and least-privilege function exposure', async () => {
  await asUser(platform);
  for (const t of [
    'staff_invitations',
    'intake_gateway_keys',
    'intake_submissions',
    'platform_events',
  ])
    await denied(`select * from private.${t}`);
  expect((await call<unknown[]>('platform_activity')).length).toBeGreaterThan(
    0,
  );
  await db.exec('reset role');
  expect(
    (
      await db.query(
        "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and prosecdef",
      )
    ).rows,
  ).toEqual([]);
  expect(
    (
      await db.query(
        "select tablename from pg_tables where schemaname in ('private','public') and not rowsecurity",
      )
    ).rows,
  ).toEqual([]);
  await denied('update private.platform_events set action=action');
});
it('requires platform authorization to revoke owners and preserves the last owner', async () => {
  await denied('select public.revoke_owner($1,$2)', [orgs[0], ownerA]);
  await asUser(platform);
  await denied('select public.revoke_owner($1,$2)', [orgs[0], ownerA]);
  await call('configure_company', [orgs[0], 'active', 'pilot', {}, ownerB]);
  await call('revoke_owner', [orgs[0], ownerA]);
  await asUser(ownerA);
  expect((await db.query('select * from organizations')).rows).toEqual([]);
});

it('denies expired invitations and accounts without verified email', async () => {
  const invite = await call<{ id: string; token: string }>(
    'create_invitation',
    [orgs[0], 'user8@example.test', 'staff', 'estimator'],
  );
  await db.exec('reset role');
  await db.query(
    "update private.staff_invitations set expires_at=now()-interval '1 minute' where id=$1",
    [invite.id],
  );
  await asUser(invitee);
  await denied('select public.accept_invitation($1)', [invite.token]);
  await asUser(ownerA);
  const current = await call<{ token: string }>('create_invitation', [
    orgs[0],
    'user8@example.test',
    'staff',
    'estimator',
  ]);
  await db.exec('reset role');
  await db.query('update auth.users set email_confirmed_at=null where id=$1', [
    invitee,
  ]);
  await asUser(invitee);
  await denied('select public.accept_invitation($1)', [current.token]);
});
it('rejects tenant-mismatched customer/location relationships and unsafe logo references', async () => {
  await asUser(null);
  await submit();
  await submit();
  await asUser(ownerA);
  const requests = (
    await db.query<{ customer_id: string; service_location_id: string }>(
      'select customer_id,service_location_id from intake_requests',
    )
  ).rows;
  await denied(
    'insert into intake_requests(organization_id,customer_id,service_location_id,summary) values($1,$2,$3,$4)',
    [
      orgs[0],
      requests[0].customer_id,
      requests[1].service_location_id,
      'Mismatched customer',
    ],
  );
  const document = crypto.randomUUID();
  await db.exec('reset role');
  await db.query(
    "insert into documents(id,organization_id,object_name,display_name,content_type,byte_size) values($1,$2,$3,'Quarantined.png','image/png',100)",
    [document, orgs[0], `${orgs[0]}/${document}`],
  );
  await asUser(ownerA);
  await denied('select public.save_company_profile($1,$2,$3)', [
    orgs[0],
    { logo_document_id: document },
    {},
  ]);
  await asUser(ownerB);
  expect((await db.query('select * from documents')).rows).toEqual([]);
  expect((await db.query('select * from storage.objects')).rows).toEqual([]);
});
it('prevents forged CRM timestamps, IDs and consent actor fields', async () => {
  await denied(
    "insert into customers(organization_id,display_name,created_at) values($1,'Forged',now())",
    [orgs[0]],
  );
  await denied('update customers set created_at=now()');
  await denied(
    "insert into communication_consents(organization_id,customer_id,email_allowed,sms_allowed,policy_version,source,recorded_by) values($1,$2,true,true,'spoof','staff',$3)",
    [orgs[0], crypto.randomUUID(), ownerB],
  );
});
