// UNAPPLIED build-only source guard. No installation or operational authority.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const pins = Object.freeze({
  'server/payments/sandbox.ts':
    '0c6bc1aa8e78ed7f6d86128e79055630cb41ec5281ed32a0bf7bbdc616a8ccc6',
  'server/payments/control-store.ts':
    '2dc82d0ff2548051de6df1461ddf783355e602da914a099bf14f0eba29f3ac7c',
  'server/payments/response-json.ts':
    '3d361bd32f9cc2ff82b9d4c1ad29ca0218199c11bc903a59ec5a644dd139c970',
  'supabase/migrations/20261015183039_phase_1_foundation.sql':
    '62ef02be55f5cf86916de4bf9891d4920f75a35ae421815c2d353bf4cedb73cc',
  'supabase/migrations/20261015201048_phase_2_operations.sql':
    '2a0e65f30e0eef0b85b53d23edc26968336f661d136303d7a1eb25b3f77e1974',
  'supabase/migrations/20261015204729_phase_3_estimating.sql':
    'ef999a3e7d8ee69f1563b3cffaf732f0a29c292161e4ce1729b6a26848bd4415',
  'supabase/migrations/20261015210230_phase_3_material_import.sql':
    '82f7594c18dfdf955ed1d2c83f6c903d8b4aebe7730c2f1a5770d501bd2d84a3',
  'supabase/migrations/20261015210546_phase_3_job_financials.sql':
    'f161cc16ec728b2e7373f3826b5d989a9fad4c1ec6d727fc193f18d5534d8c4c',
  'supabase/migrations/20261015210856_phase_3_workforce.sql':
    '78f2af2164574ba3d6aeb2f2510206d97343c5ad67a2534159a4e2960f5e9ce0',
  'supabase/migrations/20261015221730_phase_3a_release_controls.sql':
    '6dbfc3ed7a0b9905f5d824cb73698c441e8c7ee8aa5d5b0fb8f4883baacb4890',
  'supabase/migrations/20261016024502_release_1_internal_workflow.sql':
    '48522fd3b829a5bc9e482ce33c41ee7b8272edf68dbc7e6c7a699fa178b8714b',
  'supabase/migrations/20261016030324_material_worker_control_store.sql':
    '8359e7ceb4028460b7609bbd235d9941fc69b89b514463e011fec9b44a84d282',
  'supabase/migrations/20261016185108_provider_sandbox_persistence.sql':
    '5dd07b079a591b433fa7ab432fd841026de91a1cd3f1d3a722bef500aa9fd32d',
  'supabase/migrations/20261017005322_property_operations.sql':
    'c345bdf178c9339dba7ba2707c74233bcfae9a2d2b59abf148f4b7ffff35780c',
  'supabase/migrations/20261017024327_property_connected_readiness.sql':
    '6bb0b9bf22ec1079d7aa5f74c6e33e14534cc54e30e9034c33949f786cfd3ac9',
  'supabase/migrations/20261017024328_property_duplicate_index_cleanup.sql':
    '3603fe0482f46b9733a0321cd9009cb1f291993fcbede7132e1bdf721776fdfc',
  'supabase/migrations/20261018144833_customer_authorization_release_readiness.sql':
    'e3157e004c464fb2a4ab69e7a3a335a81d6bbbb0556d74234f3884f56d784ed1',
  'server/invoices/commercial-drafts.proposed.sql':
    'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c',
  'proposals/commercial-invoice-issuance/issuance.proposed.sql':
    '961c2dc380695ed2d910108d09303fff9b9018fe8d159beb9b958ddb2725d022',
  'server/invoices/commercial-draft-client.ts':
    '94aa164e60c780cb53f8658b16c57bc9c17da5d9469c73f9d73cab627dcea694',
  'server/invoices/commercial-caller-connection.ts':
    '3d892a8ae7757a6f480fde4638f17f4b642436ba728446dfd84811590be0aeed',
  'server/customer/broker-auth.ts':
    '709018249d889504b860e4cf0f4caa5cbdd1c2b04f58c53226f4499c68fd46d6',
  'scripts/invoice-caller-source-admission.mjs':
    '1d3438c34656e732c0352dab02477ea449ed4e4abd92714156c3ec62ff75e70a',
  'scripts/payment-response-source-admission.mjs':
    '74c672d6725876285c8bd2ee844aec88c183b56b12181a0373c874e02cf26510',
  'scripts/check-payment-ack-admission.mjs':
    'b1f297fc3d62cfe77a9ed9912a1a6f896a14a70cf796da2e1f24d5e5c0441ed9',
  'server/payments/commercial-capacity.proposed.sql':
    'a9fc788d6ea486a21207868088c56ca1d45a1b9b15ef29feb4f6d62b018a8aa4',
});
export function checkCommercialCapacity(
  root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
) {
  const capture = (path, expected) => {
    const parts = resolve(root, path).split('/').filter(Boolean);
    let current = '/';
    for (let i = 0; i < parts.length; i++) {
      current = resolve(current, parts[i]);
      const s = lstatSync(current);
      if (
        s.isSymbolicLink() ||
        (i < parts.length - 1
          ? !s.isDirectory()
          : !s.isFile() || (s.mode & 0o777) !== 0o644)
      )
        throw Error('Exact commercial capacity source required');
    }
    const bytes = readFileSync(resolve(root, path));
    if (createHash('sha256').update(bytes).digest('hex') !== expected)
      throw Error('Exact commercial capacity source required');
    return bytes;
  };
  for (let pass = 0; pass < 2; pass++)
    for (const [path, expected] of Object.entries(pins))
      capture(path, expected);
  return Object.freeze({
    classification: 'SOURCE_ONLY_NOT_INSTALLED',
    installationAuthorized: false,
    financialExecutionAuthorized: false,
  });
}
if (
  process.argv[1] &&
  relative(resolve(process.argv[1]), fileURLToPath(import.meta.url)) === ''
) {
  checkCommercialCapacity();
  process.stdout.write(
    'Exact commercial capacity source: PASS; operational authority: NONE\n',
  );
}
