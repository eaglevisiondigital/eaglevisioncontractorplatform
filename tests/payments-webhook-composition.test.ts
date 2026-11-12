import { createHmac } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { receiveSandboxPaymentWebhook } from '../server/payments/webhook-inbox';
import { RestrictedSandboxStore } from '../server/payments/control-store';
import { ProviderControl } from '../server/providers/control';
import type { GatewaySql } from '../server/payments/postgres-store';
import { fictionalLaunchMerchants } from './fixtures/first-launch-merchants';

function fixture(index = 0) {
  const merchants = fictionalLaunchMerchants(
    new Date(Date.now() + 60000).toISOString(),
  );
  const merchant = merchants[index].merchant,
    foreign = merchants[1 - index].merchant;
  const key = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    provider: 'nmi' as const,
    value: 'synthetic-private-webhook-key-not-live',
  };
  const query = vi.fn(async () => ({
    rows: [{ result: { status: 'recorded' } }],
  }));
  const store = new RestrictedSandboxStore(
    new ProviderControl({ query } as unknown as GatewaySql, {
      organizationId: merchant.organizationId,
      scopeId: merchant.merchantConfigId,
      service: 'payment',
    }),
  );
  const body = (eventId: string, state = 'settled') =>
    Buffer.from(
      JSON.stringify({
        event_id: eventId,
        organizationId: foreign.organizationId,
        merchantConfigId: foreign.merchantConfigId,
        event_body: {
          state,
          private: 'fictional-private-statement-not-for-inbox',
        },
      }),
    );
  const signature = (raw: Uint8Array) =>
    't=fictional_nonce,s=' +
    createHmac('sha256', key.value)
      .update('fictional_nonce.')
      .update(raw)
      .digest('hex');
  const receive = (eventId = 'fictional_event', state = 'settled') => {
    const raw = body(eventId, state);
    return receiveSandboxPaymentWebhook(
      raw,
      signature(raw),
      merchant,
      key,
      store,
    );
  };
  return { merchant, foreign, key, query, store, body, signature, receive };
}

it.each([0, 1])(
  'fictional merchant %i signed callback uses the configured SQL scope, never payload identity',
  async (index) => {
    const f = fixture(index);
    expect(await f.receive()).toBe('recorded');
    expect(f.query).toHaveBeenCalledTimes(1);
    const [sql, params] = f.query.mock.calls[0] as unknown as [
      string,
      unknown[],
    ];
    expect(sql).toBe(
      'select private.sandbox_gateway_control($1::uuid,$2::uuid,$3::text,$4::jsonb) result',
    );
    expect(params.slice(0, 3)).toEqual([
      f.merchant.organizationId,
      f.merchant.merchantConfigId,
      'webhook',
    ]);
    expect(JSON.parse(String(params[3]))).toEqual({
      eventId: 'fictional_event',
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      provider: 'nmi',
    });
    expect(JSON.stringify(params)).not.toContain(f.foreign.organizationId);
    expect(JSON.stringify(params)).not.toContain(
      'fictional-private-statement-not-for-inbox',
    );
  },
);

it.each(['body', 'signing-key', 'merchant-key-binding'] as const)(
  'rejects changed %s before any SQL command',
  async (mode) => {
    const f = fixture();
    const raw = f.body('original_event');
    const key =
      mode === 'signing-key'
        ? { ...f.key, value: 'different-synthetic-key-not-live' }
        : mode === 'merchant-key-binding'
          ? { ...f.key, merchantConfigId: f.foreign.merchantConfigId }
          : f.key;
    await expect(
      receiveSandboxPaymentWebhook(
        mode === 'body' ? f.body('changed_event') : raw,
        f.signature(raw),
        f.merchant,
        key,
        f.store,
      ),
    ).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
  },
);

it.each(['unknown', 'pending', 'malformed'] as const)(
  'uncertain SQL acknowledgment %s never completes the callback or retries',
  async (status) => {
    const f = fixture();
    f.query.mockResolvedValue({ rows: [{ result: { status } }] });
    await expect(f.receive()).rejects.toThrow(/UNKNOWN/);
    expect(f.query).toHaveBeenCalledTimes(1);
  },
);

it('SQL failure or lost acknowledgment propagates once without a replacement event or financial command', async () => {
  const f = fixture();
  f.query.mockRejectedValue(
    new Error('Synthetic lost database acknowledgment'),
  );
  await expect(f.receive()).rejects.toThrow(/UNKNOWN/);
  expect(f.query).toHaveBeenCalledTimes(1);
  expect((f.query.mock.calls[0] as unknown as [string, unknown[]])[1][2]).toBe(
    'webhook',
  );
});

it('out-of-order signed notifications only enter the inbox, never settle, refund or reconcile funds', async () => {
  const f = fixture();
  await f.receive('refund_notice_first', 'refund_settled');
  await f.receive('capture_notice_later', 'capture_settled');
  expect(f.query).toHaveBeenCalledTimes(2);
  for (const call of f.query.mock.calls as unknown as [string, unknown[]][]) {
    expect(call[1][2]).toBe('webhook');
    expect(Object.keys(JSON.parse(String(call[1][3]))).sort()).toEqual([
      'digest',
      'eventId',
      'provider',
    ]);
  }
});
