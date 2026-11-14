// UNAPPLIED integration qualification. Mutations are limited to disposable clones.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  readFileSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const directory = new URL('.', import.meta.url);
const seal = 'd8d82c5e30cb294729bc34bf9fa00b7513947020b43c27d1a675f18e4d327da5';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
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
const options = [
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
const git = (root, args, input) =>
  execFileSync('git', [...options, ...args], {
    cwd: root,
    env: environment,
    input,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

export function verifyEvidence(
  bytes = readFileSync(new URL('evidence.json', directory)),
) {
  assert.equal(
    sha(bytes),
    seal,
    'Exact literal-sealed integration evidence required',
  );
  const record = JSON.parse(bytes);
  assert.equal(record.operationalReady, false);
  assert.equal(record.launchIntegrationAuthorized, false);
  return record;
}

function tree(root, commit) {
  return git(root, ['ls-tree', '-rz', '--full-tree', commit])
    .toString()
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
      assert(match, 'Regular finite Git entries required');
      return { mode: match[1], blob: match[2], path: match[3] };
    });
}

export function verifyAuthors(root = process.cwd()) {
  const record = verifyEvidence();
  assert.equal(
    git(root, ['show', '-s', '--format=%P', record.source_author])
      .toString()
      .trim(),
    record.launch_parent,
    'Exact sole launch parent required',
  );
  assert.equal(
    git(root, ['show', '-s', '--format=%P', record.reviewed_proposal])
      .toString()
      .trim(),
    record.launch_parent,
    'Exact reviewed proposal parent required',
  );
  const original = tree(root, record.launch_parent);
  const authored = tree(root, record.source_author);
  assert.equal(original.length, record.tracked_paths);
  assert.equal(authored.length, original.length);
  const changed = [];
  for (let i = 0; i < original.length; i++) {
    assert.equal(authored[i].path, original[i].path);
    assert.equal(authored[i].mode, original[i].mode);
    if (authored[i].blob !== original[i].blob) changed.push(original[i].path);
  }
  assert.deepEqual(
    changed,
    [record.file.path],
    'Only the exact reviewed endpoint may differ',
  );
  for (const [commit, hash] of [
    [record.launch_parent, record.file.before],
    [record.source_author, record.file.after],
  ]) {
    assert.equal(
      sha(git(root, ['show', `${commit}:${record.file.path}`])),
      hash,
    );
  }
  const patch = git(root, [
    'show',
    `${record.reviewed_proposal}:${record.patch_path}`,
  ]);
  assert.equal(
    sha(patch),
    record.patch_sha256,
    'Exact previously reviewed patch required',
  );
  return { record, patch, original, authored };
}

// Current bytes, modes and every ancestor are inspected anew; no live-frame cache.
export function verifyCurrent(root, candidate = false) {
  const binding = verifyAuthors(root);
  const checked = new Set();
  for (const file of candidate ? binding.authored : binding.original) {
    let path = '/';
    for (const part of resolve(root, file.path).split('/').filter(Boolean)) {
      path = join(path, part);
      if (!checked.has(path)) {
        const info = lstatSync(path);
        assert(!info.isSymbolicLink(), 'Source symlink forbidden');
        checked.add(path);
      }
    }
    const full = resolve(root, file.path),
      info = lstatSync(full);
    assert(info.isFile(), 'Regular original file required');
    assert.equal(
      info.mode & 0o111 ? '100755' : '100644',
      file.mode,
      'Original mode required',
    );
    const bytes = readFileSync(full);
    assert.equal(
      createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex'),
      file.blob,
      `Exact current source required: ${file.path}`,
    );
  }
  return binding;
}

export function prepareArchive(root = process.cwd()) {
  const { record, patch } = verifyCurrent(root);
  const archive = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-c22-integration-'),
  );
  try {
    git(root, [
      'clone',
      '--quiet',
      '--local',
      '--shared',
      '--no-checkout',
      root,
      archive,
    ]);
    git(archive, ['checkout', '--quiet', '--detach', record.launch_parent]);
    git(archive, ['apply', '--check', '-'], patch);
    git(archive, ['apply', '-'], patch);
    verifyCurrent(archive, true);
    assert.equal(
      git(archive, ['diff', '--name-only']).toString().trim(),
      record.file.path,
    );
    return archive;
  } catch (error) {
    rmSync(archive, { recursive: true, force: true });
    throw error;
  }
}
