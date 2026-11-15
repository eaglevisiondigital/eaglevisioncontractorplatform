// Finite build/test source proof ONLY; no runtime or launch authority.
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devNull } from 'node:os';
const historical = {
  'server/invoices/commercial-draft-client.ts':
    '12c1eb303f10f8cb9e6c5f765839419f55e4b6cfd16c6c6ef9f8812ccbb76194',
  'tests/database/commercial-invoice-drafts.test.ts':
    '94d06410bdd267726f57aa1b1a90c3357af3ed51cadf69f2a39e610a09416b47',
  'tests/commercial-invoice-client.test.ts':
    'ec0829098cd7fc967fad82d33b5db003dcab67ca9b2f135ae55a2dd74349e34a',
  'tests/commercial-invoice-client-adversarial.test.ts':
    '25f1e6169365e76558348df63792c131e4f26414d4c8d50b407657ce0f282c12',
  'tests/commercial-invoice-client-reconciliation.test.ts':
    '8be24bc86172b7997ef4268a4df7375acc8cfcb131a8b7f3442c0f6d11aa7e40',
};
const authors = [
  {
    commit: '8f498f2c657608c64d40a3527be13b47a189b7b7',
    parent: '0e49670e6cc05473d3fd4e033b2c0f42b5fc10e0',
    delta:
      'A\tserver/invoices/commercial-caller-connection.ts\nM\tserver/invoices/commercial-draft-client.ts',
  },
  {
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    parent: '8f498f2c657608c64d40a3527be13b47a189b7b7',
    delta:
      'M\tCURRENT_BUILD_STATE.md\nM\tDECISIONS.md\nA\tdocs/INVOICE_CALLER_FIXTURE_SUCCESSOR.json\nA\tproposals/invoice-caller-fixture-migration/README.md\nA\tproposals/invoice-caller-fixture-migration/source-author-baseline.mjs\nM\tproposals/invoice-caller-reconciliation/qualify.d.mts\nM\tproposals/invoice-caller-reconciliation/qualify.mjs\nM\ttests/commercial-invoice-client-adversarial.test.ts\nM\ttests/commercial-invoice-client-reconciliation.test.ts\nM\ttests/commercial-invoice-client.test.ts\nM\ttests/database/commercial-invoice-drafts.test.ts\nA\ttests/fixtures/commercial-caller-native.ts\nA\ttests/fixtures/commercial-caller-unit.ts\nA\ttests/invoice-caller-migration-source.test.ts',
  },
];
const companions = [
  {
    path: 'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: '27f14d1fbab79b6ff09318e482892ac8897ab17da0509eb47a8d97f3f7324741',
  },
  {
    path: 'docs/COMMERCIAL_INVOICE_DRAFT_CANDIDATE.json',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: 'dfdecf7675fcbf332585c8bd7017ad45608ed230402ed21d997573739e2d9598',
  },
  {
    path: 'docs/LAUNCH_CURRENT_SESSION_SUCCESSOR.json',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: 'b84e425c7c9b911723c470b4c1eea14ec8061f48890c6e995ed2b7d6fd11495d',
  },
  {
    path: 'docs/INVOICE_REVOCATION_TEST_CORRECTION.json',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: 'e0e6d84396e426df86a9bd1085de168633148cd0549e481841b57b43b2c03c32',
  },
  {
    path: 'server/invoices/commercial-draft-client.ts',
    commit: '8f498f2c657608c64d40a3527be13b47a189b7b7',
    sha256: '94aa164e60c780cb53f8658b16c57bc9c17da5d9469c73f9d73cab627dcea694',
  },
  {
    path: 'server/invoices/commercial-caller-connection.ts',
    commit: '8f498f2c657608c64d40a3527be13b47a189b7b7',
    sha256: '3d892a8ae7757a6f480fde4638f17f4b642436ba728446dfd84811590be0aeed',
  },
  {
    path: 'tests/commercial-invoice-client.test.ts',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: '5d5e2f9eb9aca01fe29231a4111be4dc0f3220e4cfd4bb5234ef9d32b008c6e7',
  },
  {
    path: 'tests/commercial-invoice-client-adversarial.test.ts',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: 'af7b59add457c268231b3cd9dbfc5d051af8429852721eab1e776b9b6fa61313',
  },
  {
    path: 'tests/commercial-invoice-client-reconciliation.test.ts',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: 'c3770111b7ad3404470beb3917bd47b9cfca71adecdaec133770f396624c09a6',
  },
  {
    path: 'tests/database/commercial-invoice-drafts.test.ts',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: '4f263d411f9fb02497335df739e810571810272ccfe0afb790ba4bba95465502',
  },
  {
    path: 'tests/fixtures/commercial-caller-native.ts',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: 'ffa6eebb84fc52e96e3a070eab915e9ea7e0c9f7aea913144bbe5da38b699df1',
  },
  {
    path: 'tests/fixtures/commercial-caller-unit.ts',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: 'e77ea3357154b9d3959ac00c85aa948a634e605db43069cde34500bc2089291c',
  },
  {
    path: 'proposals/invoice-caller-fixture-migration/source-author-baseline.mjs',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: 'cb1a4069463d02d7b11d683bc38297ae110375a683809e15ec87159aa2ca1886',
  },
  {
    path: 'proposals/invoice-caller-reconciliation/qualify.mjs',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: '8d3866149532e9986f8eca8d31d95cf3899d59e7ad74eb3e7281007d13c1e13e',
  },
  {
    path: 'proposals/invoice-caller-reconciliation/qualify.d.mts',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: '30fd7efaf053fa0f3100c9ccdb9ad2ca0a250e75a8733a25fb59d0d8d0475b3a',
  },
  {
    path: 'tests/invoice-caller-migration-source.test.ts',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: 'b2ea02e8ba9a06e1bea67255261cc1784f24d05c2f0104c7f2650690782f4689',
    publishedSha256:
      'b1131c5c7d80dc2fb3d28a3e7d20540c60d420f3d8ba76a7b61eb091fee24678',
  },
  {
    path: 'docs/INVOICE_CALLER_FIXTURE_SUCCESSOR.json',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: '785db2e06fa3e2f33270a8e728279e387c67521082ca49ba14275b3278677287',
  },
  {
    path: 'server/customer/broker-auth.ts',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: '709018249d889504b860e4cf0f4caa5cbdd1c2b04f58c53226f4499c68fd46d6',
  },
  {
    path: 'server/invoices/commercial-drafts.proposed.sql',
    commit: '6063aea60588975bbe88c8ccf8b1d864721b7082',
    sha256: 'da35d098727eff68ae7905c3709d6982cf89560cae538923f5d7e570dab0306e',
  },
];
const hash = (b) => createHash('sha256').update(b).digest('hex');
const gitEnvironment = Object.freeze({
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_COUNT: '0',
  GIT_ATTR_NOSYSTEM: '1',
  GIT_ALLOW_PROTOCOL: '',
  GIT_NO_LAZY_FETCH: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
});
const git = (command, ...args) => {
  if (!['show', 'diff', 'diff-tree', 'ls-tree'].includes(command))
    throw Error('Finite Git metadata command required');
  return execFileSync(
    'git',
    [
      '--no-replace-objects',
      '--no-pager',
      '-c',
      'core.hooksPath=' + devNull,
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.attributesFile=' + devNull,
      '-c',
      'credential.helper=',
      '-c',
      'diff.external=',
      command,
      ...(command === 'ls-tree'
        ? []
        : ['--no-ext-diff', '--no-textconv', '--no-color']),
      ...args,
    ],
    { env: gitEnvironment, stdio: ['ignore', 'pipe', 'pipe'] },
  );
};
const original = (commit, path) => git('show', `${commit}:${path}`);
export function admitInvoiceCallerSource(
  path,
  current,
  expected,
  {
    readCurrent = readFileSync,
    readOriginal = original,
    metadata = git,
    stat = lstatSync,
  } = {},
) {
  if (path === guardSql) {
    if (expected !== guardBefore) guardFail();
    verifyInvoiceGuardFrame({ readCurrent, readOriginal, metadata, stat });
    if (!Buffer.from(current).equals(readCurrent(path))) guardFail();
    verifyInvoiceGuardFrame({ readCurrent, readOriginal, metadata, stat });
    return true;
  }
  if (!Object.hasOwn(historical, path)) return false;
  verifyInvoiceGuardFrame({ readCurrent, readOriginal, metadata, stat });
  const fail = () => {
    throw Error('Exact finite invoice caller source required');
  };
  if (expected !== historical[path]) fail();
  if (
    hash(
      readOriginal(
        authors[0].parent,
        'server/invoices/commercial-draft-client.ts',
      ),
    ) !== historical['server/invoices/commercial-draft-client.ts']
  )
    fail();
  if (
    metadata(
      'ls-tree',
      authors[0].parent,
      '--',
      'server/invoices/commercial-caller-connection.ts',
    )
      .toString()
      .trim() !== ''
  )
    fail();
  for (const author of authors) {
    if (
      metadata('show', '--no-patch', '--format=%P', author.commit)
        .toString()
        .trim() !== author.parent
    )
      fail();
    if (
      metadata(
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '--no-renames',
        '-r',
        author.commit,
      )
        .toString()
        .trim() !== author.delta
    )
      fail();
    for (const row of author.delta.split('\n')) {
      const p = row.split('\t')[1];
      const tree = metadata('ls-tree', author.commit, '--', p)
        .toString()
        .trim();
      if (
        !/^100644 blob [a-f0-9]{40}\t/.test(tree) ||
        tree.split('\t')[1] !== p
      )
        fail();
    }
  }
  for (const companion of companions) {
    let prefix = '';
    for (const segment of companion.path.split('/')) {
      prefix = prefix ? prefix + '/' + segment : segment;
      if (stat(prefix).isSymbolicLink()) fail();
    }
    if (!stat(companion.path).isFile()) fail();
    const published = readOriginal(companion.commit, companion.path),
      fresh = historicalFixturePaths.has(companion.path)
        ? readOriginal(guardParent, companion.path)
        : readCurrent(companion.path);
    const exactPublishedHash =
      companion.path === 'tests/invoice-caller-migration-source.test.ts'
        ? companion.publishedSha256
        : companion.sha256;
    if (
      hash(published) !== exactPublishedHash ||
      hash(fresh) !== companion.sha256
    )
      fail();
    if (companion.path === path && !Buffer.from(current).equals(fresh)) fail();
  }
  verifyInvoiceGuardFrame({ readCurrent, readOriginal, metadata, stat });
  return true;
}

