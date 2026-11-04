// Exact failed-case CI diagnosis only; never business-state or restore authority.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** JSON reporter names use spaces; the pinned runner selects nested names with >. */
export function runnerPattern(cases, createTaskName) {
  const names = cases.map((c) =>
    createTaskName([...c.ancestor_titles, c.title]),
  );
  if (names.length !== new Set(names).size)
    throw Error('Distinct exact runner case names required');
  return (
    '^(?:' +
    names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
    ')$'
  );
}

/** Pure report validation permits offline inspection without running any case. */
export function collectEvidence(report, spec, workingDirectory) {
  const pending = new Map(spec.cases.map((c) => [c.full_name, c]));
  const suites = new Map(spec.files.map((f) => [f.path, f]));
  let selected = 0,
    deselected = 0,
    passed = 0,
    failed = 0;
  if (
    pending.size !== spec.expected_selected ||
    suites.size !== spec.files.length ||
    report.numTotalTests !== spec.expected_collected ||
    report.numPendingTests !== spec.expected_deselected ||
    report.numPassedTests + report.numFailedTests !== spec.expected_selected ||
    report.testResults.length !== spec.files.length
  )
    throw Error('Exact selected/deselected diagnostic collection required');
  for (const suite of report.testResults) {
    const path = relative(workingDirectory, suite.name);
    const file = suites.get(path);
    if (
      !file ||
      !suites.delete(path) ||
      suite.assertionResults.length !== file.collected
    )
      throw Error('Exact original suite inventory required');
    const names = new Set();
    let fileSelected = 0;
    for (const c of suite.assertionResults) {
      if (
        !c.fullName ||
        names.has(c.fullName) ||
        !Array.isArray(c.ancestorTitles) ||
        c.fullName !== [...c.ancestorTitles, c.title].join(' ')
      )
        throw Error('Exact distinct reporter names required');
      names.add(c.fullName);
      if (c.status === 'pending' || c.status === 'skipped') {
        if (pending.has(c.fullName))
          throw Error('Required selected case was skipped');
        deselected++;
        continue;
      }
      const expected = pending.get(c.fullName);
      if (
        !['passed', 'failed'].includes(c.status) ||
        !expected ||
        expected.path !== path ||
        expected.title !== c.title ||
        JSON.stringify(expected.ancestor_titles) !==
          JSON.stringify(c.ancestorTitles) ||
        !pending.delete(c.fullName)
      )
        throw Error('Unexpected selected case');
      selected++;
      fileSelected++;
      if (c.status === 'passed') passed++;
      else failed++;
    }
    if (fileSelected !== file.selected)
      throw Error('Exact per-file selection required');
  }
  if (
    suites.size ||
    pending.size ||
    selected !== spec.expected_selected ||
    deselected !== spec.expected_deselected ||
    passed !== report.numPassedTests ||
    failed !== report.numFailedTests
  )
    throw Error('Missing failed-case evidence');
  return {
    selected,
    passed,
    failed,
    deselected,
    whole_foundation_success: false,
    historical_results_unchanged: true,
  };
}

async function main() {
  const mode = process.argv[2];
  if (!['collect', 'run-missing-four', 'collect-missing-four'].includes(mode))
    throw Error('Explicit diagnostic mode required');
  const missing = mode.endsWith('-missing-four');
  const specUrl = new URL(
    missing
      ? './cycle31-foundation-selected-14-missing-four.json'
      : './cycle31-foundation-selected-14.json',
    import.meta.url,
  );
  const spec = JSON.parse(readFileSync(specUrl));
  const source = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (
    source !== '1a677d67cb1f79246a7912ab7dc4ed3bacc81ccc' ||
    source !== spec.source_commit ||
    spec.expected_selected !== (missing ? 4 : 14) ||
    spec.expected_deselected !== (missing ? 100 : 148) ||
    spec.expected_collected !== (missing ? 104 : 162) ||
    spec.files.length !== (missing ? 2 : 3) ||
    spec.whole_foundation_success_claim !== false
  )
    throw Error('Exact frozen diagnostic scope required');
  const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
  for (const file of [
    ...spec.files,
    spec.test_configuration,
    { path: 'package-lock.json', sha256: spec.package_lock_sha256 },
  ])
    if (sha(file.path) !== file.sha256)
      throw Error('Original source/configuration/lock changed: ' + file.path);
  if (missing) {
    const packageFile = resolve('node_modules/vitest/package.json');
    if (
      JSON.parse(readFileSync(packageFile)).version !==
      spec.expected_vitest_version
    )
      throw Error('Exact pinned runner version required');
    const { createTaskName } = await import(
      pathToFileURL(resolve('node_modules/vitest/dist/task-utils.js')).href
    );
    if (runnerPattern(spec.cases, createTaskName) !== spec.test_name_pattern)
      throw Error('Exact pinned-runner selection pattern required');
  }
  const directory =
    'artifacts/cycle31/' +
    (missing ? 'foundation-missing-four' : 'foundation-selected-14');
  const binding = {
    source,
    node: process.version,
    spec_sha256: sha(specUrl),
    scope: missing
      ? '4_SELECTED_100_DESELECTED_NO_SUCCESSFUL10_REPLAY'
      : '14_SELECTED_148_DESELECTED_NOT_WHOLE_FOUNDATION',
    original_budgets: true,
  };
  if (mode.startsWith('run')) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      directory + '/binding.json',
      JSON.stringify(binding, null, 2) + '\n',
    );
    execFileSync(
      process.execPath,
      [
        'node_modules/vitest/vitest.mjs',
        'run',
        ...spec.files.map((f) => f.path),
        '--maxWorkers=4',
        '--testNamePattern',
        spec.test_name_pattern,
        '--reporter=json',
        '--outputFile=' + directory + '/results.json',
      ],
      { stdio: 'inherit' },
    );
  } else {
    const recordedBinding = JSON.parse(
      readFileSync(directory + '/binding.json'),
    );
    if (
      Object.keys(recordedBinding).length !== Object.keys(binding).length ||
      Object.entries(binding).some(
        ([key, value]) => recordedBinding[key] !== value,
      )
    )
      throw Error('Original diagnostic binding required');
    console.log(
      JSON.stringify(
        collectEvidence(
          JSON.parse(readFileSync(directory + '/results.json')),
          spec,
          process.cwd(),
        ),
      ),
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
