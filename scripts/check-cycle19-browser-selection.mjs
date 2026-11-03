import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const expected = {
  development: {
    config: 'tests/program/playwright.cycle19.config.ts',
    url: 'http://127.0.0.1:4381',
    command:
      'VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4381 --strictPort',
    timeout: 150000,
    counts: { 'cycle19-saved-continuity.spec.ts': 12 },
  },
  production: {
    config: 'tests/program/playwright.cycle19-off.config.ts',
    url: 'http://127.0.0.1:4391',
    command: 'npm run preview -- --host 127.0.0.1 --port 4391 --strictPort',
    timeout: 90000,
    counts: { 'cycle19-default-off.spec.ts': 3 },
  },
};
const report = {};
for (const [mode, { config, counts, url, command, timeout }] of Object.entries(
  expected,
)) {
  const result = spawnSync(
    'node_modules/.bin/playwright',
    ['test', '-c', config, '--list', '--reporter=json'],
    { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const collected = JSON.parse(result.stdout);
  assert.deepEqual(collected.errors, []);
  assert.equal(collected.config.webServer.url, url, `${mode} server origin`);
  assert.equal(
    collected.config.webServer.command,
    command,
    `${mode} server mode`,
  );
  assert.equal(collected.config.webServer.reuseExistingServer, false);
  assert.deepEqual(
    collected.config.projects.map((project) => project.name).sort(),
    ['desktop', 'mobile', 'tablet'],
  );
  for (const project of collected.config.projects) {
    assert.equal(project.timeout, timeout);
    assert.equal(project.retries, 0);
  }
  const cases = [];
  function visit(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests) {
          cases.push({
            file: spec.file,
            title: spec.title,
            project: test.projectName,
          });
        }
      }
      visit(suite.suites ?? []);
    }
  }
  visit(collected.suites);
  const actualCounts = {};
  for (const test of cases) {
    actualCounts[test.file] = (actualCounts[test.file] ?? 0) + 1;
  }
  assert.deepEqual(actualCounts, counts, `${mode} resolved test files`);
  assert.equal(
    new Set(cases.map((test) => JSON.stringify(test))).size,
    cases.length,
    `${mode} duplicate case identity`,
  );
  assert.deepEqual([...new Set(cases.map((test) => test.project))].sort(), [
    'desktop',
    'mobile',
    'tablet',
  ]);
  for (const [file, count] of Object.entries(counts)) {
    const subset = cases.filter((test) => test.file === file);
    for (const project of ['desktop', 'tablet', 'mobile']) {
      const actual = subset.filter((test) => test.project === project);
      assert.equal(
        actual.length,
        count / 3,
        `${mode} ${file} ${project} coverage`,
      );
      const titles =
        mode === 'development'
          ? [
              ...['straight-edge', 'cunningham', 'roofing-example'].map(
                (slug) =>
                  `actual saved source read compare adopt across five workspaces / ${slug}`,
              ),
              'revoked membership withholds retained private review evidence',
            ]
          : ['production keeps the operating center and guided paths closed'];
      assert.deepEqual(
        actual.map((test) => test.title).sort(),
        titles.sort(),
        `${mode} exact brand/scenario identities`,
      );
    }
  }

  report[mode] = { count: cases.length, cases };
}
mkdirSync('artifacts/cycle19', { recursive: true });
writeFileSync(
  'artifacts/cycle19/browser-selection-collection.json',
  `${JSON.stringify({ kind: 'collection-only', ...report }, null, 2)}\n`,
);
console.log(
  'Cycle19 browser collection: 12 development / 3 production-OFF cases.',
);
