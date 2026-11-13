// Finite UNAPPLIED C24 proposal. No canonical checker or runtime is written.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  readFileSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const bindings = Object.freeze({
  parent: 'a1b701a42ff838d3364c611794000b6dc533e27f',
  author: 'c50ce4521fbc264276734a9f8909b525c9a7c2f8',
  authorParent: 'af36a27e34b77bfef3700d7cd87fdb39c4dc50d5',
  prior: '608ce8b7071a555440bf1f7dccfddec9473c661a',
  path: 'scripts/check-cycle24.mjs',
  before: '4ed8baec4e1b7abc3f3ff86cc88c590b3497c3bfb7ff2ac12fcc1c7e2f71562f',
  after: '4f95b11e4e1d45186c5607f1b0773cc379e1901d99f7944ce907bfdef5a9a68d',
  patch: '60f719216eb985839602bbb97e1a3d5420b80579771583677622e7c5715ab447',
  helper: 'scripts/operating-source-signature-admission.mjs',
  helperHash:
    '38fd3d784b10dd634f6b03a5995a4ce4392eb2924865349d1414328701113978',
  runtime: 'src/lib/workflows/operating-center-runtime.ts',
  runtimeHash:
    'a789309d7f8710f2e3150f4cbc8f8acc5aee9c99633c7611e503db089bcd2544',
  c9: 'scripts/check-cycle9-integrity.mjs',
  c9Before: '1faf35bbe36cfa5ca543e568970dafd7d90b2a72c578126d572baa73829606c2',
  c9After: '484a6cf6b7282324f86e90e90d4ce947ba4eb722afa6ef33a6a2e8a03e5fff68',
  c9Patch: '274c02512df50c1a751fec124db3e8e8c22474c2286a0e70e734c76f91a8c5be',
});
const directory = 'proposals/cycle24-helper428-admission';
const environment = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_SYSTEM: devNull,
};
const hash = (b) => createHash('sha256').update(b).digest('hex');
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 8 * 1024 * 1024,
  });
