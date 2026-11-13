// Finite build/test source proof ONLY; no runtime or launch authority.
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
    sha256: '4879c0b0f3da8bc2e5d981faae43fe443c317ffcd400b654fc550f0605149a08',
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
const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args]);
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
  if (!Object.hasOwn(historical, path)) return false;
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
      fresh = readCurrent(companion.path);
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
  return true;
}
