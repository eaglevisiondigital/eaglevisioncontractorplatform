import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
const pins = Object.freeze({
  'server/invoices/commercial-caller-connection.ts':
    '3d892a8ae7757a6f480fde4638f17f4b642436ba728446dfd84811590be0aeed',
  'server/invoices/commercial-draft-client.ts':
    '94aa164e60c780cb53f8658b16c57bc9c17da5d9469c73f9d73cab627dcea694',
  'server/invoices/commercial-drafts.proposed.sql':
    'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c',
  'proposals/commercial-invoice-issuance/issuance.proposed.sql':
    '961c2dc380695ed2d910108d09303fff9b9018fe8d159beb9b958ddb2725d022',
  'proposals/commercial-invoice-issuance/presentation.ts':
    'a181a67faf3f8b3264b5cd00478b38c5a3c9d67c2b7f2463d6d81c01bf477981',
  'server/customer/broker-auth.ts':
    '709018249d889504b860e4cf0f4caa5cbdd1c2b04f58c53226f4499c68fd46d6',
  'src/lib/customer-connected.ts':
    '7f7edf3efc5f053d6f644d6baae2ec8db2eecd9d3076251071cdd9053e575474',
});
export function assertConnectionSources() {
  for (const [path, hash] of Object.entries(pins)) {
    let prefix = '';
    for (const part of path.split('/')) {
      prefix = prefix ? prefix + '/' + part : part;
      const info = lstatSync(prefix);
      if (info.isSymbolicLink() || (prefix !== path && !info.isDirectory()))
        throw Error('Exact reviewed invoice source required');
    }
    const info = lstatSync(path);
    if (
      !info.isFile() ||
      (info.mode & 0o777) !== 0o644 ||
      createHash('sha256').update(readFileSync(path)).digest('hex') !== hash
    )
      throw Error('Exact reviewed invoice source required');
  }
}
