import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCycle13File } from './check-cycle13-integrity.mjs';
import { validateCycle22Manifest } from './check-cycle22.mjs';
import { validateCycle21PublishedSource } from './check-cycle21.mjs';

export const cycle23Parent = '3e35fb29dd4488bf655446712e5a013e06f8ed1e';
export const cycle23Branch = 'codex/program-cycle-twenty-three-integration';
export const cycle23Authors = Object.freeze(
  [
    [
      'task-revision-consistency',
      'TaskRevisionConsistency',
      '/root/cycle11_field_growth',
      'codex/cycle23-task-revision-consistency',
      'b2872ae0b61905e534d6f67804ad09244582b339',
      157,
      32,
    ],
    [
      'recorded-cost-requirements',
      'RecordedCostRequirements',
      '/root/cycle23_finance_intelligence',
      'codex/cycle23-recorded-cost-requirements',
      'a3c8a39dd1b08ffdc68d1f7b9b29153ae50feb88',
      159,
      31,
    ],
    [
      'service-source-review',
      'ServiceSourceReview',
      '/root/cycle22_customer',
      'codex/cycle23-service-source-continuity',
      'b2081de250ace947391de62fdb0ad4fd6b8b16c4',
      161,
      56,
    ],
    [
      'maintenance-revision-requirements',
      'MaintenanceRevisionRequirements',
      '/root/cycle11_field_growth',
      'codex/cycle23-maintenance-revision-requirements',
      '13bc65e61c9a932ba4acbbec9f992ec216a91668',
      158,
      34,
    ],
    [
      'verified-owner-briefing',
      'VerifiedOwnerBriefing',
      '/root/cycle23_finance_intelligence',
      'codex/cycle23-verified-owner-briefing',
      'c9e40a04061da2189231cfa89f85ffa0ed1699c0',
      160,
      27,
    ],
  ].map((row) => Object.freeze(row)),
);
/** Only independently demonstrated, exact forward presentation corrections.
 * Original author commits remain immutable; this is not general ancestry admission. */
export const cycle23Corrections = Object.freeze({
  'recorded-cost-requirements': Object.freeze({
    original: '12114a8efe5bebe9a06f951537d66a89ae2c926e',
    commit: 'a3c8a39dd1b08ffdc68d1f7b9b29153ae50feb88',
    modified: Object.freeze([
      'src/components/workflows/RecordedCostRequirements.tsx',
      'src/components/workflows/recorded-cost-requirements.css',
    ]),
  }),
  'verified-owner-briefing': Object.freeze({
    original: '9bec73c579f11dedc0b21deeb715f17975452b4e',
    commit: 'c9e40a04061da2189231cfa89f85ffa0ed1699c0',
    modified: Object.freeze([
      'src/components/workflows/VerifiedOwnerBriefing.tsx',
    ]),
  }),
});
// Filled only from the actual separately published independent review. Null
// deliberately prevents CLEAR/complete acceptance during source preparation.
export const cycle23Independent = Object.freeze({
  commit: '280611624c4a515bab1e4d8ddc7a1ad387ef1ac7',
  cases: 50,
});
export const cycle23ValidationCases = 47;
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
  'docs/program/CYCLE22_SOURCE_MANIFEST.json',
];
let retainedExtraPaths;
/** Broader old author/protected paths are admitted only by the fixed published
 * parent manifests. This does not turn the earlier workflow reader into a
 * general filesystem or private infrastructure reader. */
