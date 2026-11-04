import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const tool = await import(
  pathToFileURL(resolve('scripts/cycle32-c12-browser-evidence.mjs')).href
);
// Explicit parser fixtures only: these are not executed browser acceptance.
function fixture(shard = 'desktop', collection = false) {
  const rows: {
    id: string;
    file: string;
    line: number;
    title: string;
    project: string;
    timeout: number;
  }[] = tool.expectedRows(shard);
  return {
    config: {
      workers: 2,
      fullyParallel: false,
      configFile:
        '/fixture/source/' +
        tool.manifest.config[shard === 'off' ? 'off' : 'native'],
      rootDir: '/fixture/source/tests/program',
      projects: ['desktop', 'tablet', 'mobile'].map((name) => ({
        name,
        repeatEach: 1,
        retries: 0,
        timeout: shard === 'off' ? 30000 : 90000,
      })),
    },
    errors: [] as unknown[],
    suites: [
      {
        specs: rows.map((row) => ({
          id: row.id,
          file: row.file,
          line: row.line,
          title: row.title,
          ok: true,
          tests: [
            {
              projectName: row.project,
              projectId: row.project,
              timeout: row.timeout,
              expectedStatus: 'passed',
              status: collection ? 'skipped' : 'expected',
              results: collection
                ? []
                : [
                    {
                      status: 'passed',
                      retry: 0,
                      duration: 1,
                      errors: [] as unknown[],
                    },
                  ],
            },
          ],
        })),
      },
    ],
    stats: {
      startTime: '2026-11-04T20:00:00.000Z',
      duration: 1,
      expected: collection ? 0 : rows.length,
      skipped: collection ? rows.length : 0,
      unexpected: 0,
      flaky: 0,
    },
  };
}
function binding(shard: string) {
  return {
    source: tool.manifest.source,
    tree: tool.manifest.source_tree,
    shard,
    diagnostics_source: 'a'.repeat(40),
    node: 'v24.22.2',
    platform: 'linux',
    ubuntu: '24.04',
    hashes: structuredClone(tool.manifest.hashes),
    tracked_source_clean: true,
  };
}
function input(shard: string) {
  return {
    shard,
    before: binding(shard),
    after: binding(shard),
    collection: fixture(shard, true),
    report: fixture(shard),
  };
}
it.each(['desktop', 'tablet', 'mobile', 'off'])(
  'explicit %s parser fixture accepts exactly original identities and one attempt',
  (shard) => {
    expect(tool.validateReport(fixture(shard), shard)).toMatchObject({
      cases: shard === 'off' ? 3 : 16,
      all_pass: true,
    });
  },
);
it.each(['desktop', 'tablet', 'mobile', 'off'])(
  'explicit %s collection fixture never claims executed acceptance',
  (shard) => {
    expect(
      tool.validateReport(fixture(shard, true), shard, 'collection'),
    ).toMatchObject({ collection_only: true, all_pass: false });
    expect(() => tool.validateReport(fixture(shard, true), shard)).toThrow();
  },
);
it('explicit four-shard parser fixture requires all 51 identities and is never Foundation authority', () => {
  expect(tool.validateCombined(tool.shards.map(input))).toMatchObject({
    cases: 51,
    all_four_original_shards_passed: true,
    foundation_pass: false,
  });
});
it.each([
  'missing',
  'duplicate',
  'foreign-id',
  'foreign-file',
  'foreign-line',
  'foreign-title',
  'foreign-project',
  'foreign-project-id',
  'completion',
  'test-budget',
  'config-budget',
  'config-retry',
  'attempt-retry',
  'second-attempt',
  'skipped',
  'flaky',
  'expected-failure',
  'global-error',
  'result-error',
  'duration',
  'total',
  'workers',
  'repeat',
  'config-path',
])('parser rejects demonstrated incomplete or altered %s evidence', (kind) => {
  const report = fixture(),
    specs = report.suites[0].specs,
    spec = specs[0],
    test = spec.tests[0],
    result = test.results[0];
  switch (kind) {
    case 'missing':
      specs.pop();
      break;
    case 'duplicate':
      specs[1] = structuredClone(spec);
      break;
    case 'foreign-id':
      spec.id = 'different';
      break;
    case 'foreign-file':
      spec.file = 'foreign.spec.ts';
      break;
    case 'foreign-line':
      spec.line++;
      break;
    case 'foreign-title':
      spec.title += ' altered';
      break;
    case 'foreign-project':
      test.projectName = 'mobile';
      break;
    case 'foreign-project-id':
      test.projectId = 'foreign';
      break;
    case 'completion':
      report.stats.duration = Number.NaN;
      break;
    case 'test-budget':
      test.timeout++;
      break;
    case 'config-budget':
      report.config.projects[0].timeout++;
      break;
    case 'config-retry':
      report.config.projects[0].retries = 1;
      break;
    case 'attempt-retry':
      result.retry = 1;
      break;
    case 'second-attempt':
      test.results.push(structuredClone(result));
      break;
    case 'skipped':
      test.status = 'skipped';
      break;
    case 'flaky':
      test.status = 'flaky';
      break;
    case 'expected-failure':
      test.expectedStatus = 'failed';
      break;
    case 'global-error':
      report.errors.push({ message: 'runner failure' });
      break;
    case 'result-error':
      result.errors.push({ message: 'assertion failure' });
      break;
    case 'duration':
      result.duration = 90001;
      break;
    case 'total':
      report.stats.skipped = 1;
      break;
    case 'workers':
      report.config.workers = 4;
      break;
    case 'repeat':
      report.config.projects[0].repeatEach = 2;
      break;
    case 'config-path':
      report.config.configFile = '/fixture/other.config.ts';
      break;
  }
  expect(() => tool.validateReport(report, 'desktop')).toThrow();
});
it.each(['source', 'tree', 'node', 'platform', 'ubuntu', 'diagnostics_source'])(
  'binding parser denies altered %s',
  (field) => {
    expect(() =>
      tool.validateBinding(
        { ...binding('desktop'), [field]: 'different' },
        'desktop',
      ),
    ).toThrow();
  },
);
it('binding parser denies missing hash and dirty tracked source', () => {
  const record = binding('desktop');
  delete record.hashes['package-lock.json'];
  expect(() => tool.validateBinding(record, 'desktop')).toThrow();
  expect(() =>
    tool.validateBinding(
      { ...binding('desktop'), tracked_source_clean: false },
      'desktop',
    ),
  ).toThrow();
});
it.each([
  'missing',
  'duplicate',
  'changed-after',
  'mixed-diagnostics',
  'one-failed',
])(
  'combined evidence denies %s shards instead of inventing a complete union',
  (kind) => {
    const inputs = tool.shards.map(input);
    if (kind === 'missing') inputs.pop();
    if (kind === 'duplicate') inputs[1] = structuredClone(inputs[0]);
    if (kind === 'changed-after') inputs[0].after.source = 'b'.repeat(40);
    if (kind === 'mixed-diagnostics')
      inputs[0].after.diagnostics_source = inputs[0].before.diagnostics_source =
        'b'.repeat(40);
    if (kind === 'one-failed')
      inputs[0].report.suites[0].specs[0].tests[0].results[0].status =
        'timedOut';
    expect(() => tool.validateCombined(inputs)).toThrow();
  },
);