function regular(path, read = readFileSync, stat = lstatSync) {
  let prefix = '';
  for (const part of resolve(path).split('/').filter(Boolean)) {
    prefix += '/' + part;
    assert(
      !stat(prefix).isSymbolicLink(),
      'Regular non-symlink source required',
    );
  }
  const info = stat(path);
  assert(
    info.isFile() && (info.mode & 0o777) === 0o644,
    'Regular0644 source required',
  );
  return Buffer.from(read(path));
}
export function inputs({
  evidence = regular(directory + '/evidence.json'),
  patch = regular(directory + '/cycle24.patch'),
} = {}) {
  assert.equal(
    hash(evidence),
    '21ae2fd173431da8eb485f09f902526d9469339d0e379308de0dfa5cde574d47',
    'Exact C24-only proposal evidence required',
  );
  assert.equal(
    hash(patch),
    bindings.patch,
    'Exact unchanged391 C24 patch required',
  );
  assert.deepEqual(
    patch,
    git(
      'show',
      bindings.prior + ':proposals/operating-signature-admission/cycle24.patch',
    ),
  );
  assert.equal(
    git('show', '-s', '--format=%P', bindings.parent).toString().trim(),
    bindings.author,
  );
  assert.equal(
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      bindings.parent,
    )
      .toString()
      .trim(),
    'A\t' + bindings.helper,
  );
  assert.equal(
    git('show', '-s', '--format=%P', bindings.author).toString().trim(),
    bindings.authorParent,
  );
  assert.equal(
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      bindings.author,
    )
      .toString()
      .trim(),
    'M\t' + bindings.runtime,
  );
  for (const [path, digest] of [
    [bindings.path, bindings.before],
    [bindings.helper, bindings.helperHash],
    [bindings.runtime, bindings.runtimeHash],
    [bindings.c9, bindings.c9Before],
  ]) {
    const tree = git('ls-tree', bindings.parent, '--', path).toString().trim();
    assert.match(tree, /^100644 blob [a-f0-9]{40}\t/);
    assert.equal(tree.split('\t')[1], path);
    assert.equal(hash(git('show', bindings.parent + ':' + path)), digest);
  }
  const c9 = git(
    'show',
    bindings.prior + ':proposals/operating-signature-admission/cycle9.patch',
  );
  assert.equal(hash(c9), bindings.c9Patch);
  return { patch, c9 };
}
export function canonicalFrame({ read = readFileSync, stat = lstatSync } = {}) {
  const snapshots = new Map();
  for (const path of [
    bindings.path,
    bindings.helper,
    bindings.runtime,
    bindings.c9,
  ])
    snapshots.set(path, regular(path, read, stat));
  assert.equal(
    hash(snapshots.get(bindings.helper)),
    bindings.helperHash,
    'Exact approved428 helper required',
  );
  assert.equal(
    hash(snapshots.get(bindings.runtime)),
    bindings.runtimeHash,
    'Exact389 runtime required',
  );
  const c24 = hash(snapshots.get(bindings.path)),
    c9 = hash(snapshots.get(bindings.c9));
  assert(
    [bindings.before, bindings.after].includes(c24),
    'Exact C24 frame required',
  );
  assert(
    [bindings.c9Before, bindings.c9After].includes(c9),
    'Exact C9 source frame required',
  );
  return {
    snapshots,
    c24: c24 === bindings.before ? 'ORIGINAL' : 'EXACT_PROPOSED',
    c9: c9 === bindings.c9Before ? 'ORIGINAL' : 'EXACT_PROPOSED',
  };
}
export function verifyCandidate(
  root,
  { sequence = false, read = readFileSync, stat = lstatSync } = {},
) {
  assert(typeof sequence === 'boolean', 'Exact sequence mode required');
  const options = {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  const changed = execFileSync(
    'git',
    ['--no-replace-objects', 'diff', '--name-only', bindings.parent],
    options,
  )
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
    .trim();
  assert.equal(added, '', 'No unrelated candidate files');
  assert.deepEqual(
    changed.sort(),
    [bindings.path, ...(sequence ? [bindings.c9] : [])].sort(),
    'Exact independent C24 candidate scope required',
  );
  for (let round = 0; round < 2; round++)
    for (const [path, digest] of [
      [bindings.path, bindings.after],
      [bindings.helper, bindings.helperHash],
      [bindings.runtime, bindings.runtimeHash],
      [bindings.c9, sequence ? bindings.c9After : bindings.c9Before],
    ])
      assert.equal(
        hash(regular(join(root, path), read, stat)),
        digest,
        'Fresh exact candidate source required',
      );
  return true;
}
export async function withCandidate(
  action,
  { sequence = false, framePorts, ...source } = {},
) {
  assert(typeof sequence === 'boolean', 'Exact sequence mode required');
  const artifact = inputs(source),
    observed = canonicalFrame(framePorts),
    root = mkdtempSync(join(realpathSync(tmpdir()), 'propel-c24-428-'));
  try {
    execFileSync(
      'git',
      ['clone', '--quiet', '--shared', '--no-checkout', process.cwd(), root],
      { env: environment, stdio: 'pipe' },
    );
    execFileSync('git', ['checkout', '--quiet', '--detach', bindings.parent], {
      cwd: root,
      env: environment,
      stdio: 'pipe',
    });
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    for (const patch of [artifact.patch, ...(sequence ? [artifact.c9] : [])]) {
      execFileSync('git', ['apply', '--check', '-'], {
        cwd: root,
        env: environment,
        input: patch,
        stdio: 'pipe',
      });
      execFileSync('git', ['apply', '-'], {
        cwd: root,
        env: environment,
        input: patch,
        stdio: 'pipe',
      });
    }
    verifyCandidate(root, { sequence });
    const value = await action(root);
    verifyCandidate(root, { sequence });
    return value;
  } finally {
    try {
      const terminal = canonicalFrame(framePorts);
      assert.equal(terminal.c24, observed.c24);
      assert.equal(terminal.c9, observed.c9);
      for (const [path, bytes] of observed.snapshots)
        assert.deepEqual(
          terminal.snapshots.get(path),
          bytes,
          'Canonical source must remain unchanged',
        );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
function execute(root, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120000,
    killSignal: 'SIGKILL',
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null);
  return result;
}
function critical(root, target = null, original = false) {
  assert.equal(
    hash(regular(join(root, bindings.path))),
    original ? bindings.before : bindings.after,
    'Reviewed C24 checker required before execution',
  );
  assert(
    target === null ||
      [bindings.runtime, 'src/lib/workflows/journey-runtime.ts'].includes(
        target,
      ),
  );
  const program = `const{readFileSync}=await import('node:fs');const{execFileSync}=await import('node:child_process');const c=await import('./scripts/check-cycle24.mjs');const target=${JSON.stringify(target)};const ports={read:p=>target===p?Buffer.concat([readFileSync(p),Buffer.from('\\nUNKNOWN')]):readFileSync(p),git:(commit,p)=>execFileSync('git',['--no-replace-objects','show',commit+':'+p])};console.log(JSON.stringify(c.validateCycle24CriticalSources(ports)));`;
  return execute(root, ['--input-type=module', '-e', program]);
}
export async function qualify({ mode = 'controls', ...options } = {}) {
  assert(
    ['controls', 'metadata', 'sequence'].includes(mode),
    'Exact controls, metadata or sequence mode required',
  );
  return withCandidate(
    (root) => {
      const checker = join(root, bindings.path),
        reviewed = regular(checker);
      try {
        writeFileSync(
          checker,
          git('show', bindings.parent + ':' + bindings.path),
        );
        const before = critical(root, null, true);
        assert.notEqual(before.status, 0);
        assert(
          before.stderr.includes(
            'Critical frozen source changed: ' + bindings.runtime,
          ),
        );
      } finally {
        writeFileSync(checker, reviewed);
      }
      const positive = critical(root);
      assert.equal(positive.status, 0, positive.stderr);
      assert.deepEqual(JSON.parse(positive.stdout), { critical_sources: 5 });
      for (const path of [
        bindings.runtime,
        'src/lib/workflows/journey-runtime.ts',
      ]) {
        const denied = critical(root, path);
        assert.notEqual(denied.status, 0);
      }
      const helper = join(root, bindings.helper),
        original = regular(helper);
      try {
        for (const bytes of [
          Buffer.concat([original, Buffer.from('\nUNKNOWN')]),
          Buffer.from("throw Error('UNKNOWN_HELPER_EXECUTED');"),
        ]) {
          writeFileSync(helper, bytes);
          const denied = critical(root);
          assert.notEqual(denied.status, 0);
          assert(
            denied.stderr.includes(
              'Reviewed operating-signature helper required',
            ),
          );
          assert(!denied.stderr.includes('UNKNOWN_HELPER_EXECUTED'));
        }
      } finally {
        writeFileSync(helper, original);
      }
      let full;
      if (mode === 'metadata') {
        verifyCandidate(root);
        const result = execute(root, [bindings.path]);
        assert.equal(result.status, 0, result.stderr);
        const lines = result.stdout
          .trim()
          .split('\n')
          .map((v) => JSON.parse(v));
        assert.equal(lines.length, 2);
        assert.equal(lines[0].packages, 6);
        assert.equal(lines[0].operational_ready, false);
        assert.equal(lines[0].restore_adapter, false);
        assert.equal(lines[1].protected_files, 128);
        assert.equal(lines[1].locks, 5);
        assert.equal(lines[1].bindings, 13);
        assert.equal(lines[1].critical_sources, 5);
        assert.equal(lines[1].readiness_requirements, 19);
        assert.equal(lines[1].adapter_authorized, false);
        full = lines;
      }
      if (mode === 'sequence') {
        const result = execute(root, [bindings.c9]);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Cycle9: 7 exact draft packages/);
      }
      return {
        mode,
        parent: bindings.parent,
        originalCritical: 'DENIED_EXACT_AUTHORED_RUNTIME',
        c24Critical: 5,
        unknownRuntime: 'DENIED',
        unrelatedSource: 'DENIED',
        helperBeforeExecution: 'DENIED',
        cycle9Compatibility:
          mode === 'sequence'
            ? 'EXACT_DISPOSABLE_SEQUENCE_PASS'
            : 'ORIGINAL_C9_UNCHANGED',
        cycle9ApprovalGranted: false,
        cycle24ApprovalGranted: false,
        canonicalChanges: false,
        operationalReady: false,
        ...(full ? { full } : {}),
      };
    },
    { ...options, sequence: mode === 'sequence' },
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert(process.argv.length <= 3, 'One finite mode only');
  console.log(
    JSON.stringify(
      await qualify({ mode: process.argv[2] ?? 'controls' }),
      null,
      2,
    ),
  );
}
