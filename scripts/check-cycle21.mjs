import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCycle13File } from './check-cycle13-integrity.mjs';
import { validateCycle20Manifest } from './check-cycle20-integrity.mjs';
import { admitCycle25Source } from './cycle25-source-lineage.mjs';

export const cycle21Parent = '8d607d9c30e82699f1af4634c29fa38a3756fb73';
export const cycle21Support = 'b918231ff48996575c03d64c9045ead6831b6cd0';
export const cycle21Authors = Object.freeze(
  [
    [
      'task-correction-review',
      'TaskCorrectionReview',
      '/root/cycle11_field_growth',
      'codex/cycle21-task-correction-workflow',
      '4681fc9d76a31044eded27b6f3340c2cb0b2c89c',
      147,
      35,
    ],
    [
      'cost-correction-review',
      'CostCorrectionReview',
      '/root/cycle21_finance_intelligence',
      'codex/cycle21-material-review-workflow',
      'd814f54eba1acd1ea7bb7102643356439edce4a6',
      145,
      36,
    ],
    [
      'published-service-navigation',
      'PublishedServiceNavigator',
      '/root/cycle13_customer_advanced',
      'codex/cycle21-published-service-workflow',
      'a9dd2e2844a1025adcc73ab48e16f5d0a77ba1e4',
      144,
      66,
    ],
    [
      'maintenance-plan-correction',
      'MaintenancePlanCorrection',
      '/root/cycle11_field_growth',
      'codex/cycle21-maintenance-plan-workflow',
      '25136cd9175f0ffe7a5c1804141b5e9532a9ca08',
      148,
      36,
    ],
    [
      'recorded-owner-actions',
      'RecordedOwnerActions',
      '/root/cycle21_finance_intelligence',
      'codex/cycle21-recorded-owner-workflow',
      '161f1c59d864d60aa0f45820eb6417864519baf2',
      146,
      37,
    ],
  ].map((row) => Object.freeze(row)),
);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBlob = (bytes) =>
  createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
const hex40 = (value) =>
  typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
export function cycle21PackagePaths(module, component) {
  return [
    `src/lib/workflows/${module}.ts`,
    `src/components/workflows/${component}.tsx`,
    `src/components/workflows/${module}.css`,
    `tests/cycle21-${module}.test.ts`,
    `docs/program/CYCLE21_${module.toUpperCase().replaceAll('-', '_')}.md`,
  ];
}
const readGit = (commit, path) =>
  execFileSync('git', ['show', `${commit}:${path}`], {
    maxBuffer: 4 * 1024 * 1024,
  });
/** Check immutable original evidence before the sole reviewed source-only forward.
 * Retained-manifest callers must still check their own exact path/author inventory. */
