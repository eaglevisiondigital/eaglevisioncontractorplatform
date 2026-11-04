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
// Foundation already owns DEV4206 beside production4173. Dedicated configs
// retain their exact existing ports; no case is skipped and no gate is opened.
const test = baseTest.extend({
  baseURL: async ({ baseURL }, use, info) => {
    const production =
      info.title === 'production keeps canonical correction workflows closed';
    await use(
      !production && baseURL === 'http://127.0.0.1:4173'
        ? 'http://127.0.0.1:4206'
        : baseURL,
    );
  },
});
function exactConfiguredOrigin(baseURL: string | undefined) {
  if (
    !baseURL ||
    ![
      'http://127.0.0.1:4173',
      'http://127.0.0.1:4206',
      'http://127.0.0.1:4421',
      'http://127.0.0.1:4431',
    ].includes(baseURL)
  )
    throw Error('Exact existing loopback test origin required');
  return baseURL;
}
const artifacts = resolve(
  process.env.CYCLE21_ARTIFACT_DIR ?? 'artifacts/cycle21',
);
const consent =
  'I confirm this disposable multi-job simulation; no dispatch, contract, invoice, payment or message is authorized.';
const taskConfirmation =
  'I reviewed this exact original task and confirm the local append-only correction, internal synthetic submission and review approval.';
const planConfirmation =
  'I reviewed this exact saved plan revision and confirm only this local name/cadence correction. No renewal or message is authorized.';
