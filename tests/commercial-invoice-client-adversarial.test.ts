import { expect, it, vi } from 'vitest';
import {
  CommercialDraftClient,
  type CommercialDraft,
  type DraftWrite,
} from '../server/invoices/commercial-draft-client';
import type { GatewaySql } from '../server/payments/postgres-store';

function fixture() {
  const organizationId = crypto.randomUUID();
  const write: DraftWrite = {
    invoiceId: crypto.randomUUID(),
    customerId: crypto.randomUUID(),
    locationId: null,
    sourceVersionId: crypto.randomUUID(),
    commandId: crypto.randomUUID(),
    expectedRevision: 0,
    title: 'Fictional draft only',
    memo: '',
  };
  const value: CommercialDraft = {
    invoiceId: write.invoiceId,
    organizationId,
    customerId: write.customerId,
    locationId: write.locationId,
    sourceVersionId: write.sourceVersionId,
    revision: 1,
    title: write.title,
    memo: write.memo,
    currency: 'USD',
    amountMinor: 100,
    sourceHash: 'a'.repeat(64),
    sourceCurrent: true,
    state: 'draft',
    receipt: {
      id: write.commandId,
      invoiceId: write.invoiceId,
      organizationId,
      customerId: write.customerId,
      sourceVersionId: write.sourceVersionId,
      commandId: write.commandId,
      revision: 1,
      requestHash: 'b'.repeat(64),
      actorId: crypto.randomUUID(),
    },
  };
  const query = vi.fn(async () => ({ rows: [{ result: value }] }));
  const client = new CommercialDraftClient(
    { query } as GatewaySql,
    organizationId,
  );
  return { client, write, value, query };
}

it.each(['create', 'read'] as const)(
  'withholds a foreign-currency %s result under the proposed USD-only source contract',
  async (operation) => {
    const f = fixture();
    f.value.currency = 'EUR';
    const result =
      operation === 'create'
        ? f.client.create(f.write)
        : f.client.read(f.write, f.write.commandId);
    await expect(result).rejects.toThrow('UNKNOWN');
    expect(f.query).toHaveBeenCalledTimes(1);
    if (operation === 'create') {
      await expect(
        f.client.create({ ...f.write, commandId: crypto.randomUUID() }),
      ).rejects.toThrow('UNKNOWN');
      expect(f.query).toHaveBeenCalledTimes(1);
    }
  },
);

it('retains an explicitly recorded zero USD draft without inferring payment or debt', async () => {
  const f = fixture();
  f.value.amountMinor = 0;
  expect(await f.client.create(f.write)).toMatchObject({
    currency: 'USD',
    amountMinor: 0,
    state: 'draft',
  });
  expect(f.query).toHaveBeenCalledTimes(1);
});

it('rejects staff-private additions inside the immutable receipt projection', async () => {
  const f = fixture();
  Object.assign(f.value.receipt, { privateCost: 'Fictional private value' });
  await expect(f.client.create(f.write)).rejects.toThrow('UNKNOWN');
  await expect(
    f.client.create({ ...f.write, commandId: crypto.randomUUID() }),
  ).rejects.toThrow('UNKNOWN');
  expect(f.query).toHaveBeenCalledTimes(1);
});

it.each(['create', 'read'] as const)(
  'rejects a substituted receipt ID on %s under the exact command-ID receipt contract',
  async (operation) => {
    const f = fixture();
    f.value.receipt.id = crypto.randomUUID();
    await expect(
      operation === 'create'
        ? f.client.create(f.write)
        : f.client.read(f.write, f.write.commandId),
    ).rejects.toThrow('UNKNOWN');
    expect(f.query).toHaveBeenCalledTimes(1);
  },
);