// Finite guard admission, development build/test only. No operational authority.
const guardAuthor = '5f0f17dc9766411b260d5b53fd2db5a925adc80f';
const guardParent = 'f9335e5834fb06789585c4e59edd640447441bb7';
const guardSql = 'server/invoices/commercial-drafts.proposed.sql';
const guardBefore =
  'da35d098727eff68ae7905c3709d6982cf89560cae538923f5d7e570dab0306e';
const guardAfter =
  'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c';
const guardPatch =
  'proposals/commercial-invoice-issuance/draft-projection-guard.patch';
const guardPatchHash =
  '45d2eeafaca661d586e707aa6974b3f3216a44988de8a4b3e8d39f55bd3b6f45';
const helperPath = 'scripts/invoice-caller-source-admission.mjs';
const executingHelper = import.meta.url.startsWith(
  'data:text/javascript;base64,',
)
  ? Buffer.from(
      import.meta.url.slice('data:text/javascript;base64,'.length),
      'base64',
    )
  : readFileSync(fileURLToPath(import.meta.url));
const launchPath = 'tests/launch-invoice-payment-source.test.ts';
const oldHelperHash =
  'f3fb04f429f2e43493bf57ecce38a7435f346fa4d2fd17d790ff170e366b11bb';
const guardFrame = Object.freeze({
  'server/invoices/commercial-draft-client.ts':
    '94aa164e60c780cb53f8658b16c57bc9c17da5d9469c73f9d73cab627dcea694',
  'server/invoices/commercial-caller-connection.ts':
    '3d892a8ae7757a6f480fde4638f17f4b642436ba728446dfd84811590be0aeed',
  'server/customer/broker-auth.ts':
    '709018249d889504b860e4cf0f4caa5cbdd1c2b04f58c53226f4499c68fd46d6',
  'server/payments/sandbox.ts':
    '0c6bc1aa8e78ed7f6d86128e79055630cb41ec5281ed32a0bf7bbdc616a8ccc6',
  'server/payments/refunds.ts':
    '267912113acc418387beb86826b06c2689bac9f9a00589a0cd5fc6df1aa4158e',
  'server/payments/control-store.ts':
    '2dc82d0ff2548051de6df1461ddf783355e602da914a099bf14f0eba29f3ac7c',
  'server/payments/response-json.ts':
    '3d361bd32f9cc2ff82b9d4c1ad29ca0218199c11bc903a59ec5a644dd139c970',
  'scripts/payment-response-source-admission.mjs':
    '74c672d6725876285c8bd2ee844aec88c183b56b12181a0373c874e02cf26510',
  'scripts/check-payment-ack-admission.mjs':
    'b1f297fc3d62cfe77a9ed9912a1a6f896a14a70cf796da2e1f24d5e5c0441ed9',
  'tests/database/commercial-invoice-drafts.test.ts':
    '4f263d411f9fb02497335df739e810571810272ccfe0afb790ba4bba95465502',
  'tests/nmi-two-merchant-token-boundary.test.ts':
    '784666767e8938875300e0c37759f4cc745861218033a9c4e01bdeda86abea47',
  'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json':
    '27f14d1fbab79b6ff09318e482892ac8897ab17da0509eb47a8d97f3f7324741',
  'docs/FEATURE_SOURCE_INVENTORY.json':
    'f97017445306ad390ef4b1a479158f35d3b19094b5e470f1f05b00a62ce1fd63',
  'docs/MAINTENANCE_COMMAND_AUTHORITY_VALIDATION.json':
    'ad4ad318e8b503bd7b7ace292ca0a81cdf926672f4f8d2c25f89efbd64601289',
  'docs/MAINTENANCE_SECURITY_VALIDATION.json':
    'a4827e5526414840ce675004f6e6e12ca46a8e8536319e0fdd5143bfbc0a68a5',
  'docs/program/CYCLE4_PROTECTED_SOURCE.json':
    'ae31583c9f1835178407485555760466186113ff71d4cd72300a60af1dfb61aa',
  'scripts/check-cycle17-integrity.mjs':
    'd0b61ab2c5de33f996bce62e996e6c117490a577ff8cd604c56ed6b80215ebc1',
  'scripts/check-cycle22.mjs':
    '8abb9bffe4147bec71f94a7bdb6d761f50660b8b61d50526efef7ecc00a32226',
  'scripts/check-cycle24.mjs':
    '4f95b11e4e1d45186c5607f1b0773cc379e1901d99f7944ce907bfdef5a9a68d',
  'proposals/commercial-invoice-issuance/issuance.proposed.sql':
    '961c2dc380695ed2d910108d09303fff9b9018fe8d159beb9b958ddb2725d022',
  'proposals/commercial-invoice-issuance/presentation.ts':
    'a181a67faf3f8b3264b5cd00478b38c5a3c9d67c2b7f2463d6d81c01bf477981',
  'proposals/commercial-invoice-issuance/author-fixture.ts':
    '97ec70f65772ca7ee33377e4b305fa07589c8338e1f3f10954c6d78fc0f75d97',
  'proposals/commercial-invoice-issuance/author-checkpoint.json':
    'c7ac87697e835bb658df56f00d240e571ae5feb6dc6217eda7de29451d3e425a',
  'proposals/payment-response-admission/fixture-adapter.mjs':
    '78c5bfe95bfe6e546267c52216fbad52aff57933826f24fbbf59f70f1a60a222',
  'server/invoices/commercial-drafts.proposed.sql':
    'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c',
});
const guardDerivedSpecs = Object.freeze({
  'tests/invoice-caller-migration-source.test.ts': {
    before: 'b2ea02e8ba9a06e1bea67255261cc1784f24d05c2f0104c7f2650690782f4689',
    edits: [
      [10, 10, 'eadFileSync as nodeR'],
      [
        209,
        209,
        "\n\n// Seal the ordinary historical-fixture adapter before evaluating any bytes.\nconst guardFixturePath =\n  'proposals/invoice-guard-admission/fixture-adapter.mjs';\nconst guardFixtureStat = (await import('node:fs')).lstatSync;\nlet guardFixturePrefix = '';\nfor (const part of guardFixturePath.split('/')) {\n  guardFixturePrefix = guardFixturePrefix\n    ? guardFixturePrefix + '/' + part\n    : part;\n  if (guardFixtureStat(guardFixturePrefix).isSymbolicLink())\n    throw Error('Reviewed guard fixture required');\n}\nconst guardFixtureInfo = guardFixtureStat(guardFixturePath);\nif (!guardFixtureInfo.isFile() || (guardFixtureInfo.mode & 0o777) !== 0o644)\n  throw Error('Reviewed guard fixture required');\nconst guardFixtureBytes = nodeReadFileSync(guardFixturePath);\nif (\n  (await import('node:crypto'))\n    .createHash('sha256')\n    .update(guardFixtureBytes)\n    .digest('hex') !==\n  '__GUARD_ADAPTER_DIGEST__'\n)\n  throw Error('Reviewed guard fixture required');\nconst { createHistoricalRead } = await import(\n  'data:text/javascript;base64,' + guardFixtureBytes.toString('base64')\n);\nconst readFileSync = createHistoricalRead(nodeReadFileSync, {\n  includeSql: true,\n}) as typeof nodeReadFileSync;\n",
      ],
    ],
  },
  'proposals/invoice-caller-reconciliation/qualify.mjs': {
    before: '8d3866149532e9986f8eca8d31d95cf3899d59e7ad74eb3e7281007d13c1e13e',
    edits: [
      [316, 316, ' as nodeReadFileSync'],
      [
        552,
        552,
        "\n\n// Seal the ordinary historical-fixture adapter before evaluating any bytes.\nconst guardFixturePath =\n  'proposals/invoice-guard-admission/fixture-adapter.mjs';\nconst guardFixtureStat = (await import('node:fs')).lstatSync;\nlet guardFixturePrefix = '';\nfor (const part of guardFixturePath.split('/')) {\n  guardFixturePrefix = guardFixturePrefix\n    ? guardFixturePrefix + '/' + part\n    : part;\n  if (guardFixtureStat(guardFixturePrefix).isSymbolicLink())\n    throw Error('Reviewed guard fixture required');\n}\nconst guardFixtureInfo = guardFixtureStat(guardFixturePath);\nif (!guardFixtureInfo.isFile() || (guardFixtureInfo.mode & 0o777) !== 0o644)\n  throw Error('Reviewed guard fixture required');\nconst guardFixtureBytes = nodeReadFileSync(guardFixturePath);\nif (\n  (await import('node:crypto'))\n    .createHash('sha256')\n    .update(guardFixtureBytes)\n    .digest('hex') !==\n  '__GUARD_ADAPTER_DIGEST__'\n)\n  throw Error('Reviewed guard fixture required');\nconst { createHistoricalRead } = await import(\n  'data:text/javascript;base64,' + guardFixtureBytes.toString('base64')\n);\nconst readFileSync = createHistoricalRead(nodeReadFileSync, {\n  includeSql: true,\n});\n",
      ],
    ],
  },
  'proposals/invoice-checker-qualification/baseline.mjs': {
    before: 'c45098cb7175b28f54e4343c615cce89c168e3db16bdf72c94c41651133d1667',
    edits: [
      [131, 131, '\n '],
      [144, 144, ' as nodeReadFileSync'],
      [145, 145, '\n '],
      [156, 156, '\n '],
      [167, 168, ',\n'],
      [
        278,
        278,
        "\n\n// Seal the ordinary historical-fixture adapter before evaluating any bytes.\nconst guardFixturePath =\n  'proposals/invoice-guard-admission/fixture-adapter.mjs';\nconst guardFixtureStat = (await import('node:fs')).lstatSync;\nlet guardFixturePrefix = '';\nfor (const part of guardFixturePath.split('/')) {\n  guardFixturePrefix = guardFixturePrefix\n    ? guardFixturePrefix + '/' + part\n    : part;\n  if (guardFixtureStat(guardFixturePrefix).isSymbolicLink())\n    throw Error('Reviewed guard fixture required');\n}\nconst guardFixtureInfo = guardFixtureStat(guardFixturePath);\nif (!guardFixtureInfo.isFile() || (guardFixtureInfo.mode & 0o777) !== 0o644)\n  throw Error('Reviewed guard fixture required');\nconst guardFixtureBytes = nodeReadFileSync(guardFixturePath);\nif (\n  (await import('node:crypto'))\n    .createHash('sha256')\n    .update(guardFixtureBytes)\n    .digest('hex') !==\n  '__GUARD_ADAPTER_DIGEST__'\n)\n  throw Error('Reviewed guard fixture required');\nconst { createHistoricalRead } = await import(\n  'data:text/javascript;base64,' + guardFixtureBytes.toString('base64')\n);\nconst readFileSync = createHistoricalRead(nodeReadFileSync, {\n  includeSql: true,\n});\n",
      ],
    ],
  },
  'proposals/invoice-caller-transition/qualify.mjs': {
    before: 'ec33767243ec25c53beb3743c543d4377e2d0c3a2b4f0ce361dc570184995ef9',
    edits: [
      [236, 236, ' as nodeReadFileSync'],
      [
        454,
        454,
        "\n\n// Seal the ordinary historical-fixture adapter before evaluating any bytes.\nconst guardFixturePath =\n  'proposals/invoice-guard-admission/fixture-adapter.mjs';\nconst guardFixtureStat = (await import('node:fs')).lstatSync;\nlet guardFixturePrefix = '';\nfor (const part of guardFixturePath.split('/')) {\n  guardFixturePrefix = guardFixturePrefix\n    ? guardFixturePrefix + '/' + part\n    : part;\n  if (guardFixtureStat(guardFixturePrefix).isSymbolicLink())\n    throw Error('Reviewed guard fixture required');\n}\nconst guardFixtureInfo = guardFixtureStat(guardFixturePath);\nif (!guardFixtureInfo.isFile() || (guardFixtureInfo.mode & 0o777) !== 0o644)\n  throw Error('Reviewed guard fixture required');\nconst guardFixtureBytes = nodeReadFileSync(guardFixturePath);\nif (\n  (await import('node:crypto'))\n    .createHash('sha256')\n    .update(guardFixtureBytes)\n    .digest('hex') !==\n  '__GUARD_ADAPTER_DIGEST__'\n)\n  throw Error('Reviewed guard fixture required');\nconst { createHistoricalRead } = await import(\n  'data:text/javascript;base64,' + guardFixtureBytes.toString('base64')\n);\nconst readFileSync = createHistoricalRead(nodeReadFileSync, {\n  includeSql: true,\n});\n",
      ],
      [4993, 4993, '{ read: readFileSync }'],
      [6717, 6717, '{ read: readFileSync }'],
    ],
  },
  'tests/commercial-invoice-author-checkpoint.test.ts': {
    before: '8210051217c35647ad3560acec625380f48fcef370682614040f18a9cd98a827',
    edits: [
      [10, 10, 'eadFileSync as nodeR'],
      [
        291,
        291,
        ";\n\n// Seal the ordinary historical-fixture adapter before evaluating any bytes.\nconst guardFixturePath =\n  'proposals/invoice-guard-admission/fixture-adapter.mjs';\nconst guardFixtureStat = (await import('node:fs')).lstatSync;\nlet guardFixturePrefix = '';\nfor (const part of guardFixturePath.split('/')) {\n  guardFixturePrefix = guardFixturePrefix\n    ? guardFixturePrefix + '/' + part\n    : part;\n  if (guardFixtureStat(guardFixturePrefix).isSymbolicLink())\n    throw Error('Reviewed guard fixture required');\n}\nconst guardFixtureInfo = guardFixtureStat(guardFixturePath);\nif (!guardFixtureInfo.isFile() || (guardFixtureInfo.mode & 0o777) !== 0o644)\n  throw Error('Reviewed guard fixture required');\nconst guardFixtureBytes = nodeReadFileSync(guardFixturePath);\nif (\n  (await import('node:crypto'))\n    .createHash('sha256')\n    .update(guardFixtureBytes)\n    .digest('hex') !==\n  '__GUARD_ADAPTER_DIGEST__'\n)\n  throw Error('Reviewed guard fixture required');\nconst { createHistoricalRead } = await import(\n  'data:text/javascript;base64,' + guardFixtureBytes.toString('base64')\n);\nconst readFileSync = createHistoricalRead(nodeReadFileSync, {\n  includeSql: false,\n}) as typeof nodeReadFileSync",
      ],
    ],
  },
  'proposals/invoice-caller-admission/qualify.mjs': {
    before: '96a933b122c4b698300e18d1f0b7c6970b0a21a368c3d3bfd58a5b2b49e5bd9b',
    edits: [
      [325, 325, ' as nodeReadFileSync'],
      [
        494,
        494,
        "\n\n// Seal the ordinary historical-fixture adapter before evaluating any bytes.\nconst guardFixturePath =\n  'proposals/invoice-guard-admission/fixture-adapter.mjs';\nconst guardFixtureStat = (await import('node:fs')).lstatSync;\nlet guardFixturePrefix = '';\nfor (const part of guardFixturePath.split('/')) {\n  guardFixturePrefix = guardFixturePrefix\n    ? guardFixturePrefix + '/' + part\n    : part;\n  if (guardFixtureStat(guardFixturePrefix).isSymbolicLink())\n    throw Error('Reviewed guard fixture required');\n}\nconst guardFixtureInfo = guardFixtureStat(guardFixturePath);\nif (!guardFixtureInfo.isFile() || (guardFixtureInfo.mode & 0o777) !== 0o644)\n  throw Error('Reviewed guard fixture required');\nconst guardFixtureBytes = nodeReadFileSync(guardFixturePath);\nif (\n  (await import('node:crypto'))\n    .createHash('sha256')\n    .update(guardFixtureBytes)\n    .digest('hex') !==\n  '__GUARD_ADAPTER_DIGEST__'\n)\n  throw Error('Reviewed guard fixture required');\nconst { createHistoricalRead } = await import(\n  'data:text/javascript;base64,' + guardFixtureBytes.toString('base64')\n);\nconst readFileSync = createHistoricalRead(nodeReadFileSync, {\n  includeSql: true,\n});\n",
      ],
    ],
  },
  'tests/invoice-caller-admission-proposal.test.ts': {
    before: '5e5297339ece57d2f25371e2963463a202f336266a583092fe2ca1f3089743a7',
    edits: [
      [47, 47, 'eadFileSync as nodeR'],
      [
        180,
        180,
        "\n\n// Seal the ordinary historical-fixture adapter before evaluating any bytes.\nconst guardFixturePath =\n  'proposals/invoice-guard-admission/fixture-adapter.mjs';\nconst guardFixtureStat = (await import('node:fs')).lstatSync;\nlet guardFixturePrefix = '';\nfor (const part of guardFixturePath.split('/')) {\n  guardFixturePrefix = guardFixturePrefix\n    ? guardFixturePrefix + '/' + part\n    : part;\n  if (guardFixtureStat(guardFixturePrefix).isSymbolicLink())\n    throw Error('Reviewed guard fixture required');\n}\nconst guardFixtureInfo = guardFixtureStat(guardFixturePath);\nif (!guardFixtureInfo.isFile() || (guardFixtureInfo.mode & 0o777) !== 0o644)\n  throw Error('Reviewed guard fixture required');\nconst guardFixtureBytes = nodeReadFileSync(guardFixturePath);\nif (\n  (await import('node:crypto'))\n    .createHash('sha256')\n    .update(guardFixtureBytes)\n    .digest('hex') !==\n  '__GUARD_ADAPTER_DIGEST__'\n)\n  throw Error('Reviewed guard fixture required');\nconst { createHistoricalRead } = await import(\n  'data:text/javascript;base64,' + guardFixtureBytes.toString('base64')\n);\nconst readFileSync = createHistoricalRead(nodeReadFileSync, {\n  includeSql: true,\n}) as typeof nodeReadFileSync;\n",
      ],
    ],
  },
  'tests/invoice-checker-qualification-baseline.test.ts': {
    before: 'b77ca2c3b7c3c74ab67820eaa9f5b37b67492ff7ca1d85b61837ff79bd2084ce',
    edits: [
      [47, 47, 'eadFileSync as nodeR'],
      [
        138,
        138,
        "\n\n// Seal the ordinary historical-fixture adapter before evaluating any bytes.\nconst guardFixturePath =\n  'proposals/invoice-guard-admission/fixture-adapter.mjs';\nconst guardFixtureStat = (await import('node:fs')).lstatSync;\nlet guardFixturePrefix = '';\nfor (const part of guardFixturePath.split('/')) {\n  guardFixturePrefix = guardFixturePrefix\n    ? guardFixturePrefix + '/' + part\n    : part;\n  if (guardFixtureStat(guardFixturePrefix).isSymbolicLink())\n    throw Error('Reviewed guard fixture required');\n}\nconst guardFixtureInfo = guardFixtureStat(guardFixturePath);\nif (!guardFixtureInfo.isFile() || (guardFixtureInfo.mode & 0o777) !== 0o644)\n  throw Error('Reviewed guard fixture required');\nconst guardFixtureBytes = nodeReadFileSync(guardFixturePath);\nif (\n  (await import('node:crypto'))\n    .createHash('sha256')\n    .update(guardFixtureBytes)\n    .digest('hex') !==\n  '__GUARD_ADAPTER_DIGEST__'\n)\n  throw Error('Reviewed guard fixture required');\nconst { createHistoricalRead } = await import(\n  'data:text/javascript;base64,' + guardFixtureBytes.toString('base64')\n);\nconst readFileSync = createHistoricalRead(nodeReadFileSync, {\n  includeSql: true,\n}) as typeof nodeReadFileSync;\n",
      ],
    ],
  },
});
const guardAdapterTemplate =
  "// Verified historical test inputs only. This grants no admission or execution.\nimport { readFileSync, lstatSync } from 'node:fs';\nimport { createHash } from 'node:crypto';\nconst path = 'scripts/invoice-caller-source-admission.mjs';\nlet prefix = '';\nfor (const part of path.split('/')) {\n  prefix = prefix ? prefix + '/' + part : part;\n  if (lstatSync(prefix).isSymbolicLink())\n    throw Error('Reviewed guard fixture helper required');\n}\nconst info = lstatSync(path);\nif (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o644)\n  throw Error('Reviewed guard fixture helper required');\nconst bytes = readFileSync(path);\nif (\n  createHash('sha256').update(bytes).digest('hex') !==\n  '__GUARD_HELPER_DIGEST__'\n)\n  throw Error('Reviewed guard fixture helper required');\nconst { createGuardHistoricalRead } = await import(\n  'data:text/javascript;base64,' + bytes.toString('base64')\n);\nexport const createHistoricalRead = createGuardHistoricalRead;\n";
