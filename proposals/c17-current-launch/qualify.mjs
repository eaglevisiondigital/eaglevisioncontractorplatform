// Preparation only. Reuse immutable reviewed artifacts; alter disposable clone only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  lstatSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, resolve, dirname, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
export const baseline = '2c63cfd8175fe23d6c7f80a7879af9c73b27dceb';
const original = '61f903eba93735ae945b0a16fcc07c0af9b7bbb0';
const target = 'tests/cycle17-integration.test.ts';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    maxBuffer: 8 * 1024 * 1024,
  });
export function artifacts() {
  const patch = git(
    'show',
    `${original}:proposals/c17-field-closeout/correction.patch`,
  );
  const note = git(
    'show',
    '4b9e1a72d7937e5badcf5aa0ac640ae0403bb35c:proposals/c17-field-closeout/author-note.proposed.md',
  );
  assert.equal(
    hash(patch),
    '0e309234f1186dcaeac6a6a2234fe825526666b9efb1016df405efeb382a297a',
  );
  assert.equal(
    hash(note),
    'd059a93942fe871a4af17d2f6ba207ee520c22a25d252b00300b68cd9b8537d4',
  );
  assert.equal(
    hash(git('show', `${baseline}:${target}`)),
    'f9d7a16d29cebb66070aabbd85ccdc10c09bce2eadeb2e70c525e0749a0a0089',
  );
  const oldManifest = JSON.parse(
    git(
      'show',
      '4b9e1a72d7937e5badcf5aa0ac640ae0403bb35c:proposals/c17-field-closeout/finite-successor.json',
    ),
  );
  assert.equal(oldManifest.futureAuthor.commit, null);
  assert.equal(oldManifest.admissionReady, false);
  for (const f of [
    ...oldManifest.unchangedProtectedConsumers,
    ...oldManifest.unchangedReferencedInputs,
  ]) {
    assert.equal(
      hash(git('show', `${baseline}:${f.path}`)),
      f.sha256,
      `Unchanged reviewed companion required: ${f.path}`,
    );
  }
  return { patch, note, oldManifest };
}
export function verifyCurrent(
  root,
  manifest,
  read = readFileSync,
  stat = lstatSync,
) {
  const paths = new Set(
    [
      ...manifest.unchangedProtectedConsumers,
      ...manifest.unchangedReferencedInputs,
    ].map((f) => f.path),
  );
  const pending = ['scripts/v1-c17-inventory-source.mjs'];
  const visited = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    paths.add(path);
    const source = git('show', `${baseline}:${path}`).toString();
    for (const m of source.matchAll(
      /(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g,
    )) {
      const dependency = posix.normalize(posix.join(dirname(path), m[1]));
      assert(
        !dependency.startsWith('../') && dependency.endsWith('.mjs'),
        'Bound relative module required',
      );
      if (!visited.has(dependency)) pending.push(dependency);
    }
  }
  for (const path of paths) {
    const file = join(root, path);
    const mode = git('ls-tree', baseline, '--', path).toString().split(' ')[0];
    assert.equal(mode, '100644', `Reviewed regular Git mode required: ${path}`);
    const info = stat(file);
    assert(
      info.isFile() && !info.isSymbolicLink() && (info.mode & 0o777) === 0o644,
      `Regular non-executable current source required: ${path}`,
    );
    assert.equal(
      hash(read(file)),
      hash(git('show', `${baseline}:${path}`)),
      `Reviewed current TCB bytes required: ${path}`,
    );
  }
  return paths.size;
}
export async function qualify() {
  const { patch, note, oldManifest } = artifacts();
  const currentVerified = verifyCurrent(process.cwd(), oldManifest);
  const temp = mkdtempSync(join(tmpdir(), 'propel-c17-current-'));
  try {
    execFileSync('git', [
      'clone',
      '--quiet',
      '--shared',
      '--no-checkout',
      process.cwd(),
      temp,
    ]);
    execFileSync('git', ['checkout', '--quiet', '--detach', baseline], {
      cwd: temp,
    });
    verifyCurrent(temp, oldManifest);
    const denyPaths = [
      'scripts/v1-c17-inventory-source.mjs',
      'scripts/cycle25-source-lineage.mjs',
    ];
    for (const path of denyPaths) {
      assert.throws(
        () =>
          verifyCurrent(temp, oldManifest, (file) =>
            file === join(temp, path)
              ? Buffer.concat([
                  readFileSync(file),
                  Buffer.from('\nthrow Error("UNKNOWN TCB EXECUTION");\n'),
                ])
              : readFileSync(file),
          ),
        /Reviewed current TCB bytes required/,
      );
    }
    // Only exact verified detached modules may execute. Current worktree modules never import.
    const { admitC17InventorySuccessor, inventoryParent } = await import(
      pathToFileURL(join(temp, 'scripts/v1-c17-inventory-source.mjs')).href
    );
    symlinkSync(resolve('node_modules'), join(temp, 'node_modules'));
    function run(name, expected) {
      const output = join(temp, `${name}.json`);
      const r = spawnSync(
        process.execPath,
        [
          'node_modules/vitest/vitest.mjs',
          'run',
          target,
          '-t',
          'Cycle16 closeout preserves child cancellations',
          '--reporter=json',
          `--outputFile=${output}`,
        ],
        {
          cwd: temp,
          // This child is a disposable historical fixture, not a GitHub checkout.
          // The outer CI history guard stays intact; no credentials/provider env
          // or CI checkout discovery is inherited by this private clone.
          env: {
            PATH: process.env.PATH,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: devNull,
            GIT_CONFIG_SYSTEM: devNull,
          },
          encoding: 'utf8',
          maxBuffer: 1024 * 1024,
        },
      );
      assert.equal(
        r.status,
        expected,
        `${name} unexpected exit; ${r.stderr?.slice(-1500)}`,
      );
      const j = JSON.parse(readFileSync(output));
      assert.equal(j.numPassedTests, expected === 0 ? 1 : 0);
      assert.equal(j.numFailedTests, expected === 0 ? 0 : 1);
      const cases = j.testResults
        .flatMap((x) => x.assertionResults)
        .filter((x) => x.status === 'failed');
      if (expected !== 0) {
        const message = cases.flatMap((x) => x.failureMessages).join('\n');
        assert(
          message.includes('6fcaea74f19b422424e0b562d91fb94e1d965'),
          message.slice(-4000),
        );
        assert(message.includes('4c6252aec56fa35bd530d46a2c663635ed8f1'));
      }
      return {
        exit: r.status,
        passed: j.numPassedTests,
        failed: j.numFailedTests,
        pending: j.numPendingTests,
      };
    }
    const before = run('parent', 1);
    writeFileSync(join(temp, 'correction.patch'), patch);
    execFileSync('git', ['apply', 'correction.patch'], { cwd: temp });
    const proposed = readFileSync(join(temp, target));
    assert.equal(
      hash(proposed),
      '46747ffb4188b925fa2a64250be069a32e126fc72befac8918028f7594840d9a',
    );
    const after = run('proposed', 0); // Includes existing finite Field unknown-edit rejection.
    const previous = git('show', `${inventoryParent}:${target}`);
    for (const bytes of [
      proposed,
      Buffer.concat([proposed, Buffer.from('\n// unknown edit\n')]),
    ]) {
      assert.throws(
        () =>
          admitC17InventorySuccessor(target, bytes, previous, {
            read: (p) => (p === target ? bytes : readFileSync(join(temp, p))),
          }),
        /Complete exact current C17 test\/doc bundle required/,
      );
    }
    assert.equal(
      hash(readFileSync(target)),
      'f9d7a16d29cebb66070aabbd85ccdc10c09bce2eadeb2e70c525e0749a0a0089',
    );
    return {
      baseline,
      currentVerified,
      unknownCheckerAndTcbDeniedBeforeImport: true,
      before,
      after,
      fieldUnknownRejected: true,
      downstreamProposedAndUnknownDenied: true,
      canonicalUnchanged: true,
      futureAuthor: null,
      admissionReady: false,
      proposedNoteSha256: hash(note),
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(await qualify(), null, 2));