export function validateCycle21PublishedSource(
  file,
  commit,
  bytes,
  published,
  ports = {},
) {
  if (
    !/^[a-f0-9]{64}$/.test(file.sha256) ||
    !hex40(file.blob) ||
    sha(published) !== file.sha256 ||
    gitBlob(published) !== file.blob
  )
    throw Error(`Exact published Cycle21 bytes/blob required: ${file.path}`);
  if (bytes.equals(published)) return;
  // The manifest always binds the original published source. Only this exact
  // component has a separately reviewed, fixed Cycle30 successor. The shared
  // admission checks its parent, complete delta and endpoint; no manifest hash,
  // other path or business authority is replaced.
  let admitted;
  if (
    commit === '161f1c59d864d60aa0f45820eb6417864519baf2' &&
    file.path === 'src/components/workflows/RecordedOwnerActions.tsx'
  ) {
    try {
      admitted = admitCycle25Source(file.path, bytes, published, ports);
    } catch {
      // Preserve the legacy failure contract for every unknown edit.
    }
  }
  if (
    admitted?.source_commit !== '9f85556e28875a53976b55567f3a14e942ba3995' ||
    admitted?.module !== 'owner-render' ||
    admitted?.path !== file.path ||
    admitted?.authority !== 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE'
  )
    throw Error(`Exact published Cycle21 bytes/blob required: ${file.path}`);
}
export function validateCycle21Manifest(manifest, ports = {}) {
  const read = ports.read ?? readCycle13File,
    git = ports.git ?? readGit;
  if (
    !manifest ||
    manifest.schema !== 'propel-cycle21-sources-v1' ||
    manifest.parent_commit !== cycle21Parent ||
    manifest.support_commit !== cycle21Support ||
    manifest.coordination_branch !== 'codex/program-cycle-twenty-one' ||
    manifest.coordination_draft_pr !== 143 ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    !['PENDING', 'CLEAR_LOCAL_SYNTHETIC_ONLY'].includes(
      manifest.independent_status,
    ) ||
    !Array.isArray(manifest.packages) ||
    manifest.packages.length !== 5
  )
    throw Error(
      'Exact five Cycle21 packages, support seed, Main draft and closed release required',
    );
  const priorManifest = JSON.parse(
    read('docs/program/CYCLE20_SOURCE_MANIFEST.json'),
  );
  validateCycle20Manifest(priorManifest, read);
  const prior = new Set([
    ...[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].flatMap((c) =>
      JSON.parse(
        read(`docs/program/CYCLE${c}_DELIVERY_INDEX.json`),
      ).packages.flatMap((p) => p.owned_files.map((f) => f.path)),
    ),
    ...priorManifest.packages.flatMap((p) => p.owned_files.map((f) => f.path)),
  ]);
  if (prior.size !== 448) throw Error('All448 retained author paths required');
  const seen = new Set(prior),
    prs = new Set([143]);
  function verify(files, paths, commit) {
    if (
      !Array.isArray(files) ||
      files.length !== paths.length ||
      !hex40(commit)
    )
      throw Error('Exact finite source paths and commit required');
    const pending = new Set(paths);
    for (const file of files) {
      if (!file || !pending.has(file.path) || seen.has(file.path))
        throw Error('Duplicate, overlapping or unknown Cycle21 source path');
      const bytes = Buffer.from(read(file.path)),
        published = Buffer.from(git(commit, file.path));
      validateCycle21PublishedSource(file, commit, bytes, published, {
        read,
        git,
      });
      pending.delete(file.path);
      seen.add(file.path);
    }
    if (pending.size) throw Error('Missing exact source');
  }
  for (const [i, row] of cycle21Authors.entries()) {
    const [module, component, owner, branch, head, pr, count] = row,
      p = manifest.packages[i];
    if (
      !p ||
      p.module !== module ||
      p.component !== component ||
      p.owner !== owner ||
      p.branch !== branch ||
      p.parent_commit !== cycle21Support ||
      p.head_commit !== head ||
      p.draft_pr !== pr ||
      p.focused_new_tests !== count ||
      p.status !== 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL' ||
      prs.has(pr)
    )
      throw Error('Exact Cycle21 author/branch/head/PR/count required');
    if (
      p.base_branch !== undefined &&
      p.base_branch !== 'codex/program-cycle-twenty-one'
    )
      throw Error('Exact draft stack base required');
    prs.add(pr);
    verify(p.owned_files, cycle21PackagePaths(module, component), head);
  }
  let independent = 0;
  if (manifest.independent_status === 'PENDING') {
    if (
      manifest.independent_review_commit !== null ||
      !Array.isArray(manifest.independent_files) ||
      manifest.independent_files.length
    )
      throw Error('Pending review cannot claim independent files');
  } else {
    if (
      !hex40(manifest.independent_review_commit) ||
      cycle21Authors.some((p) => p[4] === manifest.independent_review_commit)
    )
      throw Error('Separate exact independent review commit required');
    verify(
      manifest.independent_files,
      [
        'tests/cycle21-independent-integration-review.test.ts',
        'docs/program/CYCLE21_INDEPENDENT_REVIEW.json',
      ],
      manifest.independent_review_commit,
    );
    independent = 2;
  }
  return {
    packages: 5,
    author_files: 25,
    independent_files: independent,
    retained_author_files: 448,
    protected_files: 128,
    design_locks: 5,
    design_bindings: 13,
    authority: 'LOCAL_SOURCE_EVIDENCE_ONLY',
  };
}

