// UNAPPLIED temporary-source qualification. Default units make no database calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  lstatSync,
  existsSync,
  mkdtempSync,
  symlinkSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory = 'proposals/payment-response-integrity';
const base = '892bf5127af2268e6066a20d259a808b5b893cec';
const nmi = 'tests/database/nmi-refund-unknown-composition.test.ts';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args]);
export function qualify({
  mode = 'units',
  patch = readFileSync(directory + '/correction.patch'),
  evidence = readFileSync(directory + '/evidence.json'),
} = {}) {
  assert(
    ['units', 'native-parent', 'native-proposed'].includes(mode),
    'Explicit finite qualification mode required',
  );
  assert.equal(
    sha(evidence),
    'cee2ffa017da390f4bc5edc41c67729644e346ec1bbfa33fff101fe8c50e6434',
    'Exact unapplied evidence required',
  );
  const record = JSON.parse(evidence);
  assert.equal(record.parent, base);
  assert.equal(record.admissionAuthorized, false);
  assert.equal(sha(patch), record.patchSha256, 'Exact proposed patch required');
  const wire = readFileSync(directory + '/wire.fixture.txt');
  const native = readFileSync(directory + '/native.fixture.txt');
  assert.equal(
    sha(wire),
    record.wireFixtureSha256,
    'Exact wire controls required',
  );
  assert.equal(
    sha(native),
    record.nativeFixtureSha256,
    'Exact native negative proof required',
  );
  const before = new Map();
  for (const source of record.files) {
    if (source.beforeSha256 === null) {
      assert.throws(
        () => lstatSync(source.path),
        (e) => e.code === 'ENOENT',
        'New decoder must remain absent',
      );
    } else {
      const info = lstatSync(source.path);
      assert(info.isFile() && !info.isSymbolicLink());
      const bytes = readFileSync(source.path);
      assert.equal(
        sha(bytes),
        source.beforeSha256,
        'Protected original bytes required',
      );
      assert.deepEqual(bytes, git('show', `${base}:${source.path}`));
      before.set(source.path, bytes);
    }
  }
  assert.equal(
    sha(readFileSync(nmi)),
    record.originalNmiCasesSha256,
    'Original twelve native cases required',
  );
  assert.equal(
    sha(git('show', `${base}:${record.algorithmReference.path}`)),
    record.algorithmReference.sha256,
  );
  const root = mkdtempSync(join(tmpdir(), 'propel-payment-response-'));
  const env = {
    PATH: process.env.PATH,
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_SYSTEM: devNull,
  };
  try {
    const archive = join(root, 'source.tar');
    git('archive', '--format=tar', '--output', archive, base);
    execFileSync('tar', ['-xf', archive, '-C', root], { env });
    if (mode !== 'native-parent') {
      execFileSync('git', ['apply', '-'], {
        cwd: root,
        env,
        input: patch,
        stdio: 'pipe',
      });
      for (const source of record.files) {
        const info = lstatSync(join(root, source.path));
        assert(info.isFile() && !info.isSymbolicLink());
        assert.equal(
          sha(readFileSync(join(root, source.path))),
          source.proposedSha256,
        );
      }
    }
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    const output = join(root, 'result.json');
    let args;
    if (mode === 'units') {
      writeFileSync(
        join(root, 'tests/payment-response-wire.fixture.test.ts'),
        wire,
      );
      args = [
        'node_modules/vitest/vitest.mjs',
        'run',
        'tests/payment-response-wire.fixture.test.ts',
        '--configLoader',
        'runner',
        '--maxWorkers=1',
        '--reporter=json',
        '--outputFile=' + output,
      ];
    } else {
      const original = readFileSync(join(root, nmi));
      assert.equal(sha(original), record.originalNmiCasesSha256);
      writeFileSync(join(root, nmi), Buffer.concat([original, native]));
      let harness = readFileSync(
        join(root, 'scripts/test-customer-requests-native.mjs'),
        'utf8',
      );
      assert.equal(sha(harness), record.originalNativeHarnessSha256);
      const selection = `process.argv.includes('--broker')
        ? 'tests/database/customer-broker.test.ts'
        : 'tests/database/customer-requests.test.ts'`;
      assert.equal(harness.split(selection).length, 2);
      harness = harness.replace(selection, JSON.stringify(nmi));
      const worker = "'--maxWorkers=1',";
      assert.equal(harness.split(worker).length, 2);
      harness = harness.replace(
        worker,
        worker +
          `\n      '-t', 'PRIVATE response integrity', '--reporter=json', '--outputFile=' + ${JSON.stringify(output)},`,
      );
      writeFileSync(join(root, 'native-proof.mjs'), harness, { mode: 0o600 });
      args = [join(root, 'native-proof.mjs')];
    }
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      env,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    assert.equal(result.signal, null, 'Qualification must complete normally');
    assert(
      existsSync(output),
      'Selected proof report missing: ' +
        (result.stdout + result.stderr).slice(-3000),
    );
    const report = JSON.parse(readFileSync(output, 'utf8'));
    const parentGap = mode === 'native-parent';
    assert.equal(
      result.status,
      parentGap ? 1 : 0,
      'Exact selected proof outcome required',
    );
    assert.equal(report.numFailedTests, parentGap ? 1 : 0);
    assert.equal(
      report.numPassedTests,
      mode === 'units' ? 70 : parentGap ? 0 : 1,
    );
    assert.equal(report.numPendingTests, mode === 'units' ? 0 : 12);
    assert.equal(report.numTotalTests, mode === 'units' ? 70 : 13);
    if (parentGap) {
      const failures = report.testResults
        .flatMap((s) => s.assertionResults)
        .filter((t) => t.status === 'failed');
      assert.equal(failures.length, 1);
      assert.equal(
        failures[0].fullName,
        'PRIVATE response integrity probe keeps contradictory refund bytes UNKNOWN and capacity held',
      );
      const text = failures[0].failureMessages
        .join('\n')
        .replace(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g'), '');
      assert(
        text.includes(
          'WIRE_PROOF:' +
            JSON.stringify({
              first: 'declined',
              persisted: 'declined',
              next: 'succeeded',
              submissions: 2,
            }),
        ),
        'Actual capacity-release regression required',
      );
    }
    for (const [path, bytes] of before)
      assert.deepEqual(readFileSync(path), bytes);
    assert.equal(sha(readFileSync(nmi)), record.originalNmiCasesSha256);
    return {
      mode,
      result: parentGap ? 'PARENT_GAP_REPRODUCED' : 'COPIED_SOURCE_PASS',
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      originalNativeCasesFiltered: mode === 'units' ? 0 : 12,
      canonicalSourceChanged: false,
      admissionAuthorized: false,
      providerAcceptance: 'NOT_RUN',
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert(process.argv.length <= 3, 'Only one exact mode may be supplied');
  console.log(JSON.stringify(qualify({ mode: process.argv[2] ?? 'units' })));
}
