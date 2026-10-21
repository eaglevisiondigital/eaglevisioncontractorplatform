import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest';
import { createTestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
const db = createTestDatabase();
const companies = Array.from({ length: 3 }, (_, i) => ({
  org: crypto.randomUUID(),
  owner: crypto.randomUUID(),
  customer: crypto.randomUUID(),
  viewer: crypto.randomUUID(),
  tax: crypto.randomUUID(),
  name: [
    'Straight Edge Property Services',
    'Cunningham Construction',
    'Sample Roofing Contractor',
  ][i],
}));
const c = companies[0];
async function asUser(user = c.owner, aal = 'aal2') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: user, aal }),
  ]);
  await db.exec('set role authenticated');
}
async function command(
  action: string,
  input: Record<string, unknown>,
  org = c.org,
) {
  return (
    await db.query<{ value: unknown }>(
      'select public.release_command($1,$2,$3) value',
      [org, action, input],
    )
  ).rows[0].value as string;
}
async function denied(sql: string, args: unknown[] = []) {
  await db.exec('savepoint attack');
  try {
    await expect(db.query(sql, args)).rejects.toThrow();
  } finally {
    await db.exec('rollback to savepoint attack;release savepoint attack');
  }
}
async function deniedCommand(
  action: string,
  input: Record<string, unknown>,
  org = c.org,
) {
  await denied('select public.release_command($1,$2,$3)', [org, action, input]);
}
async function issue(company = c) {
  await asUser(company.owner);
  const p = blankEstimate(company.customer);
  p.expires_on = '2030-01-01';
  p.tax_policy_id = company.tax;
  p.internal_notes = 'PRIVATE SUPPLIER COST AND PAYROLL';
  p.lines[0] = {
    ...p.lines[0],
    description: 'Synthetic materials',
    quantity_milli: 2000,
    unit_cost_minor: 3333,
    unit_price_minor: 10000,
    taxable: true,
  };
  p.payment_schedule = [
    {
      id: crypto.randomUUID(),
      kind: 'deposit',
      label: 'Deposit',
      share_bps: 3000,
      due_on: null,
    },
    {
      id: crypto.randomUUID(),
      kind: 'milestone',
      label: 'Completion',
      share_bps: 7000,
      due_on: null,
    },
  ];
  const b = (
    await db.query<{ v: EstimateBundle }>(
      'select public.create_estimate($1,$2,$3) v',
      [company.org, p, crypto.randomUUID()],
    )
  ).rows[0].v;
  return (
    await db.query<{ v: EstimateBundle }>(
      'select public.issue_estimate($1,$2,$3,$4) v',
      [company.org, b.estimate.id, b.version.id, b.version.lock_revision],
    )
  ).rows[0].v;
}
async function offer(company = c) {
  const b = await issue(company);
  return {
    bundle: b,
    id: await command(
      'publish_offer',
      { version_id: b.version.id },
      company.org,
    ),
  };
}
async function contract(company = c) {
  const o = await offer(company);
  await asUser(company.viewer, 'aal1');
  await command(
    'decide_offer',
    {
      offer_id: o.id,
      decision: 'accepted',
      note: 'Synthetic acceptance',
      consent: true,
    },
    company.org,
  );
  await asUser(company.owner);
  const id = await command(
    'create_contract',
    {
      offer_id: o.id,
      terms: 'Synthetic reviewed contract terms for internal testing only.',
      legal_reference: 'Internal legal fixture v1',
    },
    company.org,
  );
  return { id, offer: o };
}
async function invoice(company = c) {
  const k = await contract(company);
  const doc = (
    await db.query<{ document_hash: string }>(
      'select document_hash from public.release_contracts where id=$1',
      [k.id],
    )
  ).rows[0];
  await asUser(company.viewer, 'aal1');
  await command(
    'sign_contract',
    {
      contract_id: k.id,
      document_hash: doc.document_hash,
      typed_name: 'Synthetic Customer',
      consent: true,
    },
    company.org,
  );
  await asUser(company.owner);
  return {
    id: await command('create_invoice', { contract_id: k.id }, company.org),
    contract: k,
  };
}
async function authorization(invoiceId: string, amount = 6600, company = c) {
  await asUser(company.viewer, 'aal1');
  const id = await command(
    'authorize_payment',
    { invoice_id: invoiceId, amount_minor: amount, consent: true },
    company.org,
  );
  await asUser(company.owner);
  return id;
}
function payment(invoiceId: string, authorizationId: string, amount = 6600) {
  return {
    invoice_id: invoiceId,
    authorization_id: authorizationId,
    amount_minor: amount,
    idempotency_key: crypto.randomUUID(),
    adjusts_event_id: null,
  };
}
beforeAll(async () => {
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const file of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(
    "update private.release_environment set mode='internal-development',approval_reference='Synthetic local approval'",
  );
  for (const x of companies) {
    for (const user of [x.owner, x.viewer])
      await db.query(
        'insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
        [user, `${user}@example.test`],
      );
    await db.query(
      "insert into public.organizations(id,name,slug,industry,status) values($1,$2,$3,'construction','active')",
      [x.org, x.name, `release-${x.org}`],
    );
    await db.query(
      "insert into public.memberships(organization_id,user_id,role) values($1,$2,'owner')",
      [x.org, x.owner],
    );
    await db.query(
      "insert into public.customers(id,organization_id,display_name,email) values($1,$2,'Synthetic Customer','customer@example.test')",
      [x.customer, x.org],
    );
    await db.query(
      "insert into public.estimate_tax_policies(id,organization_id,name,reference,jurisdiction,contract_type,rate_bps,status) values($1,$2,'Synthetic tax','Independent fixture','Test jurisdiction','Test construction',1000,'reviewed')",
      [x.tax, x.org],
    );
    await db.query(
      "insert into private.release_test_users values($1,$2,'staff',now()+interval '1 day'),($1,$3,'customer',now()+interval '1 day')",
      [x.org, x.owner, x.viewer],
    );
    await db.query(
      'insert into public.portal_identities values($1,$2,$3,true)',
      [x.org, x.customer, x.viewer],
    );
  }
});
beforeEach(async () => {
  await db.exec('begin');
  await asUser();
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(() => db.close());
it.each(companies.map((x, i) => [i, x] as const))(
  'completes internal estimate/contract/invoice/payment workflow for pilot %i',
  async (_, company) => {
    const inv = await invoice(company);
    const auth = await authorization(inv.id, 6600, company);
    const p = payment(inv.id, auth);
    const event = await command('synthetic_capture', p, company.org);
    expect(event).toMatch(/^[a-f0-9-]{36}$/);
    const b = (
      await db.query<{
        total_minor: number;
        snapshot: { schedule: { amount_minor: number }[] };
      }>(
        'select total_minor,snapshot from public.release_invoices where id=$1',
        [inv.id],
      )
    ).rows[0];
    expect(b.total_minor).toBe(22000);
    expect(b.snapshot.schedule.reduce((n, s) => n + s.amount_minor, 0)).toBe(
      22000,
    );
    expect(b.snapshot.schedule[0].amount_minor).toBe(6600);
    const ledger = await db.query<{
      credit_account: string;
      amount_minor: number;
    }>(
      'select credit_account,amount_minor from public.release_ledger_entries where invoice_id=$1 order by credit_account',
      [inv.id],
    );
    expect(ledger.rows).toEqual([
      { credit_account: 'receivable', amount_minor: 6600 },
      { credit_account: 'sales', amount_minor: 20000 },
      { credit_account: 'tax_payable', amount_minor: 2000 },
    ]);
  },
);
it('customer projection excludes private cost/markup/workforce/source data', async () => {
  const o = await offer();
  await asUser(c.viewer, 'aal1');
  const r = (
    await db.query<{ v: unknown }>('select public.release_workspace($1) v', [
      c.org,
    ])
  ).rows[0].v;
  const text = JSON.stringify(r);
  for (const secret of [
    'unit_cost_minor',
    'markup_bps',
    'internal_notes',
    'PRIVATE SUPPLIER',
    'labor_rate',
    'source_id',
  ])
    expect(text).not.toContain(secret);
  expect(text).toContain(o.id);
  expect(
    (await db.query('select * from public.estimate_versions')).rows,
  ).toEqual([]);
  expect((await db.query('select * from public.worker_profiles')).rows).toEqual(
    [],
  );
});
it('denies all six ordered cross-tenant pairs for staff and customer sessions', async () => {
  for (const company of companies) await invoice(company);
  for (const a of companies)
    for (const b of companies.filter((b) => b !== a)) {
      for (const user of [a.owner, a.viewer]) {
        await asUser(user);
        for (const table of [
          'release_offers',
          'release_contracts',
          'release_invoices',
          'release_signatures',
          'release_payment_events',
          'release_authorizations',
          'release_ledger_entries',
          'release_messages',
        ])
          expect(
            (
              await db.query(
                `select * from public.${table} where organization_id=$1`,
                [b.org],
              )
            ).rows,
          ).toEqual([]);
        await deniedCommand(
          'publish_offer',
          { version_id: crypto.randomUUID() },
          b.org,
        );
      }
    }
});
it.each([
  'environment',
  'expiry',
  'membership',
  'module',
  'organization',
  'aal1',
])('revokes internal access through %s', async (mode) => {
  const o = await offer();
  await db.exec('reset role');
  if (mode === 'environment')
    await db.exec("update private.release_environment set mode='disabled'");
  if (mode === 'expiry')
    await db.query(
      "update private.release_test_users set expires_at=now()-interval '1 second' where organization_id=$1",
      [c.org],
    );
  if (mode === 'membership')
    await db.query(
      'update public.memberships set active=false where organization_id=$1',
      [c.org],
    );
  if (mode === 'module')
    await db.query(
      "update public.company_modules set enabled=false where organization_id=$1 and module='estimates'",
      [c.org],
    );
  if (mode === 'organization')
    await db.query(
      "update public.organizations set status='suspended' where id=$1",
      [c.org],
    );
  await asUser(c.owner, mode === 'aal1' ? 'aal1' : 'aal2');
  await deniedCommand('publish_offer', { version_id: o.bundle.version.id });
  expect((await db.query('select * from public.release_offers')).rows).toEqual(
    [],
  );
});
it('enforces customer identity revocation and denies staff pretending to be a customer', async () => {
  const o = await offer();
  await deniedCommand('decide_offer', {
    offer_id: o.id,
    decision: 'accepted',
    note: '',
    consent: true,
  });
  await command('link_customer', {
    customer_id: c.customer,
    user_id: c.viewer,
    active: false,
  });
  await asUser(c.viewer, 'aal1');
  await deniedCommand('decide_offer', {
    offer_id: o.id,
    decision: 'accepted',
    note: '',
    consent: true,
  });
  expect((await db.query('select * from public.release_offers')).rows).toEqual(
    [],
  );
});
it('requires consent and prevents duplicate decisions and stale estimate acceptance', async () => {
  const o = await offer();
  await asUser(c.viewer, 'aal1');
  await deniedCommand('decide_offer', {
    offer_id: o.id,
    decision: 'accepted',
    note: '',
    consent: false,
  });
  await asUser();
  await db.query('select public.revise_estimate($1,$2,$3)', [
    c.org,
    o.bundle.estimate.id,
    o.bundle.version.id,
  ]);
  await asUser(c.viewer, 'aal1');
  await deniedCommand('decide_offer', {
    offer_id: o.id,
    decision: 'accepted',
    note: '',
    consent: true,
  });
  const fresh = await offer();
  await asUser(c.viewer, 'aal1');
  await command('decide_offer', {
    offer_id: fresh.id,
    decision: 'declined',
    note: 'Synthetic decline',
    consent: true,
  });
  await deniedCommand('decide_offer', {
    offer_id: fresh.id,
    decision: 'accepted',
    note: '',
    consent: true,
  });
});
it('requires acceptance before contract and exact document hash/consent before signature', async () => {
  const o = await offer();
  await deniedCommand('create_contract', {
    offer_id: o.id,
    terms: 'Synthetic legal content for tests',
    legal_reference: 'Test legal review',
  });
  const k = await contract();
  await asUser(c.viewer, 'aal1');
  await deniedCommand('sign_contract', {
    contract_id: k.id,
    document_hash: '0'.repeat(64),
    typed_name: 'Synthetic',
    consent: true,
  });
  const hash = (
    await db.query<{ document_hash: string }>(
      'select document_hash from public.release_contracts where id=$1',
      [k.id],
    )
  ).rows[0].document_hash;
  await deniedCommand('sign_contract', {
    contract_id: k.id,
    document_hash: hash,
    typed_name: 'Synthetic',
    consent: false,
  });
  await asUser();
  await deniedCommand('create_invoice', { contract_id: k.id });
});
it('idempotent captures cannot change amount or consume authorization twice', async () => {
  const i = await invoice();
  const auth = await authorization(i.id);
  const p = payment(i.id, auth);
  const event = await command('synthetic_capture', p);
  expect(await command('synthetic_capture', p)).toBe(event);
  await deniedCommand('synthetic_capture', { ...p, amount_minor: 6601 });
  await deniedCommand('synthetic_capture', {
    ...p,
    idempotency_key: crypto.randomUUID(),
  });
  expect(
    (await db.query('select * from public.release_payment_events')).rows,
  ).toHaveLength(1);
});
it('records bounded immutable refunds and reconciles receivables exactly', async () => {
  const i = await invoice();
  const a = await authorization(i.id);
  const p = payment(i.id, a);
  const capture = await command('synthetic_capture', p);
  await command('synthetic_refund', {
    ...p,
    idempotency_key: crypto.randomUUID(),
    amount_minor: 1000,
    adjusts_event_id: capture,
  });
  await deniedCommand('synthetic_refund', {
    ...p,
    idempotency_key: crypto.randomUUID(),
    amount_minor: 6000,
    adjusts_event_id: capture,
  });
  const r = (
    await db.query<{ balance: number }>(
      "select sum(case when debit_account='receivable' then amount_minor else -amount_minor end)::bigint balance from public.release_ledger_entries where invoice_id=$1",
      [i.id],
    )
  ).rows[0];
  expect(r.balance).toBe(16400);
});
it('rejects overbilling, expired authorization, raw card fields and invented gateway results', async () => {
  const i = await invoice();
  await asUser(c.viewer, 'aal1');
  await deniedCommand('authorize_payment', {
    invoice_id: i.id,
    amount_minor: 22001,
    consent: true,
  });
  const auth = await authorization(i.id);
  await deniedCommand('synthetic_capture', {
    ...payment(i.id, auth),
    pan: '4111111111111111',
  });
  await deniedCommand('record_gateway_capture', {
    ...payment(i.id, auth),
    provider: 'authorize_net',
  });
  await db.exec('reset role');
  const expired = crypto.randomUUID();
  await db.query(
    "insert into public.release_authorizations(id,organization_id,customer_id,invoice_id,amount_minor,currency,scope,expires_at,actor_id) values($1,$2,$3,$4,6600,'USD','one-time-synthetic-payment',now()-interval '1 minute',$5)",
    [expired, c.org, c.customer, i.id, c.viewer],
  );
  await asUser();
  await deniedCommand('synthetic_capture', payment(i.id, expired)); // No mutation of immutable authorization is needed to prove expiry: test transaction time boundary separately.
  await asUser(c.viewer, 'aal1');
  await deniedCommand('synthetic_capture', payment(i.id, auth));
});
it('all published financial records remain immutable even to an operator', async () => {
  const i = await invoice();
  const auth = await authorization(i.id);
  await command('synthetic_capture', payment(i.id, auth));
  await db.exec('reset role');
  for (const table of [
    'release_offers',
    'release_decisions',
    'release_contracts',
    'release_signatures',
    'release_invoices',
    'release_authorizations',
    'release_payment_events',
    'release_ledger_entries',
    'release_messages',
  ]) {
    await denied(`delete from public.${table} where organization_id=$1`, [
      c.org,
    ]);
    await denied(
      `update public.${table} set organization_id=organization_id where organization_id=$1`,
      [c.org],
    );
  }
});
it('email sender config cannot self-verify or inherit another company sender', async () => {
  await deniedCommand('configure_email', {
    sender_name: 'Synthetic',
    sender_email: 'a@example.test',
    domain: 'other.test',
  });
  await command('configure_email', {
    sender_name: 'Synthetic',
    sender_email: 'a@example.test',
    domain: 'example.test',
  });
  expect(
    (
      await db.query<{ status: string }>(
        'select status from public.company_email_profiles',
      )
    ).rows,
  ).toEqual([{ status: 'unverified' }]);
  await deniedCommand('configure_email', {
    sender_name: 'Synthetic',
    sender_email: 'a@example.test',
    domain: 'example.test',
    status: 'verified',
  });
  const o = await offer();
  expect(
    (
      await db.query<{ channel: string }>(
        'select channel from public.release_messages where offer_id=$1',
        [o.id],
      )
    ).rows[0].channel,
  ).toBe('internal_sink');
});
it('test grants, environment switch and writes cannot be changed by authenticated clients', async () => {
  await denied(
    "update private.release_environment set mode='internal-development'",
  );
  await denied('select * from private.release_test_users');
  await denied(
    'insert into public.release_offers(organization_id,customer_id,version_id,snapshot,expires_at) values($1,$2,$3,$4,now())',
    [c.org, c.customer, crypto.randomUUID(), {}],
  );
});
it.skipIf(!db.fork)(
  'native concurrent captures cannot exceed one invoice balance',
  async () => {
    const inv = await invoice(),
      a = await authorization(inv.id, 15000),
      b = await authorization(inv.id, 15000);
    await db.exec('commit');
    const peers = await Promise.all([db.fork!(), db.fork!()]);
    try {
      for (const peer of peers) {
        await peer.query("select set_config('request.jwt.claims',$1,false)", [
          JSON.stringify({ sub: c.owner, aal: 'aal2' }),
        ]);
        await peer.exec('set role authenticated');
      }
      const r = await Promise.allSettled(
        peers.map((peer, i) =>
          peer.query('select public.release_command($1,$2,$3)', [
            c.org,
            'synthetic_capture',
            payment(inv.id, [a, b][i], 15000),
          ]),
        ),
      );
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(r.filter((x) => x.status === 'rejected')).toHaveLength(1);
      expect(
        (
          await db.query<{ paid: number }>(
            'select sum(amount_minor)::bigint paid from public.release_payment_events where invoice_id=$1',
            [inv.id],
          )
        ).rows[0].paid,
      ).toBe(15000);
    } finally {
      for (const p of peers) await p.close();
      await db.exec('begin');
    }
  },
);
it.skipIf(!db.fork)(
  'native invoice allocation stays unique across different signed contracts',
  async () => {
    const contracts: string[] = [];
    for (let i = 0; i < 2; i++) {
      const k = await contract();
      const hash = (
        await db.query<{ document_hash: string }>(
          'select document_hash from public.release_contracts where id=$1',
          [k.id],
        )
      ).rows[0].document_hash;
      await asUser(c.viewer, 'aal1');
      await command('sign_contract', {
        contract_id: k.id,
        document_hash: hash,
        typed_name: 'Synthetic Customer',
        consent: true,
      });
      await asUser();
      contracts.push(k.id);
    }
    await db.exec('commit');
    const peers = await Promise.all([db.fork!(), db.fork!()]);
    try {
      for (const peer of peers) {
        await peer.query("select set_config('request.jwt.claims',$1,false)", [
          JSON.stringify({ sub: c.owner, aal: 'aal2' }),
        ]);
        await peer.exec('set role authenticated');
      }
      await Promise.all(
        peers.map((peer, i) =>
          peer.query('select public.release_command($1,$2,$3)', [
            c.org,
            'create_invoice',
            { contract_id: contracts[i] },
          ]),
        ),
      );
      const rows = (
        await db.query<{ invoice_number: string }>(
          'select invoice_number from public.release_invoices where contract_id=any($1::uuid[])',
          [contracts],
        )
      ).rows;
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((r) => r.invoice_number)).size).toBe(2);
    } finally {
      for (const p of peers) await p.close();
      await db.exec('begin');
    }
  },
);
it('accepted scope cannot be republished as a second full-price contract after revision', async () => {
  const o = await offer();
  await asUser(c.viewer, 'aal1');
  await command('decide_offer', {
    offer_id: o.id,
    decision: 'accepted',
    note: 'Synthetic',
    consent: true,
  });
  await asUser();
  const revised = (
    await db.query<{ v: EstimateBundle }>(
      'select public.revise_estimate($1,$2,$3) v',
      [c.org, o.bundle.estimate.id, o.bundle.version.id],
    )
  ).rows[0].v;
  const issued = (
    await db.query<{ v: EstimateBundle }>(
      'select public.issue_estimate($1,$2,$3,$4) v',
      [
        c.org,
        revised.estimate.id,
        revised.version.id,
        revised.version.lock_revision,
      ],
    )
  ).rows[0].v;
  await deniedCommand('publish_offer', { version_id: issued.version.id });
});
it('audits sender configuration and trusted verification changes without copying sender PII', async () => {
  await command('configure_email', {
    sender_name: 'Synthetic Private Name',
    sender_email: 'private@example.test',
    domain: 'example.test',
  });
  await db.exec('reset role');
  await db.query(
    "update public.company_email_profiles set status='verified',verification_reference='Synthetic trusted proof' where organization_id=$1",
    [c.org],
  );
  const events = (
    await db.query<{ action: string; entity_id: string }>(
      'select action,entity_id from public.activity_events where organization_id=$1 and entity_type=$2',
      [c.org, 'company_email_profiles'],
    )
  ).rows;
  expect(events).toHaveLength(2);
  expect(
    events.every(
      (e) => e.action === 'email.profile_changed' && e.entity_id === c.org,
    ),
  ).toBe(true);
  expect(JSON.stringify(events)).not.toContain('private@example.test');
});
