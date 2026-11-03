import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
export const cycle22Browser = Object.freeze({
  file: 'tests/browser/cycle22-current-requirements.spec.ts',
  projects: ['desktop', 'tablet', 'mobile'],
  brands: ['straight-edge', 'cunningham', 'roofing-example'],
  scenarios: [
    'recorded corrections feed canonical task cost and owner evidence',
    'property continuity and maintenance requirements retain exact source versions',
    'withdrawn acknowledgment and stale owner evidence cannot authorize replay',
  ],
  production: 'production keeps current requirements closed',
});
export function validateCycle22Browser(
  report,
  mode,
  { collection = false } = {},
) {
  if (!['development', 'production'].includes(mode))
    throw Error('Exact browser mode required');
  const port = mode === 'development' ? 4422 : 4432,
    expected = new Set(
      cycle22Browser.projects.flatMap((project) =>
        (mode === 'development'
          ? cycle22Browser.scenarios.flatMap((scenario) =>
              cycle22Browser.brands.map((brand) => `${scenario} / ${brand}`),
            )
          : [cycle22Browser.production]
        ).map((title) => JSON.stringify([project, title])),
      ),
    ),
    config = report?.config;
  if (
    !report ||
    !Array.isArray(report.suites) ||
    !Array.isArray(report.errors) ||
    report.errors.length ||
    !config ||
    config.fullyParallel !== false ||
    config.workers !== 1 ||
    config.webServer?.url !== `http://127.0.0.1:${port}` ||
    config.webServer.reuseExistingServer !== false ||
    !Array.isArray(config.projects) ||
    config.projects.length !== 3 ||
    new Set(config.projects.map((p) => p.name)).size !== 3 ||
    config.projects.some(
      (p) =>
        !cycle22Browser.projects.includes(p.name) ||
        p.retries !== 0 ||
        p.repeatEach !== 1,
    )
  )
    throw Error(
      'Exact isolated loopback modes, three layouts and zero retries required',
    );
  const total = expected.size;
  if (
    !collection &&
    (!report.stats ||
      report.stats.expected !== total ||
      report.stats.unexpected !== 0 ||
      report.stats.flaky !== 0 ||
      report.stats.skipped !== 0)
  )
    throw Error('Complete actual nonflaky browser PASS required');
  function visit(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        if (typeof spec.title !== 'string' || !Array.isArray(spec.tests))
          throw Error('Exact test spec required');
        const file = relative(process.cwd(), resolve(config.rootDir, spec.file))
          .split(sep)
          .join('/');
        if (file !== cycle22Browser.file)
          throw Error('Exact current browser source required');
        for (const test of spec.tests) {
          const key = JSON.stringify([test.projectName, spec.title]);
          if (
            !expected.delete(key) ||
            test.expectedStatus !== 'passed' ||
            !Array.isArray(test.annotations) ||
            test.annotations.length
          )
            throw Error(
              'Unexpected, duplicate, omitted or annotated browser case',
            );
          if (
            !collection &&
            (spec.ok !== true ||
              test.status !== 'expected' ||
              !Array.isArray(test.results) ||
              test.results.length !== 1 ||
              test.results[0].status !== 'passed' ||
              test.results[0].retry !== 0 ||
              (test.results[0].errors?.length ?? 0) !== 0)
          )
            throw Error(
              'One exact passed browser attempt without retry or skip required',
            );
        }
      }
      visit(suite.suites ?? []);
    }
  }
  visit(report.suites);
  if (expected.size)
    throw Error('Missing exact brand/layout/scenario browser evidence');
  return {
    mode,
    cases: total,
    kind: collection ? 'COLLECTION_ONLY_NOT_PASS' : 'ACTUAL_BROWSER_PASS',
  };
}
const runtimeSources = [
  'src/components/workflows/OperatingCenterCycleTwentyTwo.tsx',
  'src/components/workflows/OperatingCenterPreview.tsx',
  'src/components/workflows/OperatingCenterCycleFifteen.tsx',
  'src/components/workflows/SavedRevisionWorkbench.tsx',
  'src/components/workflows/saved-revision-workbench.css',
  'src/lib/workflows/saved-revision-exercise.ts',
  'src/lib/workflows/correction-preview-sources.ts',
  'src/lib/workflows/saved-workbench-selection.ts',
  ...['Ten', 'Eleven', 'Twelve', 'Thirteen'].map(
    (n) => `src/components/workflows/OperatingCenterCycle${n}.tsx`,
  ),
  ...[
    'task-correction-review',
    'cost-correction-review',
    'published-service-navigation',
    'maintenance-plan-correction',
    'recorded-owner-actions',
  ].flatMap((n) => [
    `src/components/workflows/${n}.css`,
    `src/lib/workflows/${n}.ts`,
  ]),
  ...[
    'TaskCorrectionReview',
    'CostCorrectionReview',
    'PublishedServiceNavigator',
    'MaintenancePlanCorrection',
    'RecordedOwnerActions',
  ].map((n) => `src/components/workflows/${n}.tsx`),
  ...[
    'task-custody-review',
    'cost-coverage-path',
    'property-service-continuity',
    'maintenance-requirements-review',
    'current-owner-priorities',
  ].flatMap((n) => [
    `src/lib/workflows/${n}.ts`,
    `src/components/workflows/${n}.css`,
  ]),
  ...[
    'TaskCustodyReview',
    'CostCoveragePath',
    'PropertyServiceContinuity',
    'MaintenanceRequirementsReview',
    'CurrentOwnerPriorities',
  ].map((n) => `src/components/workflows/${n}.tsx`),
];
export function collectCycle22Browser(
  directory = resolve(process.env.CYCLE22_ARTIFACT_DIR ?? 'artifacts/cycle22'),
) {
  const screenshots = resolve(directory, 'screenshots'),
    sha = (path) =>
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    json = (path) => JSON.parse(readFileSync(path, 'utf8')),
    states = [
      ['task-custody', 0],
      ['cost-coverage', 0],
      ['owner-state', 0],
      ['maintenance-differences', 1],
      ['property-jobs', 1],
      ['published-siblings', 1],
      ['completion-requirements', 1],
      ['stale-owner', 2],
      ['unknown-review', 2],
    ],
    ids = new Map(
      states.flatMap(([state, scenario]) =>
        cycle22Browser.projects.flatMap((project) =>
          cycle22Browser.brands.map((brand) => [
            `${state}-${project}-${brand}`,
            { project, brand, scenario },
          ]),
        ),
      ),
    ),
    companyIds = Object.fromEntries(
      cycle22Browser.brands.map((brand) => [brand, `sample-${brand}`]),
    );
  // Match the authoritative approved branding source, not invented identifier strings.
  const platform = readFileSync('src/domain/platform.ts', 'utf8');
  for (const brand of cycle22Browser.brands) {
    const matched = platform.match(
      new RegExp(`id: ['"]([^'"]+)['"],[^{}]*?slug: ['"]${brand}['"]`),
    );
    if (!matched) throw Error('Exact approved company brand source required');
    companyIds[brand] = matched[1];
  }
  const reports = [
    'browser-results.json',
    'browser-off-results.json',
    'browser-development-collection.json',
    'browser-production-collection.json',
  ].map((name) => {
    const path = resolve(directory, name);
    if (!existsSync(path))
      throw Error(`Actual browser report required: ${name}`);
    return { path: name, sha256: sha(path) };
  });
  const execution = [
    validateCycle22Browser(
      json(resolve(directory, 'browser-results.json')),
      'development',
    ),
    validateCycle22Browser(
      json(resolve(directory, 'browser-off-results.json')),
      'production',
    ),
    validateCycle22Browser(
      json(resolve(directory, 'browser-development-collection.json')),
      'development',
      { collection: true },
    ),
    validateCycle22Browser(
      json(resolve(directory, 'browser-production-collection.json')),
      'production',
      { collection: true },
    ),
  ];
  const captures = readdirSync(screenshots)
    .filter((n) => n.endsWith('.json'))
    .map((name) => {
      const path = resolve(screenshots, name),
        capture = json(path),
        expected = ids.get(capture.screenshot_id);
      if (
        !expected ||
        capture.schema !== 'propel-cycle22-browser-capture-v1' ||
        capture.brand !== expected.brand ||
        capture.project !== expected.project ||
        capture.company_id !== companyIds[expected.brand] ||
        capture.scenario !==
          `${cycle22Browser.scenarios[expected.scenario]} / ${expected.brand}` ||
        !/^[a-f0-9]{40}$/.test(capture.source_commit) ||
        typeof capture.working_tree_dirty !== 'boolean' ||
        capture.visual_approval !== 'PENDING' ||
        capture.physical_device_acceptance !== 'UNVERIFIED' ||
        capture.release !== 'NOT_READY_NOT_AUTHORIZED' ||
        sha(resolve(screenshots, capture.screenshot_id + '.png')) !==
          capture.screenshot_sha256
      )
        throw Error(
          'Exact unique screenshot identity, source and PNG hash required',
        );
      ids.delete(capture.screenshot_id);
      const paths = new Set(runtimeSources);
      if (
        !Array.isArray(capture.source_files) ||
        capture.source_files.length !== runtimeSources.length
      )
        throw Error('Complete finite runtime source inventory required');
      for (const source of capture.source_files)
        if (!paths.delete(source.path) || sha(source.path) !== source.sha256)
          throw Error(`Capture runtime changed: ${source.path}`);
      if (
        paths.size ||
        !capture.source_records ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          capture.source_records.job,
        )
      )
        throw Error('Exact source job binding required');
      return { ...capture, companion_sha256: sha(path) };
    });
  if (ids.size || captures.length !== 81)
    throw Error('All 81 exact matrix screenshots required');
  const pngs = readdirSync(screenshots).filter((n) => n.endsWith('.png'));
  if (
    pngs.length !== captures.length ||
    pngs.some(
      (name) => !captures.some((c) => `${c.screenshot_id}.png` === name),
    )
  )
    throw Error('Unbound screenshot files denied');
  const checked = (entry) => {
    const actual = sha(entry.path);
    if (actual !== entry.sha256)
      throw Error(`Protected source changed: ${entry.path}`);
    return { path: entry.path, sha256: actual };
  };
  const protectedFiles = json(
      'docs/program/CYCLE4_PROTECTED_SOURCE.json',
    ).files.map(checked),
    design = json('docs/program/DESIGN_SYSTEM_CONTRACT.json'),
    locks = design.locks.map(checked),
    bindings = design.bindings.map((entry) => {
      if (
        !readFileSync(entry.source.path, 'utf8').includes(entry.source.anchor)
      )
        throw Error(`Design binding changed: ${entry.id}`);
      return {
        id: entry.id,
        source: entry.source,
        source_sha256: sha(entry.source.path),
      };
    });
  if (
    protectedFiles.length !== 128 ||
    locks.length !== 5 ||
    bindings.length !== 13
  )
    throw Error('Complete protected and design inventory required');
  mkdirSync(directory, { recursive: true });
  const manifest = {
    schema: 'propel-cycle22-browser-capture-manifest-v1',
    source_commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    working_tree_dirty: !!execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
    }).trim(),
    reports,
    execution,
    screenshots: captures.sort((a, b) =>
      a.screenshot_id.localeCompare(b.screenshot_id),
    ),
    protected_files: protectedFiles,
    design_locks: locks,
    design_bindings: bindings,
    visual_approval: 'PENDING',
    release: 'NOT_READY_NOT_AUTHORIZED',
    limits: [
      'Actual local Chromium emulation only; no physical-device or owner visual acceptance.',
      'No source hash or screenshot grants business-state restoration, customer approval, completion or operational authority.',
    ],
  };
  writeFileSync(
    resolve(directory, 'browser-capture-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  return {
    captures: captures.length,
    runtime_sources: runtimeSources.length,
    protected_files: protectedFiles.length,
    design_locks: locks.length,
    design_bindings: bindings.length,
    execution,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(collectCycle22Browser()));
