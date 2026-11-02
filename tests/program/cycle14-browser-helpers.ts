import { execFileSync } from 'node:child_process';
import { expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { CompanyProfile } from '../../src/domain/platform';
const external = new WeakMap<Page, string[]>();
export async function start(page: Page, company: CompanyProfile) {
  if (!external.has(page)) {
    const requests: string[] = [];
    external.set(page, requests);
    page.on('request', (r) => {
      if (
        !r.url().startsWith('http://127.0.0.1:4281') &&
        !r.url().startsWith('data:')
      )
        requests.push(r.url());
    });
  }
  await page.goto('/preview/operating-center');
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
  await expect(
    page.getByRole('region', { name: 'Shared operating environment' }),
  ).toContainText('3 customers');
  const color = await page
    .locator('.operating-center')
    .evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--journey-primary').trim(),
    );
  expect(color).toBe(company.primary_color);
  const header = await page.locator('.oc-header').boundingBox();
  const context = await page.locator('.oc-context').boundingBox();
  expect(header!.y + header!.height).toBeLessThanOrEqual(context!.y);
}
export async function nav(page: Page, name: string) {
  const group = page.getByRole('navigation', {
    name: 'Cycle 14 source continuity',
    exact: true,
  });
  if (!(await group.isVisible()))
    await page.getByText('Cycle 14 source continuity', { exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Cycle 14 source continuity' })
    .getByRole('button', { name, exact: true })
    .click();
}
export async function audit(page: Page, region: Locator) {
  expect(external.get(page) ?? []).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  for (const header of await region.locator('header').all()) {
    if (!(await header.isVisible())) continue;
    const box = await header.boundingBox();
    for (const child of await header.locator(':scope > *').all()) {
      if (!(await child.isVisible())) continue;
      const content = await child.boundingBox();
      expect(content!.y).toBeGreaterThanOrEqual(box!.y - 1);
      expect(content!.y + content!.height).toBeLessThanOrEqual(
        box!.y + box!.height + 1,
      );
    }
  }
  for (const b of await region.getByRole('button').all()) {
    if (await b.isVisible()) {
      const box = await b.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
    }
  }
}

export async function measureClicks(page: Page, task: () => Promise<void>) {
  await page.evaluate(() => {
    const state = window as unknown as {
      cycle14Clicks?: number;
      cycle14Bound?: boolean;
    };
    state.cycle14Clicks = 0;
    if (!state.cycle14Bound) {
      state.cycle14Bound = true;
      document.addEventListener(
        'click',
        (event) => {
          if (event.isTrusted)
            state.cycle14Clicks = (state.cycle14Clicks ?? 0) + 1;
        },
        true,
      );
    }
  });
  await task();
  return page.evaluate(
    () => (window as unknown as { cycle14Clicks: number }).cycle14Clicks,
  );
}

/** Capture-time metadata only. Later commits cannot promote an earlier PNG. */
export function captureVisualSourceCommit(): string | null {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const dirty =
    execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
      encoding: 'utf8',
    }).trim().length > 0;
  return !dirty && /^[a-f0-9]{40}$/.test(head) ? head : null;
}
