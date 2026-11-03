import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { cycle15Packages } from './check-cycle15-integrity.mjs';
import { readCycle13File } from './check-cycle13-integrity.mjs';
const manifest = JSON.parse(
  readCycle13File('docs/program/CYCLE15_DELIVERY_INDEX.json'),
);
const expected = {
  ...Object.fromEntries(
    cycle15Packages.map(([module], i) => [
      `cycle15-${module}.test.ts`,
      manifest.packages[i].focused_new_tests,
    ]),
  ),
  'cycle15-integration.test.ts': manifest.combined_evidence.independent_cases,
  'cycle15-composition.test.ts': 4,
  'cycle15-feature-evidence.test.ts': 13,
  'cycle13-scorecard-evidence.test.ts': 4,
  'program-feature-evidence.test.ts': 73,
};
const report = JSON.parse(
  readFileSync('artifacts/cycle15/application-results.json', 'utf8'),
);
const total = Object.values(expected).reduce((a, b) => a + b, 0);
if (
  report.success !== true ||
  report.numFailedTests !== 0 ||
  report.numPendingTests !== 0 ||
  report.numPassedTests !== total ||
  report.numTotalTests !== total
)
  throw Error(
    'Complete single-run Cycle15 PASS required; no skipped, pending or partial rollup',
  );
const seen = new Set();
for (const file of report.testResults) {
  const name = basename(file.name);
  if (
    seen.has(name) ||
    !Object.hasOwn(expected, name) ||
    file.status !== 'passed' ||
    file.assertionResults.length !== expected[name]
  )
    throw Error('Unexpected or incomplete exact test file:' + name);
  seen.add(name);
  const cases = new Set();
  for (const assertion of file.assertionResults) {
    if (assertion.status !== 'passed' || cases.has(assertion.fullName))
      throw Error('Nonpassing or duplicate case:' + name);
    cases.add(assertion.fullName);
  }
}
if (
  seen.size !== Object.keys(expected).length ||
  manifest.combined_evidence.application_cases !== total
)
  throw Error('Missing exact Cycle15 suite or inconsistent source evidence');
console.log(
  `Cycle15:${total}actual PASS across${seen.size}exact files; no release authority.`,
);
