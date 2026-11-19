// Explicit trusted TEST consumer only. Canonical financial modules remain unchanged.
// Captured fixed modules and four named TEST inputs grant no default C/H admission.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import {
  readFileSync,
  readdirSync,
  lstatSync,
  realpathSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { tmpdir, devNull } from 'node:os';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest';

const rawPins: Readonly<Record<string, string>> = Object.freeze({
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
  'proposals/commercial-invoice-issuance/issuance.proposed.sql':
    '961c2dc380695ed2d910108d09303fff9b9018fe8d159beb9b958ddb2725d022',
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
  'scripts/check-payment-ack-admission.mjs':
    'ba39a5d3b8e7c5bb63ccdfb22b1048c304e7b49b5afef87c157de0795a6c24aa',
  'scripts/invoice-caller-source-admission.mjs':
    'cf28a441f146c5e4d398eb0ea0b78a999dd0f744e19424c46f3e95de74229438',
  'scripts/payment-response-source-admission.mjs':
    'be3fc85b5fb3997a7f2e6617b44348c657db2fdaa289c6a5689fa501aa3ff684',
  'server/customer/broker-auth.ts':
    '709018249d889504b860e4cf0f4caa5cbdd1c2b04f58c53226f4499c68fd46d6',
  'server/invoices/commercial-caller-connection.ts':
    '3d892a8ae7757a6f480fde4638f17f4b642436ba728446dfd84811590be0aeed',
  'server/invoices/commercial-draft-client.ts':
    '94aa164e60c780cb53f8658b16c57bc9c17da5d9469c73f9d73cab627dcea694',
  'server/invoices/commercial-drafts.proposed.sql':
    'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c',
  'server/payments/control-store.ts':
    '2dc82d0ff2548051de6df1461ddf783355e602da914a099bf14f0eba29f3ac7c',
  'server/payments/refunds.ts':
    '267912113acc418387beb86826b06c2689bac9f9a00589a0cd5fc6df1aa4158e',
  'server/payments/response-json.ts':
    '3d361bd32f9cc2ff82b9d4c1ad29ca0218199c11bc903a59ec5a644dd139c970',
  'server/payments/sandbox.ts':
    '0c6bc1aa8e78ed7f6d86128e79055630cb41ec5281ed32a0bf7bbdc616a8ccc6',
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
  'proposals/commercial-invoice-connection/source.ts':
    '05d7e2510d2993720bff81d71729edb838a496d72c867e345252c5d10448fe96',
  'proposals/commercial-invoice-connection/source.json':
    '93f1d88a9f614504e5647a8d12b0f49f6a5f0e86218b267f8659ecbbabf469dc',
  'tests/commercial-invoice-connection-source.test.ts':
    '3a88289f738085b95f834dbc2f18a1a315f630db04ca56ca26d99dca0f08cf37',
  'server/payments/reconciliation.ts':
    '90f8763430b0c208c1741c00224ea2b51db68f5c7c3a6c447b06856013744746',
});
const anchors: Readonly<Record<string, string>> = Object.freeze({
  'proposals/invoice-caller-reconciliation/native.fixture.ts':
    '60c0e77f407a7368d2870fb58074dc6ba72d4b4e618729f00a6c4d225df8f937',
  'proposals/invoice-caller-reconciliation/qualify.mjs':
    'fd1f640afb20c5b933d0a5ec6b5607a1732b830211b1b1b7de4eb0719ef03b9c',
  'proposals/invoice-caller-fixture-migration/source-author-baseline.mjs':
    'cb1a4069463d02d7b11d683bc38297ae110375a683809e15ec87159aa2ca1886',
  'proposals/commercial-invoice-connection/source.ts':
    '05d7e2510d2993720bff81d71729edb838a496d72c867e345252c5d10448fe96',
});
const inheritedHelpers: Readonly<Record<string, string>> = Object.freeze({
  'tests/database/engine.ts':
    '50806fe72a97a401d636f497ee854fb3c2246bcec498257b00c6229ca374d6c2',
  'src/domain/estimating/calculation.ts':
    '30480694126b1cc1cd17dc448a91fb944ef227f9d49160ca12d15777d1bf6a70',
  'src/domain/intake.ts':
    '8911284f4a8618094476f72e6a829863ae8d50bd268643ad068d0574fc41ef1d',
  'src/domain/estimating/types.ts':
    '5e878de9c0a9cbf5f68055054b336db9f68ba4a466ec66ea9b8c66b2952d14d5',
});
const historicalPins: Readonly<
  Record<string, { ref: string; sha256: string }>
