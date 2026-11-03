import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCycle20Manifest } from './check-cycle20-integrity.mjs';
import { readCycle13File } from './check-cycle13-integrity.mjs';

const expected = Object.freeze({
  'tests/cycle20-work-order-evidence-continuity.test.ts': 39,
  'tests/cycle20-recorded-cost-continuity.test.ts': 47,
  'tests/cycle20-published-service-continuity.test.ts': 53,
  'tests/cycle20-maintenance-renewal-evidence.test.ts': 38,
  'tests/cycle20-recorded-priority-navigation.test.ts': 42,
  'tests/cycle20-saved-evidence-runtime.test.ts': 13,
  'tests/cycle20-saved-evidence-files.test.ts': 12,
  'tests/cycle20-independent-integration-review.test.ts': 42,
});

export function validateCycle20Results(report, manifest, cwd = process.cwd()) {
  validateCycle20Manifest(manifest);
  const combined = manifest.combined_evidence;
  if (
    manifest.independent_status !== 'CLEAR_LOCAL_SYNTHETIC_ONLY' ||
    combined?.author_cases !== 219 ||
    combined.coordinator_cases !== 25 ||
    combined.independent_cases !== 42 ||
    combined.application_cases !== 286 ||
    !combined.application_suites ||
    Object.keys(combined.application_suites).length !== 8 ||
    Object.entries(expected).some(
      ([path, count]) => combined.application_suites[path] !== count,
    )
  )
    throw Error(
      'Exact C20 author/Main/independent source and case totals required',
    );
  if (
    report?.success !== true ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numTodoTests !== 0 ||
    report.numFailedTestSuites !== 0 ||
    report.numPendingTestSuites !== 0 ||
    report.numPassedTests !== 286 ||
    report.numTotalTests !== 286 ||
    !Array.isArray(report.testResults)
  )
    throw Error(
      'Complete single-run C20 PASS required; no zero, failed, skipped, pending, todo or partial rollup',
    );
  const seen = new Set();
  for (const file of report.testResults) {
    if (typeof file.name !== 'string' || !Array.isArray(file.assertionResults))
      throw Error('Exact C20 test file and assertions required');
    const path = relative(cwd, resolve(cwd, file.name)).split(sep).join('/');
    if (
      seen.has(path) ||
      !Object.hasOwn(expected, path) ||
      file.status !== 'passed' ||
      file.assertionResults.length !== expected[path]
    )
      throw Error(`Unexpected or incomplete exact C20 suite: ${path}`);
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
        throw Error(`Nonpassing, malformed or duplicate C20 case: ${path}`);
      cases.add(assertion.fullName);
    }
  }
  if (seen.size !== Object.keys(expected).length)
    throw Error('Missing exact C20 suite');
  return {
    passed: 286,
    suites: seen.size,
    authority: 'LOCAL_TEST_EVIDENCE_ONLY',
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = validateCycle20Results(
    JSON.parse(
      readFileSync(
        process.argv[2] ?? 'artifacts/cycle20/application-results.json',
        'utf8',
      ),
    ),
    JSON.parse(readCycle13File('docs/program/CYCLE20_SOURCE_MANIFEST.json')),
  );
  console.log(
    `Cycle20: ${result.passed} actual PASS across ${result.suites} exact new files; no release authority.`,
  );
}
