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
      info.title === 'production keeps current requirements closed';
    await use(
      !production && baseURL === 'http://127.0.0.1:4173'
        ? 'http://127.0.0.1:4206'
        : baseURL,
    );
  },
});
const artifacts = resolve(
  process.env.CYCLE22_ARTIFACT_DIR ?? 'artifacts/cycle22',
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
  ].map((n) => `src/components/workflows/${n}.css`),
  ...[
    'TaskCorrectionReview',
    'CostCorrectionReview',
    'PublishedServiceNavigator',
    'MaintenancePlanCorrection',
    'RecordedOwnerActions',
  ].map((n) => `src/components/workflows/${n}.tsx`),
  ...[
    'task-correction-review',
    'cost-correction-review',
    'published-service-navigation',
    'maintenance-plan-correction',
    'recorded-owner-actions',
  ].map((n) => `src/lib/workflows/${n}.ts`),
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
) {
  const outside: string[] = [];
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://127.0.0.1:4422') &&
      !request.url().startsWith('http://127.0.0.1:4206') &&
      !request.url().startsWith('data:') &&
      !request.url().startsWith('blob:')
    )
      outside.push(request.url());
  });
  await page.goto('/preview/operating-center');
  await expect(
    page.getByLabel('Use current source requirements', { exact: true }),
  ).not.toBeChecked();
  await page
    .getByLabel('Use current source requirements', { exact: true })
    .check();
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
        schema: 'propel-cycle22-browser-capture-v1',
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
async function openCustomer(root: Locator) {
  await tab(root, 'Service documentation');
  const customer = root.getByRole('region', {
    name: 'Published service navigator',
    exact: true,
  });
  await customer
    .getByRole('button', { name: 'Read exact published history', exact: true })
    .click();
  const first = customer
    .getByRole('button', { name: /^Inspect published report version 1 · / })
    .first();
  const label = await first.innerText(),
    report = label.split(' · ')[1];
  await first.click();
  await expect(
    customer.getByRole('heading', {
      name: 'Published service source',
      exact: true,
    }),
  ).toBeFocused();
  return { customer, report };
}
for (const company of sampleCompanies) {
  test(`recorded corrections feed canonical task cost and owner evidence / ${company.slug}`, async ({
    page,
  }, info) => {
    const { root, job, outside } = await setup(page, company);
    const custody = root.getByRole('region', {
      name: 'Task custody and correction comparison',
      exact: true,
    });
    await custody
      .getByRole('button', { name: 'Read exact task custody', exact: true })
      .click();
    await expect(custody).toContainText('NOT_ATTEMPTED');
    await custody
      .getByText('Original task correction controls', { exact: true })
      .click();
    const task = custody.getByRole('region', {
      name: 'Append exact task correction',
      exact: true,
    });
    await task
      .getByRole('button', { name: 'Load current approved task', exact: true })
      .click();
    const originalTask = await task
      .getByRole('combobox', {
        name: 'Exact eligible original entry',
        exact: true,
      })
      .inputValue();
    await task
      .getByRole('textbox', { name: 'Corrected task description', exact: true })
      .fill(`C22 actual corrected task ${company.slug}`);
    await task.getByLabel(taskConfirmation).check();
    await task
      .getByRole('button', { name: 'Save exact task correction', exact: true })
      .click();
    await expect(task.getByRole('status')).toContainText(
      'SYNTHETIC_SOURCE_SAVED',
    );
    await custody
      .getByRole('button', { name: 'Read exact task custody', exact: true })
      .click();
    await expect(custody).toContainText('KNOWN_SAVED');
    const original = custody.getByRole('article', {
        name: 'Original immutable entry',
        exact: true,
      }),
      corrected = custody.getByRole('article', {
        name: 'Recorded correction entry',
        exact: true,
      });
    await expect(original).toContainText(originalTask);
    await expect(corrected).toContainText(originalTask);
    await expect(corrected).toContainText(
      `C22 actual corrected task ${company.slug}`,
    );
    await expect(
      custody.getByRole('list', {
        name: 'Exact task field differences',
        exact: true,
      }),
    ).toContainText('task: CHANGED');
    await capture(root, 'task-custody', info, company, {
      job,
      original_task: originalTask,
    });
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
      .fill('C22 actual source review; no purchase or payment authority.');
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
    const coverage = root.getByRole('region', {
      name: 'Recorded cost source path',
      exact: true,
    });
    await coverage
      .getByRole('button', {
        name: 'Read current cost coverage path',
        exact: true,
      })
      .click();
    await expect(coverage).toContainText('Original cost coverage: UNKNOWN');
    await expect(coverage).toContainText('no issuance authority');
    await coverage
      .getByRole('combobox', { name: 'Source kind', exact: true })
      .selectOption('material_review');
    await coverage
      .getByRole('button', { name: /^Inspect recorded cost source: / })
      .last()
      .click();
    const detail = coverage.getByRole('region', {
      name: 'Exact cost source detail',
      exact: true,
    });
    await expect(detail).toContainText(expense);
    await expect(detail).toContainText('approved');
    await capture(root, 'cost-coverage', info, company, { job, expense });
    await audit(page, root);
    await tab(root, 'Recorded priorities');
    const owner = root.getByRole('region', {
      name: 'Recorded priority workflow state',
      exact: true,
    });
    await owner
      .getByRole('button', {
        name: 'Read current priority workflow state',
        exact: true,
      })
      .click();
    await expect(owner).toContainText(job);
    await expect(owner).toContainText('UNKNOWN or unverified');
    await owner
      .getByRole('button', { name: /^Inspect current workflow source: / })
      .first()
      .click();
    const inspected = owner.getByRole('region', {
      name: 'Inspected current workflow source',
      exact: true,
    });
    await expect(inspected).toContainText(job);
    await capture(root, 'owner-state', info, company, { job, expense });
    await audit(page, root);
    await inspected
      .getByRole('button', { name: 'Open exact workflow review', exact: true })
      .click();
    await expect(root.locator('.srw-context')).toContainText(job);
    expect(outside).toEqual([]);
  });
  test(`property continuity and maintenance requirements retain exact source versions / ${company.slug}`, async ({
    page,
  }, info) => {
    const { root, job, outside } = await setup(page, company, true);
    await tab(root, 'Maintenance revisions');
    const requirements = root.getByRole('region', {
      name: 'Maintenance requirements and revision review',
      exact: true,
    });
    await requirements
      .getByRole('button', {
        name: 'Capture maintenance reference',
        exact: true,
      })
      .click();
    await expect(requirements).toContainText('BLOCKED');
    await requirements
      .getByText('Original maintenance plan correction controls', {
        exact: true,
      })
      .click();
    const plan = requirements.getByRole('region', {
      name: 'Correct exact maintenance plan',
      exact: true,
    });
    await plan
      .getByRole('button', {
        name: 'Load current maintenance plan',
        exact: true,
      })
      .click();
    await plan
      .getByLabel('Corrected plan name', { exact: true })
      .fill(`C22 recorded plan ${company.slug}`);
    await plan
      .getByRole('combobox', { name: 'Corrected cadence', exact: true })
      .selectOption('custom');
    await plan
      .getByLabel('Recorded custom interval (days)', { exact: true })
      .fill('10');
    await plan.getByLabel(planConfirmation).check();
    await plan
      .getByRole('button', {
        name: 'Save exact maintenance plan correction',
        exact: true,
      })
      .click();
    await expect(plan.getByRole('status')).toContainText(
      'SYNTHETIC_SOURCE_SAVED',
    );
    await requirements
      .getByRole('button', {
        name: 'Read current maintenance requirements',
        exact: true,
      })
      .click();
    const differences = requirements.getByRole('region', {
      name: 'Maintenance reference differences',
      exact: true,
    });
    await expect(differences).toContainText('name: CHANGED');
    await expect(differences).toContainText(
      `C22 recorded plan ${company.slug}`,
    );
    await expect(requirements).toContainText('purpose consent');
    await capture(root, 'maintenance-differences', info, company, { job });
    await audit(page, root);
    await tab(root, 'Service documentation');
    const property = root.getByRole('region', {
      name: 'Property service continuity',
      exact: true,
    });
    await property
      .getByRole('button', {
        name: 'Read same-property service continuity',
        exact: true,
      })
      .click();
    await expect(property).toContainText(
      '2 authorized same-property job sources',
    );
    const rows = property.getByRole('article', {
      name: /^Published job source /,
    });
    await expect(rows).toHaveCount(2);
    await expect(property).toContainText('last explicit read');
    await capture(root, 'property-jobs', info, company, { job });
    const { customer, report } = await openCustomer(root);
    const original = await customer
      .getByRole('region', {
        name: 'Published inspection history',
        exact: true,
      })
      .textContent();
    await exercise(root, 'Append synthetic published report version');
    await property
      .getByRole('button', {
        name: 'Refresh available published property sources',
        exact: true,
      })
      .click();
    await expect(property).toContainText('OLDER_AVAILABLE_PUBLISHED_VERSION');
    await expect(property).toContainText(report);
    await customer
      .getByRole('button', {
        name: 'Read latest available published history',
        exact: true,
      })
      .click();
    const version = customer.getByRole('combobox', {
      name: 'Published report version',
      exact: true,
    });
    await expect(version).toHaveValue(report + '/1');
    const second = await version
      .locator('option')
      .filter({ hasText: 'Version 2 · ' })
      .getAttribute('value');
    expect(second).not.toBe(report + '/1');
    await version.selectOption(second!);
    await expect(
      customer.getByRole('region', {
        name: 'Published inspection history',
        exact: true,
      }),
    ).toContainText('Published report v2');
    await version.selectOption(report + '/1');
    await expect(
      customer.getByRole('region', {
        name: 'Published inspection history',
        exact: true,
      }),
    ).toHaveText(original!);
    await capture(root, 'published-siblings', info, company, {
      job,
      report,
      second_report: second!,
    });
    await customer
      .getByRole('button', {
        name: 'Review completion requirements',
        exact: true,
      })
      .click();
    const completion = customer.getByRole('region', {
      name: 'Exact completion requirements',
      exact: true,
    });
    await expect(completion).toContainText('Completion requirements · UNKNOWN');
    await expect(completion).toContainText(job);
    await expect(completion).toContainText(report);
    await expect(customer).not.toContainText('C22 recorded plan');
    await capture(root, 'completion-requirements', info, company, {
      job,
      report,
    });
    await audit(page, root);
    const siblingRow = rows.filter({
      hasText: 'Retain this exact property job',
    });
    const sibling = (await siblingRow.getAttribute('aria-label'))!.replace(
      'Published job source ',
      '',
    );
    expect(sibling).not.toBe(job);
    await property
      .getByRole('button', {
        name: 'Retain this exact property job',
        exact: true,
      })
      .click();
    await expect(root.locator('.srw-context')).toContainText(sibling);
    await tab(root, 'Time and materials');
    await root
      .getByRole('button', {
        name: 'Read current recorded cost review',
        exact: true,
      })
      .click();
    await expect(
      root.getByRole('region', { name: 'Cost correction review', exact: true }),
    ).toContainText(sibling);
    expect(outside).toEqual([]);
  });
  test(`withdrawn acknowledgment and stale owner evidence cannot authorize replay / ${company.slug}`, async ({
    page,
  }, info) => {
    const { root, job, outside } = await setup(page, company);
    await tab(root, 'Recorded priorities');
    const owner = root.getByRole('region', {
      name: 'Recorded priority workflow state',
      exact: true,
    });
    await owner
      .getByRole('button', {
        name: 'Read current priority workflow state',
        exact: true,
      })
      .click();
    await owner
      .getByRole('button', { name: /^Inspect current workflow source: / })
      .first()
      .click();
    await exercise(root, 'Save synthetic visit draft revision');
    await expect(owner.getByRole('alert')).toContainText(
      'Recorded state changed',
    );
    await expect(
      owner.getByRole('region', {
        name: 'Inspected current workflow source',
        exact: true,
      }),
    ).toHaveCount(0);
    await capture(root, 'stale-owner', info, company, { job });
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
        'C22 intentionally delayed native acknowledgment; no replay authority.',
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
      (window as unknown as { c22NativeReview: typeof probe }).c22NativeReview =
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
        (window as unknown as { c22NativeReview: { entered: boolean } })
          .c22NativeReview.entered,
    );
    await page
      .getByLabel('Use current source requirements', { exact: true })
      .uncheck();
    await page.evaluate(() =>
      (
        window as unknown as { c22NativeReview: { release(): void } }
      ).c22NativeReview.release(),
    );
    await page.waitForFunction(
      () =>
        (window as unknown as { c22NativeReview: { finished: boolean } })
          .c22NativeReview.finished,
    );
    await page
      .getByLabel('Use current source requirements', { exact: true })
      .check();
    const retained = page.getByRole('region', {
      name: 'Saved source workbench',
      exact: true,
    });
    await selectJob(retained, job);
    await tab(retained, 'Time and materials');
    const fresh = retained.getByRole('region', {
      name: 'Cost correction review',
      exact: true,
    });
    await fresh
      .getByRole('button', {
        name: 'Read current recorded cost review',
        exact: true,
      })
      .click();
    await expect(
      fresh.getByRole('button', {
        name: 'Confirm exact internal cost review',
        exact: true,
      }),
    ).toBeDisabled();
    await fresh
      .getByRole('button', { name: 'Reconcile exact cost review', exact: true })
      .click();
    await expect(fresh.getByRole('status')).toContainText('"state":"UNKNOWN"');
    await expect(fresh.getByRole('status')).toContainText(
      '"source_id":"' + expense + '"',
    );
    await expect(fresh.getByRole('status')).toContainText(
      '"replay":"FORBIDDEN"',
    );
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { c22NativeReview: { calls: number } })
            .c22NativeReview.calls,
      ),
    ).toBe(1);
    await capture(retained, 'unknown-review', info, company, { job, expense });
    await audit(page, retained);
    const otherCompany =
      sampleCompanies[
        (sampleCompanies.indexOf(company) + 1) % sampleCompanies.length
      ];
    await page
      .getByText('Disposable development controls', { exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(otherCompany.id);
    await expect(page.getByText(job, { exact: true })).toHaveCount(0);
    expect(outside).toEqual([]);
  });
}
test('production keeps current requirements closed', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:4432') &&
      !r.url().startsWith('http://127.0.0.1:4173') &&
      !r.url().startsWith('data:')
    )
      outside.push(r.url());
  });
  await page.goto('/preview/operating-center');
  await expect(
    page.getByLabel('Use current source requirements', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Prepare multi-job local environment',
      exact: true,
    }),
  ).toHaveCount(0);
  for (const name of [
    'Saved source workbench',
    'Task custody and correction comparison',
    'Cost coverage path',
    'Property service continuity',
    'Maintenance requirements and revision review',
    'Current owner priorities',
    'Shared record search',
  ])
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(
      0,
    );
  expect(outside).toEqual([]);
});
