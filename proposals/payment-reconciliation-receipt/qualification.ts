import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const pins = Object.freeze({
  'proposals/commercial-payment-capacity/qualification.ts':
    'ff691a52f531327da290e66cb85180c480fff95d5027c2e6e66a163bf08ecd5c',
  'proposals/payment-reconciliation-receipt/receipt.proposed.sql':
    '07311997e4759b26e048ef55ee397acfc8e9fa19410133c4b627c348ea4e0ebe',
  'proposals/payment-reconciliation-receipt/reader.ts':
    '78a451dee2e9b47d7e2fc171c9d369c89a2e4bd51dbecaf611089c2c3d5b0854',
});
const denied = () =>
  Error('Exact unapplied reconciliation receipt proposal required');
/** Source capture only; reuses the accepted parent qualifier and existing schema.
 * Never a connection, installer, replay or operational-authority factory.
 */
export async function captureReconciliationReceiptProposal({
  read = readFileSync,
  stat = lstatSync,
}: { read?: typeof readFileSync; stat?: typeof lstatSync } = {}) {
  const checked = (path: string, hash: string) => {
    const parts = path.split('/');
    const verify = () => {
      for (let i = 1; i <= parts.length; i++) {
        const s = stat(parts.slice(0, i).join('/'));
        if (
          s.isSymbolicLink() ||
          (i < parts.length && !s.isDirectory()) ||
          (i === parts.length && (!s.isFile() || (s.mode & 0o777) !== 0o644))
        )
          throw denied();
      }
    };
    verify();
    const bytes = Buffer.from(read(path));
    if (createHash('sha256').update(bytes).digest('hex') !== hash)
      throw denied();
    verify();
    return bytes;
  };
  const captured = new Map(
    Object.entries(pins).map(([path, hash]) => [path, checked(path, hash)]),
  );
  const helper = await import(
    'data:text/javascript;base64,' +
      Buffer.from(
        stripTypeScriptTypes(
          captured
            .get('proposals/commercial-payment-capacity/qualification.ts')!
            .toString('utf8'),
          { mode: 'strip' },
        ),
      ).toString('base64')
  );
  for (const [path, hash] of Object.entries(pins)) checked(path, hash);
  const baseline = helper.readCommercialCapacityProposal({ read, stat }) as {
    bootstrapSql: string;
    migrations: readonly { path: string; sql: string }[];
    installationAuthorized: false;
    financialExecutionAuthorized: false;
  };
  for (const [path, hash] of Object.entries(pins)) checked(path, hash);
  if (
    baseline.installationAuthorized !== false ||
    baseline.financialExecutionAuthorized !== false ||
    baseline.migrations.length !== 14
  )
    throw denied();
  return Object.freeze({
    classification: 'UNAPPLIED_RECONCILIATION_RECEIPT_ONLY' as const,
    parent: '1940dc3bf82142a50ba8d2ccd3b39890f36d0dd1',
    bootstrapSql: baseline.bootstrapSql,
    migrations: baseline.migrations,
    receiptSql: captured
      .get('proposals/payment-reconciliation-receipt/receipt.proposed.sql')!
      .toString('utf8'),
    installationAuthorized: false as const,
    financialExecutionAuthorized: false as const,
  });
}
