// Constructed parser controls only; no fake report is application/browser evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateNative,
  validateBrowser,
} from '../scripts/v1-sales-finance-integration.mjs';
const m = JSON.parse(
  readFileSync('docs/program/V1_SALES_FINANCE_MANIFEST.json'),
);
const source = {
  candidate: 'a'.repeat(40),
  checkout: 'b'.repeat(40),
  tree: 'c'.repeat(40),
};
const root = '/constructed-parser-control';
function native() {
  const files = new Map();
  for (const id of m.native_ids) {
    const colon = id.indexOf(':'),
      file = id.slice(0, colon),
      name = id.slice(colon + 1);
    if (!files.has(file))
      files.set(file, {
        name: root + '/' + file,
        status: 'passed',
        message: '',
        assertionResults: [],
      });
    files.get(file).assertionResults.push({
      fullName: name,
      status: 'passed',
      failureMessages: [],
      duration: 1,
    });
  }
  return {
    success: true,
    numTotalTests: 110,
    numPassedTests: 110,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numRuntimeErrorTestSuites: 0,
    testResults: [...files.values()],
  };
}
function browser(mode = 'operating') {
  return {
    errors: [],
    stats: {
      expected: m.browser_ids[mode].length,
      unexpected: 0,
      flaky: 0,
      skipped: 0,
    },
    config: {
      workers: 2,
      metadata: {
        source_candidate: source.candidate,
        source_checkout: source.checkout,
        source_tree: source.tree,
        reviewed_mode: mode,
        operational_acceptance: false,
        actualWorkers: 2,
      },
      projects: ['desktop', 'tablet', 'mobile'].map((name) => ({
        name,
        retries: 0,
        repeatEach: 1,
        timeout: 30000,
      })),
    },
    suites: [
      {
        specs: m.browser_ids[mode].map((id) => {
          const [projectName, file, line, column, title] = JSON.parse(id);
          return {
            file,
            line,
            column,
            title,
            ok: true,
            tests: [
              {
                projectName,
                expectedStatus: 'passed',
                status: 'expected',
                timeout: 30000,
                results: [
                  { status: 'passed', retry: 0, duration: 1, errors: [] },
                ],
              },
            ],
          };
        }),
      },
    ],
  };
}
const options = { timeout: 30000 };
test(
  'accepts only the complete literal native parser-control collection',
  options,
  () => assert.equal(validateNative(native(), m.native_ids, root).passed, 110),
);
test(
  'rejects a renamed native case at unchanged aggregate counts',
  options,
  () => {
    const r = native();
    r.testResults[0].assertionResults[0].fullName = 'substituted';
    assert.throws(() => validateNative(r, m.native_ids, root));
  },
);
test('rejects missing duplicate or skipped native identities', options, () => {
  for (const change of ['missing', 'duplicate', 'skip']) {
    const r = native(),
      a = r.testResults[0].assertionResults;
    if (change === 'missing') a.pop();
    else if (change === 'duplicate') a[1] = a[0];
    else {
      a[0].status = 'pending';
      r.numPendingTests = 1;
    }
    assert.throws(() => validateNative(r, m.native_ids, root));
  }
});
test('rejects native over-budget and runtime-error reports', options, () => {
  for (const change of ['duration', 'runtime']) {
    const r = native();
    if (change === 'duration')
      r.testResults[0].assertionResults[0].duration = 30001;
    else r.numRuntimeErrorTestSuites = 1;
    assert.throws(() => validateNative(r, m.native_ids, root));
  }
});
test(
  'accepts constructed exact browser identities separately for all three modes',
  options,
  () => {
    for (const mode of ['operating', 'finance', 'off'])
      assert.equal(
        validateBrowser(browser(mode), m.browser_ids[mode], source, mode)
          .passed,
        m.browser_ids[mode].length,
      );
  },
);
test(
  'rejects browser identity substitution and incomplete collections',
  options,
  () => {
    for (const change of ['title', 'duplicate', 'missing']) {
      const r = browser(),
        s = r.suites[0].specs;
      if (change === 'title') s[0].title = 'other';
      else if (change === 'duplicate') s[1] = s[0];
      else s.pop();
      assert.throws(() =>
        validateBrowser(r, m.browser_ids.operating, source, 'operating'),
      );
    }
  },
);
test(
  'rejects changed browser budgets retries and skipped declarations',
  options,
  () => {
    for (const change of ['budget', 'retry', 'skip']) {
      const r = browser(),
        t = r.suites[0].specs[0].tests[0];
      if (change === 'budget') t.timeout = 30001;
      else if (change === 'retry') t.results[0].retry = 1;
      else t.annotations = [{ type: 'skip' }];
      assert.throws(() =>
        validateBrowser(r, m.browser_ids.operating, source, 'operating'),
      );
    }
  },
);
test(
  'rejects wrong browser source tree candidate and worker evidence',
  options,
  () => {
    for (const change of ['source_tree', 'source_candidate', 'actualWorkers']) {
      const r = browser();
      r.config.metadata[change] =
        change === 'actualWorkers' ? 1 : 'd'.repeat(40);
      assert.throws(() =>
        validateBrowser(r, m.browser_ids.operating, source, 'operating'),
      );
    }
  },
);
