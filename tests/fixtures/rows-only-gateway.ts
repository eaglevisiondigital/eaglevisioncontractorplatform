import type { GatewaySql } from '../../server/payments/postgres-store';
/** Test transport normalization only. Preserve the actual connection, query,
 * parameters, rows and errors; expose the existing own-method/rows-only port.
 * No SQL rewriting, execution retry, result repair or authority substitution.
 */
export function rowsOnlyGateway(connection: GatewaySql): GatewaySql {
  const execute = connection.query.bind(connection) as GatewaySql['query'];
  return {
    async query<T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) {
      const result = await execute<T>(sql, params);
      return { rows: result.rows };
    },
  };
}
