import { afterEach, expect, it, vi } from 'vitest';
import {
  NmiTokenHandoffLab,
  type NmiLabBinding,
  type NmiLabAuthority,
} from '../server/payments/token-lab/nmi-token-handoff';
import { fictionalLaunchMerchants } from './fixtures/first-launch-merchants';
import {
  captureReferencedToken,
  type TokenReference,
} from '../server/payments/token-reference';
import {
  SandboxGateway,
  type SandboxIntentStore,
} from '../server/payments/sandbox';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function fixture(index = 0) {
  const expiresAt = new Date(Date.now() + 29 * 60_000).toISOString();
  const merchant = fictionalLaunchMerchants(expiresAt)[index].merchant;
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
      expiresAt,
    },
    customerId: crypto.randomUUID(),
    actorId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    sourceDigest: 'a'.repeat(64),
    consentDigest: 'b'.repeat(64),
    csrfDigest: 'c'.repeat(64),
    origin: 'https://fictional-checkout-' + index + '.invalid',
    validUntil: expiresAt,
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
  const token = 'fictional_nmi_private_token_' + index;
  const ready = async () => {
    const ceremony = await lab.begin();
    const callback = {
      ceremonyId: ceremony.ceremonyId,
      state: ceremony.state,
      paymentToken: token,
    };
    const reference = await lab.receive(callback, binding.origin);
    return { ceremony, callback, reference };
  };
  return { binding, current, readCurrent, lab, token, ready };
}
function scope(
  s: ReturnType<typeof fixture>,
  reference: Readonly<TokenReference>,
) {
  const { expiresAt, ...binding } = reference;
  expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
  return { ...binding, idempotencyKey: s.binding.intent.idempotencyKey };
}
it.each([0, 1])(
  'fictional merchant%i hands off once into existing token-reference/Sale engines without public token custody',
  async (index) => {
    const s = fixture(index),
      { ceremony, reference } = await s.ready();
    expect(Object.isFrozen(ceremony) && Object.isFrozen(reference)).toBe(true);
    expect(Date.parse(ceremony.expiresAt) - Date.now()).toBeLessThanOrEqual(
      300000,
    );
    expect(reference).toMatchObject({
      organizationId: s.binding.merchant.organizationId,
      merchantConfigId: s.binding.merchant.merchantConfigId,
      customerId: s.binding.customerId,
      provider: 'nmi',
      mode: 'sandbox',
    });
    expect(JSON.stringify(s.lab)).toBe('{}');
    expect(JSON.stringify({ ceremony, reference })).not.toContain(s.token);
    const store: SandboxIntentStore = {
      reserve: vi.fn(async () => ({ status: 'reserved' as const })),
      finish: vi.fn(async () => {}),
    };
    const transport = vi.fn<typeof fetch>(async (url, options) => {
      expect(url).toBe('https://sandbox.nmi.com/api/v5/payments/sale');
      expect(options?.method).toBe('POST');
      expect(JSON.parse(String(options?.body))).toEqual({
        amount: 1.23,
        currency: 'USD',
        payment_details: { payment_token: s.token },
        order_details: { order_id: s.binding.intent.idempotencyKey },
      });
      return Response.json({
        response: '1',
        id: 'fictional_handoff_sale_' + index,
        amount: '1.23',
        currency: 'USD',
      });
    });
    const gateway = new SandboxGateway(
      s.binding.merchant,
      { apiKey: 'fictional-only-key' },
      store,
      transport,
    );
    const capture = () =>
      captureReferencedToken(
        s.binding.merchant,
        s.binding.intent,
        s.binding.customerId,
        reference.id,
        s.lab,
        gateway,
      );
    const result = await capture();
    expect(result).toMatchObject({
      status: 'succeeded',
      transactionId: 'fictional_handoff_sale_' + index,
    });
    expect(JSON.stringify(result)).not.toContain(s.token);
    await expect(capture()).rejects.toThrow('reconcile original intent');
    await expect(s.lab.begin()).rejects.toThrow();
    expect(transport).toHaveBeenCalledOnce();
    expect(store.reserve).toHaveBeenCalledOnce();
  },
);
it.each([
  'id',
  'organizationId',
  'merchantConfigId',
  'customerId',
  'provider',
  'mode',
  'idempotencyKey',
] as const)(
  'denies wrong resolve %s without spending a valid original scope',
  async (field) => {
    const s = fixture(),
      { reference } = await s.ready(),
      original = scope(s, reference);
    await expect(
      s.lab.resolve({ ...original, [field]: 'foreign' }),
    ).rejects.toThrow();
    expect((await s.lab.resolve(original)).token.value).toBe(s.token);
    await expect(s.lab.resolve(original)).rejects.toThrow();
  },
);
it.each([
  'sourceDigest',
  'consentDigest',
  'csrfDigest',
  'actorId',
  'sessionId',
  'customerId',
] as const)(
  'holds token permanently when current %s changes before resolution',
  async (field) => {
    const s = fixture(),
      { reference } = await s.ready(),
      original = scope(s, reference);
    s.current.binding[field] = field.endsWith('Digest')
      ? 'd'.repeat(64)
      : crypto.randomUUID();
    await expect(s.lab.resolve(original)).rejects.toThrow();
    s.current.binding = structuredClone(s.binding);
    await expect(s.lab.resolve(original)).rejects.toThrow();
  },
);
it.each([
  'amountMinor',
  'invoiceId',
  'authorizationId',
  'idempotencyKey',
] as const)(
  'denies a changed current intent %s instead of silently reauthorizing token use',
  async (field) => {
    const s = fixture(),
      { reference } = await s.ready();
    Object.assign(s.current.binding.intent, {
      [field]: field === 'amountMinor' ? 124 : crypto.randomUUID(),
    });
    await expect(s.lab.resolve(scope(s, reference))).rejects.toThrow();
  },
);
it.each(['fixture', 'active', 'aal'] as const)(
  'requires current synthetic authority %s, never treating it as genuine Auth',
  async (field) => {
    const s = fixture();
    Object.assign(s.current, { [field]: field === 'aal' ? 1 : false });
    await expect(s.lab.begin()).rejects.toThrow();
    Object.assign(s.current, { fixture: true, active: true, aal: 2 });
    await expect(s.lab.begin()).rejects.toThrow();
  },
);
it.each(['state', 'ceremonyId', 'origin', 'token', 'raw-field'] as const)(
  'denies wrong callback %s without exposing or overwriting private custody',
  async (which) => {
    const s = fixture(),
      ceremony = await s.lab.begin();
    const callback = {
      ceremonyId: ceremony.ceremonyId,
      state: ceremony.state,
      paymentToken: s.token,
    };
    const changed = {
      ...callback,
      ...(which === 'raw-field'
        ? { cardNumber: 'FORBIDDEN RAW FIELD' }
        : which === 'token'
          ? { paymentToken: 'nonfictional-provider-token' }
          : which === 'origin'
            ? {}
            : { [which]: 'foreign' }),
    };
    await expect(
      s.lab.receive(
        changed,
        which === 'origin' ? 'https://foreign.invalid' : s.binding.origin,
      ),
    ).rejects.toThrow();
    const reference = await s.lab.receive(callback, s.binding.origin);
    await expect(
      s.lab.receive(
        { ...callback, paymentToken: 'fictional_nmi_replacement_token' },
        s.binding.origin,
      ),
    ).rejects.toThrow();
    expect((await s.lab.resolve(scope(s, reference))).token.value).toBe(
      s.token,
    );
  },
);
it('snapshots caller binding and current-authority facts before retaining custody', async () => {
  const s = fixture();
  const original = structuredClone(s.binding);
  s.binding.intent.amountMinor = 9999;
  s.binding.customerId = crypto.randomUUID();
  const ceremony = await s.lab.begin();
  const reference = await s.lab.receive(
    {
      ceremonyId: ceremony.ceremonyId,
      state: ceremony.state,
      paymentToken: s.token,
    },
    original.origin,
  );
  expect(reference.customerId).toBe(original.customerId);
  const { expiresAt, ...rest } = reference;
  expect(expiresAt).toBe(ceremony.expiresAt);
  expect(
    (
      await s.lab.resolve({
        ...rest,
        idempotencyKey: original.intent.idempotencyKey,
      })
    ).token.value,
  ).toBe(s.token);
});
it('rejects nested accessors and Proxy binding substitution before authority reads', () => {
  const s = fixture(),
    getter = vi.fn(() => s.binding.intent.amountMinor);
  const altered = structuredClone(s.binding);
  Object.defineProperty(altered.intent, 'amountMinor', {
    enumerable: true,
    get: getter,
  });
  expect(
    () =>
      new NmiTokenHandoffLab(altered, {
        testOnly: true,
        readCurrent: s.readCurrent,
      }),
  ).toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(
    () =>
      new NmiTokenHandoffLab(new Proxy(s.binding, {}), {
        testOnly: true,
        readCurrent: s.readCurrent,
      }),
  ).toThrow();
  expect(s.readCurrent).not.toHaveBeenCalled();
});
it('has no disabled/default authority or real-origin acceptance path', () => {
  const s = fixture(),
    network = vi.spyOn(globalThis, 'fetch');
  expect(
    () =>
      new NmiTokenHandoffLab(s.binding, {
        testOnly: false,
        readCurrent: s.readCurrent,
      } as unknown as ConstructorParameters<typeof NmiTokenHandoffLab>[1]),
  ).toThrow();
  expect(
    () =>
      new NmiTokenHandoffLab(
        s.binding,
        undefined as unknown as ConstructorParameters<
          typeof NmiTokenHandoffLab
        >[1],
      ),
  ).toThrow();
  expect(
    () =>
      new NmiTokenHandoffLab(
        { ...s.binding, origin: 'https://example.com' },
        { testOnly: true, readCurrent: s.readCurrent },
      ),
  ).toThrow();
  expect(network).not.toHaveBeenCalled();
});
it.each(['begin', 'receive', 'resolve'] as const)(
  'bounds stalled current-authority %s and never resumes on late acknowledgment',
  async (phase) => {
    vi.useFakeTimers();
    const s = fixture();
    let ceremony: Awaited<ReturnType<typeof s.lab.begin>> | undefined,
      reference: Readonly<TokenReference> | undefined;
    if (phase !== 'begin') ceremony = await s.lab.begin();
    if (phase === 'resolve')
      reference = await s.lab.receive(
        {
          ceremonyId: ceremony!.ceremonyId,
          state: ceremony!.state,
          paymentToken: s.token,
        },
        s.binding.origin,
      );
    let finish!: (a: NmiLabAuthority) => void;
    s.readCurrent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const run = () =>
      phase === 'begin'
        ? s.lab.begin()
        : phase === 'receive'
          ? s.lab.receive(
              {
                ceremonyId: ceremony!.ceremonyId,
                state: ceremony!.state,
                paymentToken: s.token,
              },
              s.binding.origin,
            )
          : s.lab.resolve(scope(s, reference!));
    const pending = expect(run()).rejects.toThrow('reconcile original intent');
    await vi.advanceTimersByTimeAsync(5000);
    await pending;
    finish(s.current);
    await vi.advanceTimersByTimeAsync(0);
    await expect(run()).rejects.toThrow();
  },
);
it('rejects an authority answer after wall-clock deadline even before timer dispatch', async () => {
  const s = fixture(),
    now = Date.now();
  s.readCurrent.mockImplementationOnce(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now + 5001);
    return s.current;
  });
  await expect(s.lab.begin()).rejects.toThrow();
  await expect(s.lab.begin()).rejects.toThrow();
});
it('caps the ceremony at the earliest expiry and rejects token callbacks after it', async () => {
  const s = fixture(),
    now = Date.now(),
    expiry = new Date(now + 1000).toISOString();
  s.binding.validUntil = expiry;
  s.current.binding.validUntil = expiry;
  const lab = new NmiTokenHandoffLab(s.binding, {
    testOnly: true,
    readCurrent: s.readCurrent,
  });
  const ceremony = await lab.begin();
  expect(ceremony.expiresAt).toBe(expiry);
  vi.spyOn(Date, 'now').mockReturnValue(now + 1001);
  await expect(
    lab.receive(
      {
        ceremonyId: ceremony.ceremonyId,
        state: ceremony.state,
        paymentToken: s.token,
      },
      s.binding.origin,
    ),
  ).rejects.toThrow();
});
it('reserves the callback before await so concurrent duplicate completion cannot replace the first token', async () => {
  const s = fixture(),
    ceremony = await s.lab.begin();
  let finish!: (a: NmiLabAuthority) => void;
  s.readCurrent.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const callback = {
    ceremonyId: ceremony.ceremonyId,
    state: ceremony.state,
    paymentToken: s.token,
  };
  const first = s.lab.receive(callback, s.binding.origin);
  await expect(
    s.lab.receive(
      { ...callback, paymentToken: 'fictional_nmi_second_token' },
      s.binding.origin,
    ),
  ).rejects.toThrow();
  finish(s.current);
  const reference = await first;
  expect((await s.lab.resolve(scope(s, reference))).token.value).toBe(s.token);
});
it('claims resolution before await without allowing a competing call to clear the winning private token', async () => {
  const s = fixture(),
    { reference } = await s.ready(),
    original = scope(s, reference);
  let finish!: (a: NmiLabAuthority) => void;
  s.readCurrent.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = s.lab.resolve(original);
  await expect(s.lab.resolve(original)).rejects.toThrow();
  finish(s.current);
  expect((await first).token.value).toBe(s.token);
  await expect(s.lab.resolve(original)).rejects.toThrow();
});
it.each(['begin', 'receive', 'resolve'] as const)(
  'close during pending %s cannot reopen custody on late authority acknowledgment',
  async (phase) => {
    const s = fixture();
    let ceremony: Awaited<ReturnType<typeof s.lab.begin>> | undefined,
      reference: Readonly<TokenReference> | undefined;
    if (phase !== 'begin') ceremony = await s.lab.begin();
    if (phase === 'resolve')
      reference = await s.lab.receive(
        {
          ceremonyId: ceremony!.ceremonyId,
          state: ceremony!.state,
          paymentToken: s.token,
        },
        s.binding.origin,
      );
    let finish!: (a: NmiLabAuthority) => void;
    s.readCurrent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending =
      phase === 'begin'
        ? s.lab.begin()
        : phase === 'receive'
          ? s.lab.receive(
              {
                ceremonyId: ceremony!.ceremonyId,
                state: ceremony!.state,
                paymentToken: s.token,
              },
              s.binding.origin,
            )
          : s.lab.resolve(scope(s, reference!));
    const rejection = expect(pending).rejects.toThrow();
    s.lab.close();
    finish(s.current);
    await rejection;
    await expect(s.lab.begin()).rejects.toThrow();
  },
);
it('holds consumed custody after gateway UNKNOWN and refuses old references in a fresh lab instance', async () => {
  const s = fixture(),
    { reference } = await s.ready();
  const store: SandboxIntentStore = {
    reserve: vi.fn(async () => ({ status: 'reserved' as const })),
    finish: vi.fn(async () => {}),
  };
  const transport = vi.fn<typeof fetch>(async () => {
    throw Error('FICTIONAL provider ACK lost');
  });
  const gateway = new SandboxGateway(
    s.binding.merchant,
    { apiKey: 'fictional-only-key' },
    store,
    transport,
  );
  const run = () =>
    captureReferencedToken(
      s.binding.merchant,
      s.binding.intent,
      s.binding.customerId,
      reference.id,
      s.lab,
      gateway,
    );
  expect((await run()).status).toBe('unknown');
  await expect(run()).rejects.toThrow();
  const restarted = new NmiTokenHandoffLab(s.binding, {
    testOnly: true,
    readCurrent: s.readCurrent,
  });
  await expect(restarted.resolve(scope(s, reference))).rejects.toThrow();
  expect(transport).toHaveBeenCalledOnce();
  expect(store.reserve).toHaveBeenCalledOnce();
});
it('redacts authority failures instead of returning session, token or provider diagnostics', async () => {
  const s = fixture();
  s.readCurrent.mockRejectedValueOnce(
    Error(
      s.token + s.binding.sessionId + ' https://private.invalid/diagnostics',
    ),
  );
  await expect(s.lab.begin()).rejects.toThrow(
    /^NMI token handoff unavailable; reconcile original intent$/,
  );
});
it('captures an own-data authority function once and rejects a later-reader accessor seam', async () => {
  const s = fixture(),
    getter = vi.fn(() => s.readCurrent);
  const unsafe = { testOnly: true as const, readCurrent: s.readCurrent };
  Object.defineProperty(unsafe, 'readCurrent', { get: getter });
  expect(() => new NmiTokenHandoffLab(s.binding, unsafe)).toThrow();
  expect(getter).not.toHaveBeenCalled();
  const ports = { testOnly: true as const, readCurrent: s.readCurrent };
  const lab = new NmiTokenHandoffLab(s.binding, ports);
  const replacement = vi.fn(async () => {
    throw Error('replacement');
  });
  ports.readCurrent = replacement;
  await expect(lab.begin()).resolves.toMatchObject({ fixture: true });
  expect(replacement).not.toHaveBeenCalled();
});
it.each(['organizationId', 'merchantConfigId'] as const)(
  'rejects an otherwise internally consistent current foreign merchant %s',
  async (field) => {
    const s = fixture(),
      { reference } = await s.ready(),
      changed = crypto.randomUUID();
    s.current.binding.merchant[field] = changed;
    s.current.binding.intent[field] = changed;
    await expect(s.lab.resolve(scope(s, reference))).rejects.toThrow();
  },
);
