import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
const pins = Object.freeze({
  'proposals/commercial-payment-capacity/reviewed-drafts.sql':
    'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c',
  'proposals/commercial-payment-capacity/reviewed-issuance.sql':
    '961c2dc380695ed2d910108d09303fff9b9018fe8d159beb9b958ddb2725d022',
  'proposals/commercial-payment-capacity/capacity.proposed.sql':
    'a9fc788d6ea486a21207868088c56ca1d45a1b9b15ef29feb4f6d62b018a8aa4',
  'server/payments/sandbox.ts':
    '0c6bc1aa8e78ed7f6d86128e79055630cb41ec5281ed32a0bf7bbdc616a8ccc6',
  'server/payments/control-store.ts':
    '2dc82d0ff2548051de6df1461ddf783355e602da914a099bf14f0eba29f3ac7c',
  'server/payments/response-json.ts':
    '3d361bd32f9cc2ff82b9d4c1ad29ca0218199c11bc903a59ec5a644dd139c970',
  'tests/database/bootstrap.sql':
    '7a9d283553f5a48bdf10541ae50b4238592506ce798043bf33e130c38b8dc81d',
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
});
const unavailable = () =>
  Error('Exact unapplied commercial capacity proposal required');
/** Capture verified source only. No connection, installer, provider or authority factory. */
export function readCommercialCapacityProposal({
  read = readFileSync,
  stat = lstatSync,
}: { read?: typeof readFileSync; stat?: typeof lstatSync } = {}) {
  const capture = (path: string, expected: string) => {
    const parts = path.split('/');
    const verify = () => {
      for (let i = 1; i <= parts.length; i++) {
        const info = stat(parts.slice(0, i).join('/'));
        if (
          info.isSymbolicLink() ||
          (i < parts.length && !info.isDirectory()) ||
          (i === parts.length &&
            (!info.isFile() || (info.mode & 0o777) !== 0o644))
        )
          throw unavailable();
      }
    };
    verify();
    const bytes = Buffer.from(read(path));
    if (createHash('sha256').update(bytes).digest('hex') !== expected)
      throw unavailable();
    verify();
    return bytes.toString('utf8');
  };
  const bytes = new Map<string, string>();
  for (const [path, expected] of Object.entries(pins))
    bytes.set(path, capture(path, expected));
  // Later reads cannot withdraw an earlier source before qualification returns.
  for (const [path, expected] of Object.entries(pins))
    if (capture(path, expected) !== bytes.get(path)) throw unavailable();
  return Object.freeze({
    classification: 'UNAPPLIED_DISPOSABLE_POSTGRESQL_ONLY' as const,
    nmiParent: '300eb070ecfa88fab7d22152893c90a8ec399b9f',
    invoiceSource: '7e25b50537fe66c19f5041e64bd2e59effc544c4',
    invoiceTree: 'f255ae9f0665d55fee94387340d84032f1fa25b8',
    draftSql: bytes.get(
      'proposals/commercial-payment-capacity/reviewed-drafts.sql',
    )!,
    issuanceSql: bytes.get(
      'proposals/commercial-payment-capacity/reviewed-issuance.sql',
    )!,
    capacitySql: bytes.get(
      'proposals/commercial-payment-capacity/capacity.proposed.sql',
    )!,
    bootstrapSql: bytes.get('tests/database/bootstrap.sql')!,
    migrations: Object.freeze(
      Object.keys(pins)
        .filter((p) => p.startsWith('supabase/migrations/'))
        .map((path) => Object.freeze({ path, sql: bytes.get(path)! })),
    ),
    installationAuthorized: false as const,
    financialExecutionAuthorized: false as const,
  });
}