> = Object.freeze({
  'scripts/payment-response-source-admission.mjs': {
    ref: '3f0c6b53747e60765cdc7faf1308b57ce730676f',
    sha256: '74c672d6725876285c8bd2ee844aec88c183b56b12181a0373c874e02cf26510',
  },
  'scripts/check-payment-ack-admission.mjs': {
    ref: '3f0c6b53747e60765cdc7faf1308b57ce730676f',
    sha256: 'b1f297fc3d62cfe77a9ed9912a1a6f896a14a70cf796da2e1f24d5e5c0441ed9',
  },
  'proposals/commercial-invoice-connection/source.ts': {
    ref: '0231feada0cac25f1461f146683f1759c8ccfd4b',
    sha256: '5962272679a66e54b6bb30c8cc52502e0703434956f3dfdd68995e3cc233aa13',
  },
  'tests/commercial-invoice-connection-source.test.ts': {
    ref: '0231feada0cac25f1461f146683f1759c8ccfd4b',
    sha256: 'ddf9b5cb015f74732b1a19b50ccf6464ea53aa23c4e81a644a164f8e933b67d1',
  },
});
const knownImports = {
  native: [
    "import { Client } from 'pg';",
    "import { readFileSync, readdirSync } from 'node:fs';",
    "import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest';",
    "import {\n  createTestDatabase,\n  type TestDatabase,\n} from '../../tests/database/engine';",
    "import { blankEstimate } from '../../src/domain/estimating/calculation';",
    "import type { EstimateBundle } from '../../src/domain/estimating/types';",
    "import type {\n  CommercialDraft,\n  DraftWrite,\n  DraftIdentity,\n} from '../../server/invoices/commercial-draft-client';",
    "import { qualify } from './qualify.mjs';",
  ],
  qualifier: [
    "import { proposalBaseline } from '../invoice-caller-fixture-migration/source-author-baseline.mjs';",
    "import assert from 'node:assert/strict';",
    "import { createHash } from 'node:crypto';",
    "import { execFileSync } from 'node:child_process';",
    "import { createRequire } from 'node:module';",
    "import {\n  mkdtempSync,\n  readFileSync as nodeReadFileSync,\n  mkdirSync,\n  writeFileSync,\n  rmSync,\n  symlinkSync,\n} from 'node:fs';",
    "import { resolve, join, dirname } from 'node:path';",
    "import { tmpdir, devNull } from 'node:os';",
    "import ts from 'typescript';",
    "import { existsSync } from 'node:fs';",
  ],
  baseline: [
    "import assert from 'node:assert/strict';",
    "import { createHash } from 'node:crypto';",
    "import { readFileSync, lstatSync } from 'node:fs';",
    "import { execFileSync } from 'node:child_process';",
  ],
};
const denied = () => Error('Exact captured native caller fixture required');
const hash = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const root = realpathSync(process.cwd());
const identity = lstatSync(root);
if (
  fileURLToPath(import.meta.url) !==
  join(root, 'tests/database/commercial-invoice-caller-proposal.test.ts')
)
  throw denied();
