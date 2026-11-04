// Exact failed-case CI diagnosis only; never business-state or restore authority.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';
const spec = JSON.parse(
  readFileSync(
    new URL('./cycle31-foundation-selected-14.json', import.meta.url),
  ),
);
const source = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
if (
  source !== '1a677d67cb1f79246a7912ab7dc4ed3bacc81ccc' ||
  source !== spec.source_commit ||
  spec.expected_selected !== 14 ||
  spec.expected_deselected !== 148 ||
  spec.whole_foundation_success_claim !== false
)
  throw Error('Exact frozen diagnostic scope required');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
for (const f of [
  ...spec.files,
  spec.test_configuration,
  { path: 'package-lock.json', sha256: spec.package_lock_sha256 },
])
  if (sha(f.path) !== f.sha256)
    throw Error('Original source/configuration/lock changed: ' + f.path);
const directory = 'artifacts/cycle31/foundation-selected-14';
mkdirSync(directory, { recursive: true });
writeFileSync(
  directory + '/binding.json',
  JSON.stringify(
    {
      source,
      node: process.version,
      spec_sha256: sha(
        new URL('./cycle31-foundation-selected-14.json', import.meta.url),
      ),
      scope: '14_SELECTED_148_DESELECTED_NOT_WHOLE_FOUNDATION',
      original_budgets: true,
    },
    null,
    2,
  ) + '\n',
);
if (process.argv[2] === 'run') {
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
} else if (process.argv[2] === 'collect') {
  const r = JSON.parse(readFileSync(directory + '/results.json'));
  const pending = new Map(spec.cases.map((c) => [c.full_name, c.path]));
  let selected = 0,
    deselected = 0;
  if (
    r.numTotalTests !== 162 ||
    r.numPendingTests !== 148 ||
    r.numPassedTests + r.numFailedTests !== 14 ||
    r.testResults.length !== 3
  )
    throw Error('Exact14selected/148deselected diagnostic collection required');
  for (const suite of r.testResults) {
    const path = relative(process.cwd(), suite.name);
    const f = spec.files.find((f) => f.path === path);
    if (!f || suite.assertionResults.length !== f.collected)
      throw Error('Exact original suite inventory required');
    for (const c of suite.assertionResults) {
      if (c.status === 'pending') {
        deselected++;
        continue;
      }
      if (
        !['passed', 'failed'].includes(c.status) ||
        pending.get(c.fullName) !== path ||
        !pending.delete(c.fullName)
      )
        throw Error('Unexpected selected case');
      selected++;
    }
  }
  if (pending.size || selected !== 14 || deselected !== 148)
    throw Error('Missing failed-case evidence');
  console.log(
    JSON.stringify({
      selected,
      passed: r.numPassedTests,
      failed: r.numFailedTests,
      deselected,
      whole_foundation_success: false,
      historical_results_unchanged: true,
    }),
  );
} else throw Error('Explicit run or collect mode required');
