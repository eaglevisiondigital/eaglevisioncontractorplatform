/** Offline pure planner controls only; never applies or runs the held workflow. */
import {
  lstatSync,
  readFileSync,
  realpathSync,
  mkdtempSync,
  writeFileSync,
  chmodSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { isAbsolute, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const source = '3f0c6b53747e60765cdc7faf1308b57ce730676f';
const tree = '00f6d211affd7e364573ca792e08a1dd67b8f190';
const patchHash =
  '5c660780e7025dd18df9188eac5a3ab7af41cd5a07adc3b6ab2cf7117ee06210';
const payloads = {
  'scheduler-manifest.json':
    '69a4a24484d348e81b161832862cd23697b3adf1a93d91de457472b9702ee207',
  'sequencer.mjs':
    '17693338bdbfde0e74cab5a005be9aeece415a7bf8080906c53caf4c3d9b49e6',
  'vitest.scheduler.config.mjs':
    'a2d736eb0e8fed976cad96e3b2c0eafdf01d9437a93e9272ac3bdce87e9ba05a',
  'planner-controls.test.mjs':
    '3f890efc7f679806a175748b577b315eb6f437ba1397dfbdad3361e9ff9e70fa',
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fail = () => {
  throw Error('Exact fixed568 offline planner evidence required');
};
const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !key.startsWith('GIT_') &&
      !key.startsWith('GCM_') &&
      key !== 'NODE_OPTIONS' &&
      key !== 'NODE_PATH',
  ),
);
Object.assign(environment, {
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_NO_LAZY_FETCH: '1',
  GIT_ALLOW_PROTOCOL: 'file',
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
});

function exactFile(path, mode = 0o644) {
  if (realpathSync.native(path) !== path) fail();
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o7777) !== mode)
    fail();
  return readFileSync(path);
}

function physical(root) {
  if (
    !isAbsolute(root) ||
    resolve(root) !== root ||
    realpathSync.native(root) !== root
  )
    fail();
  const git = (...args) =>
    execFileSync(
      '/usr/bin/git',
      [
        '--no-replace-objects',
        '-C',
        root,
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'credential.helper=',
        ...args,
      ],
      { env: environment, maxBuffer: 128 * 1024 * 1024 },
    );
  if (
    git('rev-parse', 'HEAD').toString().trim() !== source ||
    git('rev-parse', 'HEAD^{tree}').toString().trim() !== tree
  )
    fail();
  const rows = git('ls-tree', '-rz', '--full-tree', tree)
    .toString()
    .split('\0')
    .filter(Boolean);
  if (rows.length !== 2568) fail();
  const inventory = [];
  const indexExpected = [];
  for (const row of rows) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(row);
    if (
      !match ||
      match[3].split('/').some((part) => !part || part === '.' || part === '..')
    )
      fail();
    const bytes = exactFile(
      resolve(root, match[3]),
      match[1] === '100755' ? 0o755 : 0o644,
    );
    const oid = createHash('sha1')
      .update(Buffer.from('blob ' + bytes.length + '\0'))
      .update(bytes)
      .digest('hex');
    if (oid !== match[2]) fail();
    inventory.push([match[3], match[1], hash(bytes)]);
    indexExpected.push(match[1] + ' ' + match[2] + ' 0\t' + match[3]);
  }
  if (git('ls-files', '--others', '--exclude-standard', '-z').length) fail();
  const indexRows = git('ls-files', '--stage', '-z')
    .toString()
    .split('\0')
    .filter(Boolean);
  if (JSON.stringify(indexRows.sort()) !== JSON.stringify(indexExpected.sort()))
    fail();
  const indexPath = resolve(
    root,
    git('rev-parse', '--git-path', 'index').toString().trim(),
  );
  return {
    source,
    tree,
    inventory: hash(JSON.stringify(inventory)),
    index: hash(exactFile(indexPath)),
  };
}

function assertExternal(root, path) {
  const relation = relative(root, path);
  if (relation !== '..' && !relation.startsWith('../')) fail();
}

function main() {
  if (
    process.argv.length !== 3 ||
    process.versions.node.split('.')[0] !== '24' ||
    typeof realpathSync.native !== 'function' ||
    process.platform === 'win32'
  )
    fail();
  const root = process.argv[2];
  const packageRoot = fileURLToPath(new URL('.', import.meta.url)).replace(
    /\/$/,
    '',
  );
  if (realpathSync.native(packageRoot) !== packageRoot) fail();
  const held = JSON.parse(
    exactFile(join(packageRoot, 'definition.patch.json')).toString(),
  );
  if (
    Object.keys(held).join(',') !== 'patch' ||
    typeof held.patch !== 'string' ||
    hash(held.patch) !== patchHash
  )
    fail();
  const bytes = Object.fromEntries(
    Object.entries(payloads).map(([name, expected]) => {
      const body = exactFile(join(packageRoot, name + '.txt'));
      if (hash(body) !== expected) fail();
      return [name, body];
    }),
  );
  if (
    !isAbsolute(root) ||
    resolve(root) !== root ||
    realpathSync.native(root) !== root
  )
    fail();
  const temporaryBase = realpathSync.native(tmpdir());
  assertExternal(root, temporaryBase);
  const before = physical(root);
  const owned = mkdtempSync(join(temporaryBase, 'fixed568-c24-c33-planner-'));
  chmodSync(owned, 0o700);
  try {
    if (realpathSync.native(owned) !== owned) fail();
    assertExternal(root, owned);
    for (const [name, body] of Object.entries(bytes))
      writeFileSync(join(owned, name), body, { flag: 'wx', mode: 0o644 });
    for (const [name, expected] of Object.entries(payloads))
      if (hash(exactFile(join(owned, name))) !== expected) fail();
    const result = spawnSync(
      process.execPath,
      ['--test', join(owned, 'planner-controls.test.mjs')],
      {
        cwd: root,
        env: environment,
        stdio: 'inherit',
        timeout: 30000,
      },
    );
    const after = physical(root);
    if (JSON.stringify(before) !== JSON.stringify(after)) fail();
    for (const [name, expected] of Object.entries(payloads))
      if (hash(exactFile(join(owned, name))) !== expected) fail();
    if (result.error || result.signal || result.status !== 0) fail();
    console.log(
      JSON.stringify({
        classification:
          'PURE_PLANNER_CONTROLS_ONLY_NOT_APPLICATION_OR_CI_ACCEPTANCE',
        source,
        tree,
        files: 2568,
        protectedSourceChanged: false,
        workflowApplied: false,
      }),
    );
  } finally {
    rmSync(owned, { recursive: true });
  }
}

try {
  main();
} catch {
  console.error('Exact fixed568 offline planner evidence required');
  process.exitCode = 1;
}
