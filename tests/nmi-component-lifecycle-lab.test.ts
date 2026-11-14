import { afterEach, expect, it, vi } from 'vitest';
import {
  NmiTokenHandoffLab,
  type NmiLabAuthority,
  type NmiLabBinding,
  type NmiLabCeremony,
} from '../server/payments/token-lab/nmi-token-handoff';
import { createNmiComponentCallbacksLab } from '../server/payments/token-lab/nmi-component-lifecycle';
import { fictionalLaunchMerchants } from './fixtures/first-launch-merchants';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function fixture(index = 0) {
  const expires = new Date(Date.now() + 60000).toISOString();
  const merchant = fictionalLaunchMerchants(expires)[index].merchant;
  const binding: NmiLabBinding = {
    merchant,
    intent: {
      organizationId: merchant.organizationId,
      merchantConfigId: merchant.merchantConfigId,
      invoiceId: crypto.randomUUID(),
      authorizationId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      amountMinor: 123,
      currency: 'USD',
      expiresAt: expires,
    },
    customerId: crypto.randomUUID(),
    actorId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    sourceDigest: 'a'.repeat(64),
    consentDigest: 'b'.repeat(64),
    csrfDigest: 'c'.repeat(64),
    origin: 'https://fictional-callback-' + index + '.invalid',
    validUntil: expires,
  };
  const current: NmiLabAuthority = {
    fixture: true,
    active: true,
    aal: 2,
    binding: structuredClone(binding),
  };
  const readCurrent = vi.fn(async (_signal: AbortSignal) => {
    expect(_signal).toBeInstanceOf(AbortSignal);
    return current;
  });
  const lab = new NmiTokenHandoffLab(binding, { testOnly: true, readCurrent });
  const ceremony = await lab.begin();
  const callbacks = createNmiComponentCallbacksLab(lab, ceremony);
  const event = { token: 'fictional_nmi_callback_token_' + index };
  return { binding, current, readCurrent, lab, ceremony, callbacks, event };
}
function resolveScope(s: Awaited<ReturnType<typeof fixture>>) {
  const { expiresAt: _expiresAt, ...reference } =
    s.callbacks.readHandoff().reference;
  expect(_expiresAt).toBe(s.ceremony.expiresAt);
  return { ...reference, idempotencyKey: s.binding.intent.idempotencyKey };
}
it.each([0, 1])(
  'fictional merchant%i composes completion, explicit onPay and exact existing one-use reference',
  async (index) => {
    const s = await fixture(index);
    s.callbacks.onChange({ complete: false });
    expect(await s.callbacks.onPay(s.event)).toBeTypeOf('string');
    expect(s.readCurrent).toHaveBeenCalledTimes(1);
    expect(() => s.callbacks.readHandoff()).toThrow();
    s.callbacks.onChange({ complete: true, ...s.event });
    const reply = await s.callbacks.onPay(s.event);
    expect(reply).toBe('Offline handoff only; payment NOT EXECUTED.');
    expect(reply).not.toBe(true);
    expect(s.callbacks.readHandoff()).toMatchObject({
      status: 'TOKEN_REFERENCE_ONLY',
      paymentExecuted: false,
      settlement: 'UNVERIFIED',
    });
    expect(JSON.stringify(s.callbacks.readHandoff())).not.toMatch(
      /fictional_nmi_|lookupData|sourceDigest|consentDigest|sessionId|actorId/,
    );
    const scope = resolveScope(s);
    expect((await s.lab.resolve(scope)).token.value).toBe(s.event.token);
    await expect(s.lab.resolve(scope)).rejects.toThrow();
  },
);
it.each(['pending', 'ready'] as const)(
  'a new incomplete field during%s closes the original vault and never revives a late reference',
  async (phase) => {
    const s = await fixture();
    let finish: ((value: NmiLabAuthority) => void) | undefined;
    if (phase === 'pending')
      s.readCurrent.mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve)),
      );
    s.callbacks.onChange({ complete: true, ...s.event });
    const pending = s.callbacks.onPay(s.event);
    if (phase === 'ready') await pending;
    expect(() => s.callbacks.onChange({ complete: false })).toThrow();
    finish?.(s.current);
    expect(await pending).toBeTypeOf('string');
    expect(() => s.callbacks.readHandoff()).toThrow();
    expect(() =>
      s.callbacks.onChange({ complete: true, ...s.event }),
    ).toThrow();
    expect(await s.callbacks.onPay(s.event)).toBeTypeOf('string');
    await expect(
      s.lab.receive(
        {
          ceremonyId: s.ceremony.ceremonyId,
          state: s.ceremony.state,
          paymentToken: s.event.token,
        },
        s.ceremony.origin,
      ),
    ).rejects.toThrow();
  },
);
it('even another complete field event after submission invalidates rather than silently replacing the original token', async () => {
  const s = await fixture();
  s.callbacks.onChange({ complete: true, ...s.event });
  await s.callbacks.onPay(s.event);
  const scope = resolveScope(s);
  expect(() =>
    s.callbacks.onChange({
      complete: true,
      token: 'fictional_nmi_replacement_token',
    }),
  ).toThrow();
  expect(() => s.callbacks.readHandoff()).toThrow();
  await expect(s.lab.resolve(scope)).rejects.toThrow();
});
it('binds explicit onPay to the last completed token without consuming a mismatched reference', async () => {
  const s = await fixture();
  s.callbacks.onChange({ complete: true, ...s.event });
  expect(
    await s.callbacks.onPay({ token: 'fictional_nmi_other_token' }),
  ).toBeTypeOf('string');
  expect(s.readCurrent).toHaveBeenCalledTimes(1);
  expect(() => s.callbacks.readHandoff()).toThrow();
  expect(await s.callbacks.onPay(s.event)).toBeTypeOf('string');
  expect(s.readCurrent).toHaveBeenCalledTimes(1);
});
it('snapshots the original ceremony and does not read mutable caller state later', async () => {
  const s = await fixture();
  const mutable = { ...s.ceremony };
  const callbacks = createNmiComponentCallbacksLab(s.lab, mutable);
  mutable.state = 'substituted';
  callbacks.onChange({ complete: true, ...s.event });
  await callbacks.onPay(s.event);
  expect(callbacks.readHandoff().reference.expiresAt).toBe(
    s.ceremony.expiresAt,
  );
});
it('initial complete events may change before explicit submission without dispatching or retaining old tokens', async () => {
  const s = await fixture();
  s.callbacks.onChange({ complete: true, token: 'fictional_nmi_old_token' });
  s.callbacks.onChange({ complete: false });
  s.callbacks.onChange({ complete: true, ...s.event });
  expect(s.readCurrent).toHaveBeenCalledTimes(1);
  await s.callbacks.onPay(s.event);
  expect((await s.lab.resolve(resolveScope(s))).token.value).toBe(
    s.event.token,
  );
});
it('incomplete editing with an empty token neither consumes the ceremony nor marks it ready', async () => {
  const s = await fixture();
  s.callbacks.onChange({ complete: false, token: '' });
  expect(await s.callbacks.onPay(s.event)).toBeTypeOf('string');
  expect(s.readCurrent).toHaveBeenCalledTimes(1);
  s.callbacks.onChange({ complete: true, ...s.event });
  await s.callbacks.onPay(s.event);
  expect(s.callbacks.readHandoff().paymentExecuted).toBe(false);
});
it('does not traverse or retain either callback lookupData', async () => {
  const s = await fixture();
  const invoked = vi.fn(() => {
    throw Error('FORBIDDEN metadata');
  });
  const lookupData = new Proxy(
    {},
    { get: invoked, ownKeys: invoked, getOwnPropertyDescriptor: invoked },
  );
  s.callbacks.onChange({ complete: true, ...s.event, lookupData });
  await s.callbacks.onPay({ ...s.event, lookupData });
  expect(s.callbacks.readHandoff().paymentExecuted).toBe(false);
  expect(invoked).not.toHaveBeenCalled();
});
it.each([
  'getter',
  'proxy',
  'raw',
  '3ds',
  'unknown',
  'missing-token',
  'real-token',
])(
  'denies%s editing evidence without invoking untrusted data or resuming the ceremony',
  async (kind) => {
    const s = await fixture();
    const invoked = vi.fn(() => {
      throw Error('Executable input must not run');
    });
    let event: unknown = { complete: true, ...s.event };
    if (kind === 'getter')
      Object.defineProperty(event, 'complete', { get: invoked });
    if (kind === 'proxy')
      event = new Proxy(event as object, { ownKeys: invoked });
    if (kind === 'raw')
      Object.assign(event as object, { cardNumber: 'FORBIDDEN' });
    if (kind === '3ds') Object.assign(event as object, { cavv: 'UNSUPPORTED' });
    if (kind === 'unknown')
      Object.assign(event as object, { operation: 'auth' });
    if (kind === 'missing-token') event = { complete: true };
    if (kind === 'real-token')
      event = { complete: true, token: 'NONFICTIONAL' };
    expect(() => s.callbacks.onChange(event)).toThrow();
    expect(invoked).not.toHaveBeenCalled();
    expect(await s.callbacks.onPay(s.event)).toBeTypeOf('string');
    expect(s.readCurrent).toHaveBeenCalledTimes(1);
  },
);
it('a duplicate pending onPay cannot replace the first token or introduce a second authority read', async () => {
  const s = await fixture();
  let finish!: (value: NmiLabAuthority) => void;
  s.readCurrent.mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  s.callbacks.onChange({ complete: true, ...s.event });
  const first = s.callbacks.onPay(s.event);
  expect(
    await s.callbacks.onPay({ token: 'fictional_nmi_duplicate_token' }),
  ).toBeTypeOf('string');
  finish(s.current);
  await first;
  expect(s.readCurrent).toHaveBeenCalledTimes(2);
  expect((await s.lab.resolve(resolveScope(s))).token.value).toBe(
    s.event.token,
  );
});
it('a revoked authority during the existing await never produces a usable reference', async () => {
  const s = await fixture();
  s.callbacks.onChange({ complete: true, ...s.event });
  s.current.active = false;
  expect(await s.callbacks.onPay(s.event)).toBeTypeOf('string');
  expect(() => s.callbacks.readHandoff()).toThrow();
  s.current.active = true;
  expect(await s.callbacks.onPay(s.event)).toBeTypeOf('string');
  expect(() => s.callbacks.readHandoff()).toThrow();
});
it('expiry or explicit disposal clears a ready reference and the original vault', async () => {
  const s = await fixture();
  s.callbacks.onChange({ complete: true, ...s.event });
  await s.callbacks.onPay(s.event);
  const scope = resolveScope(s);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(s.ceremony.expiresAt));
  expect(() => s.callbacks.readHandoff()).toThrow();
  await expect(s.lab.resolve(scope)).rejects.toThrow();
  s.callbacks.close();
  expect(await s.callbacks.onPay(s.event)).toBeTypeOf('string');
});
it('rejects ceremony accessors and proxies before reading their executable properties', async () => {
  const s = await fixture();
  const invoked = vi.fn(() => {
    throw Error('Ceremony trap must not run');
  });
  const accessor = { ...s.ceremony };
  Object.defineProperty(accessor, 'expiresAt', { get: invoked });
  expect(() => createNmiComponentCallbacksLab(s.lab, accessor)).toThrow();
  expect(() =>
    createNmiComponentCallbacksLab(
      s.lab,
      new Proxy(s.ceremony, {
        getOwnPropertyDescriptor: invoked,
      }) as NmiLabCeremony,
    ),
  ).toThrow();
  expect(invoked).not.toHaveBeenCalled();
});
