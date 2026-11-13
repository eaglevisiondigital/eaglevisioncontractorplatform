import { unitCommercialCaller } from './fixtures/commercial-caller-unit';
import { expect, it, vi } from 'vitest';
import {
  CommercialDraftClient,
  CommercialDraftUnknownError,
  type CommercialDraft,
  type DraftWrite,
} from '../server/invoices/commercial-draft-client';
import type { GatewaySql } from '../server/payments/postgres-store';

it.each(['customerId', 'locationId', 'sourceVersionId'] as const)(
  'cannot rebind original UNKNOWN receipt reconciliation to a different %s',
  async (field) => {
    const organizationId = crypto.randomUUID();
    const original: DraftWrite = {
      invoiceId: crypto.randomUUID(),
      customerId: crypto.randomUUID(),
      locationId: crypto.randomUUID(),
      sourceVersionId: crypto.randomUUID(),
      commandId: crypto.randomUUID(),
      expectedRevision: 0,
      title: 'Original fictional scope',
      memo: 'Original unfinished draft input',
    };
    const query = vi.fn(),
      actor = crypto.randomUUID();
    const bound = unitCommercialCaller(
      { query } as GatewaySql,
      actor,
      'a'.repeat(64),
    );
    const client = new CommercialDraftClient(
      bound.sql,
      organizationId,
      bound.caller,
    );
    query.mockRejectedValueOnce(Error('Lost acknowledgment'));
    await expect(client.create(original)).rejects.toBeInstanceOf(
      CommercialDraftUnknownError,
    );

    // A caller-selected replacement expectation is not the held original source.
    const changed = { ...original, [field]: crypto.randomUUID() };
    const response: CommercialDraft = {
      invoiceId: changed.invoiceId,
      organizationId,
      customerId: changed.customerId,
      locationId: changed.locationId,
      sourceVersionId: changed.sourceVersionId,
      revision: 1,
      title: changed.title,
      memo: changed.memo,
      currency: 'USD',
      amountMinor: 12345,
      sourceHash: 'b'.repeat(64),
      sourceCurrent: true,
      state: 'draft',
      receipt: {
        id: original.commandId,
        invoiceId: changed.invoiceId,
        organizationId,
        customerId: changed.customerId,
        sourceVersionId: changed.sourceVersionId,
        commandId: original.commandId,
        revision: 1,
        requestHash: 'a'.repeat(64),
        actorId: actor,
      },
    };
    query.mockResolvedValueOnce({ rows: [{ result: response }] });
    await expect(
      client.read(changed, original.commandId),
    ).rejects.toBeInstanceOf(CommercialDraftUnknownError);
    await expect(
      client.save({
        ...original,
        commandId: crypto.randomUUID(),
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(CommercialDraftUnknownError);
    expect(
      query.mock.calls.filter(([sql]) => String(sql).includes('_save(')),
    ).toHaveLength(0);
  },
);
