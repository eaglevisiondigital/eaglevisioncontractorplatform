import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const pins = Object.freeze({
  'proposals/invoice-payment-receipt/qualification.ts':
    'a95433d8dcad4f1f067b7b46a257c7763ff0de35b793d206ae8f999b69a69562',
  'proposals/customer-payment-publication/publication.proposed.sql':
    'bff7f5f16fa620b4f7e684228d1ff41af696492027a782ea4698fe49d1fbb71d',
  'proposals/customer-payment-publication/contract.ts':
    '1ca2b3f0c49e36e3e161fb37ca3978675a23f7b26236eed1a5b07ce1de713f34',
  'proposals/customer-payment-publication/reader.ts':
    '7bc1cafcab20b5d0cf8a0bec1b3e2d0367b8265c6ba77e43c76736a7db691796',
  'proposals/customer-payment-publication/CustomerPaymentReceipt.tsx':
    'ebe7023f06156e663501fb6ef212b6727c8326b49f17e6e62764520d3537807d',
});
const denied = () =>
  Error('Exact unapplied customer payment publication proposal required');
/** Source capture only; reuses the accepted parent qualifier and existing schema.
 * Never a connection, installer, replay or operational-authority factory.
 */
export async function captureCustomerPaymentPublicationProposal({
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
            .get('proposals/invoice-payment-receipt/qualification.ts')!
            .toString('utf8'),
          { mode: 'strip' },
        ),
      ).toString('base64')
  );
  for (const [path, hash] of Object.entries(pins)) checked(path, hash);
  const baseline = (await helper.captureInvoicePaymentReceiptProposal({
    read,
    stat,
  })) as {
    receiptSql: string;
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
    classification: 'UNAPPLIED_CUSTOMER_PAYMENT_PUBLICATION_ONLY' as const,
    parent: '28f98e6f58f3ac02518efed33a8946eb9537f005',
    bootstrapSql: baseline.bootstrapSql,
    draftSql: baseline.draftSql,
    issuanceSql: baseline.issuanceSql,
    capacitySql: baseline.capacitySql,
    migrations: baseline.migrations,
    receiptSql: baseline.receiptSql,
    publicationSql: captured
      .get('proposals/customer-payment-publication/publication.proposed.sql')!
      .toString('utf8'),
    installationAuthorized: false as const,
    financialExecutionAuthorized: false as const,
  });
}
