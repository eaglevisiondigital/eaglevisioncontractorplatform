import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { contractor, developerControls } from './helpers/property-portal';
async function actualRequestToDraft(page: Page, company: string) {
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
  const original = await card.locator('.customer-scope-line').allTextContents();
  await card.getByRole('button', { name: 'Request changes version 2' }).click();
  const form = page.getByRole('form', { name: 'Request changes version 2' });
  const note =
    'Please clarify the proposed repair scope and add an assessment before further review.';
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
  const queue = page.getByRole('region', {
    name: 'Customer change requests',
    exact: true,
  });
  await queue.getByRole('button', { name: 'Review request version 2' }).click();
  const confirmation = page.getByRole('region', {
    name: 'Staff revision confirmation',
  });
  await confirmation.getByRole('checkbox').check();
  await confirmation
    .getByRole('button', { name: 'Prepare revised estimate draft' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Customer revision provenance' }),
  ).toContainText(source!);
  return { source: source!, original, receipt, note };
}
async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
for (const company of [
  'sample-property',
  'sample-construction',
  'sample-roofing',
]) {
  test(`${company}: actual request, saved comparison, immutable packet, stale history and fresh confirmation`, async ({
    page,
  }, info) => {
    const outside: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1:4173/')) outside.push(r.url());
    });
    const actual = await actualRequestToDraft(page, company);
    const count = await page.locator('.scope-card').count();
    await page
      .getByLabel('Scope item 1', { exact: true })
      .fill('Clarified exterior scope — staff draft');
    await page.getByLabel('Quantity 1', { exact: true }).fill('1.75');
    await page
      .getByRole('combobox', { name: 'Unit 1', exact: true })
      .selectOption('each');
    await page
      .locator('.scope-card')
      .first()
      .getByRole('checkbox', { name: 'Use explicit selling unit price' })
      .check();
    await page
      .getByLabel('Selling unit price 1', { exact: true })
      .fill('222.22');
    await page
      .getByLabel('Internal line note 1', { exact: true })
      .fill('STAFF_PRIVATE_PACKET_CANARY');
    await page
      .getByRole('textbox', { name: 'Private estimate notes', exact: true })
      .fill('STAFF_PRIVATE_PACKET_CANARY');
    await page
      .getByRole('button', { name: `Remove item ${count}`, exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Add material', exact: true })
      .click();
    const added = page.locator('.scope-card').last();
    await added
      .getByLabel(`Scope item ${count}`, { exact: true })
      .fill('Additional assessment allowance');
    await added
      .getByRole('checkbox', { name: 'Use explicit selling unit price' })
      .check();
    await page
      .getByLabel(`Selling unit price ${count}`, { exact: true })
      .fill('333.33');
    await page
      .getByRole('combobox', { name: 'Discount type', exact: true })
      .selectOption('percent');
    await page
      .getByRole('textbox', { name: 'Discount percent', exact: true })
      .fill('5');
    await page
      .getByRole('button', {
        name: 'Revision comparison & packet',
        exact: true,
      })
      .click();
    const review = page.getByRole('region', {
      name: 'Estimate revision review',
      exact: true,
    });
    await expect(review.getByRole('alert')).toContainText(
      'Unsaved editor changes',
    );
    await expect(
      review.getByRole('button', {
        name: 'Prepare Customer Review Packet',
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Save estimate draft', exact: true })
      .click();
    await expect(
      page.getByText('Saved revision 2', { exact: false }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Revision comparison & packet',
        exact: true,
      })
      .click();
    const comparison = review.getByRole('region', {
      name: 'Original versus revised scope',
      exact: true,
    });
    await expect(comparison).toContainText(actual.note);
    await comparison
      .getByText('Exact request and source evidence', { exact: true })
      .click();
    await expect(comparison).toContainText(actual.source);
    await expect(comparison).toContainText(actual.receipt);
    await expect(comparison).toContainText('Published version 1');
    for (const status of ['Added', 'Removed', 'Modified', 'Unchanged'])
      await expect(
        comparison
          .getByRole('article', { name: `${status} scope line`, exact: true })
          .first(),
      ).toBeVisible();
    await expect(comparison).not.toContainText('STAFF_PRIVATE_PACKET_CANARY');
    await expect(comparison).not.toContainText('Gross margin');
    const confirm = review.getByRole('checkbox');
    await confirm.focus();
    await page.keyboard.press('Space');
    const prepare = review.getByRole('button', {
      name: 'Prepare Customer Review Packet',
      exact: true,
    });
    await expect(prepare).toBeEnabled();
    await accessible(page);
    await mkdir('artifacts/property', { recursive: true });
    await page.screenshot({
      path: `artifacts/property/revision-packet-${info.project.name}-${company}-comparison.png`,
      fullPage: true,
    });
    await comparison.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({
      path: `artifacts/property/revision-packet-${info.project.name}-${company}-comparison-viewport.png`,
    });
    await comparison.screenshot({
      path: `artifacts/property/revision-packet-${info.project.name}-${company}-comparison-detail.png`,
    });
    await prepare.click();
    const packet = page.getByRole('region', {
      name: 'Customer review packet staff preview',
      exact: true,
    });
    await expect(
      packet.getByRole('heading', {
        name: 'Customer Review Packet — Staff Preview Only',
        exact: true,
      }),
    ).toBeVisible();
    await expect(packet).toContainText('Draft Estimate — Not Issued or Sent');
    await expect(packet).toContainText('Current saved snapshot');
    const packetId = await packet.getAttribute('data-packet-id');
    await packet
      .getByText('Snapshot integrity evidence', { exact: true })
      .click();
    const sha = (await packet.getByText(/^SHA-256:/).textContent())!;
    expect(sha).toMatch(/[0-9a-f]{64}/);
    await expect(packet).toContainText(actual.source);
    await expect(packet).toContainText(actual.receipt);
    await expect(packet).not.toContainText('STAFF_PRIVATE_PACKET_CANARY');
    await expect(packet).not.toContainText('Internal unit cost');
    await expect(packet).not.toContainText('profit');
    await expect(packet.locator('a')).toHaveCount(0);
    await accessible(page);
    await packet.screenshot({
      path: `artifacts/property/revision-packet-${info.project.name}-${company}-packet.png`,
    });
    await packet.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({
      path: `artifacts/property/revision-packet-${info.project.name}-${company}-packet-viewport.png`,
    });
    await review
      .getByRole('button', { name: 'Saved revision comparison', exact: true })
      .click();
    await expect(prepare).toBeDisabled();
    await page
      .getByRole('button', { name: 'Estimate builder', exact: true })
      .click();
    await page
      .getByRole('textbox', { name: 'Customer notes', exact: true })
      .fill('Later saved customer-facing note');
    await page
      .getByRole('button', { name: 'Save estimate draft', exact: true })
      .click();
    await expect(
      page.getByText('Saved revision 3', { exact: false }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Revision comparison & packet',
        exact: true,
      })
      .click();
    await expect(
      review.getByRole('region', { name: 'Review packet history' }),
    ).toContainText('Stale for further use');
    await review
      .getByRole('button', { name: 'Open packet revision 2', exact: true })
      .click();
    await expect(packet).toHaveAttribute('data-packet-id', packetId!);
    await expect(packet).toContainText(
      'Historical snapshot retained unchanged',
    );
    await expect(packet).not.toContainText('Later saved customer-facing note');
    await packet
      .getByText('Snapshot integrity evidence', { exact: true })
      .click();
    await expect(packet.getByText(/^SHA-256:/)).toHaveText(sha);
    await packet.screenshot({
      path: `artifacts/property/revision-packet-${info.project.name}-${company}-stale-packet.png`,
    });
    await review
      .getByRole('button', { name: 'Saved revision comparison', exact: true })
      .click();
    await expect(prepare).toBeDisabled();
    await review.getByRole('checkbox').check();
    await prepare.click();
    await expect(packet).not.toHaveAttribute('data-packet-id', packetId!);
    await expect(packet).toContainText('Saved revision 3');
    await expect(packet).toContainText('Later saved customer-facing note');
    await expect(packet).toContainText('Current saved snapshot');
    await page
      .getByRole('button', { name: 'All estimates', exact: true })
      .click();
    await page
      .getByRole('region', { name: 'Customer change requests', exact: true })
      .getByRole('button', { name: 'Open local customer portal', exact: true })
      .click();
    await page.getByRole('region', { name: 'Property overview' }).waitFor();
    await page
      .getByRole('button', { name: 'Estimates & repairs', exact: true })
      .click();
    const card = page
      .getByRole('region', { name: 'Customer estimate review' })
      .locator('article')
      .nth(1);
    expect(
      await card.locator('.customer-scope-line').allTextContents(),
    ).toEqual(actual.original);
    await expect(
      page.getByRole('region', { name: 'Recorded preference version 2' }),
    ).toContainText(actual.receipt);
    await expect(page.locator('.portal-concept')).not.toContainText(
      'Later saved customer-facing note',
    );
    await expect(page.locator('.portal-concept')).not.toContainText(
      'Customer Review Packet — Staff Preview Only',
    );
    expect(outside).toEqual([]);
  });
}
test('ordinary drafts and connected customer routes have no packet preparation or response surface', async ({
  page,
}) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Estimates', exact: true }).click();
  await page
    .getByRole('button')
    .filter({ hasText: 'Cedar boundary fence' })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Revision comparison & packet',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.goto('/portal/property');
  await expect(
    page.getByRole('button', { name: 'Prepare Customer Review Packet' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('The customer portal is reserved', { exact: false }),
  ).toBeVisible();
});
