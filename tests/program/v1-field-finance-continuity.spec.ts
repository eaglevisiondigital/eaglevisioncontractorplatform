import {
  test,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sampleCompanies } from '../../src/domain/platform';

// Ordinary existing routes and controls only. Main separately binds the entire
// clean browser job and its PNGs; a capture is not approval or runtime authority.
const artifactDirectory = resolve('artifacts/cycle33/v1-product-continuity'),
  simulationConfirmation =
    'I confirm this disposable multi-job simulation; no dispatch, contract, invoice, payment or message is authorized.',
  costConfirmation =
    'Open only this exact original review; financial execution remains closed.';

async function activate(locator: Locator, key: 'Enter' | 'Space' = 'Enter') {
  await expect(locator).toBeEnabled();
  await locator.focus();
  await expect(locator).toBeFocused();
  await locator.press(key);
}

function observeRequests(page: Page, baseURL: string) {
  const outside: string[] = [],
    origin = new URL(baseURL).origin;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'data:' && url.origin !== origin)
      outside.push(request.url());
  });
  return outside;
}

async function audit(page: Page, controls: Locator, outside: string[]) {
  expect(outside).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  for (const button of await controls.getByRole('button').all())
    if (await button.isVisible())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  expect(outside).toEqual([]);
}

async function capture(
  region: Locator,
  state: string,
  company: (typeof sampleCompanies)[number],
  info: TestInfo,
) {
  const directory = resolve(artifactDirectory, 'screenshots');
  mkdirSync(directory, { recursive: true });
  await region.screenshot({
    path: resolve(
      directory,
      `${state}-${info.project.name}-${company.slug}.png`,
    ),
    animations: 'disabled',
  });
}

async function prepare(page: Page, company: (typeof sampleCompanies)[number]) {
  await page
    .getByRole('combobox', { name: 'Contractor', exact: true })
    .selectOption(company.id);
  await activate(
    page.getByLabel(simulationConfirmation, { exact: true }),
    'Space',
  );
  await activate(
    page.getByRole('button', {
      name: 'Prepare multi-job local environment',
      exact: true,
    }),
  );
  await expect(
    page.getByRole('region', {
      name: 'Shared operating environment',
      exact: true,
    }),
  ).toContainText('4 admitted jobs');
  expect(
    await page
      .locator('.operating-center')
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--journey-primary').trim(),
      ),
  ).toBe(company.primary_color);
}

async function openDesk(page: Page, group: string, button: string) {
  const navigation = page.getByRole('navigation', { name: group, exact: true });
  if (!(await navigation.isVisible()))
    await activate(page.getByText(group, { exact: true }));
  const destination = navigation.getByRole('button', {
    name: button,
    exact: true,
  });
  await activate(destination);
  await expect(destination).toHaveAttribute('aria-current', 'page');
}

