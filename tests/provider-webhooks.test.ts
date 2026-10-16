import { createHmac } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  authorizeNetWebhook,
  nmiPaymentWebhook,
  docusignConnectWebhook,
  resendWebhook,
} from '../server/providers/webhooks';
const raw = Buffer.from('{"event":"synthetic"}'),
  key = 'synthetic-signing-key-not-live';
it('verifies Authorize.Net raw-body SHA512 using the binary signature key', () => {
  const hex = '11'.repeat(64),
    signature =
      'sha512=' +
      createHmac('sha512', Buffer.from(hex, 'hex')).update(raw).digest('hex');
  expect(authorizeNetWebhook(raw, signature, hex)).toMatch(/^[a-f0-9]{64}$/);
  expect(() =>
    authorizeNetWebhook(Buffer.from('{ "event":"synthetic"}'), signature, hex),
  ).toThrow();
  expect(() => authorizeNetWebhook(raw, signature, '22'.repeat(64))).toThrow();
});
it('uses NMI payment nonce dot raw-body, not the unrelated underwriting protocol', () => {
  const sig = createHmac('sha256', key)
    .update('nonce_123.')
    .update(raw)
    .digest('hex');
  expect(nmiPaymentWebhook(raw, 't=nonce_123,s=' + sig, key).nonce).toBe(
    'nonce_123',
  );
  expect(() => nmiPaymentWebhook(raw, sig, key)).toThrow();
  expect(() => nmiPaymentWebhook(raw, 't=other,s=' + sig, key)).toThrow();
  expect(() =>
    nmiPaymentWebhook(Buffer.from('{}'), 't=nonce_123,s=' + sig, key),
  ).toThrow();
});
it('verifies DocuSign Connect Base64 SHA256 without trusting completion data', () => {
  const sig = createHmac('sha256', key).update(raw).digest('base64');
  expect(docusignConnectWebhook(raw, sig, key)).toMatch(/^[a-f0-9]{64}$/);
  expect(() => docusignConnectWebhook(Buffer.from('{}'), sig, key)).toThrow();
  expect(() =>
    docusignConnectWebhook(raw, Buffer.from(sig).toString('hex'), key),
  ).toThrow();
});
it.each([
  'valid',
  'stale',
  'future',
  'changed-id',
  'changed-body',
  'wrong-key',
  'bad-signature',
])('Resend signed ID/timestamp/body: %s', (mode) => {
  const now = Date.now(),
    timestamp = String(Math.floor(now / 1000)),
    id = 'msg_synthetic_123',
    secret = Buffer.from(key),
    header = {
      id,
      timestamp,
      signature:
        'v1,' +
        createHmac('sha256', secret)
          .update(`${id}.${timestamp}.`)
          .update(raw)
          .digest('base64'),
    };
  if (mode === 'changed-id') header.id = 'different';
  if (mode === 'bad-signature') header.signature = 'v1,' + 'A'.repeat(43) + '=';
  const run = () =>
    resendWebhook(
      mode === 'changed-body' ? Buffer.from('{}') : raw,
      header,
      'whsec_' +
        Buffer.from(
          mode === 'wrong-key' ? 'wrong-synthetic-signing-secret' : key,
        ).toString('base64'),
      now + (mode === 'stale' ? 360000 : mode === 'future' ? -360000 : 0),
    );
  if (mode === 'valid') expect(run().eventId).toBe(id);
  else expect(run).toThrow();
});
it.each([0, 65537])(
  'rejects size %s before cryptographic processing',
  (length) => {
    expect(() =>
      nmiPaymentWebhook(Buffer.alloc(length), 't=a,s=' + '0'.repeat(64), key),
    ).toThrow();
  },
);

it('durably hands off authenticated tenant-bound NMI events, not raw payload tenant fields', async () => {
  const { receiveSandboxPaymentWebhook } =
    await import('../server/payments/webhook-inbox');
  const merchant = {
    organizationId: crypto.randomUUID(),
    merchantConfigId: crypto.randomUUID(),
    provider: 'nmi' as const,
    mode: 'sandbox' as const,
    approvalReference: 'Synthetic-only',
    approvedUntil: new Date(Date.now() + 60000).toISOString(),
  };
  const body = Buffer.from(
      JSON.stringify({
        event_id: 'synthetic_event',
        organizationId: crypto.randomUUID(),
        event_body: { private: 'must not retain' },
      }),
    ),
    signature =
      't=synthetic_nonce,s=' +
      createHmac('sha256', key)
        .update('synthetic_nonce.')
        .update(body)
        .digest('hex');
  const recorded: unknown[][] = [],
    inbox = {
      recordWebhook: async (...args: unknown[]) => {
        recorded.push(args);
        return 'recorded' as const;
      },
    };
  const secret = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    provider: 'nmi' as const,
    value: key,
  };
  expect(
    await receiveSandboxPaymentWebhook(
      body,
      signature,
      merchant,
      secret,
      inbox,
    ),
  ).toBe('recorded');
  expect(recorded[0][0]).toEqual(merchant);
  expect(JSON.stringify(recorded)).not.toContain('must not retain');
  await expect(
    receiveSandboxPaymentWebhook(
      body,
      signature,
      merchant,
      { ...secret, organizationId: crypto.randomUUID() },
      inbox,
    ),
  ).rejects.toThrow();
  expect(recorded).toHaveLength(1);
});
