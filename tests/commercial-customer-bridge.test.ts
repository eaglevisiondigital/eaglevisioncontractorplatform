import { afterEach, expect, it, vi } from 'vitest';
import { commercialCustomerReadProposal } from '../proposals/commercial-customer-bridge/reader';
import {
  CommercialCustomerReadController,
  commercialCustomerResponse,
  commercialCustomerTarget,
} from '../src/components/invoices/commercial-customer-read';
import { commercialCustomerBridgeFixture } from './fixtures/commercial-customer-bridge';
const signal = () => new AbortController().signal;
afterEach(() => vi.useRealTimers());

it('defaults off before inspecting port/input and makes no Auth or source reads', async () => {
  const f = commercialCustomerBridgeFixture();
  let touched = false;
  const input = new Proxy(f.viewer, {
    get() {
      touched = true;
      throw Error('must not read');
    },
  });
  const load = commercialCustomerReadProposal(f.auth, f.bearer, f.port);
  await expect(load(input, signal())).rejects.toThrow(/UNKNOWN/);
  expect(touched).toBe(false);
  expect(f.calls).toEqual({ auth: 0, session: 0, mapping: 0, source: 0 });
});
it('loads and reopens original safe issuance receipt only after repeated same-session/mapping/source reads', async () => {
  const f = commercialCustomerBridgeFixture(),
    result = await f.load(f.viewer, signal());
  expect(result.invoice.issuanceReceiptId).toBe(
    f.value.invoice.receipt.commandId,
  );
  expect(result.invoice.number).toBe(f.value.invoice.number);
  expect(result.payment).toEqual({
    status: 'UNKNOWN',
    balanceMinor: null,
    receipt: null,
  });
  expect(result.link).toMatchObject({ href: null, status: 'DISABLED' });
  expect(f.calls).toEqual({ auth: 6, session: 6, mapping: 3, source: 2 });
  const reopened = await f.load(f.viewer, signal());
  expect(reopened.invoice).toEqual(result.invoice);
  expect(JSON.stringify(result)).not.toMatch(
    /actorId|requestHash|sourceHash|PRIVATE|unit_cost|sessionId|bearer|paymentState/,
  );
  expect(Object.isFrozen(result.invoice)).toBe(true);
  expect(commercialCustomerResponse(result, f.viewer)).toEqual(result);
});
it.each([
  'unpaid',
  'partially_paid',
  'paid',
  'refunded',
  'cancelled',
  'disputed',
])(
  'rejects unsupported commercial %s claims instead of importing release/provider state',
  async (status) => {
    const f = commercialCustomerBridgeFixture();
    f.setValue({
      ...f.value,
      invoice: { ...f.value.invoice, paymentState: status },
    });
    await expect(f.load(f.viewer, signal())).rejects.toThrow(/UNKNOWN/);
  },
);
it('rejects synthetic release-ledger and arbitrary financial facts even beside a valid issued record', async () => {
  const f = commercialCustomerBridgeFixture();
  f.setValue({
    ...f.value,
    financial: { provider: 'synthetic', status: 'paid', balanceMinor: 0 },
  });
  await expect(f.load(f.viewer, signal())).rejects.toThrow(/UNKNOWN/);
});
it.each([
  'organizationId',
  'customerId',
  'locationId',
  'sourceVersionId',
  'invoiceId',
  'sourceHash',
  'revision',
  'userId',
  'sessionId',
])(
  'denies mismatched trusted mapping %s before any issued read',
  async (field) => {
    const f = commercialCustomerBridgeFixture();
    Object.assign(f.mapping, {
      [field]: field === 'revision' ? 99 : crypto.randomUUID(),
    });
    await expect(f.load(f.viewer, signal())).rejects.toThrow(/UNKNOWN/);
    expect(f.calls.source).toBe(0);
  },
);
it('expired/revoked mapping and unavailable Auth never fall back to staff read', async () => {
  const f = commercialCustomerBridgeFixture();
  f.mapping.active = false;
  await expect(f.load(f.viewer, signal())).rejects.toThrow();
  expect(f.calls.source).toBe(0);
  f.mapping.active = true;
  f.mapping.expiresAt = Date.now();
  await expect(f.load(f.viewer, signal())).rejects.toThrow();
  expect(f.calls.source).toBe(0);
  f.mapping.expiresAt = Date.now() + 120_000;
  f.setAuth(false);
  await expect(f.load(f.viewer, signal())).rejects.toThrow();
  expect(f.calls.source).toBe(0);
});
it('revocation after an issued read denies before returning content', async () => {
  const f = commercialCustomerBridgeFixture(),
    original = f.port.readIssued;
  f.port.readIssued = async (...args) => {
    const value = await original(...args);
    f.setAuth(false);
    return value;
  };
  const load = commercialCustomerReadProposal(f.auth, f.bearer, f.port, {
    enabled: true,
    mode: 'fictional-local',
  });
  await expect(load(f.viewer, signal())).rejects.toThrow(/UNKNOWN/);
  expect(f.calls.source).toBe(1);
});
it('post-await mapping revision changes deny the original result', async () => {
  const f = commercialCustomerBridgeFixture(),
    original = f.port.readIssued;
  f.port.readIssued = async (...args) => {
    const value = await original(...args);
    f.mapping.mappingRevision = 'changed';
    return value;
  };
  const load = commercialCustomerReadProposal(f.auth, f.bearer, f.port, {
    enabled: true,
    mode: 'fictional-local',
  });
  await expect(load(f.viewer, signal())).rejects.toThrow(/UNKNOWN/);
});
it('two issued reads must retain exact original header and full canonical source', async () => {
  const f = commercialCustomerBridgeFixture(),
    original = f.port.readIssued;
  f.port.readIssued = async (...args) => {
    const value = await original(...args);
    if (f.calls.source === 2)
      return {
        ...f.value,
        invoice: { ...f.value.invoice, title: 'substituted original' },
      };
    return value;
  };
  const load = commercialCustomerReadProposal(f.auth, f.bearer, f.port, {
    enabled: true,
    mode: 'fictional-local',
  });
  await expect(load(f.viewer, signal())).rejects.toThrow(/UNKNOWN/);
});
it('missing exact line source stays unavailable; issuance title is never scope evidence', async () => {
  const f = commercialCustomerBridgeFixture();
  f.setValue({ ...f.value, source: null });
  await expect(f.load(f.viewer, signal())).rejects.toThrow(/UNKNOWN/);
});
it('rejects getters and proxies without invoking supplied accessors/traps', async () => {
  const f = commercialCustomerBridgeFixture();
  let touched = false;
  const input = { ...f.viewer };
  Object.defineProperty(input, 'invoice', {
    get() {
      touched = true;
      throw Error('unsafe');
    },
    enumerable: true,
  });
  await expect(f.load(input, signal())).rejects.toThrow();
  expect(touched).toBe(false);
  const proxy = new Proxy(f.viewer, {
    ownKeys() {
      touched = true;
      throw Error('unsafe');
    },
  });
  await expect(f.load(proxy, signal())).rejects.toThrow();
  expect(touched).toBe(false);
});
it('context edits while the reader waits deny rather than rebinding a later customer', async () => {
  const f = commercialCustomerBridgeFixture();
  let release!: (v: unknown) => void;
  f.port.readIssued = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const load = commercialCustomerReadProposal(f.auth, f.bearer, f.port, {
    enabled: true,
    mode: 'fictional-local',
  });
  const pending = load(f.viewer, signal());
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  f.viewer.customerName = 'Other customer';
  release(f.value);
  await expect(pending).rejects.toThrow(/UNKNOWN/);
});
it('bounded stalled reads abort and late resolution cannot return success', async () => {
  vi.useFakeTimers();
  const f = commercialCustomerBridgeFixture();
  let release!: (v: unknown) => void;
  f.port.readIssued = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const load = commercialCustomerReadProposal(f.auth, f.bearer, f.port, {
    enabled: true,
    mode: 'fictional-local',
  });
  const pending = load(f.viewer, signal());
  const denied = expect(pending).rejects.toThrow(/UNKNOWN/);
  await vi.advanceTimersByTimeAsync(5000);
  await denied;
  if (release) release(f.value);
  await vi.advanceTimersByTimeAsync(1);
});
it('client denies asserted financial states, receipt links and stale/cross-tenant content', async () => {
  const f = commercialCustomerBridgeFixture(),
    result = await f.load(f.viewer, signal());
  for (const status of [
    'UNPAID',
    'PARTIALLY_PAID',
    'PAID',
    'REFUNDED',
    'CANCELLED',
    'DISPUTED',
  ])
    expect(() =>
      commercialCustomerResponse(
        { ...result, payment: { ...result.payment, status } },
        f.viewer,
      ),
    ).toThrow();
  expect(() =>
    commercialCustomerResponse(
      {
        ...result,
        link: { ...result.link, href: 'https://example.invalid/pay' },
      },
      f.viewer,
    ),
  ).toThrow();
  expect(() =>
    commercialCustomerResponse(
      {
        ...result,
        invoice: { ...result.invoice, customerId: crypto.randomUUID() },
      },
      f.viewer,
    ),
  ).toThrow();
  expect(() =>
    commercialCustomerResponse(result, f.viewer, result.expiresAt),
  ).toThrow();
});
it('client pending/UNKNOWN clears old receipt and ignores aborted out-of-order results', async () => {
  const f = commercialCustomerBridgeFixture(),
    result = await f.load(f.viewer, signal());
  const resolvers: ((v: unknown) => void)[] = [];
  const c = new CommercialCustomerReadController(
    () => f.viewer,
    () => new Promise((resolve) => resolvers.push(resolve)),
    true,
  );
  const first = c.open();
  expect(c.getSnapshot().status).toBe('loading');
  const second = c.open();
  resolvers[1](result);
  await second;
  expect(c.getSnapshot().status).toBe('ready');
  resolvers[0]({ ...result, payment: { status: 'PAID' } });
  await first;
  expect(c.getSnapshot().status).toBe('ready');
  c.invalidate();
  expect(c.getSnapshot().status).toBe('unknown');
  const third = c.open();
  expect(c.getSnapshot().status).toBe('loading');
  resolvers[2](null);
  await third;
  expect(c.getSnapshot().status).toBe('unknown');
  c.close();
  await c.open();
  expect(c.getSnapshot().status).toBe('unknown');
});
it('client changed context hides old receipt even before another read', async () => {
  const f = commercialCustomerBridgeFixture(),
    result = await f.load(f.viewer, signal());
  const c = new CommercialCustomerReadController(
    () => f.viewer,
    async () => result,
    true,
  );
  await c.open();
  expect(c.getSnapshot().status).toBe('ready');
  f.viewer.invoice.customerId = crypto.randomUUID();
  expect(c.getSnapshot().status).toBe('unknown');
  await c.open();
  expect(c.getSnapshot().status).toBe('unknown');
  c.close();
});

