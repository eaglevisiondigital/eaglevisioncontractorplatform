import { expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { CompanyProfile } from '../../src/domain/platform';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const external = new WeakMap<Page, string[]>();
export async function start(
  page: Page,
  company: CompanyProfile,
  mode: 'workspaces' | 'guides' = 'workspaces',
) {
  const requests: string[] = [];
  external.set(page, requests);
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:4361') &&
      !r.url().startsWith('data:')
    )
      requests.push(r.url());
  });
  await page.goto('/preview/operating-center');
  await expect(
    page.getByLabel('Use daily contractor workflow', { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('region', { name: 'Shared operating environment' }),
  ).toHaveCount(0);
  await page
    .getByLabel(
      mode === 'workspaces'
        ? 'Use daily contractor workflow'
        : 'Use daily workflow guides',
      { exact: true },
    )
    .check();
  await expect(
    page.getByRole('region', { name: 'Shared operating environment' }),
  ).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'Contractor', exact: true })
    .selectOption(company.id);
  await page
    .getByLabel(
      'I confirm this disposable multi-job simulation; no dispatch, contract, invoice, payment or message is authorized.',
    )
    .check();
  await page
    .getByRole('button', {
      name: 'Prepare multi-job local environment',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('region', { name: 'Shared operating environment' }),
  ).toContainText('4 admitted jobs');
  expect(
    await page
      .locator('.operating-center')
      .evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--journey-primary').trim(),
      ),
  ).toBe(company.primary_color);
}
export async function nav(page: Page, name: string) {
  const group = page.getByRole('navigation', {
    name: 'Daily workflow reviews',
    exact: true,
  });
  if (!(await group.isVisible()))
    await page.getByText('Daily workflow reviews', { exact: true }).click();
  await group.getByRole('button', { name, exact: true }).click();
  await expect(
    group.getByRole('button', { name, exact: true }),
  ).toHaveAttribute('aria-current', 'page');
}
export async function audit(page: Page, region: Locator) {
  expect(external.get(page) ?? []).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  for (const button of await region.getByRole('button').all()) {
    if (await button.isVisible())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  }
}
export async function capture(
  page: Page,
  region: Locator,
  name: string,
  brand: string,
  viewport: string,
) {
  mkdirSync('artifacts/cycle18', { recursive: true });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const dirty =
    execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
      encoding: 'utf8',
    }).trim().length > 0;
  await region.screenshot({
    path: `artifacts/cycle18/${name}-${viewport}-${brand}.png`,
  });
  writeFileSync(
    `artifacts/cycle18/${name}-${viewport}-${brand}.json`,
    JSON.stringify(
      {
        schema: 'propel-cycle18-capture-v1',
        brand,
        viewport,
        source: dirty ? 'WORKING_TREE_UNCOMMITTED' : head,
        approval: 'PENDING',
        release: 'NOT_READY_NOT_AUTHORIZED',
      },
      null,
      2,
    ) + '\n',
  );
  expect(external.get(page) ?? []).toEqual([]);
}
export async function measure(page: Page, task: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as {
      cycle18Clicks?: number;
      cycle18Bound?: boolean;
    };
    w.cycle18Clicks = 0;
    if (!w.cycle18Bound) {
      w.cycle18Bound = true;
      document.addEventListener(
        'click',
        (e) => {
          if (e.isTrusted) w.cycle18Clicks = (w.cycle18Clicks ?? 0) + 1;
        },
        true,
      );
    }
  });
  await task();
  return page.evaluate(
    () => (window as unknown as { cycle18Clicks: number }).cycle18Clicks,
  );
}