const fixedSuites = Object.freeze(
  Object.fromEntries([
    ['tests/cycle21-canonical-corrections.test.ts', 31],
    ...cycle21Authors.map((p) => [`tests/cycle21-${p[0]}.test.ts`, p[6]]),
    ['tests/cycle21-preview-preparation.test.ts', 10],
    ['tests/cycle21-validation.test.ts', 46],
    ['tests/cycle21-independent-integration-review.test.ts', 41],
  ]),
);
export function cycle21ApplicationSuites(manifest) {
  const suites = manifest?.combined_evidence?.application_suites;
  const expected = Object.keys(fixedSuites);
  if (
    manifest.independent_status !== 'CLEAR_LOCAL_SYNTHETIC_ONLY' ||
    !suites ||
    Array.isArray(suites) ||
    Object.keys(suites).length !== expected.length ||
    expected.some(
      (path) => !Number.isSafeInteger(suites[path]) || suites[path] < 1,
    ) ||
    Object.entries(fixedSuites).some(([path, count]) => suites[path] !== count)
  )
    throw Error(
      'Complete exact current Cycle21 suite inventory and independent review required',
    );
  const total = Object.values(suites).reduce((a, b) => a + b, 0);
  if (
    manifest.combined_evidence.application_cases !== total ||
    manifest.combined_evidence.author_cases !== 210 ||
    manifest.combined_evidence.coordinator_cases !== 87 ||
    manifest.combined_evidence.independent_cases !== 41
  )
    throw Error('Actual source-bound application totals required');
  return suites;
}
export function validateCycle21Results(report, manifest, cwd = process.cwd()) {
  const expected = cycle21ApplicationSuites(manifest),
    total = Object.values(expected).reduce((a, b) => a + b, 0);
  if (
    !report ||
    report.success !== true ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numTodoTests !== 0 ||
    report.numFailedTestSuites !== 0 ||
    report.numPendingTestSuites !== 0 ||
    !Number.isSafeInteger(report.numTotalTestSuites) ||
    report.numTotalTestSuites < 1 ||
    report.numPassedTestSuites !== report.numTotalTestSuites ||
    report.numPassedTests !== total ||
    report.numTotalTests !== total ||
    !Array.isArray(report.testResults) ||
    report.testResults.length !== Object.keys(expected).length
  )
    throw Error(
      'One complete application PASS with no missing/failed/pending/todo suites required',
    );
  const seen = new Set();
  let observed = 0;
  for (const file of report.testResults) {
    if (typeof file.name !== 'string' || !Array.isArray(file.assertionResults))
      throw Error('Actual suite/assertion identities required');
    const path = relative(cwd, resolve(cwd, file.name)).split(sep).join('/');
    if (
      seen.has(path) ||
      !Object.hasOwn(expected, path) ||
      file.status !== 'passed' ||
      file.assertionResults.length !== expected[path]
    )
      throw Error(`Unexpected or incomplete suite ${path}`);
    seen.add(path);
    const names = new Set();
    for (const item of file.assertionResults) {
      if (
        item.status !== 'passed' ||
        typeof item.fullName !== 'string' ||
        !item.fullName.trim() ||
        names.has(item.fullName) ||
        !Array.isArray(item.failureMessages) ||
        item.failureMessages.length ||
        !Number.isFinite(item.duration) ||
        item.duration < 0
      )
        throw Error(`Failed, skipped, malformed or duplicate case ${path}`);
      names.add(item.fullName);
      observed++;
    }
  }
  if (seen.size !== Object.keys(expected).length || observed !== total)
    throw Error('Missing actual application assertions');
  return {
    passed: observed,
    suites: seen.size,
    authority: 'LOCAL_TEST_EVIDENCE_ONLY',
  };
}
export const cycle21Browser = Object.freeze({
  projects: ['desktop', 'tablet', 'mobile'],
  brands: ['straight-edge', 'cunningham', 'roofing-example'],
  scenarios: [
    'canonical task cost plan corrections and exact history navigation',
    'saved plan staleness and explicit published version continuity',
    'withdrawn pending review cannot restore old correction controls',
  ],
  off: 'production keeps canonical correction workflows closed',
  file: 'tests/browser/cycle21-canonical-corrections.spec.ts',
});
function browserExpected(mode) {
  if (!['development', 'production'].includes(mode))
    throw Error('Exact browser mode required');
  const titles =
    mode === 'development'
      ? cycle21Browser.scenarios.flatMap((s) =>
          cycle21Browser.brands.map((b) => `${s} / ${b}`),
        )
      : [cycle21Browser.off];
  return cycle21Browser.projects.flatMap((project) =>
    titles.map((title) => ({ project, title })),
  );
}
export function validateCycle21Browser(
  report,
  mode,
  { collection = false } = {},
) {
  const expected = browserExpected(mode),
    seen = new Set(),
    errors = report?.errors;
  if (
    !report ||
    !Array.isArray(report.suites) ||
    !Array.isArray(errors) ||
    errors.length
  )
    throw Error('Complete actual browser report without errors required');
  const config = report.config,
    port = mode === 'development' ? 4421 : 4431;
  if (
    !config ||
    config.fullyParallel !== false ||
    config.webServer?.url !== `http://127.0.0.1:${port}` ||
    config.webServer.reuseExistingServer !== false ||
    !Array.isArray(config.projects) ||
    config.projects.length !== 3 ||
    new Set(config.projects.map((p) => p.name)).size !== 3 ||
    config.projects.some(
      (p) =>
        !cycle21Browser.projects.includes(p.name) ||
        p.retries !== 0 ||
        p.repeatEach !== 1,
    )
  )
    throw Error(
      'Exact isolated loopback browser modes, three layouts and no retries required',
    );
  if (
    !collection &&
    (!report.stats ||
      report.stats.expected !== expected.length ||
      report.stats.skipped !== 0 ||
      report.stats.unexpected !== 0 ||
      report.stats.flaky !== 0)
  )
    throw Error('Complete nonflaky browser PASS required');
  function visit(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        if (typeof spec.title !== 'string' || !Array.isArray(spec.tests))
          throw Error('Exact browser specs required');
        for (const test of spec.tests) {
          const match = expected.find(
              (x) => x.title === spec.title && x.project === test.projectName,
            ),
            key = JSON.stringify([test.projectName, spec.title]);
          const path = relative(
            process.cwd(),
            resolve(config.rootDir, spec.file),
          )
            .split(sep)
            .join('/');
          if (
            !match ||
            seen.has(key) ||
            path !== cycle21Browser.file ||
            test.expectedStatus !== 'passed' ||
            !Array.isArray(test.annotations) ||
            test.annotations.length
          )
            throw Error(
              'Unexpected, duplicate, skipped or unauthorized browser case',
            );
          if (
            !collection &&
            (spec.ok !== true ||
              test.status !== 'expected' ||
              !Array.isArray(test.results) ||
              test.results.length !== 1 ||
              test.results[0].status !== 'passed' ||
              test.results[0].retry !== 0 ||
              (test.results[0].errors?.length ?? 0) !== 0)
          )
            throw Error(
              'Actual single passed browser attempt required; no retries/flaky/expected-failure claims',
            );
          seen.add(key);
        }
      }
      visit(suite.suites ?? []);
    }
  }
  visit(report.suites);
  if (seen.size !== expected.length)
    throw Error('Missing exact brand/layout/scenario browser evidence');
  return {
    mode,
    cases: seen.size,
    kind: collection ? 'COLLECTION_ONLY_NOT_PASS' : 'ACTUAL_BROWSER_PASS',
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  execFileSync(process.execPath, ['scripts/check-cycle20-integrity.mjs'], {
    stdio: 'inherit',
  });
  const manifest = JSON.parse(
    readFileSync('docs/program/CYCLE21_SOURCE_MANIFEST.json', 'utf8'),
  );
  const result = validateCycle21Manifest(manifest);
  if (
    process.argv.includes('--require-independent') &&
    manifest.independent_status !== 'CLEAR_LOCAL_SYNTHETIC_ONLY'
  )
    throw Error('Independent review remains pending');
  console.log(JSON.stringify(result));
  console.log(
    'Cycle21 exact sources and protected chain PASS; no operational or release authority.',
  );
}
