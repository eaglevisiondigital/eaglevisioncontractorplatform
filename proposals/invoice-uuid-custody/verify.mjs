// Offline unapplied-proposal verifier. Never imports a provider client or reads credentials.
import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  cpSync,
  symlinkSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const proposal = dirname(fileURLToPath(import.meta.url));
const root = resolve(proposal, '../..');
const manifest = JSON.parse(
  readFileSync(join(proposal, 'manifest.json'), 'utf8'),
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const patch = readFileSync(join(proposal, 'proposed.patch'));
if (hash(patch) !== manifest.patchSha256)
  throw Error('Exact proposed patch required');
if (
  hash(readFileSync(join(proposal, 'acceptance.test.ts'))) !==
  manifest.acceptanceTestSha256
)
  throw Error('Exact proposal regression tests required');
for (const source of manifest.sources)
  if (hash(readFileSync(join(root, source.path))) !== source.sha256)
    throw Error('Protected source drift: ' + source.path);
const snapshots = manifest.sources.map((source) => [
  source.path,
  hash(readFileSync(join(root, source.path))),
]);
const temporary = mkdtempSync(
  join(realpathSync('/tmp'), 'propel-unapplied-invoice-uuid-'),
);
const reports = [];
let failure;
try {
  for (const variant of ['parent', 'proposed']) {
    const stage = join(temporary, variant);
    mkdirSync(stage, { mode: 0o700 });
    for (const source of manifest.sources) {
      const target = join(stage, source.path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(root, source.path), target);
    }
    symlinkSync(
      realpathSync(join(root, 'node_modules')),
      join(stage, 'node_modules'),
      'dir',
    );
    writeFileSync(join(stage, 'package.json'), '{"type":"module"}\n');
    cpSync(
      join(proposal, 'acceptance.test.ts'),
      join(stage, 'tests/invoice-uuid-custody-proposal.test.ts'),
    );
    // Existing Vitest, original30s per-test/hook budget; no accepted suite/history rerun.
    writeFileSync(
      join(stage, 'vitest.config.mjs'),
      'export default {test:{include:["tests/invoice-uuid-custody-proposal.test.ts"],testTimeout:30000,hookTimeout:30000,maxWorkers:1}};\n',
    );
    if (variant === 'proposed') {
      execFileSync(
        'git',
        [
          'apply',
          '--unidiff-zero',
          '--check',
          join(proposal, 'proposed.patch'),
        ],
        { cwd: stage, stdio: 'pipe' },
      );
      execFileSync(
        'git',
        ['apply', '--unidiff-zero', join(proposal, 'proposed.patch')],
        {
          cwd: stage,
          stdio: 'pipe',
        },
      );
    }
    for (const source of manifest.sources) {
      const expected =
        variant === 'proposed'
          ? (source.proposedSha256 ?? source.sha256)
          : source.sha256;
      if (hash(readFileSync(join(stage, source.path))) !== expected)
        throw Error('Staged source hash mismatch');
    }
    execFileSync(
      process.execPath,
      [
        join(stage, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--noUnusedLocals',
        '--noUnusedParameters',
        '--skipLibCheck',
        '--moduleResolution',
        'Bundler',
        '--module',
        'ESNext',
        '--target',
        'ES2022',
        '--lib',
        'ES2022,DOM',
        '--esModuleInterop',
        '--types',
        'node',
        ...manifest.sources.map((source) => source.path),
        'tests/invoice-uuid-custody-proposal.test.ts',
      ],
      { cwd: stage, stdio: 'pipe', timeout: 120000 },
    );
    const run = spawnSync(
      process.execPath,
      [
        join(stage, 'node_modules/vitest/vitest.mjs'),
        'run',
        '--config',
        'vitest.config.mjs',
        '--reporter=json',
        '--outputFile=results.json',
      ],
      { cwd: stage, encoding: 'utf8', timeout: 120000 },
    );
    if (run.error || run.signal)
      throw Error('Offline proposal test did not complete');
    const result = JSON.parse(
      readFileSync(join(stage, 'results.json'), 'utf8'),
    );
    const expected =
      variant === 'parent'
        ? manifest.expectedParent
        : manifest.expectedProposed;
    const observed = {
      passed: result.numPassedTests,
      failed: result.numFailedTests,
    };
    if (
      observed.passed !== expected.passed ||
      observed.failed !== expected.failed ||
      run.status !== (variant === 'parent' ? 1 : 0)
    )
      throw Error(
        'Unexpected ' +
          variant +
          ' acceptance result: ' +
          JSON.stringify(observed),
      );
    reports.push({ variant, ...observed, changedCanonicalSource: false });
  }
} catch (error) {
  failure = error;
} finally {
  rmSync(temporary, { recursive: true, force: true });
  for (const [path, expected] of snapshots)
    if (hash(readFileSync(join(root, path))) !== expected)
      failure = Error('Canonical source unexpectedly changed');
}
if (failure) throw failure;
process.stdout.write(
  JSON.stringify({
    classification: manifest.classification,
    reports,
    runtimePatchApplied: false,
    cloudCalls: 0,
    providerAcceptance: 'NOT_RUN',
  }) + '\n',
);
