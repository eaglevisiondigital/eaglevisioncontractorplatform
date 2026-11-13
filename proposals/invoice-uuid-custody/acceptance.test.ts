import { expect, it, vi } from 'vitest';
import {
  CommercialDraftClient,
  CommercialDraftUnknownError,
  type DraftWrite,
} from '../server/invoices/commercial-draft-client';
import type { GatewaySql } from '../server/payments/postgres-store';
const original = (): DraftWrite => ({
  invoiceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  customerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  locationId: null,
  sourceVersionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  commandId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  expectedRevision: 0,
  title: 'Fictional invoice',
  memo: '',
});
it('does not replay a lost-ACK command under alternate UUID casing', async () => {
  const query = vi.fn().mockRejectedValue(Error('Lost ACK'));
  const client = new CommercialDraftClient(
    { query } as GatewaySql,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  );
  const v = original();
  await expect(client.create(v)).rejects.toBeInstanceOf(
    CommercialDraftUnknownError,
  );
  await expect(
    client.create({
      ...v,
      invoiceId: v.invoiceId.toUpperCase(),
      sourceVersionId: v.sourceVersionId.toUpperCase(),
      commandId: v.commandId.toUpperCase(),
    }),
  ).rejects.toThrow();
  expect(query).toHaveBeenCalledTimes(1);
});
it.each([
  'invoiceId',
  'customerId',
  'locationId',
  'sourceVersionId',
  'commandId',
] as const)('rejects noncanonical %s before any SQL request', async (field) => {
  const query = vi.fn().mockRejectedValue(Error('Must not dispatch'));
  const client = new CommercialDraftClient(
    { query } as GatewaySql,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  );
  const v = {
    ...original(),
    locationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  };
  await expect(
    client.create({ ...v, [field]: v[field].toUpperCase() }),
  ).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
});
it('rejects a noncanonical organization before constructing a caller', () => {
  const query = vi.fn();
  expect(
    () =>
      new CommercialDraftClient(
        { query } as GatewaySql,
        'EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE',
      ),
  ).toThrow();
  expect(query).not.toHaveBeenCalled();
});
it('rejects noncanonical read identity and command before an SQL read', async () => {
  const query = vi.fn().mockRejectedValue(Error('Must not dispatch'));
  const client = new CommercialDraftClient(
    { query } as GatewaySql,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  );
  const v = original();
  await expect(
    client.read({ ...v, invoiceId: v.invoiceId.toUpperCase() }),
  ).rejects.toThrow();
  await expect(client.read(v, v.commandId.toUpperCase())).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
});
function response(
  v: DraftWrite,
  organizationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
) {
  return {
    invoiceId: v.invoiceId,
    customerId: v.customerId,
    locationId: v.locationId,
    sourceVersionId: v.sourceVersionId,
    organizationId,
    revision: v.expectedRevision + 1,
    title: v.title,
    memo: v.memo,
    currency: 'USD',
    amountMinor: 1234,
    sourceHash: 'a'.repeat(64),
    sourceCurrent: true,
    state: 'draft',
    receipt: {
      id: v.commandId,
      invoiceId: v.invoiceId,
      customerId: v.customerId,
      sourceVersionId: v.sourceVersionId,
      organizationId,
      commandId: v.commandId,
      revision: v.expectedRevision + 1,
      requestHash: 'b'.repeat(64),
      actorId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    },
  };
}
it('retains lowercase create/save/reopen and successful-command duplicate denial', async () => {
  const query = vi.fn(),
    client = new CommercialDraftClient(
      { query } as GatewaySql,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ),
    v = original();
  query.mockResolvedValueOnce({ rows: [{ result: response(v) }] });
  expect((await client.create(v)).revision).toBe(1);
  const next = {
    ...v,
    commandId: '11111111-1111-4111-8111-111111111111',
    expectedRevision: 1,
    title: 'Revised fictional scope',
  };
  query.mockResolvedValueOnce({ rows: [{ result: response(next) }] });
  expect((await client.save(next)).revision).toBe(2);
  query.mockResolvedValueOnce({ rows: [{ result: response(next) }] });
  expect((await client.read(next, next.commandId)).title).toBe(next.title);
  await expect(client.save(next)).rejects.toBeInstanceOf(
    CommercialDraftUnknownError,
  );
  expect(query).toHaveBeenCalledTimes(3);
});
it('retains UNKNOWN on wrong-tenant receipt without clearing the original hold', async () => {
  const query = vi.fn(),
    client = new CommercialDraftClient(
      { query } as GatewaySql,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ),
    v = original();
  query.mockResolvedValueOnce({
    rows: [{ result: response(v, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') }],
  });
  await expect(client.create(v)).rejects.toBeInstanceOf(
    CommercialDraftUnknownError,
  );
  await expect(
    client.create({ ...v, commandId: crypto.randomUUID() }),
  ).rejects.toBeInstanceOf(CommercialDraftUnknownError);
  expect(query).toHaveBeenCalledTimes(1);
});
