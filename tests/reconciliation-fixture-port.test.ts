import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type { GatewaySql } from '../server/payments/postgres-store';
import { rowsOnlyGateway } from './fixtures/rows-only-gateway';
it('adapts an inherited query method to the existing own data-method port without changing its connection', async () => {
  const rows = [{ receipt: { outcome: 'UNKNOWN' } }];
  const call = vi.fn(function (
    this: { marker: string },
    sql: string,
    params?: unknown[],
  ) {
    expect(this.marker).toBe('SAME CONNECTION');
    expect(sql).toBe('select unchanged');
    expect(params).toEqual([1]);
    return Promise.resolve({
      rows,
      fields: ['PGLITE METADATA'],
      command: 'SELECT',
    });
  });
  const connection = Object.create({ query: call }) as GatewaySql & {
    marker: string;
  };
  connection.marker = 'SAME CONNECTION';
  expect(Object.hasOwn(connection, 'query')).toBe(false);
  const port = rowsOnlyGateway(connection);
  expect(Object.getOwnPropertyDescriptor(port, 'query')?.value).toBeTypeOf(
    'function',
  );
  const result = await port.query('select unchanged', [1]);
  expect(result).toEqual({ rows });
  expect(result.rows).toBe(rows);
  expect(call).toHaveBeenCalledTimes(1);
});
it('captures the original method and forwards the identical SQL and parameter object without retry', async () => {
  const parameters = ['unchanged'],
    first = vi.fn(async (sql: string, params?: unknown[]) => {
      expect(sql).toBe('select exact');
      expect(params).toBe(parameters);
      return { rows: [] };
    }),
    next = vi.fn(async () => ({ rows: [{ forbidden: true }] }));
  const connection = { query: first } as GatewaySql;
  const port = rowsOnlyGateway(connection);
  connection.query = next as GatewaySql['query'];
  expect(await port.query('select exact', parameters)).toEqual({ rows: [] });
  expect(first).toHaveBeenCalledExactlyOnceWith('select exact', parameters);
  expect(first.mock.calls[0][1]).toBe(parameters);
  expect(next).not.toHaveBeenCalled();
});
it('does not catch SQL permission errors or retry the failed read', async () => {
  const error = Error('EXACT SYNTHETIC DENIAL');
  const query = vi.fn(async () => {
    throw error;
  });
  const port = rowsOnlyGateway({ query });
  await expect(port.query('select denied')).rejects.toBe(error);
  expect(query).toHaveBeenCalledTimes(1);
});
it.each([
  { rows: [] },
  {
    rows: [
      { receipt: { outcome: 'UNKNOWN' } },
      { receipt: { outcome: 'UNKNOWN' } },
    ],
  },
  {
    rows: [
      {
        receipt: { outcome: 'UNKNOWN', private: 'NOT SANITIZED INTO SUCCESS' },
      },
    ],
  },
])('never fabricates, filters or repairs rows', async ({ rows }) => {
  const port = rowsOnlyGateway({
    query: async <T extends Record<string, unknown>>() => ({
      rows: rows as unknown as T[],
    }),
  });
  expect((await port.query('select original')).rows).toBe(rows);
});
it('changes only the fixture boundary and retains all original 20 identities/assertions/budgets/skip bytes', () => {
  const current = readFileSync(
    'tests/database/reconciliation-receipt-proposal.test.ts',
    'utf8',
  );
  const original = current
    .replace(
      "import { rowsOnlyGateway as rows } from '../fixtures/rows-only-gateway';\n",
      '',
    )
    .replaceAll('rows(c)', 'c')
    .replaceAll('rows(db)', 'db');
  expect(current.match(/rows\((?:c|db)\)/g) || []).toHaveLength(4);
  expect(createHash('sha256').update(original).digest('hex')).toBe(
    '4aaa95857cadca3daea9ec50c0ddc3ececacbd7718cc4fae7e3254061f7616e4',
  );
  expect(
    createHash('sha256')
      .update(
        readFileSync('proposals/payment-reconciliation-receipt/reader.ts'),
      )
      .digest('hex'),
  ).toBe('78a451dee2e9b47d7e2fc171c9d369c89a2e4bd51dbecaf611089c2c3d5b0854');
  expect(
    createHash('sha256')
      .update(
        readFileSync(
          'proposals/payment-reconciliation-receipt/receipt.proposed.sql',
        ),
      )
      .digest('hex'),
  ).toBe('07311997e4759b26e048ef55ee397acfc8e9fa19410133c4b627c348ea4e0ebe');
});
