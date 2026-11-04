import {
  test as baseTest,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { sampleCompanies } from '../../src/domain/platform';
// The original Foundation config already provides DEV4206 beside production4173.
// Keep every assertion; only its DEV cases use that existing development server.
const test = baseTest.extend({
  baseURL: async ({ baseURL }, use, info) => {
    const production =
      info.title === 'production keeps revision consistency closed';
    await use(
      !production && baseURL === 'http://127.0.0.1:4173'
        ? 'http://127.0.0.1:4206'
        : baseURL,
    );
  },
});
// Keep this new source-review contract consistent under the original Foundation config.
test.use({ actionTimeout: 15000 });
const artifacts = resolve(
  process.env.CYCLE23_ARTIFACT_DIR ?? 'artifacts/cycle23',
);
const consent =
  'I confirm this disposable multi-job simulation; no dispatch, contract, invoice, payment or message is authorized.';
const taskConfirmation =
  'I reviewed this exact original task and confirm the local append-only correction, internal synthetic submission and review approval.';
const planConfirmation =
  'I reviewed this exact saved plan revision and confirm only this local name/cadence correction. No renewal or message is authorized.';
const sources = [
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
  'src/components/workflows/OperatingCenterCycleTwentyThree.tsx',
  'src/components/workflows/cycle23-source-review.css',
  ...[
    'task-revision-consistency',
    'recorded-cost-requirements',
    'service-source-review',
    'maintenance-revision-requirements',
    'verified-owner-briefing',
  ].flatMap((name) => [
    `src/lib/workflows/${name}.ts`,
    `src/components/workflows/${name}.css`,
  ]),
  ...[
    'TaskRevisionConsistency',
    'RecordedCostRequirements',
    'ServiceSourceReview',
    'MaintenanceRevisionRequirements',
    'VerifiedOwnerBriefing',
  ].map((name) => `src/components/workflows/${name}.tsx`),
];

async function tab(root: Locator, name: string) {
  await root
    .getByRole('navigation', { name: 'Saved source review sections' })
    .getByRole('button', { name, exact: true })
    .click();
}
async function selectJob(root: Locator, exactJob?: string) {
  const search = root
    .getByRole('region', { name: 'Shared record search', exact: true })
    .first();
  await search
    .getByRole('button', { name: 'Find another record', exact: true })
    .click();
  await search
    .getByRole('button', { name: 'Search shared records', exact: true })
    .click();
  await expect(search).toContainText('4 matching of 4');
  const first = exactJob
    ? search.locator('article').filter({ hasText: exactJob })
    : search.locator('article').first();
  const job = (await first.locator('span').allTextContents())[0];
  if (exactJob) expect(job).toBe(exactJob);
  await first.getByRole('button', { name: /^Open exact record in / }).click();
  await expect(root.locator('.srw-context')).toContainText(job);
  return job;
}
async function setup(
  page: Page,
  company: (typeof sampleCompanies)[number],
  sameProperty = false,
  baseURL = 'http://127.0.0.1:4423',
) {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'data:' && url.origin !== new URL(baseURL).origin)
      outside.push(request.url());
  });
  await page.goto('/preview/operating-center');
  await expect(
    page.getByLabel('Use current source requirements', { exact: true }),
  ).not.toBeChecked();
  const mode = page.getByRole('combobox', {
    name: 'Current source review',
    exact: true,
  });
  await expect(mode).toHaveValue('requirements');
  await expect(mode).toBeDisabled();
  await page
    .getByLabel('Use current source requirements', { exact: true })
    .check();
  await mode.selectOption('consistency');
  await page
    .getByRole('combobox', { name: 'Contractor', exact: true })
    .selectOption(company.id);
  await page.getByLabel(consent).check();
  await page
    .getByRole('button', {
      name: 'Prepare multi-job local environment',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('region', { name: 'Shared operating environment' }),
  ).toContainText('4 admitted jobs');
  await page.getByText('Current source requirements', { exact: true }).click();
  await page
    .getByRole('navigation', {
      name: 'Current source requirements',
      exact: true,
    })
    .getByRole('button', { name: 'Current task requirements', exact: true })
    .click();
  const root = page.getByRole('region', {
    name: 'Saved source workbench',
    exact: true,
  });
  let job = await selectJob(root);
  if (sameProperty) {
    const search = root
      .getByRole('region', { name: 'Shared record search', exact: true })
      .first();
    await search
      .getByRole('button', { name: 'Find another record', exact: true })
      .click();
    await search
      .getByRole('button', { name: 'Search shared records', exact: true })
      .click();
    const readRows = async () => {
      const out: { job: string; property: string }[] = [];
      for (const article of await search.locator('article').all())
        out.push({
          job: (await article.locator('span').allTextContents())[0],
          property: await article.locator('p').first().innerText(),
        });
      return out;
    };
    const rows = await readRows();
    await search
      .getByRole('button', { name: 'Next shared page', exact: true })
      .click();
    await expect(search).toContainText('page 2');
    rows.push(...(await readRows()));
    const paired = rows.find(
      (r) => rows.filter((other) => other.property === r.property).length === 2,
    );
    expect(paired).toBeTruthy();
    await search
      .getByRole('textbox', {
        name: 'Search available customer, property, job or estimate',
        exact: true,
      })
      .fill(paired!.job);
    await search
      .getByRole('button', { name: 'Search shared records', exact: true })
      .click();
    await search
      .locator('article')
      .getByRole('button', { name: /^Open exact record in / })
      .click();
    job = paired!.job;
    await expect(root.locator('.srw-context')).toContainText(job);
  }
  return { root, job, outside };
}
async function exercise(root: Locator, name: string) {
  const details = root.locator('.srw-exercise');
  if (
    !(await details
      .getByLabel('I confirm this disposable source exercise only.')
      .isVisible())
  )
    await details
      .getByText('Disposable saved-source exercise', { exact: true })
      .click();
  await details
    .getByLabel('I confirm this disposable source exercise only.')
    .check();
  await details.getByRole('button', { name, exact: true }).click();
  await expect(details).toContainText('Exact disposable source saved');
}
async function capture(
  root: Locator,
  state: string,
  info: TestInfo,
  company: (typeof sampleCompanies)[number],
  sourceRecords: Record<string, string> = {},
) {
  const directory = resolve(artifacts, 'screenshots');
  mkdirSync(directory, { recursive: true });
  const id = `${state}-${info.project.name}-${company.slug}`,
    png = resolve(directory, id + '.png');
  await root.screenshot({ path: png, animations: 'disabled' });
  const sha = (path: string) =>
    createHash('sha256').update(readFileSync(path)).digest('hex');
  writeFileSync(
    resolve(directory, id + '.json'),
    JSON.stringify(
      {
        schema: 'propel-cycle23-browser-capture-v1',
        screenshot_id: id,
        screenshot_sha256: sha(png),
        brand: company.slug,
        company_id: company.id,
        project: info.project.name,
        viewport: info.project.use.viewport,
        scenario: info.title,
        source_commit: execFileSync('git', ['rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        working_tree_dirty: !!execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
        }).trim(),
        source_files: sources.map((path) => ({ path, sha256: sha(path) })),
        source_records: sourceRecords,
        visible_controls: {
          textboxes: await root.getByRole('textbox').count(),
          comboboxes: await root.getByRole('combobox').count(),
          checkboxes: await root.getByRole('checkbox').count(),
        },
        visual_approval: 'PENDING',
        physical_device_acceptance: 'UNVERIFIED',
        release: 'NOT_READY_NOT_AUTHORIZED',
      },
      null,
      2,
    ),
  );
}
async function audit(page: Page, root: Locator) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  const overlappingHeaders = await root
    .locator('header')
    .evaluateAll((headers) =>
      headers.flatMap((header, headerIndex) => {
        if (!(header instanceof HTMLElement) || !header.offsetHeight) return [];
        const children = [...header.children].filter(
          (child) => child instanceof HTMLElement && child.offsetHeight,
        );
        return children.flatMap((child, index) =>
          children.slice(index + 1).flatMap((other) => {
            const a = child.getBoundingClientRect(),
              b = other.getBoundingClientRect();
            return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
              ? [
                  {
                    headerIndex,
                    first: child.textContent,
                    second: other.textContent,
                  },
                ]
              : [];
          }),
        );
      }),
    );
  expect(overlappingHeaders).toEqual([]);
  for (const button of await root.getByRole('button').all())
    if (await button.isVisible())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
}
type KeyStep = { label: string; key: 'Enter' | 'Space' };
async function keyActivate(
  locator: Locator,
  steps: KeyStep[],
  key: 'Enter' | 'Space' = 'Enter',
) {
  await locator.focus();
  await expect(locator).toBeFocused();
  steps.push({
    label:
      (await locator.getAttribute('aria-label')) ?? (await locator.innerText()),
    key,
  });
  await locator.press(key);
}
async function keyTab(root: Locator, name: string, steps: KeyStep[]) {
  await keyActivate(
    root
      .getByRole('navigation', { name: 'Saved source review sections' })
      .getByRole('button', { name, exact: true }),
    steps,
  );
}
async function recordKeyboard(page: Page) {
  await page.evaluate(() => {
    const values: { key: string; trusted: boolean }[] = [];
    (window as unknown as { c23Keys: typeof values }).c23Keys = values;
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter' || event.key === ' ')
          values.push({ key: event.key, trusted: event.isTrusted });
      },
      true,
    );
  });
}
async function keyboardProof(
  page: Page,
  steps: KeyStep[],
  info: TestInfo,
  company: (typeof sampleCompanies)[number],
  startJob: string,
  endJob: string,
  outside: string[],
) {
  const events = await page.evaluate(
    () =>
      (window as unknown as { c23Keys: { key: string; trusted: boolean }[] })
        .c23Keys,
  );
  expect(events.length).toBe(steps.length);
  expect(events.every((event) => event.trusted)).toBe(true);
  expect(events.map((event) => event.key)).toEqual(
    steps.map((step) => (step.key === 'Space' ? ' ' : 'Enter')),
  );
  expect(steps.length).toBeGreaterThanOrEqual(14);
  expect(outside).toEqual([]);
  const directory = resolve(artifacts, 'keyboard');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, `${info.project.name}-${company.slug}.json`),
    JSON.stringify(
      {
        schema: 'propel-cycle23-keyboard-v1',
        brand: company.slug,
        company_id: company.id,
        project: info.project.name,
        scenario: info.title,
        start_job: startJob,
        end_job: endJob,
        steps,
        events,
        outside_requests: outside,
        skipped: 0,
        retries: 0,
        source_commit: execFileSync('git', ['rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        working_tree_dirty: !!execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
        }).trim(),
        source_files: sources.map((path) => ({
          path,
          sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
        })),
        authority: 'LOCAL_KEYBOARD_REVIEW_ONLY',
        release: 'NOT_READY_NOT_AUTHORIZED',
      },
      null,
      2,
    ) + '\n',
  );
}
for (const company of sampleCompanies) {
  test(`task lineage and financial requirements follow recorded canonical changes / ${company.slug}`, async ({
    page,
    baseURL,
  }, info) => {
    test.setTimeout(150000);
    const { root, job, outside } = await setup(page, company, false, baseURL);
    const graph = root.getByRole('region', {
      name: 'Task revision consistency',
      exact: true,
    });
    await graph
      .getByRole('button', { name: 'Read task revision graph', exact: true })
      .click();
    await expect(graph).toContainText(job);
    await expect(graph).toContainText('NOT_ATTEMPTED');
    await graph
      .getByText('Original task correction controls', { exact: true })
      .click();
    const correction = graph.getByRole('region', {
      name: 'Append exact task correction',
      exact: true,
    });
    await correction
      .getByRole('button', { name: 'Load current approved task', exact: true })
      .click();
    const taskId = await correction
      .getByRole('combobox', {
        name: 'Exact eligible original entry',
        exact: true,
      })
      .inputValue();
    await correction
      .getByRole('textbox', { name: 'Corrected task description', exact: true })
      .fill(`C23 exact task correction ${company.slug}`);
    await correction.getByLabel(taskConfirmation).check();
    await correction
      .getByRole('button', { name: 'Save exact task correction', exact: true })
      .click();
    await expect(correction.getByRole('status')).toContainText(
      'SYNTHETIC_SOURCE_SAVED',
    );
    await graph
      .getByRole('button', { name: 'Read task revision graph', exact: true })
      .click();
    await expect(graph).toContainText('KNOWN_SAVED');
    await graph
      .getByRole('combobox', { name: 'Exact recorded task', exact: true })
      .selectOption(taskId);
    const lineage = graph.getByRole('region', {
      name: 'Selected task lineage',
      exact: true,
    });
    await expect(lineage).toContainText(taskId);
    await expect(lineage).toContainText(
      `C23 exact task correction ${company.slug}`,
    );
    await expect(lineage).toContainText('successors');
    await capture(root, 'task-lineage', info, company, {
      job,
      original_task: taskId,
    });
    await audit(page, root);
    await lineage
      .getByRole('button', {
        name: 'Open exact task field review',
        exact: true,
      })
      .click();
    await expect(root.locator('.srw-context')).toContainText(job);
    await tab(root, 'Time and materials');
    const cost = root.getByRole('region', {
      name: 'Cost correction review',
      exact: true,
    });
    await cost
      .getByRole('button', {
        name: 'Read current recorded cost review',
        exact: true,
      })
      .click();
    const expense = await cost
      .getByRole('combobox', { name: 'Recorded pending expense', exact: true })
      .inputValue();
    await cost
      .getByRole('combobox', { name: 'Internal review decision', exact: true })
      .selectOption('approved');
    await cost
      .getByLabel('Staff review reason', { exact: true })
      .fill('C23 exact recorded cost review, no payment authority.');
    await cost
      .getByLabel(
        'I reviewed this exact pending expense and current job revision',
      )
      .check();
    await cost
      .getByRole('button', {
        name: 'Confirm exact internal cost review',
        exact: true,
      })
      .click();
    await expect(cost.getByRole('status')).toContainText(
      'SYNTHETIC_SOURCE_SAVED',
    );
    const requirements = root.getByRole('region', {
      name: 'Canonical cost requirement drill-down',
      exact: true,
    });
    await requirements
      .getByRole('button', {
        name: 'Read recorded cost requirements',
        exact: true,
      })
      .click();
    await expect(requirements).toContainText(job);
    await expect(requirements).toContainText('Cost coverage: UNKNOWN');
    await requirements
      .getByRole('combobox', { name: 'Canonical cost category', exact: true })
      .selectOption('materials');
    await requirements
      .getByRole('button', {
        name: `Inspect exact category source: material:${expense}`,
        exact: true,
      })
      .click();
    const source = requirements.getByRole('region', {
      name: 'Inspected recorded cost requirement source',
      exact: true,
    });
    await expect(source).toContainText(expense);
    const requirement = requirements.getByRole('combobox', {
      name: 'Original financial requirement',
      exact: true,
    });
    const firstRequirement = await requirement
      .locator('option')
      .nth(1)
      .getAttribute('value');
    expect(firstRequirement).toBeTruthy();
    await requirement.selectOption(firstRequirement!);
    await expect(
      requirements.getByRole('region', {
        name: 'Original financial requirement detail',
        exact: true,
      }),
    ).toContainText(firstRequirement!);
    await capture(root, 'financial-requirements', info, company, {
      job,
      expense,
    });
    await audit(page, root);
    await tab(root, 'Recorded priorities');
    const owner = root.getByRole('region', {
      name: 'Verified priority source comparison',
      exact: true,
    });
    await owner
      .getByRole('button', {
        name: 'Read verified owner briefing',
        exact: true,
      })
      .click();
    await expect(owner).toContainText(job);
    await expect(owner).toContainText('Original ranking is unchanged');
    await owner
      .getByRole('button', { name: /^Inspect exact current briefing source:/ })
      .first()
      .click();
    const inspected = owner.getByRole('region', {
      name: 'Inspected verified owner source',
      exact: true,
    });
    await expect(inspected).toContainText(job);
    await expect(inspected).toContainText('suggestion, not permission');
    await capture(root, 'owner-source', info, company, { job, expense });
    await audit(page, root);
    await inspected
      .getByRole('button', {
        name: 'Open original verified source review',
        exact: true,
      })
      .click();
    await expect(root.locator('.srw-context')).toContainText(job);
    expect(outside).toEqual([]);
  });
  test(`published lineage and occurrence requirements preserve exact source identities / ${company.slug}`, async ({
    page,
    baseURL,
  }, info) => {
    test.setTimeout(150000);
    const { root, job, outside } = await setup(page, company, true, baseURL),
      keys: KeyStep[] = [];
    await recordKeyboard(page);
    const search = root
      .getByRole('region', { name: 'Shared record search', exact: true })
      .first();
    const toggle = search.getByRole('button', {
      name: 'Find another record',
      exact: true,
    });
    if ((await toggle.getAttribute('aria-expanded')) === 'true')
      await keyActivate(toggle, keys, 'Space');
    await keyActivate(toggle, keys);
    await search
      .getByRole('textbox', {
        name: 'Search available customer, property, job or estimate',
        exact: true,
      })
      .fill(job);
    await keyActivate(
      search.getByRole('button', {
        name: 'Search shared records',
        exact: true,
      }),
      keys,
      'Space',
    );
    await keyActivate(
      search
        .locator('article')
        .getByRole('button', { name: /^Open exact record in / }),
      keys,
    );
    await expect(root.locator('.srw-context')).toContainText(job);
    await keyTab(root, 'Service documentation', keys);
    const service = root.getByRole('region', {
      name: 'Service source review',
      exact: true,
    });
    await keyActivate(
      service.getByText(
        'Original published service and same-property controls',
        { exact: true },
      ),
      keys,
    );
    const property = service.getByRole('region', {
      name: 'Property service continuity',
      exact: true,
    });
    await keyActivate(
      property.getByRole('button', {
        name: 'Read same-property service continuity',
        exact: true,
      }),
      keys,
    );
    await expect(property).toContainText(
      '2 authorized same-property job sources',
    );
    await exercise(root, 'Append synthetic published report version');
    await keyActivate(
      property.getByRole('button', {
        name: 'Refresh available published property sources',
        exact: true,
      }),
      keys,
      'Space',
    );
    await expect(property).toContainText('OLDER_AVAILABLE_PUBLISHED_VERSION');
    await keyActivate(
      service.getByRole('button', {
        name: 'Review exact request and report sources',
        exact: true,
      }),
      keys,
    );
    await expect(service).toContainText(
      'Request → job: UNKNOWN — no recorded FK',
    );
    await expect(service).toContainText(job);
    const rows = service.getByRole('article', {
      name: /^Service report lineage /,
    });
    await expect(rows).toHaveCount(2);
    const first = service.getByRole('article', {
      name: /^Service report lineage .* version 1$/,
    });
    await keyActivate(
      first.getByRole('button', { name: /^Inspect source chain: report / }),
      keys,
      'Space',
    );
    const detail = service.getByRole('region', {
      name: 'Inspected service source chain',
      exact: true,
    });
    await expect(detail).toContainText('published version 1');
    await expect(detail).toContainText('UNVERIFIED / UNVERIFIED');
    await expect(detail).toContainText('NOT_RECORDED');
    const report = (await first.getAttribute('aria-label'))!.match(
      /^Service report lineage (.*) version 1$/,
    )![1];
    await capture(root, 'service-lineage', info, company, { job, report });
    const second = service.getByRole('article', {
      name: /^Service report lineage .* version 2$/,
    });
    await keyActivate(
      second.getByRole('button', { name: /^Inspect source chain: report / }),
      keys,
    );
    await expect(detail).toContainText('published version 2');
    await expect(
      service.getByRole('region', {
        name: 'Existing completion verification requirements',
        exact: true,
      }),
    ).toContainText('CUSTOMER_ACCEPTANCE · UNKNOWN');
    await capture(root, 'published-source-versions', info, company, {
      job,
      report,
    });
    await audit(page, root);
    const siblingRow = property
      .getByRole('article', { name: /^Published job source / })
      .filter({ hasText: 'Retain this exact property job' });
    const sibling = (await siblingRow.getAttribute('aria-label'))!.replace(
      'Published job source ',
      '',
    );
    expect(sibling).not.toBe(job);
    await keyActivate(
      property.getByRole('button', {
        name: 'Retain this exact property job',
        exact: true,
      }),
      keys,
      'Space',
    );
    await expect(root.locator('.srw-context')).toContainText(sibling);
    await keyTab(root, 'Maintenance revisions', keys);
    const maintenance = root.getByRole('region', {
      name: 'Maintenance revision requirements',
      exact: true,
    });
    await keyActivate(
      maintenance.getByRole('button', {
        name: 'Read occurrence revision requirements',
        exact: true,
      }),
      keys,
    );
    const occurrence = maintenance.getByRole('combobox', {
      name: 'Exact recorded occurrence',
      exact: true,
    });
    const oldOccurrence = await occurrence
      .locator('option')
      .nth(1)
      .getAttribute('value');
    expect(oldOccurrence).toBeTruthy();
    await occurrence.selectOption(oldOccurrence!);
    await expect(
      maintenance.getByRole('region', {
        name: 'Selected occurrence requirement matrix',
        exact: true,
      }),
    ).toContainText(oldOccurrence!);
    await keyActivate(
      maintenance.getByText('Original maintenance plan correction controls', {
        exact: true,
      }),
      keys,
    );
    const plan = maintenance.getByRole('region', {
      name: 'Correct exact maintenance plan',
      exact: true,
    });
    await keyActivate(
      plan.getByRole('button', {
        name: 'Load current maintenance plan',
        exact: true,
      }),
      keys,
    );
    await plan
      .getByLabel('Corrected plan name', { exact: true })
      .fill(`C23 recorded plan ${company.slug}`);
    await plan
      .getByRole('combobox', { name: 'Corrected cadence', exact: true })
      .selectOption('custom');
    await plan
      .getByLabel('Recorded custom interval (days)', { exact: true })
      .fill('10');
    await plan.getByLabel(planConfirmation).check();
    await keyActivate(
      plan.getByRole('button', {
        name: 'Save exact maintenance plan correction',
        exact: true,
      }),
      keys,
      'Space',
    );
    await expect(plan.getByRole('status')).toContainText(
      'SYNTHETIC_SOURCE_SAVED',
    );
    await keyActivate(
      maintenance.getByRole('button', {
        name: 'Read occurrence revision requirements',
        exact: true,
      }),
      keys,
    );
    await expect(
      maintenance
        .getByRole('alert')
        .filter({ hasText: /^Selected occurrence NOT IN CURRENT REVIEW/ }),
    ).toContainText('Selected occurrence NOT IN CURRENT REVIEW');
    await expect(
      maintenance.getByRole('region', {
        name: 'Selected occurrence requirement matrix',
        exact: true,
      }),
    ).toHaveCount(0);
    const currentOccurrence = await occurrence
      .locator('option')
      .nth(1)
      .getAttribute('value');
    expect(currentOccurrence).not.toBe(oldOccurrence);
    await occurrence.selectOption(currentOccurrence!);
    const matrix = maintenance.getByRole('region', {
      name: 'Selected occurrence requirement matrix',
      exact: true,
    });
    await expect(matrix).toContainText('BLOCKED');
    await expect(matrix).toContainText('CAPTURED_NOT_ATOMIC');
    await capture(root, 'maintenance-requirements', info, company, {
      job: sibling,
      occurrence: currentOccurrence!,
    });
    await audit(page, root);
    await keyTab(root, 'Time and materials', keys);
    const cost = root.getByRole('region', {
      name: 'Cost correction review',
      exact: true,
    });
    await keyActivate(
      cost.getByRole('button', {
        name: 'Read current recorded cost review',
        exact: true,
      }),
      keys,
    );
    await expect(cost).toContainText(sibling);
    await keyboardProof(page, keys, info, company, job, sibling, outside);
  });
  test(`mode continuity retains source context and original UNKNOWN custody / ${company.slug}`, async ({
    page,
    baseURL,
  }, info) => {
    test.setTimeout(150000);
    const { root, job, outside } = await setup(page, company, false, baseURL);
    await tab(root, 'Recorded priorities');
    const owner = root.getByRole('region', {
      name: 'Verified priority source comparison',
      exact: true,
    });
    await owner
      .getByRole('button', {
        name: 'Read verified owner briefing',
        exact: true,
      })
      .click();
    await owner
      .getByRole('button', { name: /^Inspect exact current briefing source:/ })
      .first()
      .click();
    await exercise(root, 'Save synthetic visit draft revision');
    await expect(owner.getByRole('alert')).toContainText(
      'Sources or access changed',
    );
    await expect(
      owner.getByRole('region', {
        name: 'Inspected verified owner source',
        exact: true,
      }),
    ).toHaveCount(0);
    await capture(root, 'stale-briefing', info, company, { job });
    await audit(page, root);
    await owner
      .getByRole('button', {
        name: 'Read verified owner briefing',
        exact: true,
      })
      .click();
    await expect(
      owner.getByRole('combobox', {
        name: 'Source comparison view',
        exact: true,
      }),
    ).toBeVisible();
    await owner
      .locator(
        'button[aria-label^="Inspect exact current difference:"]:enabled',
      )
      .first()
      .click();
    await expect(
      owner.getByRole('region', {
        name: 'Inspected verified owner source',
        exact: true,
      }),
    ).toContainText(job);
    await audit(page, root);

    await tab(root, 'Time and materials');
    const cost = root.getByRole('region', {
      name: 'Cost correction review',
      exact: true,
    });
    await cost
      .getByRole('button', {
        name: 'Read current recorded cost review',
        exact: true,
      })
      .click();
    const expense = await cost
      .getByRole('combobox', { name: 'Recorded pending expense', exact: true })
      .inputValue();
    await cost
      .getByRole('combobox', { name: 'Internal review decision', exact: true })
      .selectOption('approved');
    await cost
      .getByLabel('Staff review reason', { exact: true })
      .fill(
        'C23 intentionally delayed native acknowledgment; no replay authority.',
      );
    await cost
      .getByLabel(
        'I reviewed this exact pending expense and current job revision',
      )
      .check();
    await page.evaluate(async () => {
      const path = '/src/lib/phase3.ts',
        module = await import(path);
      type Native = (this: unknown, ...args: unknown[]) => unknown;
      const prototype = module.Phase3Repository.prototype as {
          reviewExpense: Native;
        },
        original = prototype.reviewExpense;
      let release!: () => void;
      const delay = new Promise<void>((resolve) => {
        release = resolve;
      });
      const probe = {
        calls: 0,
        entered: false,
        finished: false,
        release: () => {
          prototype.reviewExpense = original;
          release();
        },
      };
      (window as unknown as { c23NativeReview: typeof probe }).c23NativeReview =
        probe;
      prototype.reviewExpense = async function (
        this: unknown,
        ...args: unknown[]
      ) {
        const result = await original.apply(this, args);
        probe.calls++;
        probe.entered = true;
        await delay;
        probe.finished = true;
        return result;
      };
    });
    await cost
      .getByRole('button', {
        name: 'Confirm exact internal cost review',
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () =>
        (window as unknown as { c23NativeReview: { entered: boolean } })
          .c23NativeReview.entered,
    );
    const mode = page.getByRole('combobox', {
      name: 'Current source review',
      exact: true,
    });
    await mode.selectOption('requirements');
    await page.evaluate(() =>
      (
        window as unknown as { c23NativeReview: { release(): void } }
      ).c23NativeReview.release(),
    );
    await page.waitForFunction(
      () =>
        (window as unknown as { c23NativeReview: { finished: boolean } })
          .c23NativeReview.finished,
    );
    const retained = page.getByRole('region', {
      name: 'Saved source workbench',
      exact: true,
    });
    await expect(retained.locator('.srw-context')).toContainText(job);
    await tab(retained, 'Time and materials');
    let review = retained.getByRole('region', {
      name: 'Cost correction review',
      exact: true,
    });
    await review
      .getByRole('button', {
        name: 'Read current recorded cost review',
        exact: true,
      })
      .click();
    await expect(
      review.getByRole('button', {
        name: 'Confirm exact internal cost review',
        exact: true,
      }),
    ).toBeDisabled();
    await capture(retained, 'mode-retained-context', info, company, {
      job,
      expense,
    });
    await audit(page, retained);
    await mode.selectOption('consistency');
    await expect(retained.locator('.srw-context')).toContainText(job);
    await tab(retained, 'Time and materials');
    review = retained.getByRole('region', {
      name: 'Cost correction review',
      exact: true,
    });
    await review
      .getByRole('button', {
        name: 'Read current recorded cost review',
        exact: true,
      })
      .click();
    await review
      .getByRole('button', { name: 'Reconcile exact cost review', exact: true })
      .click();
    await expect(review.getByRole('status')).toContainText('"state":"UNKNOWN"');
    await expect(review.getByRole('status')).toContainText(
      '"source_id":"' + expense + '"',
    );
    await expect(review.getByRole('status')).toContainText(
      '"replay":"FORBIDDEN"',
    );
    await expect(
      review.getByRole('button', {
        name: 'Confirm exact internal cost review',
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { c23NativeReview: { calls: number } })
            .c23NativeReview.calls,
      ),
    ).toBe(1);
    await capture(retained, 'unknown-cost-custody', info, company, {
      job,
      expense,
    });
    await audit(page, retained);
    await page
      .getByText('Disposable development controls', { exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(
        sampleCompanies[
          (sampleCompanies.indexOf(company) + 1) % sampleCompanies.length
        ].id,
      );
    await expect(page.getByText(job, { exact: true })).toHaveCount(0);
    expect(outside).toEqual([]);
  });
}
test('production keeps revision consistency closed', async ({
  page,
  baseURL,
}) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'data:' && url.origin !== new URL(baseURL!).origin)
      outside.push(request.url());
  });
  await page.goto('/preview/operating-center');
  for (const label of [
    'Use current source requirements',
    'Current source review',
  ])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Prepare multi-job local environment',
      exact: true,
    }),
  ).toHaveCount(0);
  for (const name of [
    'Saved source workbench',
    'Task revision consistency',
    'Recorded cost requirements',
    'Service source review',
    'Maintenance revision requirements',
    'Verified owner briefing',
    'Shared record search',
  ])
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(
      0,
    );
  expect(outside).toEqual([]);
});
