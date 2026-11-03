import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { cycle18Packages } from './check-cycle18-integrity.mjs';
import { readCycle13File } from './check-cycle13-integrity.mjs';
const manifest = JSON.parse(
  readCycle13File('docs/program/CYCLE18_DELIVERY_INDEX.json'),
);
if (
  !Array.isArray(manifest.packages) ||
  manifest.packages.length !== cycle18Packages.length ||
  manifest.independent_status !== 'CLEAR_LOCAL_SYNTHETIC_ONLY' ||
  !Number.isSafeInteger(manifest.combined_evidence?.independent_cases) ||
  manifest.combined_evidence.independent_cases < 1
)
  throw Error('Final exact Cycle18 author and independent evidence required');
const expected = {
  ...Object.fromEntries(
    cycle18Packages.map(([module], i) => {
      const authored = manifest.packages[i];
      if (
        authored.module !== module ||
        !Number.isSafeInteger(authored.focused_new_tests) ||
        authored.focused_new_tests < 1
      )
        throw Error('Exact positive Cycle18 authored case count required');
      return [`tests/cycle18-${module}.test.ts`, authored.focused_new_tests];
    }),
  ),
  'tests/cycle18-workbench-runtime.test.ts': 20,
  'tests/program/cycle18-composition.test.ts': 8,
  'tests/cycle18-independent-integration-review.test.ts':
    manifest.combined_evidence.independent_cases,
  'tests/program/cycle13-scorecard-evidence.test.ts': 4,
  'tests/program-feature-evidence.test.ts': 73,
  'tests/program/cycle17-composition.test.ts': 7,
  'tests/program/cycle17-feature-evidence.test.ts': 13,
};
const report = JSON.parse(
  readFileSync('artifacts/cycle18/application-results.json', 'utf8'),
);
const total = Object.values(expected).reduce((a, b) => a + b, 0);
if (
  report.success !== true ||
  report.numFailedTests !== 0 ||
  report.numPendingTests !== 0 ||
  report.numPassedTests !== total ||
  report.numTotalTests !== total ||
  !Array.isArray(report.testResults)
)
  throw Error(
    'Complete single-run Cycle18 PASS required; no skipped, pending or partial rollup',
  );
const seen = new Set();
for (const file of report.testResults) {
  if (typeof file.name !== 'string' || !Array.isArray(file.assertionResults))
    throw Error('Exact test file identity and assertions required');
  const name = relative(process.cwd(), resolve(file.name)).split(sep).join('/');
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
    if (
      assertion.status !== 'passed' ||
      typeof assertion.fullName !== 'string' ||
      !assertion.fullName ||
      cases.has(assertion.fullName) ||
      (Array.isArray(assertion.failureMessages) &&
        assertion.failureMessages.length !== 0)
    )
      throw Error('Nonpassing or duplicate case:' + name);
    cases.add(assertion.fullName);
  }
}
if (
  seen.size !== Object.keys(expected).length ||
  manifest.combined_evidence.application_cases !== total
)
  throw Error('Missing exact Cycle18 suite or inconsistent source evidence');
console.log(
  `Cycle18: ${total} actual PASS across ${seen.size} exact files; no release authority.`,
);
