import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(
  readFileSync('docs/program/CYCLE14_DELIVERY_INDEX.json', 'utf8'),
);
const report = JSON.parse(
  readFileSync('artifacts/cycle14/application-results.json', 'utf8'),
);
if (report.evidenceSequence) {
  const sequence = report.evidenceSequence;
  if (
    sequence.kind !==
      'UNIQUE_CASE_ROLLUP_AFTER_COORDINATOR_WHITESPACE_ASSERTION_NORMALIZATION' ||
    sequence.replacedSuite !== 'cycle14-feature-evidence.test.ts' ||
    sequence.baseline.path !==
      'artifacts/cycle14/application-results-before-format-normalization.json' ||
    sequence.correction.path !== 'artifacts/cycle14/coordinator-results.json'
  )
    throw Error('Exact corrective evidence sequence required');
  const read = (record) => {
    const bytes = readFileSync(record.path);
    if (createHash('sha256').update(bytes).digest('hex') !== record.sha256)
      throw Error('Raw corrective evidence changed');
    return JSON.parse(bytes);
  };
  const baseline = read(sequence.baseline),
    correction = read(sequence.correction);
  if (
    baseline.numPassedTests !== 406 ||
    baseline.numFailedTests !== 1 ||
    baseline.numPendingTests !== 0 ||
    correction.numPassedTests !== 15 ||
    correction.numFailedTests !== 0 ||
    correction.numPendingTests !== 0 ||
    correction.testResults.length !== 1 ||
    basename(correction.testResults[0].name) !== sequence.replacedSuite ||
    baseline.testResults.length !== report.testResults.length
  )
    throw Error('Actual bounded correction outcomes required');
  for (const result of report.testResults) {
    const original = baseline.testResults.find((r) => r.name === result.name);
    if (!original) throw Error('Unknown corrective source suite');
    if (basename(result.name) === sequence.replacedSuite) {
      const failed = original.assertionResults.filter(
        (a) => a.status !== 'passed',
      );
      if (
        failed.length !== 1 ||
        failed[0].fullName !==
          'retains approved artwork, portal and back-office scopes without extra approval claims' ||
        JSON.stringify(result) !== JSON.stringify(correction.testResults[0])
      )
        throw Error('Only exact documentation assertion correction permitted');
    } else if (JSON.stringify(result) !== JSON.stringify(original))
      throw Error('Unchanged passing evidence was replaced');
  }
}
const expected = new Map([
  ...manifest.packages.map((p) => [
    `cycle14-${p.module}.test.ts`,
    p.focused_new_tests,
  ]),
  ['cycle14-integration.test.ts', manifest.combined_evidence.independent_cases],
  [
    'cycle14-feature-evidence.test.ts',
    manifest.combined_evidence.coordinator_cases,
  ],
  ['cycle14-visual-review.test.ts', 16],
  ['cycle13-scorecard-evidence.test.ts', 4],
  ['program-feature-evidence.test.ts', 73],
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
  `Cycle14: ${report.numPassedTests} ${report.evidenceSequence ? 'unique passing cases (raw full run + bounded correction)' : 'actual PASS'} across ${report.testResults.length} exact files; no release authority.`,
);
