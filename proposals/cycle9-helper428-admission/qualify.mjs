// Offline source qualification only; no canonical mutation or admission authority.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory = 'proposals/cycle9-helper428-admission';
const parent = 'a1b701a42ff838d3364c611794000b6dc533e27f';
const author = 'c50ce4521fbc264276734a9f8909b525c9a7c2f8';
const original = 'af36a27e34b77bfef3700d7cd87fdb39c4dc50d5';
const proposal = '608ce8b7071a555440bf1f7dccfddec9473c661a';
const patchHash =
  '274c02512df50c1a751fec124db3e8e8c22474c2286a0e70e734c76f91a8c5be';
const checker = 'scripts/check-cycle9-integrity.mjs';
const helper = 'scripts/operating-source-signature-admission.mjs';
const runtime = 'src/lib/workflows/operating-center-runtime.ts';
const manifest = 'docs/program/CYCLE9_DELIVERY_INDEX.json';
const cycle24 = 'scripts/check-cycle24.mjs';
const oldRuntime =
  '7a5272ae344400714dea1efe727a40c19a10c96ccfdf70f7321e127488bbd239';
const before =
  '1faf35bbe36cfa5ca543e568970dafd7d90b2a72c578126d572baa73829606c2';
const after =
  '484a6cf6b7282324f86e90e90d4ce947ba4eb722afa6ef33a6a2e8a03e5fff68';
