import { expect, it, vi } from 'vitest';
import {
  captureReferencedToken,
  type TokenReference,
  type SandboxTokenVault,
} from '../server/payments/token-reference';
import type {
  SandboxMerchant,
  SandboxIntent,
  SandboxResult,
  GatewayToken,
} from '../server/payments/sandbox';
function setup() {
  const organizationId = crypto.randomUUID(),
    merchantConfigId = crypto.randomUUID(),
    customerId = crypto.randomUUID(),
    referenceId = crypto.randomUUID(),
    expiresAt = new Date(Date.now() + 60000).toISOString();
  const merchant: SandboxMerchant = {
    organizationId,
    merchantConfigId,
    provider: 'nmi',
    mode: 'sandbox',
    approvalReference: 'Synthetic local fixture',
    approvedUntil: expiresAt,
  };
  const intent: SandboxIntent = {
    organizationId,
    merchantConfigId,
    invoiceId: crypto.randomUUID(),
    authorizationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    amountMinor: 1000,
    currency: 'USD',
    expiresAt,
  };
  const reference: TokenReference = {
    id: referenceId,
    organizationId,
    merchantConfigId,
    customerId,
    provider: 'nmi',
    mode: 'sandbox',
    expiresAt,
  };
  const vault = {
    resolve: vi.fn<SandboxTokenVault['resolve']>(async () => ({
      reference,
      token: { provider: 'nmi' as const, value: 'synthetic-provider-token' },
    })),
  };
  const gateway = {
    capture: vi.fn<
      (intent: SandboxIntent, token: GatewayToken) => Promise<SandboxResult>
    >(
      async () =>
        ({
          status: 'succeeded',
          provider: 'nmi',
          transactionId: 'synthetic',
          amountMinor: 1000,
          currency: 'USD',
          mode: 'sandbox',
        }) as SandboxResult,
    ),
  };
  return {
    merchant,
    intent,
    customerId,
    referenceId,
    reference,
    vault,
    gateway,
  };
}
it('resolves an opaque tenant/customer/merchant token reference server-side before normal durable capture', async () => {
  const s = setup();
  expect(
    (
      await captureReferencedToken(
        s.merchant,
        s.intent,
        s.customerId,
        s.referenceId,
        s.vault,
        s.gateway,
      )
    ).status,
  ).toBe('succeeded');
  expect(s.vault.resolve.mock.calls[0]?.length).toBe(1);
  expect(s.gateway.capture.mock.calls[0]?.[1]).toEqual({
    provider: 'nmi',
    value: 'synthetic-provider-token',
  });
});
it.each([
  'organizationId',
  'merchantConfigId',
  'customerId',
  'id',
  'provider',
  'mode',
  'expiresAt',
])('rejects foreign/invalid vault %s', async (field) => {
  const s = setup();
  Object.assign(s.reference, {
    [field]:
      field === 'provider'
        ? 'authorize_net'
        : field === 'mode'
          ? 'live'
          : field === 'expiresAt'
            ? '2020-01-01'
            : crypto.randomUUID(),
  });
  await expect(
    captureReferencedToken(
      s.merchant,
      s.intent,
      s.customerId,
      s.referenceId,
      s.vault,
      s.gateway,
    ),
  ).rejects.toThrow();
  expect(s.gateway.capture).not.toHaveBeenCalled();
});
it('does not mutate the reviewed capture while waiting for vault resolution', async () => {
  const s = setup();
  s.vault.resolve.mockImplementation(async () => {
    s.intent.amountMinor = 99999;
    s.intent.organizationId = crypto.randomUUID();
    return {
      reference: s.reference,
      token: { provider: 'nmi', value: 'synthetic-provider-token' },
    };
  });
  await captureReferencedToken(
    s.merchant,
    s.intent,
    s.customerId,
    s.referenceId,
    s.vault,
    s.gateway,
  );
  expect(s.gateway.capture.mock.calls[0]?.[0].amountMinor).toBe(1000);
});
