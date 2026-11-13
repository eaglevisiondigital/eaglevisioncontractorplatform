import { unitCommercialCaller } from './fixtures/commercial-caller-unit';
import { describe, expect, it, vi } from 'vitest';
import {
  CommercialDraftClient,
  CommercialDraftUnknownError,
  type CommercialDraft,
  type DraftWrite,
} from '../server/invoices/commercial-draft-client';
import type { GatewaySql } from '../server/payments/postgres-store';

const org = crypto.randomUUID(),
  actor = crypto.randomUUID();
const input = (): DraftWrite => ({
  invoiceId: crypto.randomUUID(),
  customerId: crypto.randomUUID(),
  locationId: crypto.randomUUID(),
  sourceVersionId: crypto.randomUUID(),
  commandId: crypto.randomUUID(),
  expectedRevision: 0,
  title: 'Recorded estimate scope',
  memo: 'Draft only; review required.',
});
function result(v: DraftWrite): CommercialDraft {
  return {
    invoiceId: v.invoiceId,
    organizationId: org,
    customerId: v.customerId,
    locationId: v.locationId,
    sourceVersionId: v.sourceVersionId,
    revision: v.expectedRevision + 1,
    title: v.title,
    memo: v.memo,
    currency: 'USD',
    amountMinor: 12345,
    sourceHash: 'b'.repeat(64),
    sourceCurrent: true,
    state: 'draft',
    receipt: {
      id: v.commandId,
      invoiceId: v.invoiceId,
      organizationId: org,
      customerId: v.customerId,
      sourceVersionId: v.sourceVersionId,
      commandId: v.commandId,
      revision: v.expectedRevision + 1,
      requestHash: 'a'.repeat(64),
      actorId: actor,
    },
  };
}
function setup() {
  const query = vi.fn();
  const bound = unitCommercialCaller(
    { query } as GatewaySql,
    actor,
    'a'.repeat(64),
  );
  return {
    query,
    client: new CommercialDraftClient(bound.sql, org, bound.caller),
  };
}
describe('unwired commercial draft client', () => {
  it('creates, saves and reopens exact revisions through the proposed SQL port', async () => {
    const { query, client } = setup(),
      first = input();
    query.mockResolvedValueOnce({ rows: [{ result: result(first) }] });
    expect((await client.create(first)).revision).toBe(1);
    const second = {
      ...first,
      commandId: crypto.randomUUID(),
      expectedRevision: 1,
      title: 'Reviewed title',
    };
    query.mockResolvedValueOnce({ rows: [{ result: result(second) }] });
    expect((await client.save(second)).revision).toBe(2);
    query.mockResolvedValueOnce({ rows: [{ result: result(second) }] });
    expect(await client.read(second)).toEqual(resultShape(second));
    expect(query.mock.calls.map((c) => c[0])).toEqual([
      expect.stringContaining('commercial_invoice_draft_create'),
      expect.stringContaining('commercial_invoice_draft_save'),
      expect.stringContaining('commercial_invoice_draft_read'),
    ]);
    expect(query.mock.calls[1][1]).toEqual([
      org,
      first.invoiceId,
      second.commandId,
      1,
      first.customerId,
      first.locationId,
      first.sourceVersionId,
      second.title,
      second.memo,
    ]);
  });
  it('reserves before await and blocks concurrent duplicate or replacement commands', async () => {
    const { query, client } = setup(),
      v = input();
    let complete!: (value: unknown) => void;
    query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = client.create(v);
    await expect(client.create(v)).rejects.toBeInstanceOf(
      CommercialDraftUnknownError,
    );
    await expect(
      client.create({ ...v, commandId: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(CommercialDraftUnknownError);
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
    complete({ rows: [{ result: result(v) }] });
    await pending;
    expect(query).toHaveBeenCalledTimes(1);
    await expect(client.create(v)).rejects.toBeInstanceOf(
      CommercialDraftUnknownError,
    );
  });
  it('snapshots unfinished inputs before a pending acknowledgment', async () => {
    const { query, client } = setup(),
      v = input(),
      original = { ...v };
    let complete!: (value: unknown) => void;
    query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = client.create(v);
    v.title = 'Changed after dispatch';
    v.sourceVersionId = crypto.randomUUID();
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
    complete({ rows: [{ result: result(original) }] });
    expect((await pending).title).toBe(original.title);
    expect(query.mock.calls[0][1][5]).toBe(original.sourceVersionId);
  });
  it('withholds raw errors and reconciles a lost acknowledgment by exact receipt without replay', async () => {
    const { query, client } = setup(),
      v = input();
    query.mockRejectedValueOnce(Error('PRIVATE database detail'));
    await expect(client.create(v)).rejects.toThrow('outcome UNKNOWN');
    query.mockResolvedValueOnce({ rows: [{ result: result(v) }] });
    expect((await client.read(v, v.commandId)).receipt.commandId).toBe(
      v.commandId,
    );
    await expect(client.create(v)).rejects.toBeInstanceOf(
      CommercialDraftUnknownError,
    );
    const next = {
      ...v,
      commandId: crypto.randomUUID(),
      expectedRevision: 1,
      memo: 'Explicit later revision',
    };
    query.mockResolvedValueOnce({ rows: [{ result: result(next) }] });
    expect((await client.save(next)).revision).toBe(2);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain('_read(');
  });
  it('a current-head read cannot clear an uncertain original-command hold', async () => {
    const { query, client } = setup(),
      v = input();
    query.mockRejectedValueOnce(Error('lost ack'));
    await expect(client.create(v)).rejects.toThrow('UNKNOWN');
    query.mockResolvedValueOnce({ rows: [{ result: result(v) }] });
    await client.read(v);
    await expect(
      client.save({
        ...v,
        commandId: crypto.randomUUID(),
        expectedRevision: 1,
      }),
    ).rejects.toThrow('UNKNOWN');
    expect(query).toHaveBeenCalledTimes(2);
  });
  for (const [name, change] of [
    [
      'foreign tenant',
      (r: CommercialDraft) => {
        r.organizationId = crypto.randomUUID();
      },
    ],
    [
      'foreign customer',
      (r: CommercialDraft) => {
        r.customerId = crypto.randomUUID();
      },
    ],
    [
      'foreign property',
      (r: CommercialDraft) => {
        r.locationId = crypto.randomUUID();
      },
    ],
    [
      'different source version',
      (r: CommercialDraft) => {
        r.sourceVersionId = crypto.randomUUID();
      },
    ],
    [
      'receipt substitution',
      (r: CommercialDraft) => {
        r.receipt.invoiceId = crypto.randomUUID();
      },
    ],
    [
      'stale revision',
      (r: CommercialDraft) => {
        r.revision = 2;
        r.receipt.revision = 2;
      },
    ],
    [
      'changed saved inputs',
      (r: CommercialDraft) => {
        r.memo = 'Unexpected replacement';
      },
    ],
    [
      'private fields',
      (r: CommercialDraft) => {
        Object.assign(r, { privateCost: 999 });
      },
    ],
    [
      'invalid amount',
      (r: CommercialDraft) => {
        r.amountMinor = Number.NaN;
      },
    ],
  ] as const) {
    it(`denies ${name} in a mutation acknowledgment and keeps its hold`, async () => {
      const { query, client } = setup(),
        v = input(),
        r = result(v);
      change(r);
      query.mockResolvedValueOnce({ rows: [{ result: r }] });
      await expect(client.create(v)).rejects.toThrow('UNKNOWN');
      await expect(
        client.create({ ...v, commandId: crypto.randomUUID() }),
      ).rejects.toThrow('UNKNOWN');
      expect(query).toHaveBeenCalledTimes(1);
    });
  }
  it('does not infer non-commit from absent or duplicate acknowledgment rows', async () => {
    for (const rows of [[], [{ result: {} }, { result: {} }]]) {
      const { query, client } = setup(),
        v = input();
      query.mockResolvedValueOnce({ rows });
      await expect(client.create(v)).rejects.toThrow('UNKNOWN');
      await expect(client.create(v)).rejects.toThrow('UNKNOWN');
      expect(query).toHaveBeenCalledTimes(1);
    }
  });
  it('rejects invalid inputs before invoking SQL', async () => {
    const { query, client } = setup();
    await expect(
      client.create({ ...input(), expectedRevision: 1 }),
    ).rejects.toThrow('Valid draft');
    await expect(client.save(input())).rejects.toThrow('Valid draft');
    await expect(
      client.create({ ...input(), sourceVersionId: 'untrusted' }),
    ).rejects.toThrow('Exact invoice');
    expect(query).not.toHaveBeenCalled();
  });
  it('can reopen stale source evidence without treating it as a successful save', async () => {
    const { query, client } = setup(),
      v = input(),
      r = result(v);
    r.sourceCurrent = false;
    query.mockResolvedValueOnce({ rows: [{ result: r }] });
    expect((await client.read(v, v.commandId)).sourceCurrent).toBe(false);
    query.mockResolvedValueOnce({ rows: [{ result: r }] });
    await expect(client.create(v)).rejects.toThrow('UNKNOWN');
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('a different receipt cannot resolve the original uncertain command', async () => {
    const { query, client } = setup(),
      v = input(),
      r = result(v);
    query.mockRejectedValueOnce(Error('lost acknowledgment'));
    await expect(client.create(v)).rejects.toThrow('UNKNOWN');
    r.receipt.commandId = crypto.randomUUID();
    query.mockResolvedValueOnce({ rows: [{ result: r }] });
    await expect(client.read(v, v.commandId)).rejects.toThrow('UNKNOWN');
    await expect(
      client.create({ ...v, commandId: crypto.randomUUID() }),
    ).rejects.toThrow('UNKNOWN');
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('an uncertain source cannot be retried under replacement invoice and command IDs', async () => {
    const { query, client } = setup(),
      v = input();
    query.mockRejectedValueOnce(Error('acknowledgment lost'));
    await expect(client.create(v)).rejects.toThrow('UNKNOWN');
    await expect(
      client.create({
        ...v,
        invoiceId: crypto.randomUUID(),
        commandId: crypto.randomUUID(),
      }),
    ).rejects.toThrow('UNKNOWN');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
function resultShape(v: DraftWrite) {
  return {
    ...result(v),
    receipt: { ...result(v).receipt, actorId: expect.any(String) },
  };
}