let derivedGuardFrame;
function deriveGuardFrame() {
  if (derivedGuardFrame) return derivedGuardFrame;
  const adapter = Buffer.from(
    guardAdapterTemplate.replace(
      '__GUARD_HELPER_DIGEST__',
      hash(executingHelper),
    ),
  );
  const adapterDigest = hash(adapter),
    frame = {
      'proposals/invoice-guard-admission/fixture-adapter.mjs': adapterDigest,
    };
  for (const [p, spec] of Object.entries(guardDerivedSpecs)) {
    const tree = git('ls-tree', guardParent, '--', p).toString().trim();
    if (!/^100644 blob [a-f0-9]{40}\t/.test(tree) || tree.split('\t')[1] !== p)
      guardFail();
    const bytes = original(guardParent, p);
    if (hash(bytes) !== spec.before) guardFail();
    const chunks = [];
    let end = 0;
    for (const [start, stop, replacement] of spec.edits) {
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(stop) ||
        start < end ||
        stop < start ||
        stop > bytes.length
      )
        guardFail();
      chunks.push(
        bytes.subarray(end, start),
        Buffer.from(
          replacement.replaceAll('__GUARD_ADAPTER_DIGEST__', adapterDigest),
        ),
      );
      end = stop;
    }
    chunks.push(bytes.subarray(end));
    frame[p] = hash(Buffer.concat(chunks));
  }
  derivedGuardFrame = Object.freeze(frame);
  return derivedGuardFrame;
}
const historicalFixturePaths = new Set([
  'scripts/invoice-caller-source-admission.mjs',
  'tests/launch-invoice-payment-source.test.ts',
  'tests/invoice-caller-migration-source.test.ts',
  'proposals/invoice-caller-reconciliation/qualify.mjs',
  'proposals/invoice-checker-qualification/baseline.mjs',
  'proposals/invoice-caller-transition/qualify.mjs',
  'tests/commercial-invoice-author-checkpoint.test.ts',
  'proposals/invoice-caller-admission/qualify.mjs',
  'tests/invoice-caller-admission-proposal.test.ts',
  'tests/invoice-checker-qualification-baseline.test.ts',
  'server/invoices/commercial-drafts.proposed.sql',
]);
function guardFail() {
  throw Error('Exact approved invoice guard frame required');
}

