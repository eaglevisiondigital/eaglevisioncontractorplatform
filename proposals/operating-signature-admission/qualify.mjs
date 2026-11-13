// Offline qualification only. Never changes canonical checkers or grants admission.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  realpathSync,
  lstatSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { signatureSource, signatureGit } from './helper.mjs';
const directory = 'proposals/operating-signature-admission';
const sha = (b) => createHash('sha256').update(b).digest('hex');
// Literal pins bind the proposal before any patch execution; evidence is not authority.
const expected = {
  classification: 'UNAPPLIED_CHECKER_ADMISSION_PROPOSAL',
  parent: 'c50ce4521fbc264276734a9f8909b525c9a7c2f8',
  patchSha256:
    '216da91d6c7f9e1323f8fab75436861a9e3d4620122771f0225e6494caee2596',
  separatePatches: {
    cycle9: '274c02512df50c1a751fec124db3e8e8c22474c2286a0e70e734c76f91a8c5be',
    cycle24: '60f719216eb985839602bbb97e1a3d5420b80579771583677622e7c5715ab447',
    helper: '97852ab007d3d7600db597e53d420658a75f4e51c932cd25ce3a509d62396982',
  },
  files: [
    {
      path: 'scripts/check-cycle9-integrity.mjs',
      beforeSha256:
        '1faf35bbe36cfa5ca543e568970dafd7d90b2a72c578126d572baa73829606c2',
      proposedSha256:
        '484a6cf6b7282324f86e90e90d4ce947ba4eb722afa6ef33a6a2e8a03e5fff68',
    },
    {
      path: 'scripts/check-cycle24.mjs',
      beforeSha256:
        '4ed8baec4e1b7abc3f3ff86cc88c590b3497c3bfb7ff2ac12fcc1c7e2f71562f',
      proposedSha256:
        '4f95b11e4e1d45186c5607f1b0773cc379e1901d99f7944ce907bfdef5a9a68d',
    },
    {
      path: 'scripts/operating-source-signature-admission.mjs',
      beforeSha256: null,
      proposedSha256:
        '38fd3d784b10dd634f6b03a5995a4ce4392eb2924865349d1414328701113978',
    },
  ],
  canonicalCheckersChanged: false,
  admissionAuthorized: false,
  release: 'NOT_READY_NOT_AUTHORIZED',
};
export function assertHelperAbsent(lstat = lstatSync) {
  try {
    lstat('scripts/operating-source-signature-admission.mjs');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw Error('Canonical admission helper must remain absent');
}
export async function qualify({
  fullCycle24 = false,
  patch = readFileSync(join(directory, 'checker.patch')),
  evidence = JSON.parse(readFileSync(join(directory, 'evidence.json'), 'utf8')),
} = {}) {
  assert.deepEqual(
    evidence,
    expected,
    'Exact unapplied checker proposal required',
  );
  assert.equal(
    sha(patch),
    expected.patchSha256,
    'Exact checker patch required',
  );
  assertHelperAbsent();
  const parts = ['cycle9', 'cycle24', 'helper'].map((name) => {
    const part = readFileSync(join(directory, name + '.patch'));
    assert.equal(
      sha(part),
      expected.separatePatches[name],
      'Exact separately approvable patch required',
    );
    return part;
  });
  assert.deepEqual(
    Buffer.concat(parts),
    patch,
    'Exact combined patch must equal separate artifacts',
  );
  const before = new Map();
  for (const file of expected.files) {
    if (!file.beforeSha256) continue;
    const bytes = readFileSync(file.path);
    assert.equal(sha(bytes), file.beforeSha256, 'Historical checker unchanged');
    assert.deepEqual(
      bytes,
      signatureGit('show', `${expected.parent}:${file.path}`),
    );
    before.set(file.path, bytes);
  }
  assert.equal(
    sha(readFileSync(join(directory, 'helper.mjs'))),
    expected.files[2].proposedSha256,
  );
  const root = mkdtempSync(join(tmpdir(), 'propel-signature-admission-'));
  const env = {
    PATH: process.env.PATH,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CEILING_DIRECTORIES: root,
  };
  try {
    // Reuse the exact reviewed #387 patch to establish actual M1 source identity,
    // without rerunning its accepted differential suite or recreating its logic.
    const review = join(root, 'review');
    mkdirSync(dirname(join(review, signatureSource.path)), { recursive: true });
    writeFileSync(
      join(review, signatureSource.path),
      signatureGit('show', `${signatureSource.parent}:${signatureSource.path}`),
    );
    const reviewedPatch = signatureGit(
      'show',
      '89d2d8f8ad9848110d60bba5e73916a8bbdfabcd:proposals/operating-source-signature/correction.patch',
    );
    assert.equal(
      sha(reviewedPatch),
      'da9db5c5e953c859ab24dc127c48b1d78e0cd1d6e2b7bbe9edf4b444a40ae4a0',
    );
    execFileSync('git', ['apply', '-'], {
      cwd: review,
      env,
      input: reviewedPatch,
    });
    assert.deepEqual(
      readFileSync(join(review, signatureSource.path)),
      signatureGit('show', `${signatureSource.author}:${signatureSource.path}`),
    );
    const sandbox = join(root, 'tree');
    mkdirSync(sandbox);
    const archive = join(root, 'source.tar');
    signatureGit(
      'archive',
      '--format=tar',
      '--output',
      archive,
      expected.parent,
    );
    execFileSync('tar', ['-xf', archive, '-C', sandbox]);
    execFileSync('git', ['apply', '-'], { cwd: sandbox, env, input: patch });
    symlinkSync(
      realpathSync('node_modules'),
      join(sandbox, 'node_modules'),
      'dir',
    );
    for (const file of expected.files)
      assert.equal(
        sha(readFileSync(join(sandbox, file.path))),
        file.proposedSha256,
      );
    const gitDir = signatureGit('rev-parse', '--absolute-git-dir')
      .toString()
      .trim();
    const cli = execFileSync(
      process.execPath,
      ['scripts/check-cycle9-integrity.mjs'],
      {
        cwd: sandbox,
        env: { ...env, GIT_DIR: gitDir, GIT_WORK_TREE: sandbox },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    assert.match(cli, /Cycle9: 7 exact draft packages/);
    let fullCycle24Result;
    if (fullCycle24) {
      try {
        const output = execFileSync(
          process.execPath,
          ['scripts/check-cycle24.mjs'],
          {
            cwd: sandbox,
            env: { ...env, GIT_DIR: gitDir, GIT_WORK_TREE: sandbox },
            encoding: 'utf8',
            stdio: 'pipe',
            maxBuffer: 16 * 1024 * 1024,
          },
        );
        const lines = output
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        assert.equal(lines.length, 2, 'Exact full checker result required');
        assert.equal(lines[0].packages, 6);
        assert.equal(lines[0].protected_files, 128);
        assert.equal(lines[0].operational_ready, false);
        assert.equal(lines[0].restore_adapter, false);
        assert.equal(lines[1].critical_sources, 5);
        assert.equal(lines[1].adapter_authorized, false);
        fullCycle24Result = {
          status: 'PASS',
          manifest: lines[0],
          preservation: lines[1],
        };
      } catch (error) {
        throw Error(
          'Actual full Cycle24 checker DENIED: ' +
            String(error.stderr ?? error.message).slice(-4000),
          { cause: error },
        );
      }
    }
    const checker = await import(
      pathToFileURL(join(sandbox, 'scripts/check-cycle24.mjs')).href
    );
    const ports = {
      read: (p) => readFileSync(join(sandbox, p)),
      git: (c, p) => signatureGit('show', `${c}:${p}`),
    };
    assert.equal(
      checker.validateCycle24CriticalSources(ports).critical_sources,
      5,
    );
    // Unknown current bytes remain rejected by the actual patched critical guard.
    assert.throws(
      () =>
        checker.validateCycle24CriticalSources({
          ...ports,
          read: (p) =>
            p === signatureSource.path
              ? Buffer.concat([ports.read(p), Buffer.from('\n// unknown')])
              : ports.read(p),
        }),
      /Exact reviewed operating-signature author/,
    );
    const other = 'src/lib/workflows/journey-runtime.ts';
    assert.throws(
      () =>
        checker.validateCycle24CriticalSources({
          ...ports,
          read: (p) =>
            p === other
              ? Buffer.concat([ports.read(p), Buffer.from('\n// unknown')])
              : ports.read(p),
        }),
      /Critical frozen source changed/,
    );
    const installedHelper = join(
      sandbox,
      'scripts/operating-source-signature-admission.mjs',
    );
    const helperBytes = readFileSync(installedHelper);
    const helperMutants = [
      Buffer.concat([
        helperBytes,
        Buffer.from('\n// unreviewed helper comment'),
      ]),
      Buffer.from(
        helperBytes
          .toString()
          .replace(signatureSource.originalHash, '0'.repeat(64)),
      ),
      Buffer.from('export const admitOperatingSignatureSource = () => true;'),
      Buffer.from("throw Error('UNREVIEWED_HELPER_EXECUTED');"),
    ];
    try {
      for (const mutant of helperMutants) {
        writeFileSync(installedHelper, mutant);
        for (const command of [
          ['scripts/check-cycle9-integrity.mjs'],
          [
            '--input-type=module',
            '-e',
            "await import('./scripts/check-cycle24.mjs')",
          ],
        ]) {
          assert.throws(
            () =>
              execFileSync(process.execPath, command, {
                cwd: sandbox,
                env: { ...env, GIT_DIR: gitDir, GIT_WORK_TREE: sandbox },
                stdio: 'pipe',
              }),
            (error) => {
              const message = String(error.stderr);
              return (
                message.includes(
                  'Reviewed operating-signature helper required',
                ) && !message.includes('UNREVIEWED_HELPER_EXECUTED')
              );
            },
            'Checker-owned hash must reject helper mutation before execution',
          );
        }
      }
    } finally {
      writeFileSync(installedHelper, helperBytes);
    }
    for (const [path, bytes] of before)
      assert.deepEqual(readFileSync(path), bytes);
    return {
      cycle9: 'PASS',
      cycle24CriticalSources: 5,
      unknownRuntime: 'DENIED',
      helperMutationsDenied: helperMutants.length,
      unrelatedRuntime: 'DENIED',
      canonicalCheckersChanged: false,
      admissionAuthorized: false,
      ...(fullCycle24Result ? { fullCycle24: fullCycle24Result } : {}),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