function checkRoot() {
  const now = lstatSync(root);
  if (
    process.cwd() !== root ||
    realpathSync(root) !== root ||
    !now.isDirectory() ||
    now.isSymbolicLink() ||
    now.dev !== identity.dev ||
    now.ino !== identity.ino
  )
    throw denied();
}
function regular(key: string) {
  checkRoot();
  for (let current = root; ; current = dirname(current)) {
    const info = lstatSync(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw denied();
    if (dirname(current) === current) break;
  }
  let current = root;
  const pieces = key.split('/');
  for (let index = 0; index < pieces.length; index++) {
    const piece = pieces[index];
    if (!piece || piece === '.' || piece === '..') throw denied();
    current = join(current, piece);
    const info = lstatSync(current);
    if (
      info.isSymbolicLink() ||
      (index < pieces.length - 1 && !info.isDirectory())
    )
      throw denied();
  }
  const first = lstatSync(current);
  if (!first.isFile() || (first.mode & 0o7777) !== 0o644) throw denied();
  const bytes = readFileSync(current);
  const last = lstatSync(current);
  if (
    first.dev !== last.dev ||
    first.ino !== last.ino ||
    first.mode !== last.mode ||
    first.size !== last.size ||
    first.mtimeMs !== last.mtimeMs
  )
    throw denied();
  return bytes;
}
function checkCurrent() {
  for (let pass = 0; pass < 2; pass++) {
    checkRoot();
    for (const [key, digest] of Object.entries(rawPins))
      if (hash(regular(key)) !== digest) throw denied();
    for (const [key, digest] of Object.entries(anchors))
      if (hash(regular(key)) !== digest) throw denied();
    // These helpers/packages remain inherited TCB: this is not transitive capture.
    for (const [key, digest] of Object.entries(inheritedHelpers))
      if (hash(regular(key)) !== digest) throw denied();
  }
  if (
    hash(regular('server/payments/reconciliation.ts')) !==
    rawPins['server/payments/reconciliation.ts']
  )
    throw denied();
}
function capture(key: string) {
  const bytes = regular(key);
  if (hash(bytes) !== anchors[key]) throw denied();
  return Buffer.from(bytes);
}
function utf8(bytes: Uint8Array) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
function maskImports(source: string, declarations: readonly string[]) {
  let result = source;
  for (const declaration of declarations) {
    const at = result.indexOf(declaration);
    if (at < 0 || result.indexOf(declaration, at + 1) >= 0) throw denied();
    result =
      result.slice(0, at) +
      declaration.replace(/[^\r\n]/g, ' ') +
      result.slice(at + declaration.length);
  }
  return result;
}
function removeExport(source: string, before: string, after: string) {
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + 1) >= 0) throw denied();
  return source.slice(0, at) + after + source.slice(at + before.length);
}
type ModuleFactory = new (
  ...source: string[]
) => (...bindings: unknown[]) => Promise<Record<string, unknown>>;
const AsyncFunction = Object.getPrototypeOf(async function () {})
  .constructor as ModuleFactory;
async function evaluate(
  source: string,
  names: readonly string[],
  bindings: readonly unknown[],
  exports: string,
) {
  if (names.length !== bindings.length || source.includes('import.meta'))
    throw denied();
  const run = new AsyncFunction(
    ...names,
    '"use strict";\n' + source + '\nreturn ' + exports + ';',
  );
  return await run.call(undefined, ...bindings);
}
async function fresh<T>(operation: () => Promise<T>): Promise<T> {
  checkCurrent();
  try {
    return await operation();
  } finally {
    checkCurrent();
  }
}

checkCurrent();
const capturedNative = capture(
  'proposals/invoice-caller-reconciliation/native.fixture.ts',
);
const capturedQualifier = capture(
  'proposals/invoice-caller-reconciliation/qualify.mjs',
);
const capturedBaseline = capture(
  'proposals/invoice-caller-fixture-migration/source-author-baseline.mjs',
);
// Only immutable historical data is retained; every current proof remains fresh.
const historical = new Map<string, Buffer>();
const gitEnvironment = {
  PATH: '/usr/bin:/bin',
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
};
function metadata(args: string[]) {
  return execFileSync(
    '/usr/bin/git',
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
      ...args,
    ],
    {
      cwd: root,
      env: gitEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    },
  );
}
for (const [key, pin] of Object.entries(historicalPins)) {
  const bytes = metadata(['show', pin.ref + ':' + key]);
  const oid = createHash('sha1')
    .update('blob ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex');
  if (
    hash(bytes) !== pin.sha256 ||
    metadata(['ls-tree', pin.ref, '--', key]).toString().trim() !==
      '100644 blob ' + oid + '\t' + key
  )
    throw denied();
  historical.set(key, Buffer.from(bytes));
}
const validatedRead: typeof readFileSync = ((
  file: Parameters<typeof readFileSync>[0],
  options?: Parameters<typeof readFileSync>[1],
) => {
  const result =
    options === undefined ? readFileSync(file) : readFileSync(file, options);
  const key =
    typeof file === 'string'
      ? relative(root, resolve(file))
      : file instanceof URL
        ? relative(root, fileURLToPath(file))
        : '';
  if (!Object.hasOwn(rawPins, key)) return result;
  const encoding = typeof options === 'string' ? options : options?.encoding;
  const bytes =
    typeof result === 'string'
      ? Buffer.from(result, encoding ?? 'utf8')
      : result;
  if (hash(bytes) !== rawPins[key]) throw denied();
  const before = historical.get(key);
  if (!before) return result;
  return encoding ? before.toString(encoding) : Buffer.from(before);
}) as typeof readFileSync;

