// Compare actual runner evidence with the public source-bound delivery register.
// This is local/CI proof only, never operational authority or a signed attestation.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const manifest = JSON.parse(
  readFileSync('docs/program/CYCLE8_DELIVERY_INDEX.json', 'utf8'),
);
const report = JSON.parse(
  readFileSync('artifacts/cycle8/application-results.json', 'utf8'),
);
const expected = new Map([
  ...manifest.packages.map((p) => [
    `cycle8-${p.module}.test.ts`,
    p.focused_new_tests,
  ]),
  [
    'cycle8-integration.test.ts',
    manifest.combined_evidence.independent_new_cases,
  ],
  [
    'cycle7-integration.test.ts',
    manifest.combined_evidence.retained_independent_cases,
  ],
  [
    'program-feature-evidence.test.ts',
    manifest.combined_evidence.source_inventory_cases,
  ],
  [
    'program-controlled-integration-contracts.test.ts',
    manifest.combined_evidence.compatibility_cases,
  ],
]);
if (
  report.numFailedTests !== 0 ||
  report.numPendingTests !== 0 ||
  report.numPassedTests !== manifest.combined_evidence.application_cases ||
  report.testResults.length !== expected.size
)
  throw Error('Actual complete passing application results required');
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
  `Cycle8 actual application evidence: ${report.numPassedTests} PASS; all ${report.testResults.length} file counts match the delivery register. No release authority inferred.`,
);
