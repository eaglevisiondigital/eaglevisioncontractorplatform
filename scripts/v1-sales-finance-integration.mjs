// Build/test evidence only. No canonical state, operational adapter or authority.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { admitHygiene, trackedSnapshot } from './v1-hygiene-integration.mjs';
import {
  admitSalesSuccessor,
  validateTap as validateAdmissionTap,
} from './v1-sales-source-admission.mjs';

export const parent = 'd8d85760f9188d83a631328d9211421470002e8a';
export const sales = '76fc6f212d2391b000fc22280ad7dcb4d6582772';
export const admission = 'c33886f5a6d2b234b500cf99895891baff2322c5';
export const portability = 'f80a11ebd63e7f6bd21c1e8f6bbc237ab7e24183';
const portabilityFiles = [
  'tests/v1-sales-source-admission.test.mjs',
  'docs/program/V1_SALES_SOURCE_PORTABILITY.md',
  '.github/workflows/v1-sales-source-portability.yml',
];
const salesParent = 'a415bb4b35ff9e5727ce4f1a05a8f7f00def8bbc';
export const directory = 'artifacts/cycle33/v1-sales-finance';
const manifestPath = 'docs/program/V1_SALES_FINANCE_MANIFEST.json';
const append = [
  'CURRENT_BUILD_STATE.md',
  'DECISIONS.md',
  'docs/PROGRAM_DELIVERY_STATUS.md',
  'docs/FEATURE_ACCEPTANCE_REGISTER.md',
];
export const mainFiles = [
  ...append,
  'docs/program/V1_INTEGRATION_SCORECARD.json',
  'docs/program/V1_FOUNDATION_COVERAGE_RECONCILIATION.json',
  'docs/program/V1_FIRST_PILOT_WRITER_INVENTORY.md',
  manifestPath,
  'docs/program/V1_SALES_FINANCE_VALIDATION.md',
  'scripts/v1-sales-finance-integration.mjs',
  'tests/v1-sales-finance-evidence.test.mjs',
  'tests/program/playwright.v1-sales-finance.config.ts',
  '.github/workflows/v1-sales-finance-integration.yml',
];
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
const bytes = (commit, path) =>
  execFileSync('git', ['--no-replace-objects', 'show', `${commit}:${path}`]);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (path) => JSON.parse(readFileSync(path));