it('Auth revocation during the final mapping await denies the already-read receipt', async () => {
  const f = commercialCustomerBridgeFixture(),
    original = f.port.authorize;
  f.port.authorize = async (...args) => {
    const mapping = await original(...args);
    if (f.calls.mapping === 3) f.setAuth(false);
    return mapping;
  };
  const load = commercialCustomerReadProposal(f.auth, f.bearer, f.port, {
    enabled: true,
    mode: 'fictional-local',
  });
  await expect(load(f.viewer, signal())).rejects.toThrow(/UNKNOWN/);
  expect(f.calls.source).toBe(2);
});

it('disabled client retains disabled controls and never inspects context or calls a reader', async () => {
  let touched = false;
  const c = new CommercialCustomerReadController(
    () => {
      touched = true;
      throw Error('disabled');
    },
    async () => {
      touched = true;
      throw Error('disabled');
    },
  );
  await c.open();
  expect(c.getSnapshot().status).toBe('disabled');
  c.close();
  expect(c.getSnapshot().status).toBe('disabled');
  expect(touched).toBe(false);
});
it('restored original context cannot resurrect an old receipt without an explicit new read', async () => {
  const f = commercialCustomerBridgeFixture();
  let reads = 0;
  const c = new CommercialCustomerReadController(
    () => f.viewer,
    async (input, abort) => {
      reads++;
      return f.load(input, abort);
    },
    true,
  );
  await c.open();
  expect(c.getSnapshot().status).toBe('ready');
  const original = f.viewer.invoice.customerId;
  f.viewer.invoice.customerId = crypto.randomUUID();
  expect(c.getSnapshot().status).toBe('unknown');
  f.viewer.invoice.customerId = original;
  expect(c.getSnapshot().status).toBe('unknown');
  expect(reads).toBe(1);
  await c.open();
  expect(c.getSnapshot().status).toBe('ready');
  expect(reads).toBe(2);
  c.close();
});
it('client context drift during a pending response clears loading instead of trapping the restored target', async () => {
  const f = commercialCustomerBridgeFixture(),
    result = await f.load(f.viewer, signal());
  let resolve!: (v: unknown) => void;
  const c = new CommercialCustomerReadController(
    () => f.viewer,
    () =>
      new Promise((done) => {
        resolve = done;
      }),
    true,
  );
  const pending = c.open();
  const original = f.viewer.invoice.customerId;
  f.viewer.invoice.customerId = crypto.randomUUID();
  resolve(result);
  await pending;
  f.viewer.invoice.customerId = original;
  expect(c.getSnapshot().status).toBe('unknown');
  c.close();
});
it('observed pending context drift cannot revive its old result after context restoration before resolution', async () => {
  const f = commercialCustomerBridgeFixture(),
    result = await f.load(f.viewer, signal());
  let resolve!: (v: unknown) => void;
  let pendingSignal: AbortSignal | undefined;
  const c = new CommercialCustomerReadController(
    () => f.viewer,
    (_input, abort) => {
      pendingSignal = abort;
      return new Promise((done) => {
        resolve = done;
      });
    },
    true,
  );
  let notifications = 0;
  const unsubscribe = c.subscribe(() => {
    notifications++;
  });
  const pending = c.open();
  const original = f.viewer.invoice.customerId;
  f.viewer.invoice.customerId = crypto.randomUUID();
  expect(c.getSnapshot().status).toBe('unknown');
  f.viewer.invoice.customerId = original;
  resolve(result);
  await pending;
  expect(c.getSnapshot().status).toBe('unknown');
  expect(pendingSignal?.aborted).toBe(true);
  expect(notifications).toBe(1); // no render-time notification or late-ready notification
  unsubscribe();
  c.close();
});