// Exact #489 source-only admission. Immutable recipes avoid an H/G hash cycle.
const yearlyAuthor = '3b52b8706bf83eefc0712ec83fca8dda57e76a37';
const yearlyParent = 'b7387ade02d842eeb4eb8d7d1b3ab2f615963f02';
const yearlyGuard = 'proposals/commercial-invoice-connection/source.ts';
const yearlyManifest = 'proposals/commercial-invoice-connection/source.json';
let yearlyFrame;
function exactlyOnce(text, before, after) {
  if (text.split(before).length !== 2) guardFail();
  return text.replace(before, after);
}
const retainedTemplate =
  "// Offline qualification only. Canonical files remain untouched.\nimport { readFileSync, lstatSync } from 'node:fs';\nimport { createHash } from 'node:crypto';\nimport { execFileSync } from 'node:child_process';\nimport { resolve, relative } from 'node:path';\nimport { fileURLToPath } from 'node:url';\nimport { devNull } from 'node:os';\n\nconst directory = 'proposals/invoice-guard-admission';\nconst parent = '5f0f17dc9766411b260d5b53fd2db5a925adc80f';\nconst tree = '868059f16ec4431ee8c8381ddf63fb5ffb1ed9bd';\nconst evidenceHash =\n  'e23de825623031192e5aff45a66c01860211e48f26e5c703cd0cc96375f5d8e5';\nconst patchHash =\n  '2fc927fa37cb8da1ba4eccc8a4ea225ed847e07eadea496130ad61e6c09596cf';\nconst helperPath = 'scripts/invoice-caller-source-admission.mjs';\nconst helperHash =\n  '1d3438c34656e732c0352dab02477ea449ed4e4abd92714156c3ec62ff75e70a';\n// Finite retained-launch compatibility. Original histories and proposal seals stay unchanged.\nconst retainedLaunch = Object.freeze({\n  'proposals/payment-launch-integration/legacy-invoice-fixture.mjs': {\n    before: '2e1cb96bb8c124d4ec11a053582bbcc27a259311ef7d1d09ef486448c53d51c2',\n    after: '9520858626dde02883b5755e3681d1a3ba35f00f9a57eb55fe1f613a8befbe06',\n  },\n  'tests/launch-caller-payment-integration.test.ts': {\n    before: 'e9efe20d12c69c4c9c17b4027e88b34f72589e834e5975169e4062a20912379c',\n    after: 'f9289b166c0170072446aa35e261f2108fa3f62602dd6f4e34ccf952195949ab',\n  },\n});\nconst digest = (bytes) => createHash('sha256').update(bytes).digest('hex');\nconst fail = () => {\n  throw Error('Exact sealed invoice guard proposal required');\n};\nconst gitEnvironment = Object.freeze({\n  PATH: process.env.PATH,\n  LC_ALL: 'C',\n  GIT_CONFIG_NOSYSTEM: '1',\n  GIT_CONFIG_SYSTEM: devNull,\n  GIT_CONFIG_GLOBAL: devNull,\n  GIT_CONFIG_COUNT: '0',\n  GIT_ATTR_NOSYSTEM: '1',\n  GIT_ALLOW_PROTOCOL: '',\n  GIT_NO_LAZY_FETCH: '1',\n  GIT_TERMINAL_PROMPT: '0',\n  GIT_OPTIONAL_LOCKS: '0',\n});\nfunction git(...args) {\n  return execFileSync(\n    'git',\n    [\n      '--no-replace-objects',\n      '--no-pager',\n      '-c',\n      'core.hooksPath=' + devNull,\n      '-c',\n      'core.fsmonitor=false',\n      '-c',\n      'credential.helper=',\n      ...args,\n    ],\n    { env: gitEnvironment, stdio: ['ignore', 'pipe', 'pipe'] },\n  );\n}\nlet immutableFrame;\nfunction baseline() {\n  if (!immutableFrame) {\n    if (\n      git('rev-parse', parent + '^{tree}')\n        .toString()\n        .trim() !== tree\n    )\n      fail();\n    immutableFrame = git('ls-tree', '-rz', parent)\n      .toString()\n      .split('\\0')\n      .filter(Boolean)\n      .map((row) => {\n        const [meta, path] = row.split('\\t');\n        const [mode, type, oid] = meta.split(' ');\n        if (!['100644', '100755'].includes(mode) || type !== 'blob') fail();\n        return Object.freeze({ mode, oid, path });\n      });\n    if (immutableFrame.length !== 2421) fail();\n    Object.freeze(immutableFrame);\n  }\n  return immutableFrame;\n}\nfunction regular(path, mode, stat) {\n  let prefix = '';\n  for (const part of path.split('/')) {\n    prefix = prefix ? prefix + '/' + part : part;\n    const info = stat(prefix);\n    if (info.isSymbolicLink()) fail();\n    if (prefix !== path && !info.isDirectory()) fail();\n  }\n  const info = stat(path);\n  if (!info.isFile() || (info.mode & 0o777) !== mode) fail();\n}\nfunction checked(path, hash, read, stat) {\n  regular(path, 0o644, stat);\n  const bytes = Buffer.from(read(path));\n  if (digest(bytes) !== hash) fail();\n  regular(path, 0o644, stat);\n  return bytes;\n}\nfunction inspect({ read, stat }) {\n  const evidence = JSON.parse(\n    checked(directory + '/evidence.json', evidenceHash, read, stat),\n  );\n  checked(directory + '/admission.patch', patchHash, read, stat);\n  if (\n    evidence.parent !== parent ||\n    evidence.patchSha256 !== patchHash ||\n    evidence.files.length !== 10 ||\n    evidence.admissionAuthorized !== false\n  )\n    fail();\n  const payloads = new Map();\n  for (const row of evidence.files) {\n    if (row.mode !== '100644' || payloads.has(row.path)) fail();\n    payloads.set(\n      row.path,\n      checked(directory + '/payload/' + row.path, row.after, read, stat),\n    );\n  }\n  if (digest(payloads.get(helperPath)) !== helperHash) fail();\n  for (const row of evidence.fixtureFiles)\n    checked(row.path, row.sha256, read, stat);\n  const targets = new Map(evidence.files.map((row) => [row.path, row]));\n  const phases = new Set();\n  const retainedPhases = new Set();\n  for (const row of baseline()) {\n    regular(row.path, row.mode === '100644' ? 0o644 : 0o755, stat);\n    const bytes = Buffer.from(read(row.path));\n    const target = targets.get(row.path);\n    if (target) {\n      const hash = digest(bytes);\n      if (hash === target.before) phases.add('before');\n      else if (hash === target.after) phases.add('after');\n      else fail();\n    } else if (Object.hasOwn(retainedLaunch, row.path)) {\n      const pin = retainedLaunch[row.path],\n        hash = digest(bytes);\n      if (hash === pin.before) retainedPhases.add('original');\n      else if (hash === pin.after) retainedPhases.add('proposed');\n      else fail();\n    } else {\n      const oid = createHash('sha1')\n        .update(Buffer.from('blob ' + bytes.length + '\\0'))\n        .update(bytes)\n        .digest('hex');\n      if (oid !== row.oid) fail();\n    }\n    regular(row.path, row.mode === '100644' ? 0o644 : 0o755, stat);\n  }\n  if (\n    phases.size !== 1 ||\n    retainedPhases.size !== 1 ||\n    (retainedPhases.has('proposed') && phases.has('before'))\n  )\n    fail();\n  return {\n    payloads,\n    phase: [...phases][0],\n    retainedPhase: [...retainedPhases][0],\n  };\n}\nconst key = (path) =>\n  relative(\n    process.cwd(),\n    path instanceof URL ? fileURLToPath(path) : resolve(String(path)),\n  );\n\nasync function qualifyLegacyInvoiceGuardProposal({\n  read = readFileSync,\n  stat = lstatSync,\n} = {}) {\n  const captured = inspect({ read, stat });\n  const bytes = Buffer.from(captured.payloads.get(helperPath));\n  const helper = await import(\n    'data:text/javascript;base64,' + bytes.toString('base64')\n  );\n  const inspectCaptured = () => {\n    const current = inspect({ read, stat });\n    if (\n      current.phase !== captured.phase ||\n      current.retainedPhase !== captured.retainedPhase\n    )\n      fail();\n    return current;\n  };\n  // Import is an await boundary. Source and packet reads stay fresh.\n  inspectCaptured();\n  const readCurrent = (path, encoding) => {\n    const bytes = captured.payloads.get(key(path));\n    if (!bytes) return read(path, encoding);\n    return encoding\n      ? bytes.toString(\n          typeof encoding === 'string' ? encoding : encoding.encoding,\n        )\n      : Buffer.from(bytes);\n  };\n  const check = () => {\n    inspectCaptured();\n    const result = helper.verifyInvoiceGuardFrame({ readCurrent, stat });\n    // The helper performs further current/history reads. Recheck the full frame.\n    inspectCaptured();\n    return result;\n  };\n  check();\n  return Object.freeze({\n    classification: 'UNAPPLIED_OFFLINE_QUALIFICATION_ONLY',\n    parent,\n    canonicalPhase: captured.phase,\n    helper,\n    readCurrent,\n    stat,\n    check,\n    admissionAuthorized: false,\n    sqlInstallation: 'NOT_RUN',\n  });\n}\n\n// Existing historical proposal remains a historical view, never current admission.\nconst successorPins = Object.freeze({\n  'scripts/invoice-caller-source-admission.mjs': {\n    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',\n    before: '1d3438c34656e732c0352dab02477ea449ed4e4abd92714156c3ec62ff75e70a',\n    after: '0000000100000000000000000000000000000000000000000000000000000000',\n  },\n  'proposals/invoice-guard-admission/fixture-adapter.mjs': {\n    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',\n    before: '6c6a5758d3a3219b4fac88e5dbbeb2e24f6182bf73c8eba3f7bc5c44c8cd61bc',\n    after: '0000000200000000000000000000000000000000000000000000000000000000',\n  },\n  'tests/invoice-caller-migration-source.test.ts': {\n    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',\n    before: '866339cc0e394971886ff6c8d9007ac485642d089bf07e28b812cc884d2b0c8a',\n    after: '0000000300000000000000000000000000000000000000000000000000000000',\n  },\n  'proposals/invoice-caller-reconciliation/qualify.mjs': {\n    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',\n    before: '96ed1c379bc2ad3c6f03f1f54b1a66933d486b3793c688913bc9ea26074d27a7',\n    after: '0000000400000000000000000000000000000000000000000000000000000000',\n  },\n  'proposals/invoice-checker-qualification/baseline.mjs': {\n    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',\n    before: '949edd4dce7557f8c9829494579ae9e0babd572441e710fb3940479d41a04a25',\n    after: '0000000500000000000000000000000000000000000000000000000000000000',\n  },\n  'proposals/invoice-caller-transition/qualify.mjs': {\n    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',\n    before: '361b24b71ca03b54e86d521bde76f5e95be53125c84ffcfb881548b732ab2645',\n    after: '0000000600000000000000000000000000000000000000000000000000000000',\n  },\n  'tests/commercial-invoice-author-checkpoint.test.ts': {\n    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',\n    before: '9519540efd5c531c3d79fc101d48e139c26de8240121a16ce9a13e66f04473ab',\n    after: '0000000700000000000000000000000000000000000000000000000000000000',\n  },\n  'proposals/invoice-caller-admission/qualify.mjs': {\n    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',\n    before: '8137978d6b2d2f8e91a864db2d6b61ae0a0391faeea38f25c63db19abb8c4629',\n    after: '0000000800000000000000000000000000000000000000000000000000000000',\n  },\n  'tests/invoice-caller-admission-proposal.test.ts': {\n    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',\n    before: '1cbcc2051c20a2287d93e6f148f41f62c8f3c60ec13557f6d0be8cd895f2a11a',\n    after: '0000000900000000000000000000000000000000000000000000000000000000',\n  },\n  'tests/invoice-checker-qualification-baseline.test.ts': {\n    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',\n    before: '9b2ef5e2dfcd99c218a249bc6cdbc7f30dfb24521ad23478ed7c72f15f2d7341',\n    after: '0000000a00000000000000000000000000000000000000000000000000000000',\n  },\n  'tests/launch-invoice-payment-source.test.ts': {\n    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',\n    before: 'ada16b37c940f58473b5449bf53317ca1bff81abfb3e3125dece0447b2814862',\n    after: '0000000b00000000000000000000000000000000000000000000000000000000',\n  },\n  'proposals/commercial-invoice-issuance/presentation.ts': {\n    commit: 'afb028058b479d1ab17a9e516d1460cb1c4de4f3',\n    before: 'a181a67faf3f8b3264b5cd00478b38c5a3c9d67c2b7f2463d6d81c01bf477981',\n    after: 'a63a605af3b1e03a0169828340f4938a50031a6f131404054da60e2db610ea6b',\n  },\n});\n\nlet successorProjection;\nexport async function qualifyInvoiceGuardProposal({\n  read = readFileSync,\n  stat = lstatSync,\n} = {}) {\n  const currentHelper = 'scripts/invoice-caller-source-admission.mjs';\n  const bytes = checked(\n    currentHelper,\n    '0000000100000000000000000000000000000000000000000000000000000000',\n    read,\n    stat,\n  );\n  const current = await import(\n    'data:text/javascript;base64,' + bytes.toString('base64')\n  );\n  const checkCurrent = (legacyError = false) => {\n    try {\n      checked(\n        currentHelper,\n        '0000000100000000000000000000000000000000000000000000000000000000',\n        read,\n        stat,\n      );\n      current.verifyInvoiceGuardFrame({ readCurrent: read, stat });\n    } catch (error) {\n      if (legacyError) fail();\n      throw error;\n    }\n  };\n  checkCurrent(true);\n  if (!successorProjection) {\n    const map = new Map();\n    for (const [path, pin] of Object.entries(successorPins)) {\n      const original = git('show', pin.commit + ':' + path);\n      if (digest(original) !== pin.before) fail();\n      map.set(path, original);\n    }\n    successorProjection = map;\n  }\n  const historicalRead = (path, encoding) => {\n    const actual = read(path, encoding),\n      p = key(path),\n      historical = successorProjection.get(p);\n    if (!historical) return actual;\n    if (digest(Buffer.from(actual)) !== successorPins[p].after) fail();\n    return encoding\n      ? historical.toString(\n          typeof encoding === 'string' ? encoding : encoding.encoding,\n        )\n      : Buffer.from(historical);\n  };\n  const legacy = await qualifyLegacyInvoiceGuardProposal({\n    read: historicalRead,\n    stat,\n  });\n  checkCurrent(true);\n  const checkedCall = (fn, args) => {\n    checkCurrent();\n    const result = fn(...args);\n    checkCurrent();\n    return result;\n  };\n  const helper = Object.freeze({\n    verifyInvoiceGuardFrame: (...args) =>\n      checkedCall(legacy.helper.verifyInvoiceGuardFrame, args),\n    admitInvoiceCallerSource: (...args) =>\n      checkedCall(legacy.helper.admitInvoiceCallerSource, args),\n    createGuardHistoricalRead: (...args) => {\n      const historical = checkedCall(\n        legacy.helper.createGuardHistoricalRead,\n        args,\n      );\n      return (...readArgs) => checkedCall(historical, readArgs);\n    },\n  });\n  return Object.freeze({\n    ...legacy,\n    helper,\n    check: () => checkedCall(legacy.check, []),\n  });\n}\n";