for (const company of sampleCompanies) {
  test(`ordinary Field void navigation retains exact job and destination focus / ${company.slug}`, async ({
    page,
    baseURL,
  }, info) => {
    test.setTimeout(90_000); // Original C17 Field budget, not a timeout supplement.
    const outside = observeRequests(page, baseURL!);
    await page.goto('/preview/operating-center');
    const retained = page.getByLabel('Use retained daily workspaces', {
      exact: true,
    });
    await expect(retained).not.toBeChecked();
    await expect(
      page.getByRole('region', { name: 'Shared operating environment' }),
    ).toHaveCount(0);
    await activate(retained, 'Space');
    await prepare(page, company);
    await openDesk(
      page,
      'Cycle 14 source continuity',
      'Schedule and work orders',
    );
    const workspace = page.getByRole('region', {
        name: 'Field workspace',
        exact: true,
      }),
      choice = workspace.getByRole('combobox', {
        name: 'Field workspace job',
        exact: true,
      });
    await choice.selectOption({ index: 1 });
    const job = await choice.inputValue();
    expect(job).not.toBe('');
    const open = workspace.getByRole('button', {
      name: 'Open retained field workspace',
      exact: true,
    });
    await expect(open).toBeDisabled();
    await activate(
      workspace.getByLabel('I confirm this is a local field source review.', {
        exact: true,
      }),
      'Space',
    );
    await activate(open);
    await expect(
      workspace.getByRole('heading', {
        name: 'Retained work-order controls',
        exact: true,
      }),
    ).toBeFocused();
    const context = workspace.getByRole('navigation', {
        name: 'Exact field record context',
        exact: true,
      }),
      identities = await context.locator('small').allTextContents();
    expect(identities).toHaveLength(5);
    expect(identities.every((identity) => identity.trim().length > 0)).toBe(
      true,
    );
    expect(identities).toContain(company.id);
    expect(identities).toContain(job);
    await expect(workspace).toContainText('No dispatch or operational writer');
    await audit(page, workspace, outside);
    await capture(workspace, 'field-original', company, info);

    await activate(
      workspace.getByRole('button', {
        name: 'Open exact field job',
        exact: true,
      }),
    );
    const destination = page.getByRole('region', {
      name: 'Selected job field review',
      exact: true,
    });
    await expect(destination).toBeVisible();
    await expect(destination).toBeFocused();
    const selected = page.locator('.oc-identities');
    for (const identity of identities)
      await expect(selected).toContainText(identity);
    await expect(
      page.getByText(
        'Retained selected job context is UNKNOWN. Continuity controls are withheld; no other job is substituted.',
        { exact: true },
      ),
    ).toHaveCount(0);
    await audit(page, destination, outside);
    await capture(destination, 'field-destination', company, info);
    expect(outside).toEqual([]);
  });

  test(`ordinary Finance material save retains exact time selection for fresh verification / ${company.slug}`, async ({
    page,
    baseURL,
  }, info) => {
    test.setTimeout(150_000); // Original native-actions browser budget.
    const outside = observeRequests(page, baseURL!);
    await page.goto('/preview/operating-center');
    const requirements = page.getByLabel('Use current source requirements', {
        exact: true,
      }),
      mode = page.getByRole('combobox', {
        name: 'Current source review',
        exact: true,
      });
    await expect(requirements).not.toBeChecked();
    await expect(mode).toBeDisabled();
    await expect(mode).toHaveValue('requirements');
    await activate(requirements, 'Space');
    await mode.selectOption('consistency');
    await prepare(page, company);
    await openDesk(
      page,
      'Current source requirements',
      'Current task requirements',
    );
    const root = page.getByRole('region', {
        name: 'Saved source workbench',
        exact: true,
      }),
      search = root.getByRole('region', {
        name: 'Shared record search',
        exact: true,
      });
    await activate(
      search.getByRole('button', { name: 'Find another record', exact: true }),
    );
    await activate(
      search.getByRole('button', {
        name: 'Search shared records',
        exact: true,
      }),
    );
    await expect(search).toContainText('4 matching of 4');
    const record = search.locator('article').first(),
      [job, version] = await record.locator('span').allTextContents();
    expect(job).toMatch(/^[a-f0-9-]{36}$/);
    expect(version).toMatch(/^[a-f0-9-]{36}$/);
    await activate(
      record.getByRole('button', { name: /^Open exact record in / }),
    );
    await expect(root.locator('.srw-context')).toContainText(job);
    await activate(
      root
        .getByRole('navigation', {
          name: 'Saved source review sections',
          exact: true,
        })
        .getByRole('button', { name: 'Time and materials', exact: true }),
    );
    const finance = root.getByRole('region', {
        name: 'Cost action requirements',
        exact: true,
      }),
      load = finance.getByRole('button', {
        name: 'Load original cost action sources',
        exact: true,
      });
    await activate(load);
    const choice = finance.getByRole('combobox', {
        name: 'Exact recorded cost action source',
        exact: true,
      }),
      option = choice
        .locator('option')
        .filter({ hasText: /^time ·/ })
        .first(),
      key = await option.getAttribute('value');
    expect(key).toMatch(/^time:/);
    await choice.selectOption(key!);
    const query = finance.getByRole('searchbox', {
      name: 'Search original cost action sources',
      exact: true,
    });
    await query.fill('time');
    const verify = finance.getByRole('button', {
      name: 'Verify selected cost action',
      exact: true,
    });
    await activate(verify);
    const result = finance.locator('.cost-action-result'),
      originalRevision = (await result.innerText()).match(/job revision (\d+)/);
    expect(originalRevision).not.toBeNull();
    await expect(result).toContainText(key!.slice('time:'.length));
    await expect(result).toContainText('Cost coverage: UNKNOWN');
    await expect(result).toContainText('invoice prerequisites: NO_GO');
    await activate(
      finance.getByLabel(costConfirmation, { exact: true }),
      'Space',
    );
    const continuation = finance.getByRole('button', {
      name: 'Open verified original cost review',
      exact: true,
    });
    await expect(continuation).toBeEnabled();
    await audit(page, root, outside);
    await capture(finance, 'finance-original', company, info);

    // This sibling uses the original in-memory native reviewExpense workflow.
    // No browser-evaluated repository command, fixture or source replacement.
    const cost = root.getByRole('region', {
      name: 'Cost correction review',
      exact: true,
    });
    await activate(
      cost.getByRole('button', {
        name: 'Read current recorded cost review',
        exact: true,
      }),
    );
    const expense = await cost
      .getByRole('combobox', { name: 'Recorded pending expense', exact: true })
      .inputValue();
    expect(expense).toMatch(/^[a-f0-9-]{36}$/);
    await expect(cost).toContainText(job);
    await expect(cost).toContainText(version);
    await cost
      .getByRole('combobox', { name: 'Internal review decision', exact: true })
      .selectOption('approved');
    await cost
      .getByLabel('Staff review reason', { exact: true })
      .fill(
        'Explicit unrelated material review; no invoice or payment authority.',
      );
    await activate(
      cost.getByLabel(
        'I reviewed this exact pending expense and current job revision',
        { exact: true },
      ),
      'Space',
    );
    await activate(
      cost.getByRole('button', {
        name: 'Confirm exact internal cost review',
        exact: true,
      }),
    );
    await expect(cost.getByRole('status')).toContainText(
      'SYNTHETIC_SOURCE_SAVED',
    );
    await expect(root.locator('.srw-context')).toContainText(job);
    await activate(load);
    await expect(finance.getByRole('status')).toContainText(
      'UNCHANGED_SOURCE_REVERIFY_REQUIRED',
    );
    await expect(choice).toHaveValue(key!);
    await expect(query).toHaveValue('time');
    await expect(result).toHaveCount(0);
    await expect(
      finance.getByLabel(costConfirmation, { exact: true }),
    ).toHaveCount(0);
    await expect(continuation).toHaveCount(0);
    await activate(verify);
    const currentRevision = (await result.innerText()).match(
      /job revision (\d+)/,
    );
    expect(currentRevision).not.toBeNull();
    expect(Number(currentRevision![1])).toBeGreaterThan(
      Number(originalRevision![1]),
    );
    await expect(choice).toHaveValue(key!);
    await expect(result).toContainText(key!.slice('time:'.length));
    await expect(result).toContainText('Cost coverage: UNKNOWN');
    await expect(result).toContainText('invoice prerequisites: NO_GO');
    await expect(
      finance.getByLabel(costConfirmation, { exact: true }),
    ).not.toBeChecked();
    await expect(continuation).toBeDisabled();
    await expect(root.locator('.srw-context')).toContainText(job);
    await expect(cost).toContainText(job);
    await expect(cost).toContainText(version);
    await expect(
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    ).toContainText('4 admitted jobs');
    await audit(page, root, outside);
    await capture(finance, 'finance-reverified', company, info);
    expect(outside).toEqual([]);
  });
}

test('production keeps Field and Finance continuity controls OFF', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000); // Original C17 production-OFF budget.
  const outside = observeRequests(page, baseURL!);
  await page.goto('/preview/operating-center');
  for (const label of [
    'Use retained daily workspaces',
    'Use current source requirements',
    'Current source review',
  ])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  for (const name of [
    'Shared operating environment',
    'Field workspace',
    'Field task continuity',
    'Saved source workbench',
    'Cost action requirements',
    'Cost correction review',
  ])
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(
      0,
    );
  await expect(
    page.getByRole('button', {
      name: 'Prepare multi-job local environment',
      exact: true,
    }),
  ).toHaveCount(0);
  await audit(page, page.locator('body'), outside);
});
