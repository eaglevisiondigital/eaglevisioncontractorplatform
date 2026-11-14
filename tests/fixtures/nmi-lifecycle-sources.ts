import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Finite test preflight only. Never a production source admission or capability.
export const nmiAcceptanceParent = 'e2414b42fcf1acc65c0d40a11d917cee8121fc04';
export const nmiAcceptanceSources = Object.freeze({
  'server/payments/sandbox.ts':
    '0c6bc1aa8e78ed7f6d86128e79055630cb41ec5281ed32a0bf7bbdc616a8ccc6',
  'server/payments/token-reference.ts':
    '5c369dd88ecdc4158ad5ffd3118e3a7b8cde3277324be17dd3c22eeb7041acf1',
  'server/payments/refunds.ts':
    '267912113acc418387beb86826b06c2689bac9f9a00589a0cd5fc6df1aa4158e',
  'server/payments/nmi-payment-lookup.ts':
    '73c7e7c48c0a4687dc67f82752559bc9508d5cf2eb7b83056eea5a79c4ddcc2b',
  'server/payments/control-store.ts':
    '2dc82d0ff2548051de6df1461ddf783355e602da914a099bf14f0eba29f3ac7c',
  'server/payments/postgres-store.ts':
    '9b2b9148db4ca5389aa8e9ef4bd5d5c6ccd700a2ed85a7b5dc0f58f8d94d0eef',
  'server/payments/reconciliation.ts':
    '94f339aa679c0b7fa0880fef035b921608b0717614c3705620f06eed07f9c0b0',
  'server/payments/webhook-inbox.ts':
    'baba0a4a560be8af01bc0f5bf3bbebd8103f4875c34a5f43394b584bcfb146d0',
  'server/payments/response-json.ts':
    '3d361bd32f9cc2ff82b9d4c1ad29ca0218199c11bc903a59ec5a644dd139c970',
  'server/providers/control.ts':
    '5f979931b85b67cb7b05b9b6ebf529c68538e52674f6eeeb6b7811acc5822293',
  'server/providers/safety.ts':
    'a8865035638e0cd19d5c1ea4b43dc9ed04012dd34cce9cc5084d7f35e9414c4d',
  'server/providers/webhooks.ts':
    '4872715950663a845543005ea6bc7ca48fd99a34cb586448e3a236742e1726fb',
  'tests/database/engine.ts':
    '50806fe72a97a401d636f497ee854fb3c2246bcec498257b00c6229ca374d6c2',
  'tests/database/bootstrap.sql':
    '7a9d283553f5a48bdf10541ae50b4238592506ce798043bf33e130c38b8dc81d',
  'tests/fixtures/first-launch-merchants.ts':
    'a105d44b4ba33437d46c0abe3203dc49247fe7874397ef933d0b81a960d2c34c',
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
} as const);
export function verifyNmiAcceptanceSources(
  read: (path: string) => Uint8Array = (path) => readFileSync(path),
) {
  for (const [path, digest] of Object.entries(nmiAcceptanceSources)) {
    const stat = lstatSync(path);
    if (
      !stat.isFile() ||
      (stat.mode & 0o777) !== 0o644 ||
      createHash('sha256').update(read(path)).digest('hex') !== digest
    )
      throw Error('NMI acceptance source mismatch: ' + path);
  }
  return Object.keys(nmiAcceptanceSources).length;
}