const retainedTokens = {
  'scripts/invoice-caller-source-admission.mjs':
    '0000000100000000000000000000000000000000000000000000000000000000',
  'proposals/invoice-guard-admission/fixture-adapter.mjs':
    '0000000200000000000000000000000000000000000000000000000000000000',
  'tests/invoice-caller-migration-source.test.ts':
    '0000000300000000000000000000000000000000000000000000000000000000',
  'proposals/invoice-caller-reconciliation/qualify.mjs':
    '0000000400000000000000000000000000000000000000000000000000000000',
  'proposals/invoice-checker-qualification/baseline.mjs':
    '0000000500000000000000000000000000000000000000000000000000000000',
  'proposals/invoice-caller-transition/qualify.mjs':
    '0000000600000000000000000000000000000000000000000000000000000000',
  'tests/commercial-invoice-author-checkpoint.test.ts':
    '0000000700000000000000000000000000000000000000000000000000000000',
  'proposals/invoice-caller-admission/qualify.mjs':
    '0000000800000000000000000000000000000000000000000000000000000000',
  'tests/invoice-caller-admission-proposal.test.ts':
    '0000000900000000000000000000000000000000000000000000000000000000',
  'tests/invoice-checker-qualification-baseline.test.ts':
    '0000000a00000000000000000000000000000000000000000000000000000000',
  'tests/launch-invoice-payment-source.test.ts':
    '0000000b00000000000000000000000000000000000000000000000000000000',
};
function deriveYearlyFrame() {
  if (yearlyFrame) return yearlyFrame;
  if (
    git('show', '--no-patch', '--format=%P', yearlyAuthor).toString().trim() !==
      yearlyParent ||
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      yearlyAuthor,
    )
      .toString()
      .trim() !==
      'M\tproposals/commercial-invoice-connection/source.json\nM\tproposals/commercial-invoice-connection/source.ts\nM\ttests/commercial-invoice-connection-source.test.ts'
  )
    guardFail();
  const immutable = (path, digest) => {
    const entry = git('ls-tree', yearlyAuthor, '--', path).toString().trim();
    if (
      !/^100644 blob [a-f0-9]{40}\t/.test(entry) ||
      entry.split('\t')[1] !== path
    )
      guardFail();
    const bytes = original(yearlyAuthor, path);
    if (hash(bytes) !== digest) guardFail();
    return bytes;
  };
  immutable(
    helperPath,
    '1d3438c34656e732c0352dab02477ea449ed4e4abd92714156c3ec62ff75e70a',
  );
  const g = immutable(
    yearlyGuard,
    '7ea759100c2b2fa406dfe7202d1da8367a92d48feb7166a04fa41bdb5f15d06f',
  ).toString();
  let manifest = immutable(
    yearlyManifest,
    '28bc080f9a034ec1dd13c81a0806a288af14c7dd809169c730db1565b9710a44',
  ).toString();
  immutable(
    'tests/commercial-invoice-connection-source.test.ts',
    'ddf9b5cb015f74732b1a19b50ccf6464ea53aa23c4e81a644a164f8e933b67d1',
  );
  const m = JSON.parse(manifest),
    frame = { ...m.source };
  if (Object.keys(frame).length !== 52 || m.operationalReady !== false)
    guardFail();
  for (const [path, digest] of Object.entries(guardFrame)) {
    if (
      frame[path] !==
      (path === 'proposals/commercial-invoice-issuance/presentation.ts'
        ? 'a63a605af3b1e03a0169828340f4938a50031a6f131404054da60e2db610ea6b'
        : digest)
    )
      guardFail();
  }
  const launch = original(guardParent, launchPath).toString();
  const updates = {
    ...deriveGuardFrame(),
    [helperPath]: hash(executingHelper),
    [launchPath]: hash(
      Buffer.from(exactlyOnce(launch, oldHelperHash, hash(executingHelper))),
    ),
  };
  immutable(
    'proposals/invoice-guard-admission/qualify.mjs',
    '16cf2e24c6e8925ef8ec401f913a0277c0debde1ced48c35a19b47aeda9c0c39',
  );
  let retained = retainedTemplate;
  for (const [path, token] of Object.entries(retainedTokens)) {
    if (!retained.includes(token)) guardFail();
    retained = retained.replaceAll(token, updates[path]);
  }
  updates['proposals/invoice-guard-admission/qualify.mjs'] = hash(
    Buffer.from(retained),
  );
  const marker = '\n  {\n',
    start = g.indexOf(marker, g.indexOf(marker) + 1),
    stop = g.indexOf('\n  },\n]);', start);
  if (start < 0 || stop < start) guardFail();
  let slot = g.slice(start, stop);
  const manifestStart = manifest.indexOf('  "source": {'),
    manifestStop = manifest.indexOf('\n  },', manifestStart);
  if (manifestStart < 0 || manifestStop < manifestStart) guardFail();
  let manifestSlot = manifest.slice(manifestStart, manifestStop);
  for (const [path, digest] of Object.entries(updates)) {
    if (path === 'proposals/invoice-guard-admission/qualify.mjs') {
      slot +=
        '\n    ' +
        JSON.stringify(path).replaceAll('"', "'") +
        ':\n      ' +
        JSON.stringify(digest).replaceAll('"', "'") +
        ',';
      manifestSlot +=
        ',\n    ' + JSON.stringify(path) + ': ' + JSON.stringify(digest);
      frame[path] = digest;
      continue;
    }
    const before = frame[path];
    if (typeof before !== 'string' || !/^[a-f0-9]{64}$/.test(digest))
      guardFail();
    slot = exactlyOnce(slot, before, digest);
    manifestSlot = exactlyOnce(manifestSlot, before, digest);
    frame[path] = digest;
  }
  manifest =
    manifest.slice(0, manifestStart) +
    manifestSlot +
    manifest.slice(manifestStop);
  const guard = exactlyOnce(
    g.slice(0, start) + slot + g.slice(stop),
    '28bc080f9a034ec1dd13c81a0806a288af14c7dd809169c730db1565b9710a44',
    hash(Buffer.from(manifest)),
  );
  frame[yearlyManifest] = hash(Buffer.from(manifest));
  frame[yearlyGuard] = hash(Buffer.from(guard));
  frame['tests/commercial-invoice-connection-source.test.ts'] =
    'ddf9b5cb015f74732b1a19b50ccf6464ea53aa23c4e81a644a164f8e933b67d1';
  yearlyFrame = Object.freeze(frame);
  return yearlyFrame;
}

