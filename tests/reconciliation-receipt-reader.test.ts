import { afterEach, expect, it, vi } from 'vitest';
import type { GatewaySql } from '../server/payments/postgres-store';
import {
  ProposedReconciliationReceiptReader,
  type OriginalReconciliation,
} from '../proposals/payment-reconciliation-receipt/reader';
import { fictionalLaunchMerchants } from './fixtures/first-launch-merchants';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function fixture(index = 0, remainingMs = 60000) {
  const merchant = fictionalLaunchMerchants(
    new Date(Date.now() + remainingMs).toISOString(),
  )[index].merchant;
  const original: OriginalReconciliation = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    provider: 'nmi',
    mode: 'sandbox',
    reportId: crypto.randomUUID(),
    evidenceDigest: 'a'.repeat(64),
    snapshotDigest: 'b'.repeat(64),
  };
  const value = {
    outcome: 'RECORDED',
    ...original,
    currency: 'USD',
    recordedAt: new Date().toISOString(),
    report: {
      missing: 0,
      unexpected: 0,
      conflicts: 0,
      unresolved: 0,
      expectedNetMinor: '0',
      reportedNetMinor: '0',
      balanced: true,
    },
  };
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    expect(sql).toMatch(/^select private\.sandbox_reconciliation_receipt\(/);
    expect(params).toHaveLength(6);
    return { rows: [{ receipt: value }] };
  });
  const connection = { query } as unknown as GatewaySql;
  const reader = new ProposedReconciliationReceiptReader(connection, merchant, {
    testOnly: true,
  });
  return { merchant, original, value, query, connection, reader };
}
it.each([0, 1])(
  'reads only merchant%i exact original aggregate receipt without paid/settlement/current-ledger or hold-release authority',
  async (index) => {
    const s = fixture(index);
    const result = await s.reader.read(s.original);
    expect(result.outcome).toBe('RECORDED');
    expect(result).toMatchObject({
      financialEffect: false,
      settlement: 'UNVERIFIED',
      holdRelease: false,
      currentLedgerMatch: 'NOT_ASSERTED',
    });
    expect(s.query).toHaveBeenCalledExactlyOnceWith(
      'select private.sandbox_reconciliation_receipt($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text,$6::text) receipt',
      [
        s.original.organizationId,
        s.original.merchantConfigId,
        'nmi',
        s.original.reportId,
        s.original.evidenceDigest,
        s.original.snapshotDigest,
      ],
    );
    expect(Object.isFrozen(result)).toBe(true);
    if (result.outcome === 'RECORDED') {
      expect(
        Object.isFrozen(result.receipt) &&
          Object.isFrozen(result.receipt.report),
      ).toBe(true);
      expect(result.receipt.report).toEqual(s.value.report);
    }
  },
);
it.each([
  'organizationId',
  'merchantConfigId',
  'provider',
  'mode',
  'reportId',
  'evidenceDigest',
  'snapshotDigest',
] as const)(
  'a substituted %s is never accepted as the original receipt',
  async (key) => {
    const s = fixture();
    Object.assign(s.value, {
      [key]: key.endsWith('Digest')
        ? '0'.repeat(64)
        : key === 'provider'
          ? 'authorize_net'
          : key === 'mode'
            ? 'production'
            : crypto.randomUUID(),
    });
    expect((await s.reader.read(s.original)).outcome).toBe('UNKNOWN');
  },
);
it.each(['organizationId', 'merchantConfigId', 'provider', 'mode'] as const)(
  'wrong requested %s never reaches the SQL port',
  async (key) => {
    const s = fixture();
    const original = {
      ...s.original,
      [key]:
        key === 'provider'
          ? 'authorize_net'
          : key === 'mode'
            ? 'production'
            : crypto.randomUUID(),
    } as OriginalReconciliation;
    expect((await s.reader.read(original)).outcome).toBe('UNKNOWN');
    expect(s.query).not.toHaveBeenCalled();
  },
);
it('preserves UUID semantic identity under case variation instead of replacing or rerunning the report', async () => {
  const s = fixture();
  const result = await s.reader.read({
    ...s.original,
    reportId: s.original.reportId.toUpperCase(),
  });
  expect(result.outcome).toBe('RECORDED');
  expect(s.query.mock.calls[0][1]?.[3]).toBe(s.original.reportId);
});
it('snapshots the original tuple before await and captures the port method before later substitution', async () => {
  const s = fixture();
  let finish!: (x: unknown) => void;
  s.query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
  );
  const input = { ...s.original };
  const pending = s.reader.read(input);
  input.reportId = crypto.randomUUID();
  s.connection.query = vi.fn(async () => {
    throw Error('REPLACED');
  }) as GatewaySql['query'];
  finish({ rows: [{ receipt: s.value }] });
  expect((await pending).outcome).toBe('RECORDED');
  expect(s.connection.query).not.toHaveBeenCalled();
});
it.each([
  'extra',
  'currency',
  'missing',
  'negative',
  'fraction',
  'contradiction',
  'invalid-net',
  'negative-zero',
  'oversize-net',
  'future',
  'duplicate-row',
  'missing-row',
  'unknown-extra',
] as const)(
  'malformed %s SQL evidence stays UNKNOWN with no raw response leak',
  async (kind) => {
    const s = fixture();
    let response: unknown = { rows: [{ receipt: s.value }] };
    if (kind === 'currency') s.value.currency = 'EUR';
    if (kind === 'extra')
      Object.assign(s.value, { privatePayload: 'FORBIDDEN' });
    if (kind === 'missing')
      delete (s.value.report as Partial<typeof s.value.report>).balanced;
    if (kind === 'negative') s.value.report.missing = -1;
    if (kind === 'fraction') s.value.report.unresolved = 0.1;
    if (kind === 'contradiction') s.value.report.missing = 1;
    if (kind === 'invalid-net') s.value.report.expectedNetMinor = 'PRIVATE';
    if (kind === 'negative-zero') s.value.report.expectedNetMinor = '-0';
    if (kind === 'oversize-net')
      s.value.report.expectedNetMinor = '9000000000000001';
    if (kind === 'future')
      s.value.recordedAt = new Date(Date.now() + 60000).toISOString();
    if (kind === 'duplicate-row')
      response = { rows: [{ receipt: s.value }, { receipt: s.value }] };
    if (kind === 'missing-row') response = { rows: [] };
    if (kind === 'unknown-extra')
      response = {
        rows: [
          { receipt: { outcome: 'UNKNOWN', privatePayload: 'FORBIDDEN' } },
        ],
      };
    s.query.mockResolvedValueOnce(response as never);
    const result = await s.reader.read(s.original);
    expect(result.outcome).toBe('UNKNOWN');
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|FORBIDDEN|reportId|report|receipt/,
    );
  },
);
it('missing/unavailable evidence does not become proof of absence, decline or a replacement-report permission', async () => {
  const s = fixture();
  s.query.mockResolvedValueOnce({
    rows: [{ receipt: { outcome: 'UNKNOWN' } }],
  } as never);
  expect(await s.reader.read(s.original)).toEqual({
    outcome: 'UNKNOWN',
    financialEffect: false,
    settlement: 'UNVERIFIED',
    holdRelease: false,
    currentLedgerMatch: 'NOT_ASSERTED',
  });
  s.query.mockRejectedValueOnce(Error('SENSITIVE_DATABASE_DETAIL'));
  expect((await s.reader.read(s.original)).outcome).toBe('UNKNOWN');
});
it('does not execute data getters or proxy traps in the retained identity or SQL response', async () => {
  const s = fixture();
  const invoked = vi.fn(() => {
    throw Error('EXECUTABLE INPUT');
  });
  const original = { ...s.original };
  Object.defineProperty(original, 'reportId', { get: invoked });
  expect((await s.reader.read(original)).outcome).toBe('UNKNOWN');
  expect(s.query).not.toHaveBeenCalled();
  s.query.mockResolvedValueOnce({
    rows: [
      {
        receipt: new Proxy(s.value, {
          ownKeys: invoked,
          getOwnPropertyDescriptor: invoked,
        }),
      },
    ],
  } as never);
  expect((await s.reader.read(s.original)).outcome).toBe('UNKNOWN');
  expect(invoked).not.toHaveBeenCalled();
});
it.each(['cancel', 'deadline', 'approval-expiry'] as const)(
  '%s while awaiting the exact read suppresses late evidence without replay',
  async (kind) => {
    vi.useFakeTimers();
    const s = fixture(0, kind === 'approval-expiry' ? 1000 : 60000);
    let finish!: (x: unknown) => void;
    s.query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }) as never,
    );
    const abort = new AbortController();
    const pending = s.reader.read(s.original, abort.signal);
    if (kind === 'cancel') abort.abort();
    else await vi.advanceTimersByTimeAsync(kind === 'deadline' ? 5000 : 1000);
    expect((await pending).outcome).toBe('UNKNOWN');
    finish({ rows: [{ receipt: s.value }] });
    await vi.advanceTimersByTimeAsync(1);
    expect(s.query).toHaveBeenCalledOnce();
  },
);
it('pre-cancelled reads perform no SQL', async () => {
  const s = fixture();
  const abort = new AbortController();
  abort.abort();
  expect((await s.reader.read(s.original, abort.signal)).outcome).toBe(
    'UNKNOWN',
  );
  expect(s.query).not.toHaveBeenCalled();
});
it('accepts historical unresolved totals only as historical aggregate evidence', async () => {
  const s = fixture();
  Object.assign(s.value.report, {
    unresolved: 1,
    balanced: false,
    expectedNetMinor: '4000',
    reportedNetMinor: '0',
  });
  const result = await s.reader.read(s.original);
  expect(result.outcome).toBe('RECORDED');
  expect(result).toMatchObject({
    holdRelease: false,
    currentLedgerMatch: 'NOT_ASSERTED',
    financialEffect: false,
  });
});