const rows = [
  [checker, before],
  [helper, '38fd3d784b10dd634f6b03a5995a4ce4392eb2924865349d1414328701113978'],
  [runtime, 'a789309d7f8710f2e3150f4cbc8f8acc5aee9c99633c7611e503db089bcd2544'],
  [
    manifest,
    'c5418e0732eb4115ff613776919a22f2321ec80bdf84d59836f27b92bb6766eb',
  ],
  [cycle24, '4ed8baec4e1b7abc3f3ff86cc88c590b3497c3bfb7ff2ac12fcc1c7e2f71562f'],
];
const expected = {
  classification: 'UNAPPLIED_CYCLE9_HELPER428_ADMISSION',
  parent,
  runtimeAuthor: author,
  historicalProposal: proposal,
  patchSha256: patchHash,
  checker: { path: checker, beforeSha256: before, proposedSha256: after },
  unchanged: rows.slice(1).map(([path, sha256]) => ({ path, sha256 })),
  historicalRuntimeSha256: oldRuntime,
  canonicalChanged: false,
  admissionAuthorized: false,
  release: 'NOT_READY_NOT_AUTHORIZED',
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function regular(path, base = process.cwd()) {
  let current = base;
  for (const part of path.split('/')) {
    assert(
      part && part !== '.' && part !== '..',
      'Finite public path required',
    );
    current = resolve(current, part);
    assert(!lstatSync(current).isSymbolicLink(), 'Source symlinks forbidden');
  }
  const stat = lstatSync(current);
  assert(
    stat.isFile() && (stat.mode & 0o777) === 0o644,
    'Regular 0644 source required',
  );
  return Buffer.from(readFileSync(current));
}
export function git(...args) {
  return execFileSync('git', ['--no-replace-objects', ...args], {
    timeout: 30000,
    stdio: 'pipe',
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: devNull,
      GIT_CONFIG_GLOBAL: devNull,
    },
  });
}
function sameFrame(read) {
  const bytes = new Map(rows.map(([path]) => [path, Buffer.from(read(path))]));
  const found = sha(bytes.get(checker));
  assert(
    found === before || found === after,
    'Exact Cycle9 BEFORE or AFTER required',
  );
  for (const [path, hash] of rows.slice(1))
    assert.equal(
      sha(bytes.get(path)),
      hash,
      `Exact unchanged source required: ${path}`,
    );
  const index = JSON.parse(bytes.get(manifest).toString());
  assert.equal(
    index.foundation.owned_files.find((file) => file.path === runtime)?.sha256,
    oldRuntime,
    'Original historical manifest pin required',
  );
  return { kind: found === before ? 'BEFORE' : 'AFTER', bytes };
}
function unchanged(first, final) {
  assert.equal(
    final.kind,
    first.kind,
    'Source frame changed during qualification',
  );
  for (const [path, bytes] of first.bytes)
    assert(
      bytes.equals(final.bytes.get(path)),
      `Source changed during qualification: ${path}`,
    );
}
export function inspect({
  read = regular,
  metadata = git,
  patch = regular(`${directory}/admission.patch`),
  record = JSON.parse(regular(`${directory}/evidence.json`).toString()),
} = {}) {
  // Mutable evidence never chooses identities or hashes.
  assert.deepEqual(record, expected, 'Literal reviewed proposal required');
  assert.equal(
    sha(patch),
    patchHash,
    'Exact original391 Cycle9 patch required',
  );
  const frame = sameFrame(read);
  assert(
    Buffer.from(
      metadata(
        'show',
        `${proposal}:proposals/operating-signature-admission/cycle9.patch`,
      ),
    ).equals(patch),
    'Original391 patch bytes required',
  );
  assert.equal(
    metadata('show', '--no-patch', '--format=%P', parent).toString().trim(),
    author,
    'Exact428 sole parent required',
  );
  assert.equal(
    metadata(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      parent,
    )
      .toString()
      .trim(),
    `A\t${helper}`,
    'Exact428 sole helper addition required',
  );
  assert.equal(
    metadata('show', '--no-patch', '--format=%P', author).toString().trim(),
    original,
    'Exact389 sole parent required',
  );
  assert.equal(
    metadata(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      author,
    )
      .toString()
      .trim(),
    `M\t${runtime}`,
    'Exact389 sole runtime delta required',
  );
  for (const [path, hash] of rows) {
    const entry = metadata('ls-tree', parent, '--', path).toString().trim();
    assert(
      /^100644 blob [a-f0-9]{40}\t/.test(entry) &&
        entry.split('\t')[1] === path,
      'Exact parent regular100644 path required',
    );
    assert.equal(
      sha(metadata('show', `${parent}:${path}`)),
      hash,
      'Exact parent source required',
    );
  }
  assert.equal(
    sha(metadata('show', `${original}:${runtime}`)),
    oldRuntime,
    'Original runtime required',
  );
  // Re-read after metadata callbacks and initial bundle checks, before execution.
  unchanged(frame, sameFrame(read));
  return Object.freeze({
    frame: frame.kind,
    canonicalChanged: false,
    admissionAuthorized: false,
  });
}
export async function qualify() {
  const initial = inspect();
  const patch = regular(`${directory}/admission.patch`);
  assert.equal(sha(patch), patchHash, 'Exact captured patch required');
  // Resolve fallible metadata before allocating disposable storage.
  const gitDir = git('rev-parse', '--absolute-git-dir').toString().trim();
  const root = mkdtempSync(join(tmpdir(), 'propel-cycle9-428-'));
  const sandbox = join(root, 'tree');
  const env = {
    PATH: process.env.PATH,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_DIR: gitDir,
    GIT_WORK_TREE: sandbox,
    GIT_CEILING_DIRECTORIES: root,
  };
  const run = () =>
    execFileSync(process.execPath, [checker], {
      cwd: sandbox,
      env,
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  try {
    mkdirSync(sandbox);
    const archive = join(root, 'source.tar');
    git('archive', '--format=tar', '--output', archive, parent);
    execFileSync('tar', ['-xf', archive, '-C', sandbox], {
      timeout: 30000,
      env,
    });
    assert.throws(
      run,
      (error) =>
        String(error.stderr).includes(
          `Reviewed Cycle9 source changed: ${runtime}`,
        ),
      'Unmodified428 must deny the authored runtime under the original manifest',
    );
    execFileSync('git', ['apply', '--check', '-'], {
      cwd: sandbox,
      env,
      input: patch,
      timeout: 30000,
    });
    execFileSync('git', ['apply', '-'], {
      cwd: sandbox,
      env,
      input: patch,
      timeout: 30000,
    });
    assert.equal(sha(regular(checker, sandbox)), after);
    const output = run();
    assert.match(
      output,
      /Cycle9: 7 exact draft packages \/ 35 disjoint author files/,
    );
    for (const [path, hash] of rows.slice(1))
      assert.equal(sha(regular(path, sandbox)), hash);
    const helperBytes = regular(helper, sandbox);
    const mutants = [
      "throw Error('UNREVIEWED_HELPER_EXECUTED');",
      'export const admitOperatingSignatureSource = () => true;',
    ];
    for (const mutant of mutants) {
      writeFileSync(join(sandbox, helper), mutant);
      assert.throws(
        run,
        (error) =>
          String(error.stderr).includes(
            'Reviewed operating-signature helper required',
          ) && !String(error.stderr).includes('UNREVIEWED_HELPER_EXECUTED'),
        'Reject unreviewed helper before execution',
      );
    }
    writeFileSync(join(sandbox, helper), helperBytes);
    assert.equal(sha(regular(helper, sandbox)), rows[1][1]);
    return {
      original428: 'DENIED',
      proposedCycle9: 'PASS',
      helperMutantsDenied: mutants.length,
      canonicalChanged: false,
      admissionAuthorized: false,
      cycle24Changed: false,
      frame: initial.frame,
    };
  } finally {
    try {
      assert.equal(
        inspect().frame,
        initial.frame,
        'Canonical source frame changed',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert(process.argv.length === 2, 'No qualification CLI arguments accepted');
  console.log(JSON.stringify(await qualify()));
}
