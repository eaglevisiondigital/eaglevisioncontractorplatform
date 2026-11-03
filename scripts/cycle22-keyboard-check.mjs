import { chromium, devices, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sampleCompanies } from '../src/domain/platform.ts';
const origin = 'http://127.0.0.1:4424';
const layoutDevices = {
  desktop: 'Desktop Chrome',
  tablet: 'iPad Mini',
  mobile: 'iPhone 13',
};
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
const sha = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const head = () =>
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = () =>
  !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
const uuid = (v) =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    v,
  );
const steps = [
  'enable-mode',
  'confirm-local-fixture',
  'prepare-original-sources',
  'open-requirements-group',
  'open-original-workbench',
  'open-shared-search',
  'search-original-records',
  'next-shared-page',
  'search-exact-job',
  'select-exact-job',
  'open-service-documentation',
  'read-exact-property',
  'handoff-exact-sibling',
  'open-recorded-priorities',
  'read-current-priority-state',
  'inspect-exact-priority',
  'open-authorized-review',
];
export function validateCycle22Keyboard(report) {
  const expected = new Set(
    Object.keys(layoutDevices).flatMap((layout) =>
      sampleCompanies.map((company) => `${layout}/${company.slug}`),
    ),
  );
  if (
    report?.schema !== 'propel-cycle22-keyboard-v1' ||
    report.origin !== origin ||
    report.expected !== 9 ||
    report.passed !== 9 ||
    report.failed !== 0 ||
    report.skipped !== 0 ||
    report.retries !== 0 ||
    !Array.isArray(report.rows) ||
    report.rows.length !== 9 ||
    !Array.isArray(report.errors) ||
    report.errors.length ||
    !Array.isArray(report.outside_requests) ||
    report.outside_requests.length ||
    !/^[a-f0-9]{40}$/.test(report.source_commit) ||
    !/^[a-f0-9]{40}$/.test(report.completed_commit) ||
    typeof report.working_tree_dirty !== 'boolean' ||
    report.authority !== 'LOCAL_KEYBOARD_NAVIGATION_ONLY' ||
    report.release !== 'NOT_READY_NOT_AUTHORIZED'
  )
    throw Error('Complete actual nine-journey keyboard PASS required');
  const sourcePaths = new Set(runtimeSources);
  if (
    !Array.isArray(report.source_files) ||
    report.source_files.length !== 42 ||
    sourcePaths.size !== 42
  )
    throw Error('Exact 42 runtime bindings required');
  for (const source of report.source_files)
    if (!sourcePaths.delete(source.path) || sha(source.path) !== source.sha256)
      throw Error('Keyboard runtime source binding changed');
  if (sourcePaths.size) throw Error('Missing keyboard runtime source');
  for (const row of report.rows) {
    const company = sampleCompanies.find((c) => c.slug === row.brand),
      viewport = devices[layoutDevices[row.layout]]?.viewport;
    if (
      !company ||
      !expected.delete(`${row.layout}/${row.brand}`) ||
      row.company_id !== company.id ||
      row.status !== 'passed' ||
      row.attempt !== 1 ||
      row.skipped !== false ||
      row.retries !== 0 ||
      JSON.stringify(row.viewport) !== JSON.stringify(viewport) ||
      !uuid(row.original_job_id) ||
      !uuid(row.sibling_job_id) ||
      row.original_job_id === row.sibling_job_id ||
      row.retained_job_id !== row.sibling_job_id ||
      !Array.isArray(row.steps) ||
      row.steps.length !== steps.length ||
      row.steps.some(
        (step, i) =>
          step.id !== steps[i] ||
          step.focus_verified !== true ||
          !['Enter', 'Space'].includes(step.key),
      ) ||
      !Array.isArray(row.trusted_key_events) ||
      row.trusted_key_events.length < steps.length ||
      row.trusted_key_events.some(
        (e) =>
          e.trusted !== true ||
          !['Enter', 'Space'].includes(e.key) ||
          !['BUTTON', 'INPUT', 'SUMMARY'].includes(e.tag),
      ) ||
      !row.trusted_key_events.some((e) => e.key === 'Enter') ||
      !row.trusted_key_events.some((e) => e.key === 'Space') ||
      row.exact_property_handoff !== true ||
      row.exact_priority_navigation !== true ||
      row.property_heading_focus !== true ||
      !Array.isArray(row.outside_requests) ||
      row.outside_requests.length
    )
      throw Error(
        'Exact unique brand/layout keyboard navigation and focus evidence required',
      );
  }
  if (expected.size) throw Error('Missing keyboard journey');
  return {
    journeys: 9,
    brands: 3,
    layouts: 3,
    runtime_sources: 42,
    status: 'ACTUAL_KEYBOARD_PASS',
    release: 'NOT_READY_NOT_AUTHORIZED',
  };
}
async function pause(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
export async function runCycle22Keyboard() {
  const report = {
    schema: 'propel-cycle22-keyboard-v1',
    origin,
    expected: 9,
    passed: 0,
    failed: 0,
    skipped: 0,
    retries: 0,
    source_commit: head(),
    completed_commit: head(),
    working_tree_dirty: dirty(),
    source_files: runtimeSources.map((path) => ({ path, sha256: sha(path) })),
    rows: [],
    errors: [],
    outside_requests: [],
    authority: 'LOCAL_KEYBOARD_NAVIGATION_ONLY',
    release: 'NOT_READY_NOT_AUTHORIZED',
  };
  const directory = resolve(
    process.env.CYCLE22_ARTIFACT_DIR ?? 'artifacts/cycle22',
  );
  let server,
    browser,
    serverOutput = '',
    stopping;
  const stop = () =>
    (stopping ??= (async () => {
      if (browser) await browser.close().catch(() => undefined);
      if (server && server.exitCode === null) {
        server.kill('SIGTERM');
        for (let i = 0; i < 50 && server.exitCode === null; i++)
          await pause(100);
        if (server.exitCode === null) server.kill('SIGKILL');
      }
    })());
  const interrupt = () => {
    void stop().finally(() => process.exit(130));
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const existing = await fetch(origin, {
      signal: AbortSignal.timeout(1000),
    }).catch(() => null);
    if (existing)
      throw Error(
        'Exclusive keyboard test port already occupied; no existing listener reused or killed',
      );
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        '--host',
        '127.0.0.1',
        '--port',
        '4424',
        '--strictPort',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, VITE_CONTRACTOR_JOURNEY_PREVIEW: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    for (const stream of [server.stdout, server.stderr])
      stream.on('data', (chunk) => {
        serverOutput = (serverOutput + String(chunk)).slice(-3000);
      });
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null)
        throw Error(`Owned loopback server stopped: ${serverOutput}`);
      if (
        (
          await fetch(origin, { signal: AbortSignal.timeout(1000) }).catch(
            () => null,
          )
        )?.ok
      ) {
        ready = true;
        break;
      }
      await pause(250);
    }
    if (!ready) throw Error('Owned keyboard server readiness unavailable');
    browser = await chromium.launch();
    for (const [layout, device] of Object.entries(layoutDevices))
      for (const company of sampleCompanies) {
        const descriptor = { ...devices[device] };
        delete descriptor.defaultBrowserType;
        const context = await browser.newContext({
            ...descriptor,
            baseURL: origin,
          }),
          page = await context.newPage();
        page.setDefaultTimeout(15000);
        const outside = [],
          row = {
            layout,
            brand: company.slug,
            company_id: company.id,
            viewport: page.viewportSize(),
            status: 'pending',
            attempt: 1,
            skipped: false,
            retries: 0,
            steps: [],
            trusted_key_events: [],
            outside_requests: outside,
          };
        page.on('request', (request) => {
          if (
            !request.url().startsWith(origin + '/') &&
            !request.url().startsWith('data:') &&
            !request.url().startsWith('blob:')
          )
            outside.push(request.url());
        });
        await page.addInitScript(() => {
          const events = [];
          Object.defineProperty(window, '__cycle22ObservedKeys', {
            value: events,
          });
          document.addEventListener('keydown', (event) => {
            if (
              events.length < 100 &&
              event.isTrusted &&
              ['Enter', ' '].includes(event.key)
            )
              events.push({
                key: event.key === ' ' ? 'Space' : event.key,
                tag: event.target?.tagName,
                trusted: event.isTrusted,
              });
          });
        });
        const activate = async (locator, id, key = 'Enter') => {
          await locator.focus();
          await expect(locator).toBeFocused();
          await locator.press(key === 'Space' ? ' ' : key);
          row.steps.push({ id, key, focus_verified: true });
        };
        try {
          await page.goto('/preview/operating-center');
          await expect(
            page.getByLabel('Use current source requirements', { exact: true }),
          ).not.toBeChecked();
          await activate(
            page.getByLabel('Use current source requirements', { exact: true }),
            'enable-mode',
            'Space',
          );
          await page
            .getByRole('combobox', { name: 'Contractor', exact: true })
            .selectOption(company.id);
          await activate(
            page.getByLabel(
              'I confirm this disposable multi-job simulation; no dispatch, contract, invoice, payment or message is authorized.',
            ),
            'confirm-local-fixture',
            'Space',
          );
          await activate(
            page.getByRole('button', {
              name: 'Prepare multi-job local environment',
              exact: true,
            }),
            'prepare-original-sources',
          );
          await expect(
            page.getByRole('region', {
              name: 'Shared operating environment',
              exact: true,
            }),
          ).toContainText('4 admitted jobs');
          await activate(
            page.getByText('Current source requirements', { exact: true }),
            'open-requirements-group',
          );
          await activate(
            page
              .getByRole('navigation', {
                name: 'Current source requirements',
                exact: true,
              })
              .getByRole('button', {
                name: 'Current task requirements',
                exact: true,
              }),
            'open-original-workbench',
          );
          const root = page.getByRole('region', {
              name: 'Saved source workbench',
              exact: true,
            }),
            search = root
              .getByRole('region', {
                name: 'Shared record search',
                exact: true,
              })
              .first();
          await activate(
            search.getByRole('button', {
              name: 'Find another record',
              exact: true,
            }),
            'open-shared-search',
          );
          await activate(
            search.getByRole('button', {
              name: 'Search shared records',
              exact: true,
            }),
            'search-original-records',
          );
          await expect(search).toContainText('4 matching of 4');
          const readRows = async () => {
            const rows = [];
            for (const article of await search.locator('article').all())
              rows.push({
                job: (await article.locator('span').allTextContents())[0],
                property: await article.locator('p').first().innerText(),
              });
            return rows;
          };
          const rows = await readRows();
          await activate(
            search.getByRole('button', {
              name: 'Next shared page',
              exact: true,
            }),
            'next-shared-page',
          );
          await expect(search).toContainText('page 2');
          rows.push(...(await readRows()));
          const paired = rows.find(
            (candidate) =>
              rows.filter((other) => other.property === candidate.property)
                .length === 2,
          );
          expect(paired).toBeTruthy();
          row.original_job_id = paired.job;
          await search
            .getByRole('textbox', {
              name: 'Search available customer, property, job or estimate',
              exact: true,
            })
            .fill(paired.job);
          await activate(
            search.getByRole('button', {
              name: 'Search shared records',
              exact: true,
            }),
            'search-exact-job',
          );
          await expect(search).toContainText('1 matching of 4');
          await activate(
            search
              .locator('article')
              .getByRole('button', { name: /^Open exact record in / }),
            'select-exact-job',
          );
          await expect(root.locator('.srw-context')).toContainText(paired.job);
          const tabs = root.getByRole('navigation', {
            name: 'Saved source review sections',
            exact: true,
          });
          await activate(
            tabs.getByRole('button', {
              name: 'Service documentation',
              exact: true,
            }),
            'open-service-documentation',
            'Space',
          );
          await expect(
            tabs.getByRole('button', {
              name: 'Service documentation',
              exact: true,
            }),
          ).toHaveAttribute('aria-current', 'page');
          const property = root.getByRole('region', {
            name: 'Property service continuity',
            exact: true,
          });
          await activate(
            property.getByRole('button', {
              name: 'Read same-property service continuity',
              exact: true,
            }),
            'read-exact-property',
          );
          await expect(property).toContainText(
            '2 authorized same-property job sources',
          );
          await expect(
            property.getByRole('heading', {
              name: 'Property service continuity',
              exact: true,
            }),
          ).toBeFocused();
          row.property_heading_focus = true;
          const handoffRow = property
            .getByRole('article', { name: /^Published job source / })
            .filter({ hasText: 'Retain this exact property job' });
          row.sibling_job_id = (
            await handoffRow.getAttribute('aria-label')
          ).replace('Published job source ', '');
          expect(row.sibling_job_id).not.toBe(row.original_job_id);
          await activate(
            property.getByRole('button', {
              name: 'Retain this exact property job',
              exact: true,
            }),
            'handoff-exact-sibling',
          );
          await expect(root.locator('.srw-context')).toContainText(
            row.sibling_job_id,
          );
          await expect(root.locator('.srw-context')).not.toContainText(
            row.original_job_id,
          );
          row.exact_property_handoff = true;
          await activate(
            tabs.getByRole('button', {
              name: 'Recorded priorities',
              exact: true,
            }),
            'open-recorded-priorities',
            'Space',
          );
          await expect(
            tabs.getByRole('button', {
              name: 'Recorded priorities',
              exact: true,
            }),
          ).toHaveAttribute('aria-current', 'page');
          const owner = root.getByRole('region', {
            name: 'Recorded priority workflow state',
            exact: true,
          });
          await activate(
            owner.getByRole('button', {
              name: 'Read current priority workflow state',
              exact: true,
            }),
            'read-current-priority-state',
          );
          await expect(owner).toContainText(row.sibling_job_id);
          const inspect = owner
            .getByRole('button', { name: /^Inspect current workflow source: / })
            .first();
          await activate(inspect, 'inspect-exact-priority');
          await expect(inspect).toBeFocused();
          const detail = owner.getByRole('region', {
            name: 'Inspected current workflow source',
            exact: true,
          });
          await expect(detail).toContainText(row.sibling_job_id);
          const step = (await detail.innerText()).match(
            /Existing review: (field|finance|invoice|customer|maintenance|priorities)/,
          )?.[1];
          expect(step).toBeTruthy();
          await activate(
            detail.getByRole('button', {
              name: 'Open exact workflow review',
              exact: true,
            }),
            'open-authorized-review',
          );
          const tabNames = {
            field: 'Work-order revisions',
            finance: 'Time and materials',
            invoice: 'Time and materials',
            customer: 'Service documentation',
            maintenance: 'Maintenance revisions',
            priorities: 'Recorded priorities',
          };
          await expect(
            tabs.getByRole('button', { name: tabNames[step], exact: true }),
          ).toHaveAttribute('aria-current', 'page');
          await expect(root.locator('.srw-context')).toContainText(
            row.sibling_job_id,
          );
          row.retained_job_id = row.sibling_job_id;
          row.exact_priority_navigation = true;
          row.trusted_key_events = await page.evaluate(
            () => window.__cycle22ObservedKeys,
          );
          expect(outside).toEqual([]);
          expect(row.trusted_key_events.length).toBeGreaterThanOrEqual(
            steps.length,
          );
          row.status = 'passed';
          report.passed++;
          console.log(`${layout}/${company.slug}: keyboard PASS`);
        } catch (error) {
          row.status = 'failed';
          row.error = String(error.message ?? error);
          report.failed++;
          report.errors.push({ layout, brand: company.slug, error: row.error });
          throw error;
        } finally {
          report.rows.push(row);
          report.outside_requests.push(...outside);
          await context.close();
        }
      }
    report.completed_commit = head();
    validateCycle22Keyboard(report);
    return report;
  } finally {
    report.completed_commit = head();
    report.working_tree_dirty = dirty();
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      resolve(directory, 'keyboard-results.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    await stop();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runCycle22Keyboard()
    .then((report) =>
      console.log(JSON.stringify(validateCycle22Keyboard(report))),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
