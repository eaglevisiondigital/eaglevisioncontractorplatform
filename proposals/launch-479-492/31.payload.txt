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
const beforePins = Object.freeze({
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
  'proposals/commercial-invoice-issuance/presentation.ts':
    'a181a67faf3f8b3264b5cd00478b38c5a3c9d67c2b7f2463d6d81c01bf477981',
  'proposals/invoice-caller-admission/qualify.mjs':
    '8137978d6b2d2f8e91a864db2d6b61ae0a0391faeea38f25c63db19abb8c4629',
  'proposals/invoice-caller-reconciliation/qualify.mjs':
    '96ed1c379bc2ad3c6f03f1f54b1a66933d486b3793c688913bc9ea26074d27a7',
  'proposals/invoice-caller-transition/qualify.mjs':
    '361b24b71ca03b54e86d521bde76f5e95be53125c84ffcfb881548b732ab2645',
  'proposals/invoice-checker-qualification/baseline.mjs':
    '949edd4dce7557f8c9829494579ae9e0babd572441e710fb3940479d41a04a25',
  'proposals/invoice-guard-admission/fixture-adapter.mjs':
    '6c6a5758d3a3219b4fac88e5dbbeb2e24f6182bf73c8eba3f7bc5c44c8cd61bc',
  'proposals/invoice-guard-admission/qualify.mjs':
    '16cf2e24c6e8925ef8ec401f913a0277c0debde1ced48c35a19b47aeda9c0c39',
  'tests/commercial-invoice-author-checkpoint.test.ts':
    '9519540efd5c531c3d79fc101d48e139c26de8240121a16ce9a13e66f04473ab',
  'tests/invoice-caller-admission-proposal.test.ts':
    '1cbcc2051c20a2287d93e6f148f41f62c8f3c60ec13557f6d0be8cd895f2a11a',
  'tests/invoice-caller-migration-source.test.ts':
    '866339cc0e394971886ff6c8d9007ac485642d089bf07e28b812cc884d2b0c8a',
  'tests/invoice-checker-qualification-baseline.test.ts':
    '9b2ef5e2dfcd99c218a249bc6cdbc7f30dfb24521ad23478ed7c72f15f2d7341',
  'tests/launch-invoice-payment-source.test.ts':
    'ada16b37c940f58473b5449bf53317ca1bff81abfb3e3125dece0447b2814862',
});
const afterPins = Object.freeze({
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
    'cf28a441f146c5e4d398eb0ea0b78a999dd0f744e19424c46f3e95de74229438',
  'scripts/payment-response-source-admission.mjs':
    '74c672d6725876285c8bd2ee844aec88c183b56b12181a0373c874e02cf26510',
  'scripts/check-payment-ack-admission.mjs':
    'b1f297fc3d62cfe77a9ed9912a1a6f896a14a70cf796da2e1f24d5e5c0441ed9',
  'server/payments/commercial-capacity.proposed.sql':
    'a9fc788d6ea486a21207868088c56ca1d45a1b9b15ef29feb4f6d62b018a8aa4',
  'docs/COMMERCIAL_INVOICE_DRAFT_CANDIDATE.json':
    'dfdecf7675fcbf332585c8bd7017ad45608ed230402ed21d997573739e2d9598',
  'docs/FEATURE_SOURCE_INVENTORY.json':
    'f97017445306ad390ef4b1a479158f35d3b19094b5e470f1f05b00a62ce1fd63',
  'docs/INVOICE_CALLER_FIXTURE_SUCCESSOR.json':
    '785db2e06fa3e2f33270a8e728279e387c67521082ca49ba14275b3278677287',
  'docs/INVOICE_REVOCATION_TEST_CORRECTION.json':
    'e0e6d84396e426df86a9bd1085de168633148cd0549e481841b57b43b2c03c32',
  'docs/LAUNCH_CURRENT_SESSION_SUCCESSOR.json':
    'b84e425c7c9b911723c470b4c1eea14ec8061f48890c6e995ed2b7d6fd11495d',
  'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json':
    '27f14d1fbab79b6ff09318e482892ac8897ab17da0509eb47a8d97f3f7324741',
  'docs/MAINTENANCE_COMMAND_AUTHORITY_VALIDATION.json':
    'ad4ad318e8b503bd7b7ace292ca0a81cdf926672f4f8d2c25f89efbd64601289',
  'docs/MAINTENANCE_SECURITY_VALIDATION.json':
    'a4827e5526414840ce675004f6e6e12ca46a8e8536319e0fdd5143bfbc0a68a5',
  'docs/program/CYCLE4_PROTECTED_SOURCE.json':
    'ae31583c9f1835178407485555760466186113ff71d4cd72300a60af1dfb61aa',
  'proposals/commercial-invoice-connection/connection.ts':
    '50db32661490a3e1d7807bfffcca66dcacda1333e9578c3ab63e3e9984747d23',
  'proposals/commercial-invoice-issuance/author-checkpoint.json':
    'c7ac87697e835bb658df56f00d240e571ae5feb6dc6217eda7de29451d3e425a',
  'proposals/commercial-invoice-issuance/author-fixture.ts':
    '97ec70f65772ca7ee33377e4b305fa07589c8338e1f3f10954c6d78fc0f75d97',
  'proposals/commercial-invoice-issuance/draft-projection-guard.patch':
    '45d2eeafaca661d586e707aa6974b3f3216a44988de8a4b3e8d39f55bd3b6f45',
  'proposals/commercial-invoice-issuance/presentation.ts':
    'a63a605af3b1e03a0169828340f4938a50031a6f131404054da60e2db610ea6b',
  'proposals/commercial-invoice-numbering/numbering.proposed.sql':
    '49fbbde015b9cf7a92f2bbdb74f7f5c347a63246d63cc7c9a47724858b11922e',
  'proposals/commercial-invoice-year-numbering/numbering.proposed.sql':
    '89cf71e709d94cb9d0c14bd7822f2dec613315dcbac24b05299b3b0ae15ae9f7',
  'proposals/invoice-caller-admission/qualify.mjs':
    '5d8521ae472a2983fb2b450c3ca138811b2f04d7e4c61e4e32772d68c069457d',
  'proposals/invoice-caller-fixture-migration/source-author-baseline.mjs':
    'cb1a4069463d02d7b11d683bc38297ae110375a683809e15ec87159aa2ca1886',
  'proposals/invoice-caller-reconciliation/qualify.d.mts':
    '30fd7efaf053fa0f3100c9ccdb9ad2ca0a250e75a8733a25fb59d0d8d0475b3a',
  'proposals/invoice-caller-reconciliation/qualify.mjs':
    'fd1f640afb20c5b933d0a5ec6b5607a1732b830211b1b1b7de4eb0719ef03b9c',
  'proposals/invoice-caller-transition/qualify.mjs':
    'fa38a34b7ac3d70a8ec0a3fce9af703fea6d3cb0bf68c589e88dcdb532b2ac57',
  'proposals/invoice-checker-qualification/baseline.mjs':
    '3057cd8b268f24a29dd3a1ec83006254774e26393da1c551845d02ecf4c099b5',
  'proposals/invoice-guard-admission/fixture-adapter.mjs':
    'f12618162eb8bb0e7d74e4f41e1b9b1c7375788834cb98991d7fbca77741ece9',
  'proposals/payment-response-admission/fixture-adapter.mjs':
    '78c5bfe95bfe6e546267c52216fbad52aff57933826f24fbbf59f70f1a60a222',
  'scripts/check-cycle17-integrity.mjs':
    'd0b61ab2c5de33f996bce62e996e6c117490a577ff8cd604c56ed6b80215ebc1',
  'scripts/check-cycle22.mjs':
    '8abb9bffe4147bec71f94a7bdb6d761f50660b8b61d50526efef7ecc00a32226',
  'scripts/check-cycle24.mjs':
    '4f95b11e4e1d45186c5607f1b0773cc379e1901d99f7944ce907bfdef5a9a68d',
  'server/payments/refunds.ts':
    '267912113acc418387beb86826b06c2689bac9f9a00589a0cd5fc6df1aa4158e',
  'src/lib/customer-connected.ts':
    '7f7edf3efc5f053d6f644d6baae2ec8db2eecd9d3076251071cdd9053e575474',
  'tests/commercial-invoice-author-checkpoint.test.ts':
    '56bc23def7acf53501b3af4cdc599f98de601a5d6e95dda47d583bd0e8400c73',
  'tests/commercial-invoice-client-adversarial.test.ts':
    'af7b59add457c268231b3cd9dbfc5d051af8429852721eab1e776b9b6fa61313',
  'tests/commercial-invoice-client-reconciliation.test.ts':
    'c3770111b7ad3404470beb3917bd47b9cfca71adecdaec133770f396624c09a6',
  'tests/commercial-invoice-client.test.ts':
    '5d5e2f9eb9aca01fe29231a4111be4dc0f3220e4cfd4bb5234ef9d32b008c6e7',
  'tests/database/commercial-invoice-drafts.test.ts':
    '4f263d411f9fb02497335df739e810571810272ccfe0afb790ba4bba95465502',
  'tests/fixtures/commercial-caller-native.ts':
    'ffa6eebb84fc52e96e3a070eab915e9ea7e0c9f7aea913144bbe5da38b699df1',
  'tests/fixtures/commercial-caller-unit.ts':
    'e77ea3357154b9d3959ac00c85aa948a634e605db43069cde34500bc2089291c',
  'tests/invoice-caller-admission-proposal.test.ts':
    '1dd283a94bd4a374d058db2cf0225d691be6e5b3180e033b5ef6c47feb3e57a2',
  'tests/invoice-caller-migration-source.test.ts':
    'e476ba2e126b8a56dfed5eeca839d081d3193df7feced08cf1540d5916b05fa8',
  'tests/invoice-checker-qualification-baseline.test.ts':
    '620713f79f664b3af0ed0dcb93473e3d939e034e202fcfcb50bb31221b1424b7',
  'tests/launch-invoice-payment-source.test.ts':
    '98af655cb91e0bf68a926730bdc192ef9d6cef0c5379498bbd83ef0c06d10aa4',
  'tests/nmi-two-merchant-token-boundary.test.ts':
    '784666767e8938875300e0c37759f4cc745861218033a9c4e01bdeda86abea47',
  'proposals/invoice-guard-admission/qualify.mjs':
    'c6e62953cbb1e58c8ea1c636ef8f1929cdb46cbf2655fbc2e6015c29f09b5f94',
  'proposals/commercial-invoice-connection/README.md':
    '57262b034ccb9b0080b4466b06f6d6c7392f31ca6c602acc6ea5c0bd67fe81e6',
  'proposals/commercial-invoice-connection/source.json':
    '93f1d88a9f614504e5647a8d12b0f49f6a5f0e86218b267f8659ecbbabf469dc',
  'proposals/commercial-invoice-connection/source.ts':
    '5962272679a66e54b6bb30c8cc52502e0703434956f3dfdd68995e3cc233aa13',
  'proposals/commercial-invoice-numbering/README.md':
    '4d8a78a6d41babb6eb36ca54b2de14d40a82439e375e66d5c9e53112efa0b6d3',
  'proposals/commercial-invoice-numbering/source.json':
    'b0fa9bb10ff26b7269606bd82b0c6559028611723eb4a90485173dd0fc113932',
  'proposals/commercial-invoice-year-numbering/README.md':
    '37cda894f693975377b69350a3c086abdb7afe322b67edaa0f1838ba218250e2',
  'proposals/commercial-invoice-year-numbering/source.json':
    '105f2da765b51f03a5d28c3b565fa31bf9c54602d684e9944599ef4f5487073d',
  'tests/commercial-invoice-connection-source.test.ts':
    'ddf9b5cb015f74732b1a19b50ccf6464ea53aa23c4e81a644a164f8e933b67d1',
  'tests/commercial-invoice-connection.test.ts':
    'f13179fab5264e9ce4c22261c1a02abd083f56abdba4e5a66b4dfff147ddc0e0',
  'tests/commercial-invoice-numbering-source.test.ts':
    'e5f0ca4125c015784ae40c8c1eae03391945f21c4d5aab247044c123dd1b0056',
  'tests/commercial-invoice-year-numbering-source.test.ts':
    'a20489d248c508fdacd5fafd1c72da9e4cf4430061c63077cd466d55e7470eff',
  'tests/database/commercial-invoice-connection-preparation.test.ts':
    '4d9d9481dd9db4e3c97b9cafee52b75c4a8d2c2b2fd381551fa7f7358d1ab987',
  'tests/database/commercial-invoice-numbering-proposal.test.ts':
    '2047ec94b436a722fb1601a169dcfcb1b6dede54e672a939b6e2b5196ecac669',
  'tests/database/commercial-invoice-year-numbering-proposal.test.ts':
    '31f982f491d22c18356fac2c3c6131fbbd572efd13dba49dcef2297efc3d2c1e',
});
const absentBefore = Object.freeze([
  'proposals/commercial-invoice-connection/README.md',
  'proposals/commercial-invoice-connection/connection.ts',
  'proposals/commercial-invoice-connection/source.json',
  'proposals/commercial-invoice-connection/source.ts',
  'proposals/commercial-invoice-numbering/README.md',
  'proposals/commercial-invoice-numbering/numbering.proposed.sql',
  'proposals/commercial-invoice-numbering/source.json',
  'proposals/commercial-invoice-year-numbering/README.md',
  'proposals/commercial-invoice-year-numbering/numbering.proposed.sql',
  'proposals/commercial-invoice-year-numbering/source.json',
  'tests/commercial-invoice-connection-source.test.ts',
  'tests/commercial-invoice-connection.test.ts',
  'tests/commercial-invoice-numbering-source.test.ts',
  'tests/commercial-invoice-year-numbering-source.test.ts',
  'tests/database/commercial-invoice-connection-preparation.test.ts',
  'tests/database/commercial-invoice-numbering-proposal.test.ts',
  'tests/database/commercial-invoice-year-numbering-proposal.test.ts',
]);
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
  const helper = 'scripts/invoice-caller-source-admission.mjs';
  let phase;
  try {
    capture(
      helper,
      '1d3438c34656e732c0352dab02477ea449ed4e4abd92714156c3ec62ff75e70a',
    );
    phase = '479';
  } catch {
    try {
      capture(
        helper,
        'cf28a441f146c5e4d398eb0ea0b78a999dd0f744e19424c46f3e95de74229438',
      );
      phase = '492';
    } catch {
      throw Error('Exact commercial capacity source required');
    }
  }
  if (!phase) throw Error('Exact commercial capacity source required');
  const selected = phase === '479' ? beforePins : afterPins;
  for (const [path, digest] of Object.entries(pins))
    if (path !== helper && selected[path] !== digest)
      throw Error('Exact commercial capacity source required');
  for (let pass = 0; pass < 2; pass++) {
    if (phase === '479')
      for (const path of absentBefore) {
        let current = root;
        for (const part of path.split('/')) {
          current = resolve(current, part);
          let info;
          try {
            info = lstatSync(current);
          } catch (error) {
            if (error?.code === 'ENOENT') break;
            throw error;
          }
          if (
            info.isSymbolicLink() ||
            current === resolve(root, path) ||
            !info.isDirectory()
          )
            throw Error('Exact commercial capacity source required');
        }
      }
    for (const [path, hash] of Object.entries(
      phase === '479' ? beforePins : afterPins,
    ))
      capture(path, hash);
    capture(helper, selected[helper]);
  }
  return Object.freeze({
    classification: 'SOURCE_ONLY_NOT_INSTALLED',
    sourcePhase: phase,
    installationAuthorized: false,
    financialExecutionAuthorized: false,
  });
}
if (
  import.meta.url.startsWith('file:') &&
  process.argv[1] &&
  relative(resolve(process.argv[1]), fileURLToPath(import.meta.url)) === ''
) {
  checkCommercialCapacity();
  process.stdout.write(
    'Exact commercial capacity source: PASS; operational authority: NONE\n',
  );
}