function readCycle23File(path) {
  if (!retainedExtraPaths) {
    retainedExtraPaths = new Set(
      retainedIndexPaths.flatMap((index) =>
        JSON.parse(readGit(cycle23Parent, index)).packages.flatMap((p) =>
          p.owned_files.map((file) => file.path),
        ),
      ),
    );
    const protectedSource = JSON.parse(
        readGit(cycle23Parent, 'docs/program/CYCLE4_PROTECTED_SOURCE.json'),
      ),
      design = JSON.parse(
        readGit(cycle23Parent, 'docs/program/DESIGN_SYSTEM_CONTRACT.json'),
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
export function cycle23PackagePaths(module, component) {
  return [
    `src/lib/workflows/${module}.ts`,
    `src/components/workflows/${component}.tsx`,
    `src/components/workflows/${module}.css`,
    `tests/cycle23-${module}.test.ts`,
    `docs/program/CYCLE23_${module.toUpperCase().replaceAll('-', '_')}.md`,
  ];
}
export function validateCycle23Manifest(manifest, ports = {}) {
  const read = ports.read ?? readCycle23File,
    git = ports.git ?? readGit;
  if (
    !manifest ||
    manifest.schema !== 'propel-cycle23-sources-v1' ||
    manifest.parent_commit !== cycle23Parent ||
    manifest.coordination_branch !== cycle23Branch ||
    manifest.coordination_draft_pr !== 155 ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    !['PENDING', 'CLEAR_LOCAL_SYNTHETIC_ONLY'].includes(
      manifest.independent_status,
    ) ||
    !Array.isArray(manifest.packages) ||
    manifest.packages.length !== 5
  )
    throw Error(
      'Exact Cycle23 parent, five packages, Main155 and closed release required',
    );
  const priorManifest = JSON.parse(
    read('docs/program/CYCLE22_SOURCE_MANIFEST.json'),
  );
  validateCycle22Manifest(priorManifest, { read, git });
  const priorIndexes = retainedIndexPaths;
  for (const path of [
    ...priorIndexes,
    'docs/program/CYCLE4_PROTECTED_SOURCE.json',
    'docs/program/DESIGN_SYSTEM_CONTRACT.json',
  ])
    if (!Buffer.from(read(path)).equals(Buffer.from(git(cycle23Parent, path))))
      throw Error(`Exact retained manifest required: ${path}`);
  for (const path of priorIndexes)
    for (const p of JSON.parse(read(path)).packages)
      for (const file of p.owned_files) {
        const bytes = Buffer.from(read(file.path));
        if (sha(bytes) === file.sha256) continue;
        if (
          path === 'docs/program/CYCLE21_SOURCE_MANIFEST.json' &&
          p.head_commit === '161f1c59d864d60aa0f45820eb6417864519baf2' &&
          file.path === 'src/components/workflows/RecordedOwnerActions.tsx'
        ) {
          try {
            // Prior validation and the exact retained-manifest check above
            // remain mandatory. Recheck this current read against the sole
            // reviewed endpoint without changing its original hash or blob.
            validateCycle21PublishedSource(
              file,
              p.head_commit,
              bytes,
              Buffer.from(git(p.head_commit, file.path)),
              { read, git },
            );
            continue;
          } catch {
            // Unknown current bytes retain the original failure contract.
          }
        }
        throw Error(`Retained author source changed: ${file.path}`);
      }
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
    ...JSON.parse(
      read('docs/program/CYCLE21_SOURCE_MANIFEST.json'),
    ).packages.flatMap((p) => p.owned_files.map((f) => f.path)),
    ...priorManifest.packages.flatMap((p) => p.owned_files.map((f) => f.path)),
  ]);
  if (prior.size !== 498) throw Error('All498 retained author paths required');
  const seen = new Set(prior),
    prs = new Set([155]);
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
        throw Error('Duplicate, overlapping or unknown Cycle23 source path');
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
          `Exact published Cycle23 bytes/blob required: ${file.path}`,
        );
      pending.delete(file.path);
      seen.add(file.path);
    }
    if (pending.size) throw Error('Missing exact source');
  }
  const parent =
    ports.parent ??
    ((commit) =>
      execFileSync('git', ['show', '--no-patch', '--format=%P', commit], {
        encoding: 'utf8',
      }).trim());
  const delta =
    ports.delta ??
    ((commit) =>
      execFileSync(
        'git',
        [
          'diff-tree',
          '--no-commit-id',
          '--name-status',
          '--no-renames',
          '-r',
          commit,
        ],
        { encoding: 'utf8' },
      ));
  for (const [i, row] of cycle23Authors.entries()) {
    const [module, component, owner, branch, head, pr, count] = row,
      p = manifest.packages[i];
    if (
      !p ||
      p.module !== module ||
      p.component !== component ||
      p.owner !== owner ||
      p.branch !== branch ||
      p.parent_commit !== cycle23Parent ||
      p.head_commit !== head ||
      p.draft_pr !== pr ||
      p.focused_new_tests !== count ||
      p.base_branch !== cycle23Branch ||
      p.status !== 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL' ||
      prs.has(pr)
    )
      throw Error('Exact Cycle23 author/branch/head/PR/count/stack required');
    prs.add(pr);
    const correction = cycle23Corrections[module],
      original = correction?.original ?? head;
    if (p.original_author_commit !== original)
      throw Error('Exact immutable original author commit required');
    if (correction) {
      if (
        head !== correction.commit ||
        parent(head) !== original ||
        parent(original) !== cycle23Parent
      )
        throw Error(
          'Exact separately reviewed forward correction and original single parent required',
        );
      const actualDelta = delta(head);
      const expectedDelta = correction.modified
        .map((path) => `M\t${path}`)
        .sort()
        .join('\n');
      if (
        typeof actualDelta !== 'string' ||
        actualDelta.trimEnd().split('\n').sort().join('\n') !== expectedDelta
      )
        throw Error(
          'Only the exact reviewed modified presentation paths are admitted',
        );
      for (const path of cycle23PackagePaths(module, component))
        if (
          !correction.modified.includes(path) &&
          !Buffer.from(git(head, path)).equals(Buffer.from(git(original, path)))
        )
          throw Error(
            'Original reader, test and documentation bytes must remain unchanged',
          );
    } else if (parent(head) !== cycle23Parent)
      throw Error('Published author must have the exact single parent');
    verify(p.owned_files, cycle23PackagePaths(module, component), head);
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
      !hex40(cycle23Independent.commit) ||
      manifest.independent_review_commit !== cycle23Independent.commit ||
      !Number.isSafeInteger(cycle23Independent.cases) ||
      cycle23Independent.cases < 1
    )
      throw Error(
        'Exact separately published Cycle23 independent review required',
      );
    verify(
      manifest.independent_files,
      [
        'tests/cycle23-independent-integration-review.test.ts',
        'docs/program/CYCLE23_INDEPENDENT_REVIEW.json',
      ],
      cycle23Independent.commit,
    );
    independent = 2;
  }
  if (ports.requireIndependent === true && independent !== 2)
    throw Error('Independent Cycle23 review remains pending');
  return {
    packages: 5,
    author_files: 25,
    independent_files: independent,
    independent_status: manifest.independent_status,
    retained_author_files: 498,
    protected_files: 128,
    design_locks: 5,
    design_bindings: 13,
    authority: 'LOCAL_SOURCE_EVIDENCE_ONLY',
  };
}
export function cycle23ApplicationSuites(manifest) {
  const suites = manifest?.combined_evidence?.application_suites;
  const fixed = Object.fromEntries([
    ...cycle23Authors.map((p) => [`tests/cycle23-${p[0]}.test.ts`, p[6]]),
    ['tests/cycle23-validation.test.ts', cycle23ValidationCases],
    [
      'tests/cycle23-independent-integration-review.test.ts',
      cycle23Independent.cases,
    ],
  ]);
  if (
    manifest?.independent_status !== 'CLEAR_LOCAL_SYNTHETIC_ONLY' ||
    manifest.independent_review_commit !== cycle23Independent.commit ||
    !hex40(cycle23Independent.commit) ||
    !suites ||
    Array.isArray(suites) ||
    Object.keys(suites).length !== Object.keys(fixed).length ||
    Object.entries(fixed).some(
      ([path, count]) =>
        !Number.isSafeInteger(count) || count < 1 || suites[path] !== count,
    )
  )
    throw Error(
      'Complete source-fixed current Cycle23 suite inventory and independent review required',
    );
  const total = Object.values(fixed).reduce((a, b) => a + b, 0),
    e = manifest.combined_evidence;
  if (
    e.application_cases !== total ||
    e.author_cases !== cycle23Authors.reduce((n, p) => n + p[6], 0) ||
    e.coordinator_cases !== cycle23ValidationCases ||
    e.independent_cases !== cycle23Independent.cases
  )
    throw Error('Actual source-bound Cycle23 totals required');
  return fixed;
}
export function validateCycle23Results(report, manifest, cwd = process.cwd()) {
  return validateCycle23ApplicationReport(
    report,
    cycle23ApplicationSuites(manifest),
    cwd,
  );
}
export function validateCycle23ApplicationReport(
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
        !/^tests\/cycle23-[a-z0-9-]+\.test\.ts$/.test(path) ||
        !Number.isSafeInteger(count) ||
        count < 1,
    )
  )
    throw Error('Finite exact Cycle23 suite inventory required');
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
  if (
    process.argv
      .slice(2)
      .some((arg) => !['--require-independent', '--application'].includes(arg))
  )
    throw Error('Only exact bounded Cycle23 verification supported');
  execFileSync(
    process.execPath,
    ['scripts/check-cycle22.mjs', '--require-independent'],
    { stdio: 'inherit' },
  );
  const manifest = JSON.parse(
    readFileSync('docs/program/CYCLE23_SOURCE_MANIFEST.json', 'utf8'),
  );
  console.log(
    JSON.stringify(
      validateCycle23Manifest(manifest, { requireIndependent: true }),
    ),
  );
  if (process.argv.includes('--application')) {
    const report = JSON.parse(
      readFileSync('artifacts/cycle23/application-results.json', 'utf8'),
    );
    console.log(JSON.stringify(validateCycle23Results(report, manifest)));
  }
  console.log(
    'Cycle23 exact sources and independent/protected chain verified. Local evidence only; no operational or release authority.',
  );
}