it('public customer target and port arguments contain no source hash; only the authenticated server mapping binds it', async () => {
  const f = commercialCustomerBridgeFixture(),
    originalAuthorize = f.port.authorize,
    originalRead = f.port.readIssued;
  const targets: unknown[] = [];
  f.port.authorize = async (...args) => {
    targets.push(args[1]);
    return originalAuthorize(...args);
  };
  f.port.readIssued = async (...args) => {
    targets.push(args[1]);
    return originalRead(...args);
  };
  const load = commercialCustomerReadProposal(f.auth, f.bearer, f.port, {
    enabled: true,
    mode: 'fictional-local',
  });
  const result = await load(f.viewer, signal());
  expect(commercialCustomerTarget(f.viewer)).toEqual(f.viewer);
  expect(JSON.stringify([f.viewer, targets, result])).not.toContain(
    'sourceHash',
  );
  expect(JSON.stringify([f.viewer, targets, result])).not.toContain(
    f.mapping.sourceHash,
  );
});
it('rejects a client-supplied private hash in target or response without granting source authority', async () => {
  const f = commercialCustomerBridgeFixture();
  const expanded = {
    ...f.viewer,
    invoice: { ...f.viewer.invoice, sourceHash: f.mapping.sourceHash },
  };
  expect(() => commercialCustomerTarget(expanded)).toThrow();
  expect(
    () =>
      new CommercialCustomerReadController(
        () => expanded,
        async () => null,
        true,
      ),
  ).toThrow();
  await expect(f.load(expanded, signal())).rejects.toThrow();
  expect(f.calls.auth).toBe(0);
  const result = await f.load(f.viewer, signal());
  expect(() =>
    commercialCustomerResponse(
      { ...result, sourceHash: f.mapping.sourceHash },
      f.viewer,
    ),
  ).toThrow();
  expect(() =>
    commercialCustomerResponse(
      {
        ...result,
        invoice: { ...result.invoice, sourceHash: f.mapping.sourceHash },
      },
      f.viewer,
    ),
  ).toThrow();
});
it.each(['', 'not-a-digest', 'A'.repeat(64)])(
  'rejects malformed private digest from the trusted mapping: %s',
  async (digest) => {
    const f = commercialCustomerBridgeFixture();
    f.mapping.sourceHash = digest;
    await expect(f.load(f.viewer, signal())).rejects.toThrow();
    expect(f.calls.auth).toBe(1);
    expect(f.calls.source).toBe(0);
  },
);
it('a valid but substituted server mapping digest cannot validate another issued source', async () => {
  const f = commercialCustomerBridgeFixture();
  f.mapping.sourceHash = 'c'.repeat(64);
  await expect(f.load(f.viewer, signal())).rejects.toThrow(/UNKNOWN/);
});
it('private source hash withdrawal after the first read denies rather than rebinding the retained record', async () => {
  const f = commercialCustomerBridgeFixture(),
    original = f.port.authorize;
  f.port.authorize = async (...args) => {
    const mapping = await original(...args);
    return f.calls.mapping === 3
      ? { ...(mapping as typeof f.mapping), sourceHash: 'c'.repeat(64) }
      : mapping;
  };
  const load = commercialCustomerReadProposal(f.auth, f.bearer, f.port, {
    enabled: true,
    mode: 'fictional-local',
  });
  await expect(load(f.viewer, signal())).rejects.toThrow(/UNKNOWN/);
  expect(f.calls.source).toBe(2);
});
