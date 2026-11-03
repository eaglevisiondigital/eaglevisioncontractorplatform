import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { cycle16Packages } from './check-cycle16-integrity.mjs';
import { readCycle13File } from './check-cycle13-integrity.mjs';
const manifest = JSON.parse(
  readCycle13File('docs/program/CYCLE16_DELIVERY_INDEX.json'),
);
const expected = {
  ...Object.fromEntries(
    cycle16Packages.map(([module], i) => [
      `cycle16-${module}.test.ts`,
      manifest.packages[i].focused_new_tests,
    ]),
  ),
  'cycle16-integration.test.ts': manifest.combined_evidence.independent_cases,
  'cycle16-composition.test.ts': 10,
  'cycle16-feature-evidence.test.ts': 13,
  'cycle13-scorecard-evidence.test.ts': 4,
  'program-feature-evidence.test.ts': 73,
};
const report = JSON.parse(
  readFileSync('artifacts/cycle16/application-results.json', 'utf8'),
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
    'Complete single-run Cycle16 PASS required; no skipped, pending or partial rollup',
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
  throw Error('Missing exact Cycle16 suite or inconsistent source evidence');
console.log(
  `Cycle16:${total}actual PASS across${seen.size}exact files; no release authority.`,
);
