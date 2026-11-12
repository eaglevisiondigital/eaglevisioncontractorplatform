import { createHmac } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  receiveSandboxPaymentWebhook,
  type GatewayEventInbox,
} from '../server/payments/webhook-inbox';
import { fictionalLaunchMerchants } from './fixtures/first-launch-merchants';

function fixture() {
  const merchant = fictionalLaunchMerchants(
    new Date(Date.now() + 60000).toISOString(),
  )[0].merchant;
  const key = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    provider: 'nmi' as const,
    value: 'synthetic-webhook-signing-key-not-live',
  };
  const raw = Buffer.from(
    JSON.stringify({
      event_id: 'fictional_event_1',
      event_body: { private: 'fictional-do-not-persist' },
    }),
  );
  const signature =
    't=fixture_nonce,s=' +
    createHmac('sha256', key.value)
      .update('fixture_nonce.')
      .update(raw)
      .digest('hex');
  return { merchant, key, raw, signature };
}

it.each([
  undefined,
  null,
  'unknown',
  'not-recorded',
  {},
  { status: 'recorded' },
])(
  'does not complete a verified callback on malformed or uncertain inbox acknowledgment %j',
  async (ack) => {
    const f = fixture();
    const recordWebhook = vi.fn(async () => ack);
    await expect(
      receiveSandboxPaymentWebhook(f.raw, f.signature, f.merchant, f.key, {
        recordWebhook,
      } as unknown as GatewayEventInbox),
    ).rejects.toThrow(/UNKNOWN/);
    expect(recordWebhook).toHaveBeenCalledTimes(1);
  },
);

it.each(['recorded', 'duplicate'] as const)(
  'accepts only explicit %s inbox acknowledgment',
  async (status) => {
    const f = fixture();
    const recordWebhook = vi.fn(async () => status);
    expect(
      await receiveSandboxPaymentWebhook(
        f.raw,
        f.signature,
        f.merchant,
        f.key,
        { recordWebhook },
      ),
    ).toBe(status);
    expect(recordWebhook).toHaveBeenCalledTimes(1);
  },
);

it('treats inbox exceptions as UNKNOWN without disclosing internal database details', async () => {
  const f = fixture();
  const recordWebhook = vi.fn(async () => {
    throw new Error('fictional internal database parameters');
  });
  await expect(
    receiveSandboxPaymentWebhook(f.raw, f.signature, f.merchant, f.key, {
      recordWebhook,
    }),
  ).rejects.toThrow('Webhook acknowledgment UNKNOWN; reconcile original event');
  expect(recordWebhook).toHaveBeenCalledTimes(1);
});
