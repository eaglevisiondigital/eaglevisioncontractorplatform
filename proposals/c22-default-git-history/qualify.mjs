// Finite UNAPPLIED proposal only. The protected checker changes in a disposable clone.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const directory = fileURLToPath(new URL('.', import.meta.url));
const baseline = '53a4705b72b584228b33988d1eae586ef10b44eb';
const patchHash =
  'aadd9222300005c399a133bb6a9536687a8ce97ee40af68c330982779ae6cca6';
const frameHash =
  'eb7e41a4457c2e65ab10778ca2ba0941321a86824dd0d755d7bab89690373ef1';
const patch = join(directory, 'correction.patch');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function assertProposalInputs(
  frameBytes = readFileSync(join(directory, 'source-frame.json')),
  patchBytes = readFileSync(patch),
) {
  assert.equal(
    sha(frameBytes),
    frameHash,
    'Exact literal-sealed source frame required',
  );
  assert.equal(
    sha(patchBytes),
    patchHash,
    'Exact literal-sealed patch required',
  );
  const parsed = JSON.parse(frameBytes);
  assert.equal(parsed.baseline, baseline);
  assert.equal(parsed.patch_sha256, patchHash);
  return parsed;
}
const frame = assertProposalInputs();
// Subprocesses never inherit owner auth, NODE_OPTIONS, global Git configuration
// or arbitrary GIT_* settings. Only the tool search path is copied explicitly.
const environment = Object.freeze({
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_COUNT: '0',
  GIT_TERMINAL_PROMPT: '0',
  GIT_ALLOW_PROTOCOL: 'file',
  GIT_PROTOCOL_FROM_USER: '0',
});
const gitOptions = [
  '--no-replace-objects',
  '-c',
  `core.hooksPath=${devNull}`,
  '-c',
  'core.fsmonitor=false',
  '-c',
  'credential.helper=',
  '-c',
  'credential.interactive=false',
  '-c',
  'protocol.allow=never',
  '-c',
  'protocol.file.allow=always',
];
const git = (cwd, ...args) =>
  execFileSync('git', [...gitOptions, ...args], {
    cwd,
    env: environment,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
// Only immutable full-SHA Git tree metadata is cached. Every current file and
// ancestor is read/stat'ed again on every check, including after each control.
let baselineFiles;
function originalFiles(root) {
  if (!baselineFiles) {
    baselineFiles = git(root, 'ls-tree', '-rz', '--full-tree', baseline)
      .toString()
      .split('\0')
      .filter(Boolean)
      .map((row) => {
        const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(row);
        assert(match, 'Only regular original Git blobs required');
        return { mode: match[1], blob: match[2], path: match[3] };
      });
    assert.equal(
      baselineFiles.length,
      2410,
      'All2410 original tracked files required',
    );
  }
  return baselineFiles;
}
function checkFrame(root, proposed) {
  assertProposalInputs();
  const checked = new Set();
  for (const file of originalFiles(root)) {
    const full = resolve(root, file.path);
    let current = '/';
    for (const part of full.split('/').filter(Boolean)) {
      current = join(current, part);
      if (!checked.has(current)) {
        assert(
          !lstatSync(current).isSymbolicLink(),
          `Source symlink forbidden: ${current}`,
        );
        checked.add(current);
      }
    }
    const stat = lstatSync(full);
    assert(stat.isFile(), `Regular original file required: ${file.path}`);
    assert.equal(
      stat.mode & 0o111 ? '100755' : '100644',
      file.mode,
      `Original tracked mode changed: ${file.path}`,
    );
    const bytes = readFileSync(full);
    if (proposed && file.path === frame.checker.path) {
      assert.equal(
        sha(bytes),
        frame.checker.proposed,
        'Exact proposed checker required',
      );
    } else {
      const blob = createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex');
      assert.equal(
        blob,
        file.blob,
        `Original tracked blob changed: ${file.path}`,
      );
    }
  }
}
export function checkArchive(root) {
  checkFrame(root, true);
}
export function prepareArchive(root = process.cwd()) {
  checkFrame(root, false);
  assert.equal(sha(readFileSync(patch)), frame.patch_sha256);
  const temp = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-c22-default-history-'),
  );
  try {
    git(
      root,
      'clone',
      '--quiet',
      '--local',
      '--shared',
      '--no-checkout',
      root,
      temp,
    );
    git(temp, 'checkout', '--quiet', '--detach', baseline);
    git(temp, 'apply', '--check', patch);
    git(temp, 'apply', patch);
    checkFrame(temp, true);
    assert.equal(
      git(temp, 'diff', '--name-only').toString().trim(),
      frame.checker.path,
    );
    return temp;
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}
export function runControl(root, name) {
  assert(frame.controls.includes(name), 'One exact finite control required');
  checkFrame(root, true);
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), '--control', name],
    {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: 25000,
    },
  );
  checkFrame(root, true);
  assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
  return JSON.parse(result.stdout);
}
async function control(name) {
  assert(frame.controls.includes(name), 'One exact finite control required');
  checkFrame(process.cwd(), true);
  const { validateCycle22Manifest } = await import(
    pathToFileURL(resolve(frame.checker.path)).href
  );
  checkFrame(process.cwd(), true);
  const { cycle25SourcePorts } = await import(
    pathToFileURL(resolve('scripts/cycle25-source-lineage.mjs')).href
  );
  const manifest = JSON.parse(
    readFileSync('docs/program/CYCLE22_SOURCE_MANIFEST.json'),
  );
  manifest.independent_status = 'PENDING';
  manifest.independent_review_commit = null;
  manifest.independent_files = [];
  // Warm the exact default history before every current-read/ports control.
  if (name !== 'copied-history-buffer')
    assert.equal(validateCycle22Manifest(manifest).retained_author_files, 473);
  const target = 'src/lib/workflows/work-order-evidence-continuity.ts';
  if (name === 'captured-default-reader') {
    const initial = cycle25SourcePorts.git;
    cycle25SourcePorts.git = () => {
      throw Error('Later exported Git substitution must not replace default');
    };
    try {
      assert.equal(
        validateCycle22Manifest(manifest).retained_author_files,
        473,
      );
    } finally {
      cycle25SourcePorts.git = initial;
    }
  }
  if (name === 'unknown-current-source')
    assert.throws(() =>
      validateCycle22Manifest(manifest, {
        read: (path) =>
          path === target ? Buffer.from('UNKNOWN source') : readFileSync(path),
      }),
    );
  if (name === 'mixed-current-source') {
    let reads = 0;
    assert.throws(() =>
      validateCycle22Manifest(manifest, {
        read: (path) =>
          path === target && ++reads > 1
            ? Buffer.from('mixed current source')
            : readFileSync(path),
      }),
    );
    assert(reads > 1, 'Repeated current reads must not be memoized');
  }
  if (name === 'injected-proxy-denial') {
    let denials = 0;
    const denied = new Proxy(() => {}, {
      apply() {
        denials++;
        throw Error('Injected Git denial');
      },
    });
    assert.throws(() => validateCycle22Manifest(manifest, { git: denied }));
    assert(denials > 0, 'Explicit supplied Git port must remain authoritative');
  }
  if (name === 'copied-history-buffer') {
    const commit = '2fecb89213647b567746c0413a9ba3e41ce748ae',
      path = 'docs/program/CYCLE21_SOURCE_MANIFEST.json',
      buffer = cycle25SourcePorts.git(commit, path),
      copy = Buffer.from(buffer);
    buffer.fill(0);
    assert.deepEqual(cycle25SourcePorts.git(commit, path), copy);
  }
  checkFrame(process.cwd(), true);
  return { control: name, passed: true, canonicalApplied: false };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert.equal(process.argv.length, 4);
  assert.equal(process.argv[2], '--control');
  console.log(JSON.stringify(await control(process.argv[3])));
}
