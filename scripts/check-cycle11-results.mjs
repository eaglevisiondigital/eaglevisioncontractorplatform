import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const manifest = JSON.parse(
  readFileSync('docs/program/CYCLE11_DELIVERY_INDEX.json', 'utf8'),
);
const report = JSON.parse(
  readFileSync('artifacts/cycle11/application-results.json', 'utf8'),
);
const expected = new Map([
  ...manifest.packages.map((p) => [
    `cycle11-${p.module}.test.ts`,
    p.focused_new_tests,
  ]),
  [
    'cycle11-integration.test.ts',
    manifest.combined_evidence.independent_new_cases,
  ],
  [
    'cycle11-feature-evidence.test.ts',
    manifest.combined_evidence.source_ownership_cases,
  ],
  [
    'cycle10-integration.test.ts',
    manifest.combined_evidence.retained_independent_cases,
  ],
  [
    'cycle11-pilot-scorecard.test.ts',
    manifest.combined_evidence.pilot_scorecard_cases,
  ],
  [
    'program-feature-evidence.test.ts',
    manifest.combined_evidence.source_inventory_cases,
  ],
]);
if (
  report.numFailedTests !== 0 ||
  report.numPendingTests !== 0 ||
  report.numPassedTests !== manifest.combined_evidence.application_cases ||
  report.testResults.length !== expected.size
)
  throw Error('Actual complete passing application evidence required');
for (const result of report.testResults) {
  const name = basename(result.name);
  if (
    !expected.has(name) ||
    result.status !== 'passed' ||
    result.assertionResults.length !== expected.get(name) ||
    result.assertionResults.some((a) => a.status !== 'passed')
  )
    throw Error(`Source/test count or outcome differs: ${name}`);
  expected.delete(name);
}
if (expected.size) throw Error('Missing actual suite evidence');
console.log(
  `Cycle11 actual application evidence: ${report.numPassedTests} PASS across ${report.testResults.length} files; exact delivery counts. No release authority.`,
);
