import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCycle13File } from './check-cycle13-integrity.mjs';
import { validateCycle21Manifest } from './check-cycle21.mjs';

export const cycle22Parent = '2fecb89213647b567746c0413a9ba3e41ce748ae';
export const cycle22Branch = 'codex/program-cycle-twenty-two-integration';
export const cycle22Authors = Object.freeze(
  [
    [
      'task-custody-review',
      'TaskCustodyReview',
      '/root/cycle11_field_growth',
      'codex/cycle22-task-custody-workflow',
      '51bbe5ada4853f2306ea38b3e1b04a92057d7ea6',
      152,
      30,
    ],
    [
      'cost-coverage-path',
      'CostCoveragePath',
      '/root/cycle21_finance_intelligence',
      'codex/cycle22-cost-coverage-workflow',
      'e5b6c9a0fc40b59acf68de7aa068e55d0d2739f4',
      151,
      34,
    ],
    [
      'property-service-continuity',
      'PropertyServiceContinuity',
      '/root/cycle22_customer',
      'codex/cycle22-property-service-workflow',
      '86dd3a884ac007349ac216f1cdb729ad73ffe351',
      150,
      55,
    ],
    [
      'maintenance-requirements-review',
      'MaintenanceRequirementsReview',
      '/root/cycle11_field_growth',
      'codex/cycle22-maintenance-requirements-workflow',
      '24253d8ece3392d71dafde9732f42da0538bc1d6',
      153,
      34,
    ],
    [
      'current-owner-priorities',
      'CurrentOwnerPriorities',
      '/root/cycle21_finance_intelligence',
      'codex/cycle22-current-priorities-workflow',
      '6def582dee2d67e4577722719dabc5655005e265',
      154,
      30,
    ],
  ].map((row) => Object.freeze(row)),
);
// Filled only from the actual separately published independent review. Null
// deliberately prevents CLEAR/complete acceptance during source preparation.
export const cycle22Independent = Object.freeze({
  commit: 'b8e0cade3ae7de9773ce11cc0ab2cbae5274cd69',
  cases: 50,
});
export const cycle22ValidationCases = 58;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBlob = (bytes) =>
  createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
const hex40 = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{40}$/.test(value) &&
  value !== '0'.repeat(40);
const readGit = (commit, path) =>
  execFileSync('git', ['show', `${commit}:${path}`], {
    maxBuffer: 4 * 1024 * 1024,
  });
