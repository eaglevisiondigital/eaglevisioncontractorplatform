// UNAPPLIED finite source qualification. Only disposable clones are modified.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory = 'proposals/callback-launch-integration';
const base = '27300dbaff877d18ecb219a2c9000c96e7c3e8c8';
const evidenceHash =
  '1ee208621d08f767f893cd07fcf05466b3529d2a530d11c2f65031482c321174';
const patchHash =
  'be71e3b300cd1e62d207391d65ae810018e9f2ae342fa884d624dc5097abdbe9';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const env = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_SYSTEM: devNull,
};
const git = (...a) =>
  execFileSync('git', ['--no-replace-objects', ...a], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 8 * 1024 * 1024,
  });
function regular(path, read = readFileSync, stat = lstatSync) {
  let prefix = '';
  for (const p of resolve(path).split('/').filter(Boolean)) {
    prefix += '/' + p;
    assert(
      !stat(prefix).isSymbolicLink(),
      'Regular nonsymbolic source required',
    );
  }
  const s = stat(path);
  assert(
    s.isFile() && (s.mode & 0o777) === 0o644,
    'Regular0644 source required',
  );
  return read(path);
}
export function preflight({
  evidence = regular(directory + '/evidence.json'),
  patch = regular(directory + '/integration.patch'),
  root = process.cwd(),
  read = readFileSync,
  stat = lstatSync,
} = {}) {
  assert.equal(
    sha(evidence),
    evidenceHash,
    'Exact finite callback record required',
  );
  assert.equal(
    sha(patch),
    patchHash,
    'Exact three-file callback patch required',
  );
  const r = JSON.parse(evidence);
  assert.equal(r.baseline, base);
  assert.equal(r.protectedPromotionAuthorized, false);
  assert.equal(r.operationalReady, false);
  for (const [author, parent, delta] of [
    [
      r.sourceAuthor,
      r.sourceParent,
      [
        'M\tCURRENT_BUILD_STATE.md',
        'M\tDECISIONS.md',
        'M\tserver/payments/webhook-inbox.ts',
        'A\ttests/payments-webhook-wire-integrity.test.ts',
      ],
    ],
    [
      r.nativeAuthor,
      r.nativeParent,
      [
        'M\tCURRENT_BUILD_STATE.md',
        'M\tDECISIONS.md',
        'A\ttests/database/nmi-signed-wire-custody.test.ts',
      ],
    ],
  ]) {
    assert.equal(
      git('show', '-s', '--format=%P', author).toString().trim(),
      parent,
    );
    assert.deepEqual(
      git(
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '--no-renames',
        '-r',
        author,
      )
        .toString()
        .trim()
        .split('\n'),
      delta,
    );
  }
  for (const f of r.files) {
    assert.equal(
      git('ls-tree', f.author, '--', f.path).toString().split(' ')[0],
      '100644',
    );
    assert.equal(sha(git('show', f.author + ':' + f.path)), f.after);
    if (f.before === null)
      assert.equal(git('ls-tree', base, '--', f.path).length, 0);
    else {
      assert.equal(
        git('ls-tree', base, '--', f.path).toString().split(' ')[0],
        '100644',
      );
      assert.equal(sha(git('show', base + ':' + f.path)), f.before);
    }
  }
  const observe = () =>
    r.files.map((f) => {
      try {
        return sha(regular(join(root, f.path), read, stat));
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    });
  const values = observe(),
    before = r.files.every((f, i) => values[i] === f.before),
    after = r.files.every((f, i) => values[i] === f.after);
  assert(
    before || after,
    'Exact complete callback before or integrated context required',
  );
  assert.deepEqual(observe(), values, 'Fresh callback context required');
  return { record: r, patch, canonicalMode: before ? 'before' : 'integrated' };
}
export function verifyCandidate(
  root,
  record,
  { read = readFileSync, stat = lstatSync } = {},
) {
  // Record fields cannot be rebound to validate arbitrary bytes.
  assert.equal(
    sha(Buffer.from(JSON.stringify(record, null, 2) + '\n')),
    evidenceHash,
    'Exact candidate record required',
  );
  const options = { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] };
  const changed = execFileSync('git', ['diff', '--name-only', base], options)
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);
  const added = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    options,
  )
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);
  assert.deepEqual(
    [...changed, ...added].sort(),
    record.files.map((f) => f.path).sort(),
    'Only three callback endpoints may change',
  );
  for (let round = 0; round < 2; round++)
    for (const f of record.files)
      assert.equal(
        sha(regular(join(root, f.path), read, stat)),
        f.after,
        'Fresh exact callback candidate required',
      );
  return true;
}
export function withCandidate(callback, options = {}) {
  const { record, patch, canonicalMode } = preflight(options);
  const root = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-callback-integration-'),
  );
  try {
    execFileSync(
      'git',
      ['clone', '--quiet', '--shared', '--no-checkout', process.cwd(), root],
      { env },
    );
    execFileSync('git', ['checkout', '--quiet', '--detach', base], {
      cwd: root,
      env,
    });
    execFileSync('git', ['apply', '--check', '-'], {
      cwd: root,
      env,
      input: patch,
    });
    execFileSync('git', ['apply', '-'], { cwd: root, env, input: patch });
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    verifyCandidate(root, record);
    const result = callback(root, record);
    verifyCandidate(root, record);
    assert.equal(
      preflight(options).canonicalMode,
      canonicalMode,
      'Stable canonical source context required',
    );
    return result;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function execute(root, args) {
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  assert.equal(r.signal, null, 'Normal completion required');
  return r;
}
export function qualify({ mode = 'guards', ...options } = {}) {
  assert(
    ['guards', 'units', 'unit-before', 'native', 'native-before'].includes(
      mode,
    ),
    'Finite qualification mode required',
  );
  return withCandidate((root, record) => {
    const child = (args) => {
      const r = execute(root, args);
      assert.equal(r.status, 0, r.stdout + '\n' + r.stderr);
      return r.stdout;
    };
    const ack = JSON.parse(child(['scripts/check-payment-ack-admission.mjs']));
    assert.equal(ack.classification, 'DEVELOPMENT_SOURCE_ONLY');
    assert.equal(ack.operationalAcceptance, 'NOT_RUN');
    child(['scripts/check-cycle17-integrity.mjs']);
    if (mode === 'guards') {
      const output = join(root, 'callback-guards.json');
      try {
        child([
          'node_modules/vitest/vitest.mjs',
          'run',
          'tests/launch-invoice-payment-source.test.ts',
          '--configLoader',
          'runner',
          '--maxWorkers=1',
          '--reporter=json',
          '--outputFile=' + output,
        ]);
        const j = JSON.parse(readFileSync(output));
        assert.equal(j.numPassedTests, 8);
        assert.equal(j.numFailedTests, 0);
        assert.equal(j.numPendingTests, 0);
      } finally {
        rmSync(output, { force: true });
      }
      return {
        mode,
        passed: 8,
        failed: 0,
        ack: 'PASS',
        c17: 'PASS',
        canonicalSourceChanged: false,
        protectedPromotionAuthorized: false,
      };
    }
    const parentGap = mode.endsWith('before');
    const target = record.files[0].path;
    if (parentGap)
      writeFileSync(join(root, target), git('show', base + ':' + target));
    const output = join(root, 'callback-proof.json');
    let r;
    try {
      if (mode.startsWith('native')) {
        let harness = git(
          'show',
          base + ':scripts/test-customer-requests-native.mjs',
        ).toString();
        assert.equal(
          sha(harness),
          'fe1b5ad702033676d33b689b74d4d5a2ba925aaadaa177bb0f21b11e53a6efbd',
        );
        const select = `process.argv.includes('--broker')\n        ? 'tests/database/customer-broker.test.ts'\n        : 'tests/database/customer-requests.test.ts'`;
        assert.equal(harness.split(select).length, 2);
        harness = harness.replace(select, JSON.stringify(record.files[2].path));
        const worker = "'--maxWorkers=1',";
        assert.equal(harness.split(worker).length, 2);
        harness = harness.replace(
          worker,
          worker +
            `\n      '--reporter=json', '--outputFile='+${JSON.stringify(output)},`,
        );
        const runner = join(root, 'callback-native-proof.mjs');
        writeFileSync(runner, harness, { mode: 0o600 });
        try {
          r = execute(root, [runner]);
        } finally {
          rmSync(runner, { force: true });
        }
      } else {
        const args = [
          'node_modules/vitest/vitest.mjs',
          'run',
          record.files[1].path,
          ...(parentGap
            ? []
            : [
                'tests/payments-webhook-composition.test.ts',
                'tests/payments-webhook-ack.test.ts',
              ]),
          '--configLoader',
          'runner',
          '--maxWorkers=1',
          '--reporter=json',
          '--outputFile=' + output,
        ];
        if (parentGap)
          args.push(
            '-t',
            'signed malformed (duplicate|escaped-duplicate|invalid-utf8)',
          );
        r = execute(root, args);
      }
      assert.equal(r.status, parentGap ? 1 : 0, r.stdout + '\n' + r.stderr);
      const j = JSON.parse(readFileSync(output));
      const expected = mode === 'units' ? 47 : 6;
      assert.equal(j.numPassedTests, parentGap ? 0 : expected);
      assert.equal(j.numFailedTests, parentGap ? 6 : 0);
      assert.equal(j.numPendingTests, mode === 'unit-before' ? 22 : 0);
      if (parentGap) {
        const failures = j.testResults
          .flatMap((f) => f.assertionResults)
          .filter((t) => t.status === 'failed');
        assert.equal(failures.length, 6);
        assert(
          failures.every((f) =>
            f.failureMessages
              .join('\n')
              .includes(
                mode === 'native-before'
                  ? 'promise resolved'
                  : 'instance of Error',
              ),
          ),
          'Actual malformed callback acceptance regression required',
        );
      }
      return {
        mode,
        passed: parentGap ? 0 : expected,
        failed: parentGap ? 6 : 0,
        canonicalSourceChanged: false,
        protectedPromotionAuthorized: false,
        providerAcceptance: 'NOT_RUN',
      };
    } finally {
      if (parentGap)
        writeFileSync(
          join(root, target),
          git('show', record.sourceAuthor + ':' + target),
        );
      rmSync(output, { force: true });
    }
  }, options);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(qualify({ mode: process.argv[2] ?? 'guards' })));
