// Exact focused application collection. Successful local/CI execution is not
// genuine Auth, operational durability, physical recovery or release authority.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export function validateCycle33Application(report, root = process.cwd()) {
  const expected = new Map(
    Object.entries({
      'cycle33-task-receipt-context.test.ts': 51,
      'cycle33-customer-selection-privacy.test.ts': 12,
      'cycle33-maintenance-input-continuity.test.ts': 12,
      'cycle33-sync-proposal-privacy.test.ts': 12,
      'cycle33-owner-continuity.test.ts': 14,
      'cycle33-source-lineage.test.ts': 74,
      'cycle33-foundation-evidence.test.ts': 50,
    }).map(([p, n]) => ['tests/' + p, n]),
  );
  if (
    report.success !== true ||
    report.numTotalTests !== 225 ||
    report.numPassedTests !== 225 ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numTodoTests !== 0 ||
    report.testResults?.length !== 7
  )
    throw Error(
      'Exactly225 passing C33 cases/7files, no failures or skips required',
    );
  for (const suite of report.testResults) {
    const path = relative(root, suite.name),
      count = expected.get(path),
      cases = suite.assertionResults;
    if (
      !expected.delete(path) ||
      suite.status !== 'passed' ||
      cases?.length !== count ||
      new Set(cases.map((c) => c.fullName)).size !== count ||
      cases.some((c) => !c.fullName || c.status !== 'passed')
    )
      throw Error('Missing, duplicate or incomplete C33 suite: ' + path);
  }
  if (expected.size) throw Error('Missing C33 source suites');
  return { passed: 225, files: 7, skipped: 0, business_authority: false };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const report = JSON.parse(readFileSync(process.argv[2]));
  console.log(JSON.stringify(validateCycle33Application(report)));
}
