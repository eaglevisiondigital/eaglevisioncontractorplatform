import { createHmac } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  verifyTenantSender,
  prepareTenantNotification,
  verifyTenantEmailEvent,
  type TenantSenderProfile,
  type CommunicationContext,
  type VerifiedSender,
} from '../server/communications/preparation';
function setup() {
  const organizationId = crypto.randomUUID();
  const profile: TenantSenderProfile = {
    organizationId,
    configurationId: crypto.randomUUID(),
    version: 1,
    providerAccountId: 'synthetic-account',
    domainId: crypto.randomUUID(),
    domain: 'contractor.example.test',
    fromEmail: 'office@contractor.example.test',
    replyTo: 'office@contractor.example.test',
    companyName: 'Synthetic Construction <Company>',
    primaryColor: '#007a5e',
  };
  const context: CommunicationContext = {
    organizationId,
    customerId: crypto.randomUUID(),
    customerEmail: 'customer@example.test',
    contactVerified: true,
    consent: true,
    suppressed: false,
    profile,
  };
  const deps = {
    credential: {
      organizationId,
      providerAccountId: profile.providerAccountId,
      value: 'synthetic-only',
    },
    transport: vi.fn<typeof fetch>(async () =>
      Response.json({
        id: profile.domainId,
        name: profile.domain,
        status: 'verified',
      }),
    ),
    verifyDns: vi.fn(async () => ({
      domain: profile.domain,
      spf: true,
      dkim: true,
      dmarc: true,
      checkedAt: Date.now(),
    })),
  };
  const repository = { load: vi.fn(async () => context) };
  const input = {
    organizationId,
    customerId: context.customerId,
    documentId: crypto.randomUUID(),
    purpose: 'estimate_ready' as const,
    reference: 'EST-001',
  };
  return { profile, context, deps, repository, input };
}
it('prepares tenant-branded escaped HTML and text but cannot send an email', async () => {
  const s = setup(),
    receipt = await verifyTenantSender(s.profile, s.deps),
    message = await prepareTenantNotification(s.input, receipt, s.repository);
  expect(message.delivery).toBe('disabled');
  expect(message.providerRequest).toBeNull();
  expect(message.from).toBe(s.profile.fromEmail);
  expect(message.html).toContain('&lt;Company&gt;');
  expect(message.html).toContain('lang="en"');
  expect(message.text).toContain('No message has been sent');
  expect(s.deps.transport).toHaveBeenCalledOnce();
  expect(s.deps.transport.mock.calls[0][1]?.method).toBe('GET');
  expect(
    (await prepareTenantNotification(s.input, receipt, s.repository))
      .idempotencyKey,
  ).toBe(message.idempotencyKey);
});
it.each([
  'unverified',
  'domain-mismatch',
  'id-mismatch',
  'no-spf',
  'no-dkim',
  'no-dmarc',
  'stale-dns',
  'foreign-credential',
  'foreign-account',
])('denies sender %s', async (mode) => {
  const s = setup();
  if (mode === 'unverified')
    s.deps.transport.mockResolvedValue(
      Response.json({
        id: s.profile.domainId,
        name: s.profile.domain,
        status: 'pending',
      }),
    );
  if (mode === 'domain-mismatch')
    s.profile.fromEmail = 'office@foreign.example.test';
  if (mode === 'id-mismatch')
    s.deps.transport.mockResolvedValue(
      Response.json({
        id: crypto.randomUUID(),
        name: s.profile.domain,
        status: 'verified',
      }),
    );
  if (mode === 'foreign-credential')
    s.deps.credential.organizationId = crypto.randomUUID();
  if (mode === 'foreign-account')
    s.deps.credential.providerAccountId = 'foreign';
  if (mode.startsWith('no-') || mode === 'stale-dns')
    s.deps.verifyDns.mockResolvedValue({
      domain: s.profile.domain,
      spf: mode !== 'no-spf',
      dkim: mode !== 'no-dkim',
      dmarc: mode !== 'no-dmarc',
      checkedAt: mode === 'stale-dns' ? 0 : Date.now(),
    });
  await expect(verifyTenantSender(s.profile, s.deps)).rejects.toThrow();
});
it.each([
  'foreign-tenant',
  'foreign-customer',
  'unverified-contact',
  'no-consent',
  'suppressed',
  'profile-changed',
  'forged-receipt',
  'expired-receipt',
  'raw-field',
])('denies message %s', async (mode) => {
  const s = setup();
  let receipt: VerifiedSender = await verifyTenantSender(s.profile, s.deps);
  if (mode === 'foreign-tenant') s.context.organizationId = crypto.randomUUID();
  if (mode === 'foreign-customer') s.context.customerId = crypto.randomUUID();
  if (mode === 'unverified-contact') s.context.contactVerified = false;
  if (mode === 'no-consent') s.context.consent = false;
  if (mode === 'suppressed') s.context.suppressed = true;
  if (mode === 'profile-changed') s.profile.version++;
  if (mode === 'forged-receipt') receipt = { ...receipt };
  if (mode === 'raw-field') Object.assign(s.input, { supplier_cost: 1000 });
  if (mode === 'expired-receipt')
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60000);
  try {
    await expect(
      prepareTenantNotification(s.input, receipt, s.repository),
    ).rejects.toThrow();
  } finally {
    vi.restoreAllMocks();
  }
  expect(s.deps.transport).toHaveBeenCalledOnce();
});
it.each(['email.sent', 'email.delivered', 'email.bounced', 'email.complained'])(
  'authenticates %s event and marks terminal suppression facts',
  (type) => {
    const binding = {
        organizationId: crypto.randomUUID(),
        providerAccountId: 'synthetic',
        providerMessageId: crypto.randomUUID(),
      },
      raw = Buffer.from(
        JSON.stringify({
          type,
          data: {
            email_id: binding.providerMessageId,
            to: ['private-customer@example.test'],
          },
        }),
      ),
      secret = Buffer.from('synthetic-webhook-signing-secret'),
      timestamp = String(Math.floor(Date.now() / 1000)),
      id = 'msg_synthetic';
    const headers = {
      id,
      timestamp,
      signature:
        'v1,' +
        createHmac('sha256', secret)
          .update(`${id}.${timestamp}.`)
          .update(raw)
          .digest('base64'),
    };
    const fact = verifyTenantEmailEvent(
      raw,
      headers,
      'whsec_' + secret.toString('base64'),
      binding,
    );
    expect(() =>
      verifyTenantEmailEvent(
        raw,
        headers,
        'whsec_' + secret.toString('base64'),
        Object.assign(
          { ...binding },
          { customer_email: 'private-customer@example.test' },
        ),
      ),
    ).toThrow();
    expect(fact.suppressionRequired).toBe(
      ['email.bounced', 'email.complained'].includes(type),
    );
    expect(JSON.stringify(fact)).not.toContain('private-customer');
    expect(() =>
      verifyTenantEmailEvent(
        raw,
        headers,
        'whsec_' + secret.toString('base64'),
        { ...binding, providerMessageId: crypto.randomUUID() },
      ),
    ).toThrow();
  },
);
it('durable email preparation persists only hashes under current document authority', async () => {
  const { DurableEmailPreparation } =
    await import('../server/communications/persistence');
  const { ProviderControl } = await import('../server/providers/control');
  const s = setup(),
    receipt = await verifyTenantSender(s.profile, s.deps),
    calls: unknown[][] = [];
  const connection = {
    query: async (_sql: string, params?: unknown[]) => {
      calls.push(params!);
      return {
        rows: [{ result: { status: 'recorded', id: crypto.randomUUID() } }],
      };
    },
  };
  const control = new ProviderControl(
      connection as unknown as ConstructorParameters<typeof ProviderControl>[0],
      {
        organizationId: s.profile.organizationId,
        scopeId: s.profile.configurationId,
        service: 'email',
      },
    ),
    store = new DurableEmailPreparation(control);
  const repository = {
    ...s.repository,
    authorizeDocument: vi.fn(async () => {}),
  };
  expect(
    (await store.prepare(s.input, s.profile, receipt, repository)).status,
  ).toBe('recorded');
  expect(repository.authorizeDocument).toHaveBeenCalledTimes(2);
  expect(calls.map((c) => c[2])).toEqual(['domain', 'prepare']);
  expect(JSON.stringify(calls)).not.toContain(s.context.customerEmail);
  expect(JSON.stringify(calls)).not.toContain(s.profile.fromEmail);
  expect(JSON.stringify(calls)).not.toContain('<html');
  repository.authorizeDocument.mockRejectedValue(new Error('Document revoked'));
  await expect(
    store.prepare(s.input, s.profile, receipt, repository),
  ).rejects.toThrow(/revoked/);
  expect(calls).toHaveLength(2);
});
