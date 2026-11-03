import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const brands = ['straight-edge', 'cunningham', 'roofing-example'];
const projects = ['desktop', 'mobile', 'tablet'];
const scenarios = [
  'five actual saved evidence file round trips and tamper privacy',
  'explicit draft edit preserves safe published history and stale archives',
  'actual ended organization preparation and exact priority navigation',
  'revoked current member withholds reopened saved evidence',
];
const artifactRoot = resolve('artifacts/cycle20');
const expected = {
  development: {
    config: 'tests/program/playwright.cycle20.config.ts',
    file: 'cycle20-saved-evidence.spec.ts',
    url: 'http://127.0.0.1:4401',
    command:
      'VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4401 --strictPort',
    timeout: 150000,
    output: 'playwright-results',
    titles: scenarios.flatMap((scenario) =>
      brands.map((brand) => `${scenario} / ${brand}`),
    ),
  },
  production: {
    config: 'tests/program/playwright.cycle20-off.config.ts',
    file: 'cycle20-default-off.spec.ts',
    url: 'http://127.0.0.1:4411',
    command: 'npm run preview -- --host 127.0.0.1 --port 4411 --strictPort',
    timeout: 90000,
    output: 'playwright-results-off',
    titles: ['production keeps saved evidence and operating actions closed'],
  },
};
const report = {};
for (const [
  mode,
  { config, file, url, command, timeout, output, titles },
] of Object.entries(expected)) {
  const result = spawnSync(
    'node_modules/.bin/playwright',
    ['test', '-c', config, '--list', '--reporter=json'],
    {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, CYCLE20_ARTIFACT_DIR: artifactRoot },
    },
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
  assert.equal(collected.config.fullyParallel, false);
  assert.deepEqual(
    collected.config.projects.map((project) => project.name).sort(),
    projects,
  );
  for (const project of collected.config.projects) {
    assert.equal(project.timeout, timeout);
    assert.equal(project.retries, 0);
    assert.equal(project.repeatEach, 1);
    assert.deepEqual(project.testMatch, [file]);
    assert.equal(project.outputDir, resolve(artifactRoot, output));
  }
  const cases = [];
  function visit(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests) {
          assert.equal(test.expectedStatus, 'passed');
          assert.deepEqual(test.annotations, []);
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
  assert.equal(cases.length, titles.length * projects.length);
  assert.equal(
    new Set(cases.map((test) => JSON.stringify(test))).size,
    cases.length,
    `${mode} duplicate case identity`,
  );
  assert.deepEqual([...new Set(cases.map((test) => test.file))], [file]);
  assert.deepEqual(
    [...new Set(cases.map((test) => test.project))].sort(),
    projects,
  );
  for (const project of projects)
    assert.deepEqual(
      cases
        .filter((test) => test.project === project)
        .map((test) => test.title)
        .sort(),
      [...titles].sort(),
      `${mode} exact brand/scenario identities for ${project}`,
    );
  report[mode] = { count: cases.length, cases };
}
mkdirSync(artifactRoot, { recursive: true });
writeFileSync(
  resolve(artifactRoot, 'browser-selection-collection.json'),
  `${JSON.stringify({ kind: 'collection-only', ...report }, null, 2)}\n`,
);
console.log(
  'Cycle20 browser collection: 36 development / 3 production-OFF exact cases. Collection does not establish browser PASS.',
);
