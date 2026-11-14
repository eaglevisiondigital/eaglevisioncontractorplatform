import { afterEach, expect, it, vi } from 'vitest';
import {
  NmiTokenHandoffLab,
  type NmiLabAuthority,
  type NmiLabBinding,
} from '../server/payments/token-lab/nmi-token-handoff';
import { receiveNmiComponentOnPayLab } from '../server/payments/token-lab/nmi-component-event';
import { fictionalLaunchMerchants } from './fixtures/first-launch-merchants';
import { captureReferencedToken } from '../server/payments/token-reference';
import {
  SandboxGateway,
  type SandboxIntent,
  type SandboxIntentStore,
} from '../server/payments/sandbox';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function fixture(index = 0) {
  const expires = new Date(Date.now() + 60_000).toISOString(),
    merchant = fictionalLaunchMerchants(expires)[index].merchant;
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
    origin: 'https://fictional-component-' + index + '.invalid',
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
  const event = { token: 'fictional_nmi_component_token_' + index };
  return { binding, current, readCurrent, lab, event };
}
it.each([0, 1])(
  'merchant%i maps documented onPay token to the existing private reference without SDK success or metadata retention',
  async (index) => {
    const s = fixture(index),
      ceremony = await s.lab.begin();
    const lookupRead = vi.fn(() => {
      throw Error('lookup details must never be read');
    });
    const lookupData = new Proxy(
      {},
      {
        get: lookupRead,
        ownKeys: lookupRead,
        getOwnPropertyDescriptor: lookupRead,
      },
    );
    const result = await receiveNmiComponentOnPayLab(s.lab, ceremony, {
      ...s.event,
      lookupData,
    });
    expect(result).toMatchObject({
      fixture: true,
      status: 'TOKEN_REFERENCE_ONLY',
      paymentExecuted: false,
      settlement: 'UNVERIFIED',
      componentReply: 'Offline handoff recorded; payment NOT EXECUTED.',
    });
    expect(result.componentReply).not.toBe(true);
    expect(lookupRead).not.toHaveBeenCalled();
    expect(Object.isFrozen(result) && Object.isFrozen(result.reference)).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toMatch(
      /lookupData|fictional_nmi_|card|account|sessionId|actorId|consentDigest/,
    );
    const { expiresAt, ...reference } = result.reference;
    expect(expiresAt).toBe(ceremony.expiresAt);
    expect(
      (
        await s.lab.resolve({
          ...reference,
          idempotencyKey: s.binding.intent.idempotencyKey,
        })
      ).token.value,
    ).toBe(s.event.token);
  },
);
it.each([
  'missing-token',
  'token-getter',
  'metadata-getter',
  'symbol',
  'raw-field',
  'amount',
  'onChange-incomplete',
  'onChange-complete',
  'proxy',
  'array',
  'nonfictional',
])(
  'rejects%s before handoff without reading sensitive/executable input',
  async (kind) => {
    const s = fixture(),
      ceremony = await s.lab.begin(),
      invoked = vi.fn(() => s.event.token);
    let event: unknown = { ...s.event };
    if (kind === 'missing-token') event = { lookupData: {} };
    if (kind === 'token-getter')
      Object.defineProperty(event, 'token', { get: invoked });
    if (kind === 'metadata-getter')
      Object.defineProperty(event, 'lookupData', { get: invoked });
    if (kind === 'symbol')
      Object.assign(event as object, { [Symbol('private')]: 'FORBIDDEN' });
    if (kind === 'raw-field')
      Object.assign(event as object, { cardNumber: 'FORBIDDEN RAW FIELD' });
    if (kind === 'amount') Object.assign(event as object, { amount: 99999 });
    if (kind === 'onChange-incomplete') event = { complete: false };
    if (kind === 'onChange-complete')
      Object.assign(event as object, { complete: true });
    if (kind === 'proxy') event = new Proxy(event as object, { get: invoked });
    if (kind === 'array') event = [s.event];
    if (kind === 'nonfictional')
      event = { token: 'not-a-fictional-provider-token' };
    await expect(
      receiveNmiComponentOnPayLab(s.lab, ceremony, event),
    ).rejects.toThrow(
      /^Offline NMI component handoff unavailable; reconcile original intent$/,
    );
    expect(invoked).not.toHaveBeenCalled();
    expect(s.readCurrent).toHaveBeenCalledTimes(1); // begin only, no token handoff
  },
);
it('does not interpret initial onChange incomplete as a submitted payment or consume the explicit onPay ceremony', async () => {
  const s = fixture(),
    ceremony = await s.lab.begin();
  await expect(
    receiveNmiComponentOnPayLab(s.lab, ceremony, { complete: false }),
  ).rejects.toThrow();
  expect(
    (await receiveNmiComponentOnPayLab(s.lab, ceremony, s.event))
      .paymentExecuted,
  ).toBe(false);
});
it.each(['auth', 'capture_later', 'void'])(
  'unsupported%s intent cannot consume the newly handed-off token or become a new provider operation',
  async (operation) => {
    const s = fixture(),
      ceremony = await s.lab.begin(),
      { reference } = await receiveNmiComponentOnPayLab(
        s.lab,
        ceremony,
        s.event,
      );
    const reserve = vi.fn<SandboxIntentStore['reserve']>(async () => ({
      status: 'reserved',
    }));
    const finish = vi.fn<SandboxIntentStore['finish']>(async () => {});
    const transport = vi.fn<typeof fetch>(async (url) => {
      expect(url).toBe('https://sandbox.nmi.com/api/v5/payments/sale');
      return Response.json({
        response: '1',
        id: 'fictional_component_sale',
        amount: '1.23',
        currency: 'USD',
      });
    });
    const gateway = new SandboxGateway(
      s.binding.merchant,
      { apiKey: 'fictional-only' },
      { reserve, finish },
      transport,
    );
    const resolve = vi.spyOn(s.lab, 'resolve');
    const altered = { ...s.binding.intent, operation } as SandboxIntent;
    await expect(
      captureReferencedToken(
        s.binding.merchant,
        altered,
        s.binding.customerId,
        reference.id,
        s.lab,
        gateway,
      ),
    ).rejects.toThrow('Unexpected payment fields');
    expect(resolve).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(
      (
        await captureReferencedToken(
          s.binding.merchant,
          s.binding.intent,
          s.binding.customerId,
          reference.id,
          s.lab,
          gateway,
        )
      ).status,
    ).toBe('succeeded');
    expect(resolve).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledOnce();
  },
);
it.each(['decline', 'unknown'] as const)(
  'after actual existing Sale%s, the new component adapter cannot repeat token handoff or resolution',
  async (outcome) => {
    const s = fixture(),
      ceremony = await s.lab.begin(),
      handoff = await receiveNmiComponentOnPayLab(s.lab, ceremony, s.event);
    const reserve = vi.fn<SandboxIntentStore['reserve']>(async () => ({
      status: 'reserved',
    }));
    const finish = vi.fn<SandboxIntentStore['finish']>(async () => {});
    const transport = vi.fn<typeof fetch>(async () => {
      if (outcome === 'unknown') throw Error('FICTIONAL lost provider ACK');
      return Response.json({ response: '2', amount: '1.23', currency: 'USD' });
    });
    const gateway = new SandboxGateway(
      s.binding.merchant,
      { apiKey: 'fictional-only' },
      { reserve, finish },
      transport,
    );
    const capture = () =>
      captureReferencedToken(
        s.binding.merchant,
        s.binding.intent,
        s.binding.customerId,
        handoff.reference.id,
        s.lab,
        gateway,
      );
    expect((await capture()).status).toBe(
      outcome === 'unknown' ? 'unknown' : 'declined',
    );
    expect(handoff.componentReply).not.toBe(true);
    await expect(
      receiveNmiComponentOnPayLab(s.lab, ceremony, s.event),
    ).rejects.toThrow();
    await expect(capture()).rejects.toThrow();
    expect(reserve).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledOnce();
  },
);
it('rejects a different merchant ceremony even when its event has the same documented shape', async () => {
  const a = fixture(0),
    b = fixture(1),
    ceremony = await a.lab.begin();
  await b.lab.begin();
  await expect(
    receiveNmiComponentOnPayLab(b.lab, ceremony, a.event),
  ).rejects.toThrow();
  expect(b.readCurrent).toHaveBeenCalledTimes(1);
});
it('snapshots ceremony fields and token before the current-authority await without retaining source object aliases', async () => {
  const s = fixture(),
    original = await s.lab.begin(),
    ceremony = { ...original },
    event = { ...s.event };
  let finish!: (a: NmiLabAuthority) => void;
  s.readCurrent.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = receiveNmiComponentOnPayLab(s.lab, ceremony, event);
  ceremony.origin = 'https://foreign.invalid';
  ceremony.expiresAt = new Date(0).toISOString();
  event.token = 'fictional_nmi_changed_token';
  finish(s.current);
  const result = await pending;
  const { expiresAt, ...reference } = result.reference;
  expect(expiresAt).toBe(original.expiresAt);
  expect(
    (
      await s.lab.resolve({
        ...reference,
        idempotencyKey: s.binding.intent.idempotencyKey,
      })
    ).token.value,
  ).toBe(s.event.token);
});
it('uses the captured existing lab method rather than a later replacement callback', async () => {
  const s = fixture(),
    ceremony = await s.lab.begin(),
    fake = vi.fn(async () => {
      throw Error('replacement');
    });
  s.lab.receive = fake;
  expect(
    (await receiveNmiComponentOnPayLab(s.lab, ceremony, s.event)).status,
  ).toBe('TOKEN_REFERENCE_ONLY');
  expect(fake).not.toHaveBeenCalled();
});
it('rejects a forged longer ceremony expiry after handoff and clears the original private token', async () => {
  const s = fixture(),
    original = await s.lab.begin();
  await expect(
    receiveNmiComponentOnPayLab(
      s.lab,
      {
        ...original,
        expiresAt: new Date(
          Date.parse(original.expiresAt) + 1000,
        ).toISOString(),
      },
      s.event,
    ),
  ).rejects.toThrow();
  await expect(
    receiveNmiComponentOnPayLab(s.lab, original, s.event),
  ).rejects.toThrow();
  await expect(s.lab.begin()).rejects.toThrow();
});
it('redacts a rejected current-authority answer and never reports tokenization as paid', async () => {
  const s = fixture(),
    ceremony = await s.lab.begin();
  s.readCurrent.mockRejectedValueOnce(
    Error(s.event.token + ' PRIVATE SESSION DETAILS'),
  );
  await expect(
    receiveNmiComponentOnPayLab(s.lab, ceremony, s.event),
  ).rejects.toThrow(
    /^Offline NMI component handoff unavailable; reconcile original intent$/,
  );
  await expect(
    receiveNmiComponentOnPayLab(s.lab, ceremony, s.event),
  ).rejects.toThrow();
});
it('concurrent onPay retries cannot replace the first private token or close its winning handoff', async () => {
  const s = fixture(),
    ceremony = await s.lab.begin();
  let finish!: (a: NmiLabAuthority) => void;
  s.readCurrent.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = receiveNmiComponentOnPayLab(s.lab, ceremony, s.event);
  await expect(
    receiveNmiComponentOnPayLab(s.lab, ceremony, {
      token: 'fictional_nmi_replacement_attempt',
    }),
  ).rejects.toThrow();
  finish(s.current);
  const result = await first,
    { expiresAt, ...reference } = result.reference;
  expect(expiresAt).toBe(ceremony.expiresAt);
  expect(result.componentReply).not.toBe(true);
  expect(
    (
      await s.lab.resolve({
        ...reference,
        idempotencyKey: s.binding.intent.idempotencyKey,
      })
    ).token.value,
  ).toBe(s.event.token);
});