const save = (name, value) => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    `${directory}/${name}.json`,
    JSON.stringify(value, null, 2) + '\n',
  );
};
function authorBundle(commit, expectedParent, paths, overrides = {}) {
  assert.equal(git('cat-file', '-t', commit), 'commit');
  assert.equal(
    git('rev-list', '--parents', '-n', '1', commit),
    `${commit} ${expectedParent}`,
  );
  assert.deepEqual(
    git('diff-tree', '--no-commit-id', '--name-only', '-r', commit)
      .split('\n')
      .sort(),
    [...paths].sort(),
  );
  for (const path of paths) {
    assert.equal(git('ls-tree', commit, '--', path).split(/\s+/)[0], '100644');
    assert.deepEqual(
      readFileSync(path),
      bytes(overrides[path] || commit, path),
    );
  }
}
function scorecard() {
  const current = json('docs/program/V1_INTEGRATION_SCORECARD.json');
  const old = JSON.parse(
    bytes(parent, 'docs/program/V1_INTEGRATION_SCORECARD.json'),
  );
  assert.deepEqual(current.features, old.features);
  assert.equal(current.features.length, 25);
  assert.equal(current.genuine_A01_A12, 'NOT_RUN');
  assert.equal(current.release, 'NOT_READY_NOT_AUTHORIZED');
  assert.deepEqual(
    Object.keys(current.validation_dimensions).sort(),
    old.features.map((f) => f.id).sort(),
  );
  for (const row of Object.values(current.validation_dimensions)) {
    assert.equal(row.operational, 'NOT_RUN');
    assert.equal(row.current_combined_head, 'PENDING_SOURCE_BOUND_EXECUTION');
  }
}
export function identity() {
  const m = json(manifestPath);
  assert.equal(m.parent, parent);
  assert.equal(m.sales, sales);
  assert.equal(m.admission, admission);
  assert.equal(m.portability, portability);
  assert.deepEqual(m.portability_files, portabilityFiles);
  assert.deepEqual(m.main_files, mainFiles);
  assert.equal(m.authority, 'SOURCE_AND_TEST_EVIDENCE_NOT_BUSINESS_STATE');
  const checkout = git('rev-parse', 'HEAD'),
    candidate = process.env.CANDIDATE_HEAD || checkout;
  assert.match(candidate, /^[a-f0-9]{40}$/);
  git('merge-base', '--is-ancestor', parent, candidate);
  assert.equal(git('rev-list', '--merges', `${parent}..${candidate}`), '');
  const tree = git('rev-parse', 'HEAD^{tree}');
  assert.equal(tree, git('rev-parse', `${candidate}^{tree}`));
  if (checkout !== candidate)
    assert.deepEqual(
      git('rev-list', '--parents', '-n', '1', checkout)
        .split(' ')
        .slice(1)
        .sort(),
      [parent, candidate].sort(),
    );
  if (process.env.GITHUB_ACTIONS === 'true')
    assert.equal(process.env.GITHUB_SHA, checkout);
  assert.deepEqual(
    m.portability_files.filter((path) => m.admission_files.includes(path)),
    ['tests/v1-sales-source-admission.test.mjs'],
  );
  assert.equal(
    new Set([...m.sales_files, ...m.admission_files, ...mainFiles]).size,
    25,
  );
  const owned = [
    ...new Set([
      ...m.sales_files,
      ...m.admission_files,
      ...m.portability_files,
      ...mainFiles,
    ]),
  ];
  assert.equal(owned.length, 27);
  assert.deepEqual(
    git('diff', '--name-only', parent, 'HEAD').split('\n').sort(),
    owned.sort(),
  );
  authorBundle(sales, salesParent, m.sales_files);
  authorBundle(admission, sales, m.admission_files, {
    'tests/v1-sales-source-admission.test.mjs': portability,
  });
  authorBundle(portability, admission, m.portability_files);
  assert.deepEqual(
    git('diff-tree', '--no-commit-id', '--name-status', '-r', portability)
      .split('\n')
      .sort(),
    m.portability_files
      .map(
        (path) =>
          (path === 'tests/v1-sales-source-admission.test.mjs' ? 'M' : 'A') +
          '\t' +
          path,
      )
      .sort(),
  );
  for (const path of mainFiles)
    assert.equal(git('ls-tree', 'HEAD', '--', path).split(/\s+/)[0], '100644');
  for (const path of append) {
    const old = bytes(parent, path);
    assert.deepEqual(readFileSync(path).subarray(0, old.length), old);
  }
  admitHygiene();
  const native = 'src/lib/workflows/sales-desk.ts';
  assert.deepEqual(bytes(parent, native), bytes(salesParent, native));
  admitSalesSuccessor(
    native,
    readFileSync(native),
    bytes(salesParent, native),
    json('docs/program/CYCLE8_DELIVERY_INDEX.json').packages[2],
  );
  for (const [path, sha] of Object.entries(m.original_test_sha256))
    assert.equal(hash(readFileSync(path)), sha);
  scorecard();
  return {
    candidate,
    checkout,
    tree,
    parent,
    files: trackedSnapshot(),
    business_authority: false,
    operational_acceptance: false,
  };
}
function before() {
  const b = json(`${directory}/before.json`),
    { started_epoch_ms, ...source } = b;
  assert.ok(Number.isFinite(started_epoch_ms));
  assert.deepEqual(identity(), source);
  return b;
}
export function validateNative(r, expected, root = process.cwd()) {
  assert.equal(r.success, true);
  for (const [key, value] of Object.entries({
    numTotalTests: 110,
    numPassedTests: 110,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
  }))
    assert.equal(r[key], value, key);
  if (Object.hasOwn(r, 'numRuntimeErrorTestSuites'))
    assert.equal(r.numRuntimeErrorTestSuites, 0);
  assert.equal(r.testResults.length, 4);
  const actual = [];
  for (const f of r.testResults) {
    assert.equal(f.status, 'passed');
    assert.equal(f.message, '');
    const path = f.name.slice(root.length + 1);
    assert.ok(f.name.startsWith(root + '/'));
    for (const a of f.assertionResults) {
      assert.equal(a.status, 'passed');
      assert.deepEqual(a.failureMessages, []);
      assert.ok(
        Number.isFinite(a.duration) && a.duration >= 0 && a.duration <= 30000,
      );
      actual.push(`${path}:${a.fullName}`);
    }
  }
  assert.equal(new Set(actual).size, 110);
  assert.deepEqual(actual.sort(), [...expected].sort());
  return {
    passed: 110,
    identities_sha256: hash(JSON.stringify(actual)),
    whole_foundation: false,
  };
}
function browserRows(r) {
  const rows = [];
  function visit(s) {
    for (const spec of s.specs ?? [])
      for (const test of spec.tests ?? []) rows.push({ spec, test });
    for (const child of s.suites ?? []) visit(child);
  }
  for (const suite of r.suites ?? []) visit(suite);
  return rows;
}
export function validateBrowser(r, expected, source, mode) {
  assert.deepEqual(r.errors, []);
  for (const key of ['unexpected', 'flaky', 'skipped'])
    assert.equal(r.stats[key], 0);
  assert.equal(r.stats.expected, expected.length);
  assert.equal(r.config.workers, 2);
  assert.deepEqual(r.config.projects.map((p) => p.name).sort(), [
    'desktop',
    'mobile',
    'tablet',
  ]);
  assert.ok(
    r.config.projects.every(
      (p) => p.retries === 0 && p.repeatEach === 1 && p.timeout === 30000,
    ),
  );
  const requiredMetadata = {
    source_candidate: source.candidate,
    source_checkout: source.checkout,
    source_tree: source.tree,
    reviewed_mode: mode,
    operational_acceptance: false,
  };
  for (const [key, value] of Object.entries(requiredMetadata))
    assert.equal(r.config.metadata[key], value);
  assert.equal(r.config.metadata.actualWorkers, 2);
  if (r.config.metadata.gitCommit)
    assert.equal(r.config.metadata.gitCommit.hash, source.checkout);
  const rows = browserRows(r),
    ids = [];
  assert.equal(rows.length, expected.length);
  for (const { spec, test } of rows) {
    assert.equal(spec.ok, true);
    assert.equal(test.status, 'expected');
    assert.equal(test.expectedStatus, 'passed');
    assert.equal(test.timeout, 30000);
    assert.equal(test.results.length, 1);
    const result = test.results[0];
    assert.equal(result.status, 'passed');
    assert.equal(result.retry, 0);
    assert.ok(
      Number.isFinite(result.duration) &&
        result.duration >= 0 &&
        result.duration <= 30000,
    );
    assert.ok(!result.error);
    assert.deepEqual(result.errors ?? [], []);
    assert.ok(
      !test.annotations?.some((a) =>
        ['skip', 'fixme', 'fail', 'slow'].includes(a.type),
      ),
    );
    ids.push(
      JSON.stringify([
        test.projectName,
        spec.file,
        spec.line,
        spec.column,
        spec.title,
      ]),
    );
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.sort(), [...expected].sort());
  return {
    passed: rows.length,
    identities_sha256: hash(JSON.stringify(ids)),
    mode,
    visual_approval: false,
  };
}
function native() {
  const b = before(),
    r = json(`${directory}/native.json`),
    m = json(manifestPath);
  assert.ok(r.startTime >= b.started_epoch_ms);
  save('native-verification', {
    ...validateNative(r, m.native_ids),
    source: b.candidate,
    raw_sha256: hash(readFileSync(`${directory}/native.json`)),
  });
}
export function validateEvidenceTap(text) {
  const names = [...text.matchAll(/^ok (\d+) - (.+)$/gm)];
  const counters = {
    tests: 8,
    pass: 8,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
  };
  for (const [name, value] of Object.entries(counters)) {
    const matches = [...text.matchAll(new RegExp(`^# ${name} (\\d+)$`, 'gm'))];
    assert.equal(matches.length, 1);
    assert.equal(Number(matches[0][1]), value);
  }
  assert.equal(names.length, 8);
  assert.deepEqual(
    names.map((n) => Number(n[1])),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(new Set(names.map((n) => n[2])).size, 8);
  assert.equal(
    hash(JSON.stringify(names.map((n) => n[2]))),
    'a4f61d634e74e277e7d94a981ded61f8d2ff7456be13e3b5e0cf860a740b87c7',
  );
  assert.equal([...text.matchAll(/^1\.\.8$/gm)].length, 1);
  assert.ok(!/^not ok |^ok .*#\s*(?:skip|todo)\b/im.test(text));
  return { passed: 8, scope: 'REPORT_NEGATIVE_CONTROLS_NOT_APPLICATION_CASES' };
}
function controls() {
  const b = before();
  save('controls-verification', {
    admission: validateAdmissionTap(
      readFileSync(`${directory}/admission.tap`, 'utf8'),
    ),
    evidence: validateEvidenceTap(
      readFileSync(`${directory}/evidence.tap`, 'utf8'),
    ),
    source: b.candidate,
    whole_foundation: false,
  });
}
function browser(mode) {
  const b = before(),
    r = json(`${directory}/${mode}.json`),
    m = json(manifestPath);
  assert.ok(Date.parse(r.stats.startTime) >= b.started_epoch_ms);
  save(`${mode}-verification`, {
    ...validateBrowser(r, m.browser_ids[mode], b, mode),
    source: b.candidate,
    raw_sha256: hash(readFileSync(`${directory}/${mode}.json`)),
  });
}
async function pictures() {
  const b = before(),
    m = json(manifestPath),
    pairs = [];
  for (const path of m.screenshots) {
    let endpoint = process.cwd();
    for (const part of path.split('/')) {
      endpoint = resolve(endpoint, part);
      assert.equal(lstatSync(endpoint).isSymbolicLink(), false);
    }
    assert.equal(lstatSync(endpoint).isFile(), true);
    const data = readFileSync(path);
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(
      data.subarray(-12).toString('hex'),
      '0000000049454e44ae426082',
    );
    const image = sharp(data),
      meta = await image.metadata();
    assert.equal(meta.format, 'png');
    assert.ok(
      meta.width > 0 &&
        meta.width <= 10000 &&
        meta.height > 0 &&
        meta.height <= 30000,
    );
    await image.raw().toBuffer();
    pairs.push({
      path,
      png_sha256: hash(data),
      width: meta.width,
      height: meta.height,
      source_candidate: b.candidate,
      source_checkout: b.checkout,
      source_tree: b.tree,
      whole_job_source_sha256: hash(JSON.stringify(b.files)),
      visual_approval: false,
    });
  }
  assert.equal(pairs.length, 63);
  assert.equal(new Set(pairs.map((p) => p.path)).size, 63);
  const actual = ['artifacts/cycle8', 'artifacts/finance'].flatMap((root) =>
    readdirSync(root, { recursive: true })
      .filter((path) => path.endsWith('.png'))
      .map((path) => `${root}/${path}`),
  );
  assert.deepEqual(actual.sort(), [...m.screenshots].sort());
  save('screenshot-source-pairs', {
    pairs,
    source_only: true,
    visual_approval: false,
  });
}
function final() {
  mkdirSync(directory, { recursive: true });
  // Capture an actual final dirty-path inventory before the strict binder can
  // reject it. This does not recreate the missing historical305 inventory.
  writeFileSync(
    `${directory}/final-status-porcelain.txt`,
    execFileSync('git', [
      '--no-replace-objects',
      'status',
      '--porcelain',
      '--untracked-files=all',
    ]),
  );
  try {
    save('final', { ...before(), unchanged: true });
  } catch (error) {
    save('final-failure', {
      error: String(error),
      whole_foundation: false,
      operational_acceptance: false,
    });
    throw error;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const mode = process.argv[2];
  if (mode === 'bind')
    save('before', { ...identity(), started_epoch_ms: Date.now() });
  else if (mode === 'native') native();
  else if (mode === 'controls') controls();
  else if (['operating', 'finance', 'off'].includes(mode)) browser(mode);
  else if (mode === 'pictures') await pictures();
  else if (mode === 'final') final();
  else throw Error('Exact finite evidence command required');
  console.log(`Sales/Finance ${mode} verified; no operational authority`);
}
