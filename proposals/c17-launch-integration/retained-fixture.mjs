// Explicit legacy fixture ports. Current source is verified before historical reads.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  readFileSync,
  lstatSync,
  existsSync,
  mkdtempSync,
  symlinkSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, resolve } from 'node:path';
export const baseline = '892bf5127af2268e6066a20d259a808b5b893cec';
export const sourceAuthor = '76ee5226c52a850d5f692c8aac965d0487e0f544';
export const checkerAuthor = '72a5228b029a0fc52c06d9635f4e89ca096a76eb';
export const rows = [
  [
    'tests/cycle17-integration.test.ts',
    'f9d7a16d29cebb66070aabbd85ccdc10c09bce2eadeb2e70c525e0749a0a0089',
    '46747ffb4188b925fa2a64250be069a32e126fc72befac8918028f7594840d9a',
  ],
  [
    'docs/program/V1_C17_FIELD_CLOSEOUT_SOURCE.md',
    null,
    'd059a93942fe871a4af17d2f6ba207ee520c22a25d252b00300b68cd9b8537d4',
  ],
  [
    'scripts/v1-c17-inventory-source.mjs',
    'e0ffeb3ba80b74474c0864ada76d531dcbb0e8c4d3f1ca299c0d59c5e3648f9e',
    '076b4d234531d7c26524f1ef4e648f4c08145aabb691662643437f81b3863386',
  ],
  [
    'tests/v1-c17-inventory-source.test.mjs',
    '6e4ea84eaf1511a09c863a139adb06f947a2a9ee7539730cf2047e2c8c8b841c',
    '31045c49e82efe2fbcd86d56ba5d16ed98259dbf8a9b6619b4e1b77b02a0b448',
  ],
  [
    'tests/v1-c17-field-closeout-source.test.mjs',
    null,
    'df616e9e4f192393e7fe30faed5a4b4394c12ddcb2ac4b0e94d65f9a00399cc2',
  ],
];
export const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', ['--no-replace-objects', ...a]);
const childEnv = () => ({
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_SYSTEM: devNull,
});
export function verifyContext(
  root = process.cwd(),
  read = readFileSync,
  stat = lstatSync,
) {
  const observed = rows.map(([path]) => {
    const file = join(root, path);
    let info;
    try {
      info = stat(file);
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
    assert(
      info.isFile() && !info.isSymbolicLink() && (info.mode & 0o777) === 0o644,
      'Exact regular C17 source required',
    );
    return sha(read(file));
  });
  const legacy = rows.every((row, i) => row[1] === observed[i]);
  const proposed = rows.every((row, i) => row[2] === observed[i]);
  assert(
    legacy || proposed,
    'Exact complete legacy or integrated C17 bundle required',
  );
  return proposed ? 'integrated' : 'legacy';
}
export function verifyLineage() {
  assert.equal(
    git('show', '-s', '--format=%P', checkerAuthor).toString().trim(),
    sourceAuthor,
  );
  assert.equal(
    git('show', '-s', '--format=%P', sourceAuthor).toString().trim(),
    '2c63cfd8175fe23d6c7f80a7879af9c73b27dceb',
  );
  assert.equal(
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      sourceAuthor,
    )
      .toString()
      .trim(),
    'A\tdocs/program/V1_C17_FIELD_CLOSEOUT_SOURCE.md\nM\ttests/cycle17-integration.test.ts',
  );
  assert.equal(
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      checkerAuthor,
    )
      .toString()
      .trim(),
    'M\tscripts/v1-c17-inventory-source.mjs\nA\ttests/v1-c17-field-closeout-source.test.mjs\nM\ttests/v1-c17-inventory-source.test.mjs',
  );
  for (const [path, before, after] of rows) {
    assert.equal(
      git('ls-tree', checkerAuthor, '--', path).toString().split(' ')[0],
      '100644',
    );
    assert.equal(sha(git('show', checkerAuthor + ':' + path)), after);
    if (before) assert.equal(sha(git('show', baseline + ':' + path)), before);
    else assert.equal(git('ls-tree', baseline, '--', path).length, 0);
  }
  return true;
}
export function withHistoricalSource(callback) {
  const root = mkdtempSync(join(tmpdir(), 'propel-c17-retained-'));
  try {
    execFileSync(
      'git',
      ['clone', '--quiet', '--shared', '--no-checkout', process.cwd(), root],
      { env: childEnv() },
    );
    execFileSync('git', ['checkout', '--quiet', '--detach', baseline], {
      cwd: root,
      env: childEnv(),
    });
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    return callback(root, childEnv());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
export async function retainedFixture(kind) {
  assert(
    ['launch', 'checker'].includes(kind),
    'Exact retained fixture kind required',
  );
  verifyLineage();
  const mode = verifyContext();
  const fresh = () =>
    assert.equal(
      verifyContext(),
      mode,
      'Stable exact C17 fixture context required',
    );
  const path = `proposals/c17-current-${kind === 'launch' ? 'launch' : 'checker'}/qualify.mjs`;
  const bytes = readFileSync(path);
  assert.equal(
    sha(bytes),
    sha(git('show', baseline + ':' + path)),
    'Exact retained qualifier bytes required before import',
  );
  // These retained qualifiers have only node: imports. Capture verified bytes.
  assert(
    !/from\s*['"](?!node:)/.test(bytes.toString()),
    'Builtin-only retained qualifier required',
  );
  const old = await import(
    'data:text/javascript;base64,' + bytes.toString('base64')
  );
  const originals = new Map(
    rows.filter((r) => r[1]).map(([p]) => [p, git('show', baseline + ':' + p)]),
  );
  const key = (p) =>
    resolve(p).startsWith(process.cwd() + '/')
      ? resolve(p).slice(process.cwd().length + 1)
      : p;
  const read = (p, ...args) => {
    fresh();
    const original = mode === 'integrated' ? originals.get(key(p)) : undefined;
    if (!original) return readFileSync(p, ...args);
    const encoding = typeof args[0] === 'string' ? args[0] : args[0]?.encoding;
    return encoding ? original.toString(encoding) : Buffer.from(original);
  };
  const stat = (...args) => {
    fresh();
    return lstatSync(...args);
  };
  const exists = (p) => {
    fresh();
    if (
      mode === 'integrated' &&
      key(p) === 'tests/v1-c17-field-closeout-source.test.mjs'
    )
      return false;
    return existsSync(p);
  };
  // Verify the actual unchanged transitive TCB, allowing ONLY the five verified
  // promoted bytes through the explicit historical read port. No helper runs here.
  const launchPath = 'proposals/c17-current-launch/qualify.mjs';
  const launchBytes = readFileSync(launchPath);
  assert.equal(sha(launchBytes), sha(git('show', baseline + ':' + launchPath)));
  const launch = await import(
    'data:text/javascript;base64,' + launchBytes.toString('base64')
  );
  launch.verifyCurrent(
    process.cwd(),
    launch.artifacts().oldManifest,
    read,
    stat,
  );
  const historicalQualify = () => {
    fresh();
    return withHistoricalSource((root, env) => {
      const code = `const m=await import('./${path}');console.log('RETAINED_RESULT:'+JSON.stringify(await m.qualify()));`;
      const r = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', code],
        { cwd: root, env, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
      );
      if (r.error) throw r.error;
      assert.equal(r.status, 0, r.stderr);
      const lines = r.stdout
        .split('\n')
        .filter((s) => s.startsWith('RETAINED_RESULT:'));
      assert.equal(lines.length, 1, 'Exact historical result required');
      fresh();
      return JSON.parse(lines[0].slice('RETAINED_RESULT:'.length));
    });
  };
  return {
    mode,
    readFileSync: read,
    lstatSync: stat,
    existsSync: exists,
    proposal: {
      ...old,
      qualify: mode === 'legacy' ? old.qualify : historicalQualify,
      ...(kind === 'launch'
        ? {
            verifyCurrent: (
              root,
              manifest,
              customRead = read,
              customStat = stat,
            ) => {
              fresh();
              return old.verifyCurrent(root, manifest, customRead, customStat);
            },
          }
        : {}),
    },
  };
}
