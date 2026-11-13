import { createHash, createHmac } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { receiveSandboxPaymentWebhook } from '../server/payments/webhook-inbox';
import { fictionalLaunchMerchants } from './fixtures/first-launch-merchants';

const modes = [
  'duplicate',
  'escaped-duplicate',
  'nested-duplicate',
  'invalid-utf8',
  'bom',
  'double-bom',
  'null',
  'array',
] as const;
function fixture(provider: 'nmi' | 'authorize_net') {
  const [first, second] = fictionalLaunchMerchants(
    new Date(Date.now() + 60_000).toISOString(),
  );
  const merchant = { ...first.merchant, provider };
  const key = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    provider,
    value:
      provider === 'nmi' ? 'fictional-signing-key-not-live' : 'ab'.repeat(64),
    webhookId: 'fictional_subscription',
  };
  const field = provider === 'nmi' ? 'event_id' : 'notificationId';
  const raw = Buffer.from(
    JSON.stringify({
      [field]: 'fictional_event',
      webhookId: key.webhookId,
      metadata: 'fictional-private-no-log',
    }),
  );
  const sign = (body: Buffer) =>
    provider === 'nmi'
      ? 't=fictional_nonce,s=' +
        createHmac('sha256', key.value)
          .update('fictional_nonce.')
          .update(body)
          .digest('hex')
      : 'sha512=' +
        createHmac('sha512', Buffer.from(key.value, 'hex'))
          .update(body)
          .digest('hex');
  return { merchant, foreign: second.merchant, key, field, raw, sign };
}
for (const provider of ['nmi', 'authorize_net'] as const) {
  it.each(modes)(
    `${provider} signed malformed %s is denied before inbox acknowledgment`,
    async (mode) => {
      const f = fixture(provider);
      let raw = f.raw;
      if (mode === 'duplicate' || mode === 'escaped-duplicate') {
        const alias =
          mode === 'duplicate' ? f.field : f.field.replace('i', '\\u0069');
        raw = Buffer.from(
          `{"${f.field}":"fictional_original","${alias}":"fictional_replacement","webhookId":"${f.key.webhookId}"}`,
        );
      }
      if (mode === 'nested-duplicate')
        raw = Buffer.from(
          f.raw.toString().slice(0, -1) + ',"extra":{"same":1,"same":2}}',
        );
      if (mode === 'invalid-utf8')
        raw = Buffer.concat([
          Buffer.from(f.raw.toString().slice(0, -1) + ',"extra":"'),
          Buffer.from([0xc3, 0x28]),
          Buffer.from('"}'),
        ]);
      if (mode === 'bom' || mode === 'double-bom')
        raw = Buffer.concat([
          Buffer.from(
            mode === 'bom'
              ? [0xef, 0xbb, 0xbf]
              : [0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf],
          ),
          raw,
        ]);
      if (mode === 'null' || mode === 'array')
        raw = Buffer.from(mode === 'null' ? 'null' : '[]');
      const recordWebhook = vi.fn(async () => 'recorded' as const);
      const error = await receiveSandboxPaymentWebhook(
        raw,
        f.sign(raw),
        f.merchant,
        f.key,
        { recordWebhook },
      ).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain('fictional-private-no-log');
      expect(recordWebhook).not.toHaveBeenCalled();
    },
  );
  it.each(['recorded', 'duplicate'] as const)(
    `${provider} exact authenticated bytes retain %s ACK and raw digest`,
    async (ack) => {
      const f = fixture(provider);
      const recordWebhook = vi.fn(async () => ack);
      expect(
        await receiveSandboxPaymentWebhook(
          f.raw,
          f.sign(f.raw),
          f.merchant,
          f.key,
          { recordWebhook },
        ),
      ).toBe(ack);
      expect(recordWebhook).toHaveBeenCalledExactlyOnceWith(
        f.merchant,
        'fictional_event',
        createHash('sha256').update(f.raw).digest('hex'),
      );
    },
  );
  it(`${provider} lost inbox acknowledgment stays UNKNOWN without automatic replay`, async () => {
    const f = fixture(provider);
    const recordWebhook = vi.fn(async () => {
      throw Error('fictional-private-no-log');
    });
    await expect(
      receiveSandboxPaymentWebhook(f.raw, f.sign(f.raw), f.merchant, f.key, {
        recordWebhook,
      }),
    ).rejects.toThrow(
      'Webhook acknowledgment UNKNOWN; reconcile original event',
    );
    expect(recordWebhook).toHaveBeenCalledOnce();
  });
  it(`${provider} authenticates exact malformed bytes before decoding`, async () => {
    const f = fixture(provider);
    const malformed = Buffer.from('{');
    const recordWebhook = vi.fn(async () => 'recorded' as const);
    await expect(
      receiveSandboxPaymentWebhook(
        malformed,
        f.sign(f.raw),
        f.merchant,
        f.key,
        { recordWebhook },
      ),
    ).rejects.toThrow('Invalid webhook signature');
    expect(recordWebhook).not.toHaveBeenCalled();
  });
  it(`${provider} rejects a foreign merchant binding before inbox or decoding`, async () => {
    const f = fixture(provider);
    const recordWebhook = vi.fn(async () => 'recorded' as const);
    await expect(
      receiveSandboxPaymentWebhook(
        Buffer.from('{'),
        'invalid',
        f.merchant,
        { ...f.key, merchantConfigId: f.foreign.merchantConfigId },
        { recordWebhook },
      ),
    ).rejects.toThrow('Webhook merchant binding denied');
    expect(recordWebhook).not.toHaveBeenCalled();
  });
  it(`${provider} preserves the shared exact65536-byte signature and decoder limit`, async () => {
    const f = fixture(provider);
    const raw = Buffer.concat([
      f.raw,
      Buffer.from(' '.repeat(65536 - f.raw.length)),
    ]);
    const recordWebhook = vi.fn(async () => 'recorded' as const);
    expect(
      await receiveSandboxPaymentWebhook(raw, f.sign(raw), f.merchant, f.key, {
        recordWebhook,
      }),
    ).toBe('recorded');
    expect(recordWebhook).toHaveBeenCalledExactlyOnceWith(
      f.merchant,
      'fictional_event',
      createHash('sha256').update(raw).digest('hex'),
    );
    const oversized = Buffer.concat([raw, Buffer.from(' ')]);
    await expect(
      receiveSandboxPaymentWebhook(
        oversized,
        f.sign(oversized),
        f.merchant,
        f.key,
        { recordWebhook },
      ),
    ).rejects.toThrow('Invalid webhook size');
    expect(recordWebhook).toHaveBeenCalledOnce();
  });
}
