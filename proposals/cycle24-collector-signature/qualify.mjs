import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  lstatSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  cpSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { resolve, join, dirname, parse, relative } from 'node:path';
import { tmpdir, devNull } from 'node:os';
import { pathToFileURL } from 'node:url';
export const source = '78c57bc8e5919026b0df4d273d7cb1c7059fdbb7';
export const target = 'scripts/collect-cycle24-browser.mjs';
export const before =
  '91de8cb3c701b2a8b57c8a5b2b1dc9bfb038f8b2e8c582d08d937153fcb79644';
export const after =
  'f1113308f7517ce654827503f0341fd0bf2951a286fd23e3b783387728fa5c7a';
export const patchHash =
  'b3b9eab444c1902e8faba5aac123694c140d345937d3b8bd8864216e08d868c4';
const base = 'proposals/cycle24-collector-signature/';
const evidenceHash =
  '9d290384f63c0308a9b63211aba5c93880be23784bfd52802a1947b5079028de';
export const sha = (b) => createHash('sha256').update(b).digest('hex');
const env = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
};
const git = (...a) =>
  execFileSync('git', ['--no-replace-objects', ...a], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
function regular(root, p, mode = 0o644) {
  const full = resolve(root, p);
  let cursor = dirname(full);
  while (cursor !== parse(cursor).root) {
    assert(!lstatSync(cursor).isSymbolicLink(), 'Symlink ancestor forbidden');
    cursor = dirname(cursor);
  }
  const s = lstatSync(full);
  assert(
    s.isFile() && !s.isSymbolicLink() && (s.mode & 0o777) === mode,
    'Regular reviewed source required: ' + p,
  );
  return readFileSync(resolve(root, p));
}
export function packet(read = (p) => regular('.', p)) {
  const patch = read(base + 'collector.patch');
  assert.equal(sha(patch), patchHash, 'Exact collector patch required');
  assert.equal(
    sha(read(base + 'evidence.json')),
    evidenceHash,
    'Exact proposal evidence required',
  );
  return patch;
}
export function frame(root = process.cwd()) {
  let mode;
  const rows = git('ls-tree', '-r', source).toString().trim().split('\n');
  const blobs = execFileSync(
    'git',
    ['--no-replace-objects', 'cat-file', '--batch'],
    {
      env,
      input: rows.map((r) => r.split(' ')[2].split('\t')[0]).join('\n') + '\n',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  let offset = 0;
  for (const row of rows) {
    const [meta, p] = row.split('\t');
    const [m] = meta.split(' ');
    assert(
      ['100644', '100755'].includes(m),
      'Baseline regular source required',
    );
    const end = blobs.indexOf(10, offset);
    const size = Number(blobs.subarray(offset, end).toString().split(' ')[2]);
    const original = blobs.subarray(end + 1, end + 1 + size);
    offset = end + size + 2;
    const actual = sha(regular(root, p, m === '100755' ? 0o755 : 0o644));
    if (p === target) {
      assert(
        [before, after].includes(actual),
        'Exact collector before/after required',
      );
      mode = actual === before ? 'before' : 'after';
    } else assert.equal(actual, sha(original), 'Unreviewed source: ' + p);
  }
  return mode;
}
export function artifactFingerprint(root) {
  const rows = [];
  let bytes = 0;
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name),
        stat = lstatSync(p);
      assert(!stat.isSymbolicLink(), 'Artifact symlink forbidden');
      if (stat.isDirectory()) walk(p);
      else {
        assert(stat.isFile(), 'Regular artifact required');
        const data = regular(root, relative(root, p));
        bytes += data.length;
        assert(bytes <= 64 * 1024 * 1024, 'Artifact byte bound');
        rows.push([relative(root, p), data.length, sha(data)]);
      }
    }
  }
  walk(resolve(root));
  return { files: rows.length, bytes, sha256: sha(JSON.stringify(rows)) };
}
export function verifyArtifact(root) {
  const actual = artifactFingerprint(root);
  assert.equal(
    actual.sha256,
    'bb504dd187a76cca0a767a649c33f4688ba7aee1ce0403468e1ebed66fe016d7',
    'Exact original434 artifact packet required',
  );
  return actual;
}
export function qualify({
  artifactDir,
  proposed = true,
  mutate,
  inspect,
} = {}) {
  assert.equal(
    typeof proposed,
    'boolean',
    'Explicit boolean proposal mode required',
  );
  assert(
    mutate === undefined || typeof mutate === 'function',
    'Explicit local mutation probe required',
  );
  const canonicalMode = frame();
  const patch = packet();
  const root = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-c24-collector-'),
  );
  try {
    if (artifactDir) verifyArtifact(artifactDir);
    const tar = join(root, 'source.tar');
    git('archive', '--format=tar', '--output', tar, source);
    execFileSync('tar', ['-xf', tar, '-C', root], { env });
    // Use the original repository only for immutable Git-object reads.
    const common = resolve(
      git('rev-parse', '--git-common-dir').toString().trim(),
    );
    writeFileSync(join(root, '.git'), `gitdir: ${common}\n`, { mode: 0o600 });
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    if (proposed) {
      for (const a of [
        ['apply', '--check', '--whitespace=error', '-'],
        ['apply', '--whitespace=error', '-'],
      ])
        execFileSync('git', a, { cwd: root, env, input: patch });
    }
    assert.equal(frame(root), proposed ? 'after' : 'before');
    if (artifactDir) {
      cpSync(resolve(artifactDir), join(root, 'artifacts/cycle24'), {
        recursive: true,
      });
      verifyArtifact(join(root, 'artifacts/cycle24'));
    }
    mutate?.(root);
    assert.equal(
      frame(root),
      proposed ? 'after' : 'before',
      'Source substitution before execution',
    );
    const inspection = inspect?.(root);
    assert.equal(
      frame(root),
      proposed ? 'after' : 'before',
      'Source changed during inspection',
    );
    // No current checker code is imported by this preparation package. The exact
    // archived CLI evaluates its original assertions against the captured packet.
    const result = artifactDir
      ? (() => {
          try {
            return {
              status: 0,
              output: execFileSync(process.execPath, [target], {
                cwd: root,
                env: { ...env, GIT_WORK_TREE: root },
                encoding: 'utf8',
                maxBuffer: 4 * 1024 * 1024,
                timeout: 120_000,
              }),
            };
          } catch (e) {
            return {
              status: e.status,
              output: String(e.stdout ?? '') + '\n' + String(e.stderr ?? ''),
            };
          }
        })()
      : { status: null, output: '' };
    let validation;
    if (artifactDir && result.status === 0) {
      const value = JSON.parse(
        readFileSync(
          join(root, 'artifacts/cycle24/browser-validation.json'),
          'utf8',
        ),
      );
      validation = {
        executed: value.executed_commits,
        runtimeFiles: value.runtime_files,
        screenshots: value.screenshots.length,
        keyboard: value.keyboard.length,
        trustedEvents: value.trusted_events,
        m1: value.admitted_source_forwards.filter(
          (r) => r.state === 'EXACT_OPERATING_SIGNATURE_M1',
        ),
      };
      assert.equal(validation.m1.length, 1);
      assert.equal(
        validation.m1[0].sha256,
        'a789309d7f8710f2e3150f4cbc8f8acc5aee9c99633c7611e503db089bcd2544',
      );
      assert.equal(value.release, 'NOT_READY_NOT_AUTHORIZED');
    }
    assert.equal(
      frame(root),
      proposed ? 'after' : 'before',
      'Source changed during collection',
    );
    assert.equal(frame(), canonicalMode, 'Canonical source changed');
    return {
      canonicalMode,
      proposed,
      ...result,
      inspection,
      validation,
      canonicalChanged: false,
      applicationAuthorized: false,
    };
  } finally {
    try {
      assert.equal(frame(), canonicalMode, 'Canonical source changed on exit');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert(
    process.argv.length >= 2 && process.argv.length <= 4,
    'Exact qualifier CLI arity required',
  );
  assert(
    process.argv[3] === undefined ||
      ['before', 'after'].includes(process.argv[3]),
    'Exact before/after mode required',
  );
  const result = qualify({
    artifactDir: process.argv[2],
    proposed: process.argv[3] !== 'before',
  });
  console.log(JSON.stringify(result));
  if (result.status !== null && result.status !== 0) process.exitCode = 1;
}
