import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fictionalLaunchMerchants } from './fixtures/first-launch-merchants';
import type {
  SandboxIntent,
  SandboxIntentStore,
  SandboxResult,
} from '../server/payments/sandbox';
import {
  frame,
  load,
  packet,
  qualifyPatch,
  // @ts-expect-error Offline JavaScript source qualifier has no declaration file.
} from '../proposals/nmi-sale-order-details/qualify.mjs';

const current = frame();
function fixture(
  merchant: ReturnType<typeof fictionalLaunchMerchants>[number]['merchant'],
  response = 'success',
) {
  const intent: SandboxIntent = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    invoiceId: crypto.randomUUID(),
    authorizationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    amountMinor: 12345,
    currency: 'USD',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  let held = false,
    result: SandboxResult | undefined;
  const store: SandboxIntentStore = {
    reserve: vi.fn<SandboxIntentStore['reserve']>(async () =>
      held
        ? result
          ? { status: 'existing', result }
          : { status: 'unknown' }
        : ((held = true), { status: 'reserved' }),
    ),
    finish: vi.fn(async (_m, _i, r) => {
      result = r;
    }),
  };
  const transport = vi.fn<typeof fetch>(async () =>
    response === 'malformed'
      ? new Response('{"response":"1","response":"2"}', {
          headers: { 'content-type': 'application/json' },
        })
      : Response.json({
          object: 'transaction',
          id: 'fictional-nmi-payment',
          response: response === 'decline' ? '2' : '1',
          amount: '123.45',
          currency: 'USD',
        }),
  );
  return {
    intent,
    store,
    transport,
    token: { provider: 'nmi', value: 'fictional-token-no-network' },
    credentials: { apiKey: 'fictional-private-key-no-network' },
  };
}
function documentedReference(body: Record<string, unknown>) {
  expect(body).not.toHaveProperty('order_id');
  expect(body.order_details).toEqual(
    expect.objectContaining({ order_id: expect.any(String) }),
  );
  return (body.order_details as { order_id: string }).order_id;
}
it('qualifies only the exact one-line source change without changing canonical source', () => {
  expect(qualifyPatch()).toMatchObject({
    canonicalMode: current,
    target: 'server/payments/sandbox.ts',
    applicationAuthorized: false,
  });
  expect(frame()).toBe(current);
});
it.each([0, 1])(
  'demonstrates documented order-reference mismatch before and exact field alignment after for fictional launch position %s',
  async (position) => {
    const merchant = fictionalLaunchMerchants(
      new Date(Date.now() + 120000).toISOString(),
    )[position].merchant;
    const sharedIntent = fixture(merchant).intent;
    let originalBody: Record<string, unknown> | undefined;
    for (const mode of ['before', 'after']) {
      const module = await load(mode),
        s = fixture(merchant);
      s.intent = sharedIntent;
      const r = await new module.SandboxGateway(
        merchant,
        s.credentials,
        s.store,
        s.transport,
      ).capture(s.intent, s.token);
      expect(r.status).toBe('succeeded');
      expect(s.transport).toHaveBeenCalledOnce();
      const [url, request] = s.transport.mock.calls[0];
      expect(url).toBe('https://sandbox.nmi.com/api/v5/payments/sale');
      expect(request?.method).toBe('POST');
      expect(request?.redirect).toBe('error');
      expect(request?.headers).toEqual(
        expect.objectContaining({
          Authorization: s.credentials.apiKey,
          'Content-Type': 'application/json',
        }),
      );
      const body = JSON.parse(String(request?.body));
      expect(body.amount).toBe(123.45);
      expect(body.currency).toBe('USD');
      expect(body.payment_details).toEqual({ payment_token: s.token.value });
      if (mode === 'before') {
        expect(body.order_id).toBe(s.intent.idempotencyKey);
        expect(body).not.toHaveProperty('order_details');
        expect(() => documentedReference(body)).toThrow();
        originalBody = structuredClone(body);
      } else {
        expect(documentedReference(body)).toBe(s.intent.idempotencyKey);
        expect(originalBody).toBeDefined();
        const { order_id, ...unchanged } = originalBody!;
        expect(body).toEqual({
          ...unchanged,
          order_details: { order_id },
        });
      }
    }
    expect(frame()).toBe(current);
  },
);
it.each(['decline', 'malformed'])(
  'retains %s result and the original held duplicate boundary with the changed order field',
  async (response) => {
    const module = await load('after'),
      merchant = fictionalLaunchMerchants(
        new Date(Date.now() + 120000).toISOString(),
      )[0].merchant,
      s = fixture(merchant, response),
      gateway = new module.SandboxGateway(
        merchant,
        s.credentials,
        s.store,
        s.transport,
      );
    const r = await gateway.capture(s.intent, s.token);
    expect(r.status).toBe(response === 'decline' ? 'declined' : 'unknown');
    expect(
      documentedReference(
        JSON.parse(String(s.transport.mock.calls[0][1]?.body)),
      ),
    ).toBe(s.intent.idempotencyKey);
    expect(await gateway.capture(s.intent, s.token)).toEqual(r);
    expect(s.transport).toHaveBeenCalledOnce();
  },
);
it('preserves wrong-merchant denial before reservation and injected transport', async () => {
  const module = await load('after'),
    merchants = fictionalLaunchMerchants(
      new Date(Date.now() + 120000).toISOString(),
    ),
    s = fixture(merchants[0].merchant);
  await expect(
    new module.SandboxGateway(
      merchants[1].merchant,
      s.credentials,
      s.store,
      s.transport,
    ).capture(s.intent, s.token),
  ).rejects.toThrow();
  expect(s.store.reserve).not.toHaveBeenCalled();
  expect(s.transport).not.toHaveBeenCalled();
});
it('denies a substituted patch or coordinated documentation-record rebind', () => {
  expect(() =>
    packet((p: string) =>
      p.endsWith('.patch')
        ? Buffer.from(
            readFileSync(p, 'utf8').replace(
              '+          order_details:',
              '+          wrong_order_details:',
            ),
          )
        : readFileSync(p),
    ),
  ).toThrow();
  expect(() =>
    packet((p: string) =>
      p.endsWith('.json')
        ? Buffer.from(
            JSON.stringify({
              ...JSON.parse(readFileSync(p, 'utf8')),
              after: '0'.repeat(64),
            }),
          )
        : readFileSync(p),
    ),
  ).toThrow();
});
