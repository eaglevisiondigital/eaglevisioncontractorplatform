import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const pins = Object.freeze({
  'server/providers/safety.ts':
    'a8865035638e0cd19d5c1ea4b43dc9ed04012dd34cce9cc5084d7f35e9414c4d',
  'proposals/commercial-payment-capacity/qualification.ts':
    'ff691a52f531327da290e66cb85180c480fff95d5027c2e6e66a163bf08ecd5c',
  'proposals/invoice-payment-receipt/receipt.proposed.sql':
    '1c1ec82ca52560de86ec19ff9a865babfc3967ff466b425692e733fd240fdef5',
  'proposals/invoice-payment-receipt/reader.ts':
    'eb8e9c1e057db7edee593941bd3112f6c4fe6206824db850963e5bbaf09a082a',
});
const denied = () =>
  Error('Exact unapplied invoice payment receipt proposal required');
/** Source capture only; reuses the accepted parent qualifier and existing schema.
 * Never a connection, installer, replay or operational-authority factory.
 */
export async function captureInvoicePaymentReceiptProposal({
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
    draftSql: string;
    issuanceSql: string;
    capacitySql: string;
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
    classification: 'UNAPPLIED_INVOICE_PAYMENT_RECEIPT_ONLY' as const,
    parent: '18803134e504d52315f495e40766c74bb7e7df5a',
    bootstrapSql: baseline.bootstrapSql,
    draftSql: baseline.draftSql,
    issuanceSql: baseline.issuanceSql,
    capacitySql: baseline.capacitySql,
    migrations: baseline.migrations,
    receiptSql: captured
      .get('proposals/invoice-payment-receipt/receipt.proposed.sql')!
      .toString('utf8'),
    installationAuthorized: false as const,
    financialExecutionAuthorized: false as const,
  });
}
