// Complete collection gate for this cycle's new application/source/parser cases.
// Parser fixtures are never browser acceptance or operational recovery evidence.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const expected = new Map(
  Object.entries({
    'cycle32-c12-browser-evidence.test.ts': 45,
    'cycle32-independent-source-review.test.ts': 10,
    'cycle32-owner-filter-navigation.test.ts': 12,
    'cycle32-profit-guard-completeness.test.ts': 12,
    'cycle32-source-lineage.test.ts': 96,
    'cycle32-task-input-binding.test.ts': 11,
    'cycle32-voice-input-continuity.test.ts': 27,
  }).map(([path, count]) => ['tests/' + path, count]),
);
const report = JSON.parse(readFileSync(process.argv[2]));
if (
  !report.success ||
  report.numTotalTests !== 213 ||
  report.numPassedTests !== 213 ||
  report.numFailedTests !== 0 ||
  report.numPendingTests !== 0 ||
  report.testResults.length !== expected.size
)
  throw Error(
    'Exactly 213 passing Cycle32 cases and seven original new suites required',
  );
for (const suite of report.testResults) {
  const path = relative(process.cwd(), suite.name);
  const count = expected.get(path);
  const cases = suite.assertionResults;
  if (
    !expected.delete(path) ||
    suite.status !== 'passed' ||
    cases.length !== count ||
    new Set(cases.map((c) => c.fullName)).size !== count ||
    cases.some((c) => !c.fullName || c.status !== 'passed')
  )
    throw Error('Changed, incomplete or repeated Cycle32 collection: ' + path);
}
if (expected.size) throw Error('Missing Cycle32 suite');
console.log(
  JSON.stringify({
    cases: 213,
    suites: 7,
    passed: 213,
    skipped: 0,
    parser_cases: 45,
    browser_acceptance: false,
    operational_acceptance: false,
  }),
);
