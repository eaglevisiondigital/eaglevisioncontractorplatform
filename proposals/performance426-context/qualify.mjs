// Rebind the reviewed disposable #427 harness to exact #426; never promote source.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  lstatSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const target = Object.freeze({
  source: 'e6b437e1e4b8f72a057207b29923deb8eacd1d18',
  parent: '27300dbaff877d18ecb219a2c9000c96e7c3e8c8',
  reviewedHarness: 'b95d2871c3ba768db288350f5bd6311953014e2e',
  helperAuthor: 'a1b701a42ff838d3364c611794000b6dc533e27f',
  runtimeAuthor: 'c50ce4521fbc264276734a9f8909b525c9a7c2f8',
  originalRuntime:
    '7a5272ae344400714dea1efe727a40c19a10c96ccfdf70f7321e127488bbd239',
  proposedRuntime:
    'a789309d7f8710f2e3150f4cbc8f8acc5aee9c99633c7611e503db089bcd2544',
  failuresSha256:
    'aecf660dfed4bdea0b3bf7ebff6e887129795130e0db46230daca83f978c5d55',
});
const runtime = 'src/lib/workflows/operating-center-runtime.ts';
const helper = 'scripts/operating-source-signature-admission.mjs';
const packagePath = 'proposals/performance424-context/';
const sealed = Object.freeze({
  'evidence.json':
    'e01a366940f30761b276403ba42b0994c6602857337be0545df549cc5fc04ea3',
  'qualify.mjs':
    '199abc42fe8bd75eb3d6ea89ce77c0e3b41ab4f89cf0d35d730a7cebfc3062a6',
  'measure.mjs':
    'e31fc25d1c91d64e1a03b8a115a56b9a78fd9b224d40980a9fceb8a69b45ae34',
  'inputs.fixture.ts':
    'aa0ffd16effa462d57db44179589cc5ec59d7ea0e6d6675124b930dbc338d599',
  'regress.mjs':
    'e678d02ad504a438e092b85887aefb9d02cfb0fa32e3746dd01c33817b726081',
});
const sourceFiles = Object.freeze({
  [runtime]: target.originalRuntime,
  'scripts/check-cycle9-integrity.mjs':
    '1faf35bbe36cfa5ca543e568970dafd7d90b2a72c578126d572baa73829606c2',
  'scripts/check-cycle24.mjs':
    '4ed8baec4e1b7abc3f3ff86cc88c590b3497c3bfb7ff2ac12fcc1c7e2f71562f',
  'server/payments/webhook-inbox.ts':
    'baba0a4a560be8af01bc0f5bf3bbebd8103f4875c34a5f43394b584bcfb146d0',
  'tests/payments-webhook-wire-integrity.test.ts':
    '024eeae51c3691319cde8376f5a4a26c25f3be946750944aef71e352372447ec',
  'tests/database/nmi-signed-wire-custody.test.ts':
    '7711ed99aec191c7df7f5d160fe59bb84777b2f8151f8dcd61fdd512f7c015ee',
});
const environment = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
export const git = (...a) =>
  execFileSync('git', ['--no-replace-objects', ...a], {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
function regular(path, read = readFileSync) {
  let prefix = '';
  for (const part of path.split('/')) {
    prefix = prefix ? prefix + '/' + part : part;
    assert(!lstatSync(prefix).isSymbolicLink(), 'Regular source required');
  }
  const info = lstatSync(path);
  assert(info.isFile() && (info.mode & 0o777) === 0o644, 'Mode100644 required');
  return Buffer.from(read(path));
}
export function verifyCanonical(read = readFileSync) {
  const captured = new Map();
  for (const [path, digest] of Object.entries(sourceFiles)) {
    const bytes = regular(path, read);
    assert.equal(
      sha(bytes),
      digest,
      'Exact unchanged426 source required: ' + path,
    );
    captured.set(path, bytes);
  }
  assert.throws(
    () => lstatSync(helper),
    (e) => e.code === 'ENOENT',
  );
  return captured;
}
export function replaceExact(text, before, after, count = 1) {
  assert.equal(
    text.split(before).length - 1,
    count,
    'Exact reviewed adapter span required',
  );
  return text.split(before).join(after);
}
export function failureInventory(
  bytes = regular('proposals/performance426-context/hosted-eighteen.json'),
) {
  assert.equal(
    sha(bytes),
    target.failuresSha256,
    'Exact captured426 failures required',
  );
  const value = JSON.parse(bytes);
  assert.equal(value.source, target.source);
  assert.equal(value.run, 43503518052);
  assert.equal(value.originalTimeoutMs, 30000);
  assert.equal(value.failures.length, 18);
  assert.equal(
    new Set(
      value.failures.map((r) => r.file + '\n' + r.describe + '\n' + r.title),
    ).size,
    18,
  );
  return Buffer.from(bytes);
}
export function loadReviewed(original = git) {
  assert.equal(
    original('show', '--no-patch', '--format=%P', target.source)
      .toString()
      .trim(),
    target.parent,
  );
  const callbackDelta = [
    'M\tserver/payments/webhook-inbox.ts',
    'A\ttests/database/nmi-signed-wire-custody.test.ts',
    'A\ttests/payments-webhook-wire-integrity.test.ts',
  ].join('\n');
  assert.equal(
    original(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      target.source,
    )
      .toString()
      .trim(),
    callbackDelta,
  );
  assert.equal(
    original('show', '--no-patch', '--format=%P', target.helperAuthor)
      .toString()
      .trim(),
    target.runtimeAuthor,
  );
  assert.equal(
    original(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      target.helperAuthor,
    )
      .toString()
      .trim(),
    'A\t' + helper,
  );
  assert.equal(
    sha(original('show', target.helperAuthor + ':' + helper)),
    '38fd3d784b10dd634f6b03a5995a4ce4392eb2924865349d1414328701113978',
  );
  assert.match(
    original('ls-tree', target.helperAuthor, '--', helper).toString(),
    /^100644 blob [a-f0-9]{40}\tscripts\/operating-source-signature-admission.mjs\n$/,
  );
  const bytes = new Map();
  for (const [name, digest] of Object.entries(sealed)) {
    const path = packagePath + name;
    const tree = original(
      'ls-tree',
      target.reviewedHarness,
      '--',
      path,
    ).toString();
    assert.equal(tree.split('\t')[1], path + '\n');
    assert.match(tree, /^100644 blob [a-f0-9]{40}\t/);
    const source = original('show', target.reviewedHarness + ':' + path);
    assert.equal(
      sha(source),
      digest,
      'Exact reviewed427 harness required: ' + name,
    );
    bytes.set(name, source);
  }
  for (const [path, digest] of Object.entries(sourceFiles)) {
    const tree = original('ls-tree', target.source, '--', path).toString();
    assert.match(tree, /^100644 blob [a-f0-9]{40}\t/);
    assert.equal(tree.split('\t')[1], path + '\n');
    assert.equal(sha(original('show', target.source + ':' + path)), digest);
  }
  assert.equal(original('ls-tree', target.source, '--', helper).length, 0);
  // Reuse421 diagnostics only after comparing all twelve originally measured sources.
  const profile = original(
    'show',
    'e28958d654ce85a6fba663108487dfa242c8fd2d:diagnostics/foundation417/observations.json',
  );
  assert.equal(
    sha(profile),
    '408ebaf50815db0f786d5367716f3059ac019b15ad5d6d3e015b7a4e8615e92e',
  );
  const sourceHashes = JSON.parse(profile).traces[0].sourceHashes;
  assert.equal(Object.keys(sourceHashes).length, 12);
  for (const [path, digest] of Object.entries(sourceHashes))
    assert.equal(sha(original('show', target.source + ':' + path)), digest);
  return bytes;
}
export function adaptReviewed(bytes, failures = failureInventory()) {
  failureInventory(failures);
  const out = new Map(bytes);
  const evidence = JSON.parse(bytes.get('evidence.json'));
  assert.equal(evidence.context, target.parent);
  evidence.context = target.source;
  out.set(
    'evidence.json',
    Buffer.from(JSON.stringify(evidence, null, 2) + '\n'),
  );
  out.set(
    'qualify.mjs',
    Buffer.from(
      replaceExact(
        bytes.get('qualify.mjs').toString(),
        target.parent,
        target.source,
      ),
    ),
  );
  // Only the fixed experiment selectors change; original case files stay immutable.
  let measure = bytes.get('measure.mjs').toString();
  const start = measure.indexOf('const cases = {\n');
  const end = measure.indexOf('const envBase = {\n');
  assert(start >= 0 && end > start);
  const selected = {
    'c33-material': {
      path: 'tests/cycle33-v1-finance-owner-integration.test.ts',
      title:
        'brand 2: exact recorded material and approved unposted time refresh Finance and Owner without inventing invoice or labor coverage',
      total: 18,
    },
    'c29-closed': {
      path: 'tests/cycle29-service-continuity.test.ts',
      title:
        'brand 0: closed intake review retains exact published history without completing work or renewing its one-use action',
      total: 6,
    },
  };
  const inventory = JSON.parse(failures);
  for (const v of Object.values(selected))
    assert(
      inventory.failures.some((f) => f.file === v.path && f.title === v.title),
    );
  measure =
    measure.slice(0, start) +
    'const cases = ' +
    JSON.stringify(selected, null, 2) +
    ';\n' +
    measure.slice(end);
  out.set('measure.mjs', Buffer.from(measure));
  let regress = bytes.get('regress.mjs').toString();
  const replacements = [
    [
      'eb1e789835253c3369eb89ee27ed776d3a9611f863c0f81a3d377fe1ef961e8b',
      target.failuresSha256,
    ],
    ['43498092270', '43503518052'],
    ['target.failures.length, 10', 'target.failures.length, 18'],
    ['new Set(expected).size, 10', 'new Set(expected).size, 18'],
    ['report.numPassedTests !== 10', 'report.numPassedTests !== 18'],
  ];
  for (const [before, after] of replacements)
    regress = replaceExact(regress, before, after);
  out.set('regress.mjs', Buffer.from(regress));
  out.set('hosted-ten.json', failures); // Retained internal harness filename; contains exactly18.
  return out;
}
export function selectMode(value) {
  assert(
    typeof value === 'string' &&
      ['critical', 'c33-material', 'c29-closed', 'eighteen'].includes(value),
    'Exact bounded mode required',
  );
  return value;
}
export function run(value) {
  const mode = selectMode(value),
    captured = verifyCanonical();
  const bytes = adaptReviewed(loadReviewed());
  const root = mkdtempSync(
    join(tmpdir(), 'propel-performance426-' + process.pid + '-'),
  );
  try {
    const archive = join(root, 'source.tar');
    git('archive', '--format=tar', '--output', archive, target.source);
    execFileSync('tar', ['-xf', archive, '-C', root], { env: environment });
    // The retained harness intentionally strips ambient Git variables. Give its
    // immutable-object reads an explicit local metadata pointer, as #427 does.
    writeFileSync(
      join(root, '.git'),
      'gitdir: ' +
        git('rev-parse', '--absolute-git-dir').toString().trim() +
        '\n',
      { mode: 0o600 },
    );
    for (const [name, content] of bytes) {
      const p = join(root, packagePath, name);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content, { mode: 0o644 });
    }
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    const script =
      mode === 'critical'
        ? 'qualify.mjs'
        : mode === 'eighteen'
          ? 'regress.mjs'
          : 'measure.mjs';
    const args = [packagePath + script];
    if (!['critical', 'eighteen'].includes(mode)) args.push(mode);
    const output = execFileSync(process.execPath, args, {
      cwd: root,
      env: {
        ...environment,
        GIT_DIR: git('rev-parse', '--absolute-git-dir').toString().trim(),
        GIT_WORK_TREE: root,
      },
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout:
        mode === 'eighteen' ? 190000 : mode === 'critical' ? 45000 : 100000,
      killSignal: 'SIGKILL',
    });
    const result = JSON.parse(output);
    assert.equal(result.context, target.source);
    return {
      ...result,
      reusedHarness: target.reviewedHarness,
      adaptedPayloadHashes: Object.fromEntries(
        [...bytes].map(([p, b]) => [p, sha(b)]),
      ),
      sourcePromotionAuthorized: false,
    };
  } finally {
    try {
      const terminal = verifyCanonical();
      assert.deepEqual(
        terminal,
        captured,
        'Canonical source changed during qualification',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(run(process.argv[2]), null, 2));