const retainedIndexPaths = [
  ...[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(
    (c) => `docs/program/CYCLE${c}_DELIVERY_INDEX.json`,
  ),
  'docs/program/CYCLE20_SOURCE_MANIFEST.json',
  'docs/program/CYCLE21_SOURCE_MANIFEST.json',
];
let retainedExtraPaths;
/** Broader old author/protected paths are admitted only by the fixed published
 * parent manifests. This does not turn the earlier workflow reader into a
 * general filesystem or private infrastructure reader. */
function readCycle22File(path) {
  if (!retainedExtraPaths) {
    retainedExtraPaths = new Set(
      retainedIndexPaths.flatMap((index) =>
        JSON.parse(readGit(cycle22Parent, index)).packages.flatMap((p) =>
          p.owned_files.map((file) => file.path),
        ),
      ),
    );
    const protectedSource = JSON.parse(
        readGit(cycle22Parent, 'docs/program/CYCLE4_PROTECTED_SOURCE.json'),
      ),
      design = JSON.parse(
        readGit(cycle22Parent, 'docs/program/DESIGN_SYSTEM_CONTRACT.json'),
      );
    for (const file of [...protectedSource.files, ...design.locks])
      retainedExtraPaths.add(file.path);
    for (const binding of design.bindings)
      retainedExtraPaths.add(binding.source.path);
  }
  if (!retainedExtraPaths.has(path)) return readCycle13File(path);
  if (
    typeof path !== 'string' ||
    path.startsWith('/') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw Error('Exact finite retained source path required');
  let current = process.cwd();
  for (const segment of path.split('/')) {
    current = resolve(current, segment);
    if (lstatSync(current).isSymbolicLink())
      throw Error('Retained source symlinks forbidden');
  }
  if (!lstatSync(current).isFile())
    throw Error('Regular retained source required');
  return readFileSync(current);
}
export function cycle22PackagePaths(module, component) {
  return [
    `src/lib/workflows/${module}.ts`,
    `src/components/workflows/${component}.tsx`,
    `src/components/workflows/${module}.css`,
    `tests/cycle22-${module}.test.ts`,
    `docs/program/CYCLE22_${module.toUpperCase().replaceAll('-', '_')}.md`,
  ];
}
export function validateCycle22Manifest(manifest, ports = {}) {
  const read = ports.read ?? readCycle22File,
    git = ports.git ?? readGit;
  if (
    !manifest ||
    manifest.schema !== 'propel-cycle22-sources-v1' ||
    manifest.parent_commit !== cycle22Parent ||
    manifest.coordination_branch !== cycle22Branch ||
    manifest.coordination_draft_pr !== 149 ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    !['PENDING', 'CLEAR_LOCAL_SYNTHETIC_ONLY'].includes(
      manifest.independent_status,
    ) ||
    !Array.isArray(manifest.packages) ||
    manifest.packages.length !== 5
  )
    throw Error(
      'Exact Cycle22 parent, five packages, Main149 and closed release required',
    );
  const priorManifest = JSON.parse(
    read('docs/program/CYCLE21_SOURCE_MANIFEST.json'),
  );
  validateCycle21Manifest(priorManifest, { read, git });
  const priorIndexes = retainedIndexPaths;
  for (const path of [
    ...priorIndexes,
    'docs/program/CYCLE4_PROTECTED_SOURCE.json',
    'docs/program/DESIGN_SYSTEM_CONTRACT.json',
  ])
    if (!Buffer.from(read(path)).equals(Buffer.from(git(cycle22Parent, path))))
      throw Error(`Exact retained manifest required: ${path}`);
  for (const path of priorIndexes)
    for (const file of JSON.parse(read(path)).packages.flatMap(
      (p) => p.owned_files,
    ))
      if (sha(read(file.path)) !== file.sha256)
        throw Error(`Retained author source changed: ${file.path}`);
  const protectedFiles = JSON.parse(
      read('docs/program/CYCLE4_PROTECTED_SOURCE.json'),
    ).files,
    design = JSON.parse(read('docs/program/DESIGN_SYSTEM_CONTRACT.json'));
  if (
    protectedFiles.length !== 128 ||
    design.locks.length !== 5 ||
    design.bindings.length !== 13
  )
    throw Error('Complete protected128/design5/bindings13 required');
  for (const file of [...protectedFiles, ...design.locks])
    if (sha(read(file.path)) !== file.sha256)
      throw Error(`Protected or design source changed: ${file.path}`);
  for (const binding of design.bindings)
    if (
      !Buffer.from(read(binding.source.path))
        .toString('utf8')
        .includes(binding.source.anchor)
    )
      throw Error(`Original design binding changed: ${binding.id}`);
  const prior = new Set([
    ...[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].flatMap((c) =>
      JSON.parse(
        read(`docs/program/CYCLE${c}_DELIVERY_INDEX.json`),
      ).packages.flatMap((p) => p.owned_files.map((f) => f.path)),
    ),
    ...JSON.parse(
      read('docs/program/CYCLE20_SOURCE_MANIFEST.json'),
    ).packages.flatMap((p) => p.owned_files.map((f) => f.path)),
    ...priorManifest.packages.flatMap((p) => p.owned_files.map((f) => f.path)),
  ]);
  if (prior.size !== 473) throw Error('All473 retained author paths required');
  const seen = new Set(prior),
    prs = new Set([149]);
  function verify(files, paths, commit) {
    if (
      !Array.isArray(files) ||
      files.length !== paths.length ||
      !hex40(commit)
    )
      throw Error('Exact finite source paths and published commit required');
    const pending = new Set(paths);
    for (const file of files) {
      if (!file || !pending.has(file.path) || seen.has(file.path))
        throw Error('Duplicate, overlapping or unknown Cycle22 source path');
      const bytes = Buffer.from(read(file.path)),
        published = Buffer.from(git(commit, file.path));
      if (
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        !hex40(file.blob) ||
        sha(bytes) !== file.sha256 ||
        gitBlob(bytes) !== file.blob ||
        !bytes.equals(published)
      )
        throw Error(
          `Exact published Cycle22 bytes/blob required: ${file.path}`,
        );
      pending.delete(file.path);
      seen.add(file.path);
    }
    if (pending.size) throw Error('Missing exact source');
  }
  for (const [i, row] of cycle22Authors.entries()) {
    const [module, component, owner, branch, head, pr, count] = row,
      p = manifest.packages[i];
    if (
      !p ||
      p.module !== module ||
      p.component !== component ||
      p.owner !== owner ||
      p.branch !== branch ||
      p.parent_commit !== cycle22Parent ||
      p.head_commit !== head ||
      p.draft_pr !== pr ||
      p.focused_new_tests !== count ||
      p.base_branch !== cycle22Branch ||
      p.status !== 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL' ||
      prs.has(pr)
    )
      throw Error('Exact Cycle22 author/branch/head/PR/count/stack required');
    prs.add(pr);
    verify(p.owned_files, cycle22PackagePaths(module, component), head);
  }
  let independent = 0;
  if (manifest.independent_status === 'PENDING') {
    if (
      manifest.independent_review_commit !== null ||
      !Array.isArray(manifest.independent_files) ||
      manifest.independent_files.length
    )
      throw Error('Pending review cannot claim independent evidence');
  } else {
    if (
      !hex40(cycle22Independent.commit) ||
      manifest.independent_review_commit !== cycle22Independent.commit ||
      !Number.isSafeInteger(cycle22Independent.cases) ||
      cycle22Independent.cases < 1
    )
      throw Error(
        'Exact separately published Cycle22 independent review required',
      );
    verify(
      manifest.independent_files,
      [
        'tests/cycle22-independent-integration-review.test.ts',
        'docs/program/CYCLE22_INDEPENDENT_REVIEW.json',
      ],
      cycle22Independent.commit,
    );
    independent = 2;
  }
  if (ports.requireIndependent === true && independent !== 2)
    throw Error('Independent Cycle22 review remains pending');
  return {
    packages: 5,
    author_files: 25,
    independent_files: independent,
    independent_status: manifest.independent_status,
    retained_author_files: 473,
    protected_files: 128,
    design_locks: 5,
    design_bindings: 13,
    authority: 'LOCAL_SOURCE_EVIDENCE_ONLY',
  };
}
export function cycle22ApplicationSuites(manifest) {
  const suites = manifest?.combined_evidence?.application_suites;
  const fixed = Object.fromEntries([
    ...cycle22Authors.map((p) => [`tests/cycle22-${p[0]}.test.ts`, p[6]]),
    ['tests/cycle22-workbench-selection.test.ts', 9],
    ['tests/cycle22-validation.test.ts', cycle22ValidationCases],
    [
      'tests/cycle22-independent-integration-review.test.ts',
      cycle22Independent.cases,
    ],
  ]);
  if (
    manifest?.independent_status !== 'CLEAR_LOCAL_SYNTHETIC_ONLY' ||
    manifest.independent_review_commit !== cycle22Independent.commit ||
    !hex40(cycle22Independent.commit) ||
    !suites ||
    Array.isArray(suites) ||
    Object.keys(suites).length !== Object.keys(fixed).length ||
    Object.entries(fixed).some(
      ([path, count]) =>
        !Number.isSafeInteger(count) || count < 1 || suites[path] !== count,
    )
  )
    throw Error(
      'Complete source-fixed current Cycle22 suite inventory and independent review required',
    );
  const total = Object.values(fixed).reduce((a, b) => a + b, 0),
    e = manifest.combined_evidence;
  if (
    e.application_cases !== total ||
    e.author_cases !== 183 ||
    e.coordinator_cases !== 9 + cycle22ValidationCases ||
    e.independent_cases !== cycle22Independent.cases
  )
    throw Error('Actual source-bound Cycle22 totals required');
  return fixed;
}
export function validateCycle22Results(report, manifest, cwd = process.cwd()) {
  return validateCycle22ApplicationReport(
    report,
    cycle22ApplicationSuites(manifest),
    cwd,
  );
}
export function validateCycle22ApplicationReport(
  report,
  expected,
  cwd = process.cwd(),
) {
  if (
    !expected ||
    Array.isArray(expected) ||
    !Object.keys(expected).length ||
    Object.entries(expected).some(
      ([path, count]) =>
        !/^tests\/cycle22-[a-z0-9-]+\.test\.ts$/.test(path) ||
        !Number.isSafeInteger(count) ||
        count < 1,
    )
  )
    throw Error('Finite exact Cycle22 suite inventory required');
  const total = Object.values(expected).reduce((a, b) => a + b, 0);
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
  const seen = new Set(),
    allNames = new Set();
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
        allNames.has(item.fullName) ||
        !Array.isArray(item.failureMessages) ||
        item.failureMessages.length ||
        !Number.isFinite(item.duration) ||
        item.duration < 0
      )
        throw Error(`Failed, skipped, malformed or duplicate case ${path}`);
      names.add(item.fullName);
      allNames.add(item.fullName);
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.slice(2).some((arg) => arg !== '--require-independent'))
    throw Error('Only exact bounded Cycle22 verification supported');
  execFileSync(
    process.execPath,
    ['scripts/check-cycle21.mjs', '--require-independent'],
    { stdio: 'inherit' },
  );
  const manifest = JSON.parse(
    readFileSync('docs/program/CYCLE22_SOURCE_MANIFEST.json', 'utf8'),
  );
  console.log(
    JSON.stringify(
      validateCycle22Manifest(manifest, { requireIndependent: true }),
    ),
  );
  console.log(
    'Cycle22 exact sources and independent/protected chain verified. Local evidence only; no operational or release authority.',
  );
}