const sources = [
  'src/components/workflows/OperatingCenterCycleTwentyOne.tsx',
  'src/components/workflows/OperatingCenterPreview.tsx',
  'src/components/workflows/OperatingCenterCycleFifteen.tsx',
  'src/components/workflows/SavedRevisionWorkbench.tsx',
  'src/components/workflows/saved-revision-workbench.css',
  'src/lib/workflows/saved-revision-exercise.ts',
  'src/lib/workflows/correction-preview-sources.ts',
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
  baseURL: string | undefined,
) {
  const origin = exactConfiguredOrigin(baseURL);
  const outside: string[] = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).origin !== origin &&
      !request.url().startsWith('data:') &&
      !request.url().startsWith('blob:')
    )
      outside.push(request.url());
  });
  await page.goto('/preview/operating-center');
  await expect(
    page.getByLabel('Use canonical correction workflows', { exact: true }),
  ).not.toBeChecked();
  await page
    .getByLabel('Use canonical correction workflows', { exact: true })
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
  await page.getByText('Canonical correction review', { exact: true }).click();
  await page
    .getByRole('navigation', {
      name: 'Canonical correction review',
      exact: true,
    })
    .getByRole('button', { name: 'Task correction workflow', exact: true })
    .click();
  const root = page.getByRole('region', {
    name: 'Saved source workbench',
    exact: true,
  });
  const job = await selectJob(root);
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
        schema: 'propel-cycle21-browser-capture-v1',
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
  test(`canonical task cost plan corrections and exact history navigation / ${company.slug}`, async ({
    page,
    baseURL,
  }, info) => {
    const { root, job, outside } = await setup(page, company, baseURL);
    const task = root.getByRole('region', {
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
    expect(originalTask).toMatch(/^[a-f0-9-]{36}$/);
    await expect(task).toContainText(job);
    await task
      .getByRole('textbox', { name: 'Corrected task description', exact: true })
      .fill(`Explicit C21 corrected task for ${company.slug}`);
    await expect(
      task.getByRole('button', {
        name: 'Save exact task correction',
        exact: true,
      }),
    ).toBeDisabled();
    await task.getByLabel(taskConfirmation).check();
    if (info.project.name === 'desktop' && company.slug === 'straight-edge')
      await capture(root, 'editable-task', info, company, {
        job,
        original_task: originalTask,
      });
    await task
      .getByRole('button', { name: 'Save exact task correction', exact: true })
      .click();
    await expect(task.getByRole('status')).toContainText(
      'SYNTHETIC_SOURCE_SAVED',
    );
    await expect(
      task.getByLabel('Corrected task description', { exact: true }),
    ).toHaveCount(0);
    await task
      .getByRole('button', {
        name: 'Reconcile exact task correction',
        exact: true,
      })
      .click();
    await expect(task.getByRole('status')).toContainText(
      'KNOWN_SAVED — EXACT_RESULT_OBSERVED',
    );
    await capture(root, 'task-corrected', info, company, {
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
    expect(expense).toMatch(/^[a-f0-9-]{36}$/);
    await cost
      .getByRole('combobox', { name: 'Internal review decision', exact: true })
      .selectOption('approved');
    await cost
      .getByLabel('Staff review reason', { exact: true })
      .fill('Explicit review of the original pending materials commitment.');
    await expect(
      cost.getByRole('button', {
        name: 'Confirm exact internal cost review',
        exact: true,
      }),
    ).toBeDisabled();
    await cost
      .getByLabel(
        'I reviewed this exact pending expense and current job revision',
      )
      .check();
    if (info.project.name === 'desktop' && company.slug === 'straight-edge')
      await capture(root, 'editable-material', info, company, { job, expense });
    await cost
      .getByRole('button', {
        name: 'Confirm exact internal cost review',
        exact: true,
      })
      .click();
    await expect(cost.getByRole('status')).toContainText(
      'SYNTHETIC_SOURCE_SAVED',
    );
    await cost
      .getByRole('button', { name: 'Reconcile exact cost review', exact: true })
      .click();
    await expect(cost.getByRole('status')).toContainText(
      '"state":"KNOWN_SAVED"',
    );
    await expect(cost.getByRole('status')).toContainText(
      '"observed":"EXACT_RESULT_OBSERVED"',
    );
    await expect(cost.getByRole('status')).toContainText(expense);
    await expect(
      cost.getByRole('button', {
        name: 'Confirm exact internal cost review',
        exact: true,
      }),
    ).toBeDisabled();
    await capture(root, 'cost-reviewed', info, company, { job, expense });
    await audit(page, root);
    await tab(root, 'Maintenance revisions');
    const plan = root.getByRole('region', {
      name: 'Correct exact maintenance plan',
      exact: true,
    });
    await plan
      .getByRole('button', {
        name: 'Load current maintenance plan',
        exact: true,
      })
      .click();
    await expect(plan).toContainText(job);
    await expect(
      plan.getByRole('region', {
        name: 'Original renewal requirements',
        exact: true,
      }),
    ).toContainText('UNVERIFIED');
    await plan
      .getByLabel('Corrected plan name', { exact: true })
      .fill(`Exact local plan correction ${company.slug}`);
    await plan
      .getByRole('combobox', { name: 'Corrected cadence', exact: true })
      .selectOption('custom');
    await plan
      .getByLabel('Recorded custom interval (days)', { exact: true })
      .fill('10');
    await plan.getByLabel(planConfirmation).check();
    if (info.project.name === 'desktop' && company.slug === 'straight-edge')
      await capture(root, 'editable-plan', info, company, { job });
    await plan
      .getByRole('button', {
        name: 'Save exact maintenance plan correction',
        exact: true,
      })
      .click();
    await expect(plan.getByRole('status')).toContainText(
      'SYNTHETIC_SOURCE_SAVED',
    );
    await expect(
      plan.getByLabel('Corrected plan name', { exact: true }),
    ).toHaveCount(0);
    await plan
      .getByRole('button', {
        name: 'Reconcile exact maintenance plan correction',
        exact: true,
      })
      .click();
    await expect(plan.getByRole('status')).toContainText(
      'KNOWN_SAVED — EXACT_RESULT_OBSERVED',
    );
    await capture(root, 'plan-corrected', info, company, { job });
    await audit(page, root);
    const { customer, report } = await openCustomer(root);
    await expect(customer).toContainText(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    await customer
      .getByRole('button', { name: /^Inspect exact published finding / })
      .first()
      .click();
    await expect(
      customer.getByRole('article', {
        name: 'Exact published finding',
        exact: true,
      }),
    ).toContainText(report);
    await customer
      .getByRole('button', {
        name: 'Return to selected published report',
        exact: true,
      })
      .click();
    await customer
      .getByRole('button', {
        name: 'Review completion requirements',
        exact: true,
      })
      .click();
    const requirements = customer.getByRole('region', {
      name: 'Exact completion requirements',
      exact: true,
    });
    await expect(requirements).toContainText(report);
    await expect(requirements).toContainText(job);
    await expect(requirements).toContainText(
      'Completion requirements · UNKNOWN',
    );
    await expect(customer).not.toContainText(
      'Explicit review of the original pending materials commitment.',
    );
    await expect(customer).not.toContainText('Explicit C21 corrected task');
    await capture(root, 'published-requirements', info, company, {
      job,
      report,
    });
    await audit(page, root);
    await tab(root, 'Recorded priorities');
    const owner = root.getByRole('region', {
      name: 'Recorded owner actions',
      exact: true,
    });
    await owner
      .getByRole('button', {
        name: 'Read current owner priorities',
        exact: true,
      })
      .click();
    await owner
      .getByRole('button', { name: /^Inspect owner priority source: / })
      .first()
      .click();
    const inspected = owner.getByRole('region', {
      name: 'Exact owner priority source',
      exact: true,
    });
    await expect(inspected).toContainText(job);
    const step = (await inspected.innerText()).match(
      /Existing review: (field|finance|invoice|customer|maintenance|priorities)/,
    )?.[1];
    expect(step).toBeTruthy();
    await capture(root, 'owner-source', info, company, { job });
    await audit(page, root);
    await inspected
      .getByRole('button', {
        name: 'Open exact owner priority review',
        exact: true,
      })
      .click();
    const labels: Record<string, string> = {
      field: 'Work-order revisions',
      finance: 'Time and materials',
      invoice: 'Time and materials',
      customer: 'Service documentation',
      maintenance: 'Maintenance revisions',
      priorities: 'Recorded priorities',
    };
    await expect(
      root
        .getByRole('navigation', { name: 'Saved source review sections' })
        .getByRole('button', { name: labels[step!], exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(root.locator('.srw-context')).toContainText(job);
    expect(outside).toEqual([]);
  });
  test(`saved plan staleness and explicit published version continuity / ${company.slug}`, async ({
    page,
    baseURL,
  }, info) => {
    const { root, job, outside } = await setup(page, company, baseURL),
      { customer, report } = await openCustomer(root);
    const original = await customer
      .getByRole('region', {
        name: 'Published inspection history',
        exact: true,
      })
      .textContent();
    expect(original).toBeTruthy();
    await tab(root, 'Maintenance revisions');
    const plan = root.getByRole('region', {
      name: 'Correct exact maintenance plan',
      exact: true,
    });
    await plan
      .getByRole('button', {
        name: 'Load current maintenance plan',
        exact: true,
      })
      .click();
    await exercise(root, 'Save synthetic maintenance plan revision');
    await expect(plan.getByRole('alert')).toContainText('Source changed');
    await expect(
      plan.getByLabel('Corrected plan name', { exact: true }),
    ).toHaveCount(0);
    await expect(
      plan.getByRole('button', {
        name: 'Save exact maintenance plan correction',
        exact: true,
      }),
    ).toHaveCount(0);
    await capture(root, 'stale-plan', info, company, { job });
    await tab(root, 'Service documentation');
    await expect(
      customer.getByRole('region', {
        name: 'Published inspection history',
        exact: true,
      }),
    ).toHaveText(original!);
    await customer
      .getByRole('button', { name: 'Return to published history', exact: true })
      .click();
    await customer
      .getByLabel('Search published service history', { exact: true })
      .fill('.*');
    await expect(customer).toContainText(
      'No published reports match these literal filters',
    );
    await customer
      .getByLabel('Search published service history', { exact: true })
      .fill('weathered');
    await customer
      .getByRole('combobox', { name: 'Recorded finding severity', exact: true })
      .selectOption('moderate');
    await customer
      .getByRole('button', { name: /^Inspect published report version 1 · / })
      .click();
    await capture(root, 'immutable-published', info, company, { job, report });
    await exercise(root, 'Append synthetic published report version');
    await customer
      .getByRole('button', {
        name: 'Read latest available published history',
        exact: true,
      })
      .click();
    await expect(
      customer.getByRole('combobox', {
        name: 'Published report version',
        exact: true,
      }),
    ).toHaveValue(report + '/1');
    const options = await customer
      .getByRole('combobox', { name: 'Published report version', exact: true })
      .locator('option')
      .allTextContents();
    expect(options).toHaveLength(2);
    const versionTwo = customer
      .getByRole('combobox', { name: 'Published report version', exact: true })
      .locator('option')
      .filter({ hasText: 'Version 2 · ' });
    const second = await versionTwo.getAttribute('value');
    expect(second).not.toBe(report + '/1');
    await customer
      .getByRole('combobox', { name: 'Published report version', exact: true })
      .selectOption(second!);
    await expect(
      customer.getByRole('region', {
        name: 'Published inspection history',
        exact: true,
      }),
    ).toContainText('Published report v2');
    await customer
      .getByRole('combobox', { name: 'Published report version', exact: true })
      .selectOption(report + '/1');
    await expect(
      customer.getByRole('region', {
        name: 'Published inspection history',
        exact: true,
      }),
    ).toHaveText(original!);
    await customer
      .getByRole('button', { name: 'Return to published history', exact: true })
      .click();
    await expect(
      customer.getByLabel('Search published service history', { exact: true }),
    ).toHaveValue('weathered');
    await expect(
      customer.getByRole('combobox', {
        name: 'Recorded finding severity',
        exact: true,
      }),
    ).toHaveValue('moderate');
    await capture(root, 'published-versions', info, company, {
      job,
      report,
      second_report: second!,
    });
    await audit(page, root);
    expect(outside).toEqual([]);
  });
  test(`withdrawn pending review cannot restore old correction controls / ${company.slug}`, async ({
    page,
    baseURL,
  }, info) => {
    const { root, job, outside } = await setup(page, company, baseURL);
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
        'Explicit review with intentionally delayed native acknowledgment.',
      );
    await cost
      .getByLabel(
        'I reviewed this exact pending expense and current job revision',
      )
      .check();
    await page.evaluate(async () => {
      const path = '/src/lib/phase3.ts';
      const module = await import(path);
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
      (window as unknown as { c21NativeReview: typeof probe }).c21NativeReview =
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
        (window as unknown as { c21NativeReview: { entered: boolean } })
          .c21NativeReview.entered,
    );
    await page
      .getByLabel('Use canonical correction workflows', { exact: true })
      .uncheck();
    await page.evaluate(() =>
      (
        window as unknown as { c21NativeReview: { release(): void } }
      ).c21NativeReview.release(),
    );
    await page.waitForFunction(
      () =>
        (window as unknown as { c21NativeReview: { finished: boolean } })
          .c21NativeReview.finished,
    );
    await expect(
      page.getByRole('region', { name: 'Cost correction review', exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel('Use canonical correction workflows', { exact: true })
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
          (window as unknown as { c21NativeReview: { calls: number } })
            .c21NativeReview.calls,
      ),
    ).toBe(1);
    await capture(retained, 'withdrawn-review', info, company, {
      job,
      expense,
    });
    await audit(page, retained);
    expect(outside).toEqual([]);
  });
}
test('production keeps canonical correction workflows closed', async ({
  page,
  baseURL,
}) => {
  const origin = exactConfiguredOrigin(baseURL);
  const outside: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).origin !== origin && !r.url().startsWith('data:'))
      outside.push(r.url());
  });
  await page.goto('/preview/operating-center');
  await expect(
    page.getByLabel('Use canonical correction workflows', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Prepare multi-job local environment',
      exact: true,
    }),
  ).toHaveCount(0);
  for (const name of [
    'Saved source workbench',
    'Task correction review',
    'Cost correction review',
    'Published service navigator',
    'Maintenance plan correction',
    'Recorded owner actions',
    'Shared record search',
  ])
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(
      0,
    );
  expect(outside).toEqual([]);
});
