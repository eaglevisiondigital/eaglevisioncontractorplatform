import { afterEach, expect, it, vi } from 'vitest';
import { fictionalLaunchMerchants } from './fixtures/first-launch-merchants';
import {
  captureReferencedToken,
  type TokenReference,
  type SandboxTokenVault,
} from '../server/payments/token-reference';
import { SandboxGateway, type SandboxIntent } from '../server/payments/sandbox';
import { RestrictedSandboxStore } from '../server/payments/control-store';
import { ProviderControl } from '../server/providers/control';
import type { GatewaySql } from '../server/payments/postgres-store';

afterEach(() => vi.restoreAllMocks());

function fixture(index: number) {
  const expiresAt = new Date(Date.now() + 60_000).toISOString(),
    disabled = fictionalLaunchMerchants(expiresAt)[index],
    merchant = disabled.merchant,
    customerId = crypto.randomUUID(),
    referenceId = crypto.randomUUID();
  const intent: SandboxIntent = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    invoiceId: crypto.randomUUID(),
    authorizationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    amountMinor: 1234,
    currency: 'USD',
    expiresAt,
  };
  const reference: TokenReference = {
    id: referenceId,
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    customerId,
    provider: 'nmi',
    mode: 'sandbox',
    expiresAt,
  };
  const token = {
    provider: 'nmi' as const,
    value: `synthetic-only-token-${index}`,
  };
  const resolve = vi.fn<SandboxTokenVault['resolve']>(async () => ({
    reference,
    token,
  }));
  const commands: {
    action: string;
    data: Record<string, unknown>;
    org: unknown;
    scope: unknown;
  }[] = [];
  let reserveStatus: 'reserved' | 'unknown' = 'reserved';
  const connection: GatewaySql = {
    async query<T extends Record<string, unknown>>(
      _sql: string,
      parameters: unknown[] = [],
    ) {
      expect(_sql).toBe(
        'select private.sandbox_gateway_control($1::uuid,$2::uuid,$3::text,$4::jsonb) result',
      );
      const [org, scope, action, json] = parameters;
      expect(['reserve', 'finish']).toContain(action);
      commands.push({
        action: String(action),
        data: JSON.parse(String(json)),
        org,
        scope,
      });
      return {
        rows: [
          {
            result: {
              status: action === 'reserve' ? reserveStatus : 'recorded',
            },
          } as unknown as T,
        ],
      };
    },
  };
  const store = new RestrictedSandboxStore(
    new ProviderControl(connection, {
      organizationId: merchant.organizationId,
      scopeId: merchant.merchantConfigId,
      service: 'payment',
    }),
  );
  const transport = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          response: '1',
          id: `synthetic_transaction_${index}`,
          amount: '12.34',
          currency: 'USD',
        }),
        { status: 200 },
      ),
  );
  const gateway = new SandboxGateway(
    merchant,
    { apiKey: `synthetic-only-key-${index}` },
    store,
    transport,
  );
  const run = () =>
    captureReferencedToken(
      merchant,
      intent,
      customerId,
      referenceId,
      { resolve },
      gateway,
    );
  return {
    disabled,
    merchant,
    customerId,
    referenceId,
    intent,
    reference,
    resolve,
    token,
    commands,
    gateway,
    transport,
    run,
    unknown() {
      reserveStatus = 'unknown';
    },
  };
}

it.each([0, 1])(
  'fictional launch %i composes exact token/customer/merchant scope into restricted capture without private token in SQL',
  async (index) => {
    const s = fixture(index);
    expect(s.disabled).toMatchObject({
      fictional: true,
      executionAuthorized: false,
    });
    expect(await s.run()).toMatchObject({
      status: 'succeeded',
      provider: 'nmi',
      amountMinor: 1234,
    });
    const { expiresAt, ...scope } = s.reference;
    expect(expiresAt).toBe(s.merchant.approvedUntil);
    expect(s.resolve).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      idempotencyKey: s.intent.idempotencyKey,
    });
    expect(s.commands.map((command) => command.action)).toEqual([
      'reserve',
      'finish',
    ]);
    expect(
      s.commands.every(
        (command) =>
          command.org === s.merchant.organizationId &&
          command.scope === s.merchant.merchantConfigId,
      ),
    ).toBe(true);
    expect(s.commands[0].data).toMatchObject({
      invoiceId: s.intent.invoiceId,
      authorizationId: s.intent.authorizationId,
      key: s.intent.idempotencyKey,
    });
    expect(JSON.stringify(s.commands)).not.toContain(s.token.value);
    expect(s.transport).toHaveBeenCalledTimes(1);
    const [url, options] = s.transport.mock.calls[0];
    expect(url).toBe('https://sandbox.nmi.com/api/v5/payments/sale');
    expect(options?.redirect).toBe('error');
    expect(JSON.parse(String(options?.body))).toMatchObject({
      payment_details: { payment_token: s.token.value },
      order_id: s.intent.idempotencyKey,
    });
  },
);

it.each(['organizationId', 'merchantConfigId', 'customerId', 'id'] as const)(
  'rejects merchant-B vault %s before restricted store or transport',
  async (field) => {
    const a = fixture(0),
      b = fixture(1);
    a.reference[field] = b.reference[field];
    await expect(a.run()).rejects.toThrow(/binding/);
    expect(a.commands).toEqual([]);
    expect(a.transport).not.toHaveBeenCalled();
    expect(b.commands).toEqual([]);
    expect(b.transport).not.toHaveBeenCalled();
  },
);

it.each(['intent', 'merchant', 'reference'] as const)(
  'expiry of %s while the one-use vault awaits cannot reach a financial command',
  async (target) => {
    const s = fixture(0),
      now = Date.now();
    // Retain exact differing expiry limits to prove which original source expired.
    s.intent.expiresAt = new Date(
      now + (target === 'intent' ? 1000 : 60_000),
    ).toISOString();
    s.merchant.approvedUntil = new Date(
      now + (target === 'merchant' ? 1000 : 60_000),
    ).toISOString();
    s.reference.expiresAt = new Date(
      now + (target === 'reference' ? 1000 : 60_000),
    ).toISOString();
    s.resolve.mockImplementation(async () => {
      vi.spyOn(Date, 'now').mockReturnValue(now + 2000);
      return { reference: s.reference, token: s.token };
    });
    await expect(s.run()).rejects.toThrow(/expiry/);
    expect(s.resolve).toHaveBeenCalledTimes(1);
    expect(s.commands).toEqual([]);
    expect(s.transport).not.toHaveBeenCalled();
  },
);

it('merchant-A reference cannot be used with the merchant-B gateway even after vault validation', async () => {
  const a = fixture(0),
    b = fixture(1);
  await expect(
    captureReferencedToken(
      a.merchant,
      a.intent,
      a.customerId,
      a.referenceId,
      { resolve: a.resolve },
      b.gateway,
    ),
  ).rejects.toThrow(/mismatch/);
  expect(a.resolve).toHaveBeenCalledTimes(1);
  expect(a.commands).toEqual([]);
  expect(b.commands).toEqual([]);
  expect(b.transport).not.toHaveBeenCalled();
});

it('a restricted UNKNOWN reservation retains the original key and cannot dispatch or finish', async () => {
  const s = fixture(1);
  s.unknown();
  await expect(s.run()).rejects.toThrow(/reconciliation/);
  expect(s.commands).toHaveLength(1);
  expect(s.commands[0]).toMatchObject({
    action: 'reserve',
    data: { key: s.intent.idempotencyKey },
  });
  expect(s.transport).not.toHaveBeenCalled();
});