function guardCurrent(read, stat) {
  for (const [p, digest] of Object.entries(deriveYearlyFrame())) {
    let prefix = '';
    for (const part of p.split('/')) {
      prefix = prefix ? prefix + '/' + part : part;
      if (stat(prefix).isSymbolicLink()) guardFail();
    }
    const info = stat(p);
    if (
      !info.isFile() ||
      (info.mode & 0o777) !== 0o644 ||
      hash(read(p)) !== digest
    )
      guardFail();
  }
  for (const p of [helperPath, launchPath]) {
    let prefix = '';
    for (const part of p.split('/')) {
      prefix = prefix ? prefix + '/' + part : part;
      if (stat(prefix).isSymbolicLink()) guardFail();
    }
    const info = stat(p);
    if (!info.isFile() || (info.mode & 0o777) !== 0o644) guardFail();
  }
}
export function verifyInvoiceGuardFrame({
  readCurrent = readFileSync,
  readOriginal = original,
  metadata = git,
  stat = lstatSync,
} = {}) {
  guardCurrent(readCurrent, stat);
  const capturedHelper = Buffer.from(readCurrent(helperPath));
  if (!capturedHelper.equals(executingHelper)) guardFail();
  const capturedLaunch = Buffer.from(readCurrent(launchPath));
  if (
    metadata('show', '--no-patch', '--format=%P', guardAuthor)
      .toString()
      .trim() !== guardParent
  )
    guardFail();
  if (
    metadata(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      guardAuthor,
    )
      .toString()
      .trim() !==
    'M\t' + guardSql
  )
    guardFail();
  for (const [commit, digest] of [
    [guardParent, guardBefore],
    [guardAuthor, guardAfter],
  ]) {
    const tree = metadata('ls-tree', commit, '--', guardSql).toString().trim();
    if (
      !/^100644 blob [a-f0-9]{40}\t/.test(tree) ||
      tree.split('\t')[1] !== guardSql ||
      hash(readOriginal(commit, guardSql)) !== digest
    )
      guardFail();
  }
  if (
    hash(readCurrent(guardPatch)) !== guardPatchHash ||
    hash(readOriginal(guardAuthor, guardPatch)) !== guardPatchHash
  )
    guardFail();
  const parentLaunch = readOriginal(guardParent, launchPath).toString();
  if (
    parentLaunch.split(oldHelperHash).length !== 2 ||
    !capturedLaunch.equals(
      Buffer.from(parentLaunch.replace(oldHelperHash, hash(capturedHelper))),
    )
  )
    guardFail();
  guardCurrent(readCurrent, stat);
  if (
    !capturedHelper.equals(readCurrent(helperPath)) ||
    !capturedLaunch.equals(readCurrent(launchPath))
  )
    guardFail();
  return Object.freeze({
    classification: 'DEVELOPMENT_GUARD_SOURCE_ONLY',
    sourceAuthor: guardAuthor,
    sqlHash: guardAfter,
    operationalAcceptance: 'NOT_RUN',
  });
}
export function createGuardHistoricalRead(
  nodeRead = readFileSync,
  { includeSql = true } = {},
) {
  // Source witnesses are current. Only named historical fixture inputs are projected.
  verifyInvoiceGuardFrame({ readCurrent: nodeRead });
  const helper = Buffer.from(nodeRead(helperPath)),
    launch = Buffer.from(nodeRead(launchPath));
  const captured = new Map(
    [...historicalFixturePaths].map((p) => [
      p,
      Buffer.from(original(guardParent, p)),
    ]),
  );
  return function read(path, encoding) {
    guardCurrent(nodeRead, lstatSync);
    if (
      !helper.equals(nodeRead(helperPath)) ||
      !launch.equals(nodeRead(launchPath))
    )
      guardFail();
    const p = relative(
      process.cwd(),
      path instanceof URL ? fileURLToPath(path) : resolve(String(path)),
    );
    if (captured.has(p) && (includeSql || p !== guardSql)) {
      const bytes = captured.get(p);
      return encoding
        ? bytes.toString(
            typeof encoding === 'string' ? encoding : encoding.encoding,
          )
        : Buffer.from(bytes);
    }
    return nodeRead(path, encoding);
  };
}
