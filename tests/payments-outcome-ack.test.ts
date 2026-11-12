import { expect, it, vi } from 'vitest';
import { SandboxGateway, type SandboxIntent } from '../server/payments/sandbox';
import {
  SandboxRefundGateway,
  type SandboxRefund,
} from '../server/payments/refunds';
import { RestrictedSandboxStore } from '../server/payments/control-store';
import { ProviderControl } from '../server/providers/control';
import type { GatewaySql } from '../server/payments/postgres-store';
import { fictionalLaunchMerchants } from './fixtures/first-launch-merchants';

type Operation = 'capture' | 'refund';
function fixture(operation: Operation, finish: unknown, failure = false) {
  const merchant = fictionalLaunchMerchants(
    new Date(Date.now() + 60000).toISOString(),
  )[operation === 'capture' ? 0 : 1].merchant;
  const intent: SandboxIntent = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    invoiceId: crypto.randomUUID(),
    authorizationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    amountMinor: 1234,
    currency: 'USD',
    expiresAt: merchant.approvedUntil,
  };
  const refund: SandboxRefund = {
    ...intent,
    captureKey: crypto.randomUUID(),
    providerTransactionId: 'fictional_original',
  };
  let held = false;
  const query = vi.fn(async (_sql: string, params: unknown[] = []) => {
    expect(params.slice(0, 2)).toEqual([
      merchant.organizationId,
      merchant.merchantConfigId,
    ]);
    if (params[2] === 'reserve')
      return { rows: [{ result: { status: held ? 'unknown' : 'reserved' } }] };
    if (params[2] !== 'finish') throw Error('Unexpected SQL command');
    held = true;
    if (failure)
      throw Error('FICTIONAL private database connection and parameters');
    return { rows: [{ result: { status: finish } }] };
  });
  const store = new RestrictedSandboxStore(
    new ProviderControl({ query } as unknown as GatewaySql, {
      organizationId: merchant.organizationId,
      scopeId: merchant.merchantConfigId,
      service: 'payment',
    }),
  );
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({
      response: '1',
      id: 'fictional_result',
      amount: '12.34',
      currency: 'USD',
    }),
  );
  const capture = new SandboxGateway(
    merchant,
    { apiKey: 'fictional-only' },
    store,
    transport,
  );
  const gateway = new SandboxRefundGateway(
    merchant,
    { apiKey: 'fictional-only' },
    store,
    transport,
  );
  const run = () =>
    operation === 'capture'
      ? capture.capture(intent, { provider: 'nmi', value: 'fictional-token' })
      : gateway.refund(refund);
  return { run, query, transport };
}

it.each(
  (['capture', 'refund'] as const).flatMap((operation) =>
    [undefined, null, 'unknown', 'pending', {}, { status: 'recorded' }].map(
      (ack) => ({ operation, ack }),
    ),
  ),
)(
  'keeps $operation outcome UNKNOWN for unconfirmed finish acknowledgment $ack',
  async ({ operation, ack }) => {
    const f = fixture(operation, ack);
    await expect(f.run()).rejects.toThrow(/acknowledgment UNKNOWN/);
    expect(f.transport).toHaveBeenCalledTimes(1);
    expect(f.query.mock.calls.map((call) => call[1]?.[2])).toEqual([
      'reserve',
      'finish',
    ]);
    await expect(f.run()).rejects.toThrow(/reconciliation/);
    expect(f.transport).toHaveBeenCalledTimes(1);
  },
);
it.each(['capture', 'refund'] as const)(
  'withholds private $operation finish exceptions as UNKNOWN',
  async (operation) => {
    const f = fixture(operation, 'recorded', true);
    await expect(f.run()).rejects.toThrow(
      operation === 'capture'
        ? 'Payment acknowledgment UNKNOWN; reconcile original intent'
        : 'Refund acknowledgment UNKNOWN; reconcile original intent',
    );
    expect(f.transport).toHaveBeenCalledTimes(1);
    await expect(f.run()).rejects.toThrow(/reconciliation/);
    expect(f.transport).toHaveBeenCalledTimes(1);
  },
);
it.each(
  (['capture', 'refund'] as const).flatMap((operation) =>
    (['recorded', 'duplicate'] as const).map((ack) => ({ operation, ack })),
  ),
)(
  'retains $operation success only with explicit $ack completion',
  async ({ operation, ack }) => {
    const f = fixture(operation, ack);
    expect(await f.run()).toMatchObject({
      status: 'succeeded',
      transactionId: 'fictional_result',
      amountMinor: 1234,
      mode: 'sandbox',
    });
    expect(f.transport).toHaveBeenCalledTimes(1);
    expect(f.query.mock.calls.map((call) => call[1]?.[2])).toEqual([
      'reserve',
      'finish',
    ]);
  },
);