// Normal Vite identities resolve their own existing transitive imports.
// They are inherited TCB, not arbitrary paths accepted by a custom module loader.
const [pg, engine, calculation, compiler] = await fresh(() =>
  Promise.all([
    import('pg'),
    import('./engine'),
    import('../../src/domain/estimating/calculation'),
    import('typescript'),
  ]),
);
let baselineSource = maskImports(utf8(capturedBaseline), knownImports.baseline);
baselineSource = removeExport(
  baselineSource,
  'export const callerAuthor',
  'const callerAuthor',
);
baselineSource = removeExport(
  baselineSource,
  'export function proposalBaseline',
  'function proposalBaseline',
);
const baselineModule = await fresh(() =>
  evaluate(
    baselineSource,
    ['assert', 'createHash', 'readFileSync', 'lstatSync', 'execFileSync'],
    [assert, createHash, readFileSync, lstatSync, execFileSync],
    '{ proposalBaseline }',
  ),
);
// Fixed actual-module imports retain Vite's dynamic-import callback context.
// Captured Q remains whole-byte authenticated before these exact bootstrap splices.
async function fixedQualifierFs() {
  return await fresh(() => import('node:fs'));
}
async function fixedQualifierCrypto() {
  return await fresh(() => import('node:crypto'));
}
async function fixedQualifierAdapter(bytes: Buffer) {
  return await fresh(async () => {
    if (!Buffer.isBuffer(bytes)) throw denied();
    const captured = Buffer.from(bytes);
    if (
      hash(captured) !==
      'f12618162eb8bb0e7d74e4f41e1b9b1c7375788834cb98991d7fbca77741ece9'
    )
      throw denied();
    return await import(
      'data:text/javascript;base64,' + captured.toString('base64')
    );
  });
}
let qualifierSource = maskImports(
  utf8(capturedQualifier),
  knownImports.qualifier,
);
qualifierSource = removeExport(
  qualifierSource,
  'export const expected',
  'const expected',
);
qualifierSource = removeExport(
  qualifierSource,
  'export function qualify',
  'function qualify',
);
qualifierSource = removeExport(
  qualifierSource,
  "import('node:fs')",
  'fixedQualifierFs()',
);
qualifierSource = removeExport(
  qualifierSource,
  "import('node:crypto')",
  'fixedQualifierCrypto()',
);
qualifierSource = removeExport(
  qualifierSource,
  "import(\n  'data:text/javascript;base64,' + guardFixtureBytes.toString('base64')\n)",
  'fixedQualifierAdapter(guardFixtureBytes)',
);
const qualifierModule = await fresh(() =>
  evaluate(
    qualifierSource,
    [
      'proposalBaseline',
      'assert',
      'createHash',
      'execFileSync',
      'createRequire',
      'mkdtempSync',
      'nodeReadFileSync',
      'mkdirSync',
      'writeFileSync',
      'rmSync',
      'symlinkSync',
      'resolve',
      'join',
      'dirname',
      'tmpdir',
      'devNull',
      'ts',
      'existsSync',
      'fixedQualifierFs',
      'fixedQualifierCrypto',
      'fixedQualifierAdapter',
    ],
    [
      baselineModule.proposalBaseline,
      assert,
      createHash,
      execFileSync,
      createRequire,
      mkdtempSync,
      validatedRead,
      mkdirSync,
      writeFileSync,
      rmSync,
      symlinkSync,
      resolve,
      join,
      dirname,
      tmpdir,
      devNull,
      compiler.default,
      existsSync,
      fixedQualifierFs,
      fixedQualifierCrypto,
      fixedQualifierAdapter,
    ],
    '{ expected, qualify }',
  ),
);
if (typeof qualifierModule.qualify !== 'function') throw denied();
const actualQualify = qualifierModule.qualify as (
  ...args: unknown[]
) => unknown;
function qualify(...args: unknown[]) {
  checkCurrent();
  try {
    return actualQualify(...args);
  } finally {
    checkCurrent();
  }
}
const nativeSource = stripTypeScriptTypes(
  maskImports(utf8(capturedNative), knownImports.native),
  { mode: 'strip' },
);
await fresh(() =>
  evaluate(
    nativeSource,
    [
      'Client',
      'readFileSync',
      'readdirSync',
      'beforeAll',
      'beforeEach',
      'afterEach',
      'afterAll',
      'expect',
      'it',
      'createTestDatabase',
      'blankEstimate',
      'qualify',
    ],
    [
      pg.Client,
      readFileSync,
      readdirSync,
      beforeAll,
      beforeEach,
      afterEach,
      afterAll,
      expect,
      it,
      engine.createTestDatabase,
      calculation.blankEstimate,
      qualify,
    ],
    '{}',
  ),
);
// Registration may already have opened the owned TEST DB. External cleanup is mandatory.
