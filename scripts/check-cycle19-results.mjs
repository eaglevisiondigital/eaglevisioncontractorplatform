import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import {
  cycle19Packages,
  validateCycle19Manifest,
} from './check-cycle19-integrity.mjs';
import { readCycle13File } from './check-cycle13-integrity.mjs';
const manifest = JSON.parse(
  readCycle13File('docs/program/CYCLE19_DELIVERY_INDEX.json'),
);
validateCycle19Manifest(manifest);
const combined = manifest.combined_evidence;
if (
  manifest.independent_status !== 'CLEAR_LOCAL_SYNTHETIC_ONLY' ||
  !combined ||
  !Number.isSafeInteger(combined.independent_cases) ||
  combined.independent_cases < 1 ||
  !Number.isSafeInteger(combined.runtime_cases) ||
  combined.runtime_cases < 1 ||
  !Number.isSafeInteger(combined.source_exercise_cases) ||
  combined.source_exercise_cases < 1
)
  throw Error(
    'Final exact Cycle19 author, Main and independent evidence required',
  );
const expected = {
  ...Object.fromEntries(
    cycle19Packages.map(([module], i) => [
      `tests/cycle19-${module}.test.ts`,
      manifest.packages[i].focused_new_tests,
    ]),
  ),
  'tests/cycle19-saved-revision-runtime.test.ts': combined.runtime_cases,
  'tests/cycle19-saved-source-exercise.test.ts': combined.source_exercise_cases,
  'tests/cycle19-independent-integration-review.test.ts':
    combined.independent_cases,
};
const author = manifest.packages.reduce((n, p) => n + p.focused_new_tests, 0),
  coordinator = combined.runtime_cases + combined.source_exercise_cases,
  total = author + coordinator + combined.independent_cases;
if (
  author !== 192 ||
  combined.author_cases !== author ||
  combined.coordinator_cases !== coordinator ||
  combined.application_cases !== total
)
  throw Error('Exact Cycle19 author/Main/independent totals required');
const report = JSON.parse(
  readFileSync('artifacts/cycle19/application-results.json', 'utf8'),
);
if (
  report.success !== true ||
  report.numFailedTests !== 0 ||
  report.numPendingTests !== 0 ||
  report.numPassedTests !== total ||
  report.numTotalTests !== total ||
  !Array.isArray(report.testResults)
)
  throw Error(
    'Complete single-run Cycle19 PASS required; no zero, skipped, pending, failed or partial rollup',
  );
const seen = new Set();
for (const file of report.testResults) {
  if (typeof file.name !== 'string' || !Array.isArray(file.assertionResults))
    throw Error('Exact test file and assertions required');
  const path = relative(process.cwd(), resolve(file.name)).split(sep).join('/');
  if (
    seen.has(path) ||
    !Object.hasOwn(expected, path) ||
    file.status !== 'passed' ||
    file.assertionResults.length !== expected[path]
  )
    throw Error(`Unexpected or incomplete exact Cycle19 suite: ${path}`);
  seen.add(path);
  const cases = new Set();
  for (const assertion of file.assertionResults) {
    if (
      assertion.status !== 'passed' ||
      typeof assertion.fullName !== 'string' ||
      !assertion.fullName.trim() ||
      cases.has(assertion.fullName) ||
      !Array.isArray(assertion.failureMessages) ||
      assertion.failureMessages.length
    )
      throw Error(`Nonpassing, malformed or duplicate case: ${path}`);
    cases.add(assertion.fullName);
  }
}
if (seen.size !== Object.keys(expected).length)
  throw Error('Missing exact Cycle19 suite');
console.log(
  `Cycle19: ${total} actual PASS across ${seen.size} exact new files; no release authority.`,
);
