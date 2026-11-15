// Source snapshot only; static imports and this verifier remain trusted TCB.
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const self = new URL(import.meta.url);
const initial = createHash('sha256').update(readFileSync(self)).digest('hex');
const pins = {
  'package-lock.json':
    '038f80c378263f8c961930661d03801e55d882ad54c5929095234aea3306ce6d',
  'proposals/commercial-customer-bridge/reader.ts':
    '98e502cb1e4beaa8cd6a950539a1ba1973677da9ee4e46c097b0193d6c138ea2',
  'proposals/commercial-customer-operating-reader/binding.ts':
    '6a157cccf4569decedc6f8bdeb1fdcd9a501f328234f726b49b14dbdbb137138',
  'proposals/commercial-customer-operating-reader/catalog.ts':
    '036dd76edb1ce22f6b7f5becbd299b2528019d09837dba94a3a1207a10bca657',
  'proposals/commercial-customer-operating-reader/read.proposed.sql.in':
    '303741983f5f72ee0fefabbf71d7dd57b0e5bf1b0f265ab389d5fbeb318afe93',
  'proposals/commercial-customer-operating-reader/reader.ts':
    'fb74f91f603654fa2034592212f8ad9ad87ef7bb288b609f6adb325c1ca8417e',
  'proposals/commercial-customer-operating-reader/runtime-grants.sql.in':
    'abbca46667c9d9b44839395428f15d9d336e244fe0bd7a5c42217cf8aeb850c5',
  'proposals/commercial-invoice-issuance/issuance.proposed.sql':
    '961c2dc380695ed2d910108d09303fff9b9018fe8d159beb9b958ddb2725d022',
  'proposals/commercial-invoice-issuance/presentation.ts':
    'a63a605af3b1e03a0169828340f4938a50031a6f131404054da60e2db610ea6b',
  'server/customer/broker-auth.ts':
    '709018249d889504b860e4cf0f4caa5cbdd1c2b04f58c53226f4499c68fd46d6',
  'server/invoices/commercial-caller-connection.ts':
    '3d892a8ae7757a6f480fde4638f17f4b642436ba728446dfd84811590be0aeed',
  'server/invoices/commercial-draft-client.ts':
    '94aa164e60c780cb53f8658b16c57bc9c17da5d9469c73f9d73cab627dcea694',
  'server/invoices/commercial-drafts.proposed.sql':
    'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c',
  'server/payments/postgres-store.ts':
    '9b2b9148db4ca5389aa8e9ef4bd5d5c6ccd700a2ed85a7b5dc0f58f8d94d0eef',
  'server/payments/refunds.ts':
    '267912113acc418387beb86826b06c2689bac9f9a00589a0cd5fc6df1aa4158e',
  'server/payments/response-json.ts':
    '3d361bd32f9cc2ff82b9d4c1ad29ca0218199c11bc903a59ec5a644dd139c970',
  'server/payments/sandbox.ts':
    '0c6bc1aa8e78ed7f6d86128e79055630cb41ec5281ed32a0bf7bbdc616a8ccc6',
  'server/providers/safety.ts':
    'a8865035638e0cd19d5c1ea4b43dc9ed04012dd34cce9cc5084d7f35e9414c4d',
  'src/components/invoices/commercial-customer-read.ts':
    'e546c945bf3f4993a5a5e4a62703e8e8f6b0b7473cc31a237be2050c863ee8ef',
  'src/components/invoices/customer-invoice-contract.ts':
    'e343734dd7889fdf485e08cb74d89cbf0900c9a34cd90c50698b734549b4c0b2',
  'src/domain/customer/review.ts':
    'e387500a60595788050d7b93b92ea23c5254c5954507edc3397eb7fa2b9bf858',
  'src/domain/estimating/customer-preview.ts':
    '367628fcc9a45fc0303503215357403942637b902d36a9f1a84066228a93d411',
  'src/domain/estimating/types.ts':
    '5e878de9c0a9cbf5f68055054b336db9f68ba4a466ec66ea9b8c66b2952d14d5',
  'src/domain/property/inspections.ts':
    '7691ced4cc6b78604e782369cfedc5e5e29170109c12485000894d4ffbe8c11f',
  'src/domain/property/report-page.ts':
    '622d68ba1c6a3010641fc1b97ee3b49b6cf9bbc587a94809e2c0f298163d3771',
  'src/lib/customer-access.ts':
    '7a98b75cd806db76d9489b1abecc0a6d7cc89e70ad29d3ac00ae7f3125b95fb5',
  'src/lib/customer-connected.ts':
    '7f7edf3efc5f053d6f644d6baae2ec8db2eecd9d3076251071cdd9053e575474',
  'src/lib/customer-decision.ts':
    'a0fed920cfcfddcb4b6a32df6ef76dcce7cfc6c40cf1e702b422358e3053446e',
  'src/lib/customer-requests.ts':
    '4da5caa8e48ef723a5068338768b62fd175519a8d91a5c187ea04873673ebe9a',
  'src/lib/database.types.ts':
    '430fe4085663ee1d83d8431fa6c84253ab6f6d1d2ee643efe4a4fa1e8b519a5d',
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
};
export function assertOperatingSources() {
  const root = process.cwd(),
    own = 'proposals/commercial-customer-operating-reader/source.ts';
  if (
    realpathSync(root) !== resolve(root) ||
    realpathSync(self) !== join(root, own)
  )
    throw Error('Exact operating reader source required');
  for (const path of [...Object.keys(pins), own]) {
    let p = root;
    for (const part of path.split('/')) {
      p = join(p, part);
      const s = lstatSync(p);
      if (s.isSymbolicLink())
        throw Error('Exact operating reader source required');
    }
    const st = lstatSync(p);
    if (!st.isFile() || (st.mode & 0o777) !== 0o644)
      throw Error('Exact operating reader source required');
    const h = createHash('sha256').update(readFileSync(p)).digest('hex');
    if (h !== (path === own ? initial : pins[path as keyof typeof pins]))
      throw Error('Exact operating reader source required');
  }
}
