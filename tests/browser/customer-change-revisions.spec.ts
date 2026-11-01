import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { contractor, developerControls } from './helpers/property-portal';

for (const company of [
  'sample-property',
  'sample-construction',
  'sample-roofing',
]) {
  test(`${company}: actual customer request to reviewed editable revision in the same tab`, async ({
    page,
  }, info) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1:4173/')) external.push(r.url());
    });
    await page.goto('/preview/property-portal');
    await contractor(page, company);
    await page
      .getByRole('button', { name: 'Estimates & repairs', exact: true })
      .click();
    const card = page
      .getByRole('region', { name: 'Customer estimate review' })
      .locator('article')
      .nth(1);
    const source = await card.getAttribute('data-version-id');
    const scope = await card.locator('.customer-scope-line').allTextContents();
    await card
      .getByRole('button', { name: 'Request changes version 2' })
      .click();
    const form = page.getByRole('form', { name: 'Request changes version 2' });
    const note = `Please review the proposed scope for ${company}. Keep the original inspection evidence. <img src=x onerror=alert(1)>`;
    await form.getByRole('textbox', { name: 'Requested changes' }).fill(note);
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Review preference' }).click();
    await form
      .getByRole('button', { name: 'Record synthetic change request' })
      .click();
    const recorded = page.getByRole('region', {
      name: 'Recorded preference version 2',
    });
    await expect(recorded).toContainText(note);
    const receipt = (await recorded.textContent())!.match(
      /Receipt ([0-9a-f-]{36})/,
    )![1];
    await developerControls(page);
    await page
      .getByRole('button', { name: 'Open local staff estimate review' })
      .click();
    await expect(page).toHaveURL('/preview');
    const queue = page.getByRole('region', {
      name: 'Customer change requests',
      exact: true,
    });
    await expect(queue).toContainText(note);
    await queue
      .getByText('Exact customer request evidence', { exact: true })
      .click();
    await expect(queue).toContainText(receipt);
    await expect(queue).toContainText(source!);
    expect(await queue.locator('img').count()).toBe(0);
    await queue
      .getByRole('button', { name: 'Review request version 2' })
      .click();
    const confirmation = page.getByRole('region', {
      name: 'Staff revision confirmation',
    });
    const prepare = confirmation.getByRole('button', {
      name: 'Prepare revised estimate draft',
    });
    await expect(prepare).toBeDisabled();
    await confirmation.getByRole('checkbox').focus();
    await page.keyboard.press('Space');
    await expect(prepare).toBeEnabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/property', { recursive: true });
    await page.screenshot({
      path: `artifacts/property/customer-revision-${info.project.name}-${company}-staff-review.png`,
      fullPage: true,
    });
    await confirmation.screenshot({
      path: `artifacts/property/customer-revision-${info.project.name}-${company}-staff-review-detail.png`,
    });
    await prepare.click();
    const provenance = page.getByRole('region', {
      name: 'Customer revision provenance',
    });
    await expect(provenance).toContainText(source!);
    await provenance
      .getByText('Exact revision provenance', { exact: true })
      .click();
    await expect(provenance).toContainText(receipt);
    await expect(
      page.locator('.estimate-editor .eyebrow').first(),
    ).toContainText('3');
    await expect(
      page.getByRole('button', { name: 'Issue internal snapshot' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Duplicate estimate' }),
    ).toBeDisabled();
    await page
      .getByLabel('Project name', { exact: true })
      .fill('Customer-requested scope revision');
    await page
      .getByRole('button', { name: 'Save estimate draft', exact: true })
      .click();
    await expect(
      page.getByText('Saved revision 2', { exact: false }),
    ).toBeVisible();
    await expect(provenance).toContainText(note);
    if ((await provenance.locator('details').getAttribute('open')) === null)
      await provenance
        .getByText('Exact revision provenance', { exact: true })
        .click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/property/customer-revision-${info.project.name}-${company}-revised-draft.png`,
      fullPage: true,
    });
    await provenance.screenshot({
      path: `artifacts/property/customer-revision-${info.project.name}-${company}-revision-detail.png`,
    });
    await page
      .getByRole('button', { name: 'All estimates', exact: true })
      .click();
    await expect(queue).toContainText('Draft prepared');
    await queue
      .getByRole('button', { name: 'Read exact revision status' })
      .click();
    await expect(provenance).toContainText(receipt);
    await page
      .getByRole('button', { name: 'All estimates', exact: true })
      .click();
    await queue
      .getByRole('button', { name: 'Open local customer portal' })
      .click();
    await page.getByRole('region', { name: 'Property overview' }).waitFor();
    await page
      .getByRole('button', { name: 'Estimates & repairs', exact: true })
      .click();
    await expect(recorded).toContainText(receipt);
    expect(
      await card.locator('.customer-scope-line').allTextContents(),
    ).toEqual(scope);
    await expect(
      page
        .getByRole('region', { name: 'Customer estimate review' })
        .locator('article'),
    ).toHaveCount(2);
    await expect(page.locator('.portal-concept')).not.toContainText(
      'Customer-requested scope revision',
    );
    expect(external).toEqual([]);
  });
}

test('empty request queue stays empty across contractor changes; no requests fabricated by review', async ({
  page,
}) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Estimates', exact: true }).click();
  for (const company of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(company);
    const queue = page.getByRole('region', {
      name: 'Customer change requests',
      exact: true,
    });
    await expect(queue).toContainText(
      'No customer change requests in this tab',
    );
    await expect(
      queue.getByRole('button', { name: 'Prepare revised estimate draft' }),
    ).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});
