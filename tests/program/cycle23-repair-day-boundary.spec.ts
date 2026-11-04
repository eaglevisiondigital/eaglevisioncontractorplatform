import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const artifacts = resolve(
  process.env.CYCLE23_REPAIR_ARTIFACT_DIR ?? 'artifacts/cycle23/repair-clock',
);
async function repair(page: Page) {
  const center = page.getByRole('region', {
    name: 'Maintenance & follow-up center',
    exact: true,
  });
  await center
    .getByRole('button', { name: 'Review Finding', exact: true })
    .first()
    .click();
  const prep = center.getByRole('region', {
    name: 'Repair estimate preparation',
    exact: true,
  });
  await prep
    .getByRole('button', { name: 'Prepare Repair Estimate', exact: true })
    .click();
  await prep.getByRole('checkbox').check();
  await prep
    .getByRole('button', {
      name: 'Confirm & Prepare Repair Draft',
      exact: true,
    })
    .click();
  return center.getByRole('region', {
    name: 'Exact repair estimate workflow',
    exact: true,
  });
}
test('UTC day boundary rejects the original repair snapshot and explicit reload restores current review', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.clock.setFixedTime(new Date('2026-11-03T23:59:50.000Z'));
  await page.goto('/preview/contractor-design');
  await page
    .getByRole('combobox', { name: 'Company Context', exact: true })
    .selectOption('sample-roofing');
  const workflow = await repair(page),
    readiness = workflow.getByRole('region', {
      name: 'Repair Scope Readiness',
      exact: true,
    });
  await workflow
    .getByRole('textbox', { name: 'Scope Item 1', exact: true })
    .fill('Remove and replace measured joint seal within stated boundaries');
  await workflow
    .getByRole('textbox', { name: 'Scope Description', exact: true })
    .fill(
      'Prepare the exterior surface and replace eight feet of joint seal; concealed work excluded.',
    );
  await workflow
    .getByRole('textbox', { name: 'Quantity 1', exact: true })
    .fill('8');
  await workflow
    .getByRole('combobox', { name: 'Unit 1', exact: true })
    .selectOption({ value: 'linear_ft' });
  await workflow
    .getByRole('textbox', { name: 'Internal Unit Cost 1', exact: true })
    .fill('10.00');
  await workflow
    .getByRole('textbox', { name: 'Selling Unit Price 1', exact: true })
    .fill('20.00');
  await workflow
    .getByRole('textbox', { name: 'Estimate Terms', exact: true })
    .fill(
      'Synthetic contractor terms exclude concealed damage pending separate scope review.',
    );
  await workflow
    .getByRole('combobox', { name: 'Tax Policy', exact: true })
    .selectOption({ label: 'Synthetic zero-tax review · 0% · reviewed' });
  await workflow
    .getByRole('textbox', { name: 'Private Estimate Notes', exact: true })
    .fill('PRIVATE_COPY_SENTINEL · Manual priority');
  await expect(readiness).toContainText('Unsaved estimate changes');
  await workflow
    .getByRole('button', { name: 'Save Estimate Draft', exact: true })
    .click();
  await expect(readiness).toContainText('saved revision 2');

  await workflow
    .getByRole('button', { name: 'Customer Preview', exact: true })
    .click();
  await expect(
    workflow.getByRole('region', {
      name: 'Customer-facing estimate preview',
      exact: true,
    }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await workflow
    .getByRole('button', { name: 'Version History', exact: true })
    .click();
  await expect(workflow.locator('.history-row').first()).toBeVisible();
  await workflow
    .getByRole('button', { name: 'Estimate Builder', exact: true })
    .click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({
    path: resolve(artifacts, 'before-midnight.png'),
  });
  await page
    .getByRole('link', { name: 'Review Readiness', exact: false })
    .click();
  const card = readiness.locator('[data-review-section="scope"]');
  await card
    .getByRole('textbox', { name: /^Scope Review Note/ })
    .fill(
      'Synthetic staff reviewed exact scope, packaged labor/materials, calculation and applicability.',
    );
  await card.getByRole('checkbox').focus();
  await page.keyboard.press('Space');
  await page.clock.setFixedTime(new Date('2026-11-04T00:00:01.000Z'));
  await card
    .getByRole('button', {
      name: 'Confirm Scope & Source Evidence',
      exact: true,
    })
    .click();
  await expect(readiness).toContainText(
    'Draft, source, policy or calculation changed. Reload readiness; old review cannot carry forward.',
  );
  await expect(readiness).toContainText(
    '0 of 6 sections confirmed for saved revision 2',
  );
  let originalPositiveRejected = false;
  try {
    await expect(readiness).toContainText('1 of 6 sections confirmed');
  } catch {
    originalPositiveRejected = true;
  }
  expect(originalPositiveRejected).toBe(true);
  await page.screenshot({
    path: resolve(artifacts, 'old-snapshot-rejected.png'),
  });
  await readiness.screenshot({
    path: resolve(artifacts, 'old-snapshot-rejected-full.png'),
  });
  await readiness
    .getByRole('button', { name: 'Reload Repair Readiness', exact: true })
    .click();
  await expect(card.getByRole('checkbox')).not.toBeChecked();
  await card
    .getByRole('textbox', { name: /^Scope Review Note/ })
    .fill(
      'Synthetic staff freshly reviewed current-date source, scope and saved evidence.',
    );
  await card.getByRole('checkbox').focus();
  await page.keyboard.press('Space');
  await card
    .getByRole('button', {
      name: 'Confirm Scope & Source Evidence',
      exact: true,
    })
    .click();
  await expect(readiness).toContainText(
    '1 of 6 sections confirmed for saved revision 2',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(artifacts, 'fresh-reload-confirmed.png'),
  });
  await readiness.screenshot({
    path: resolve(artifacts, 'fresh-reload-confirmed-full.png'),
  });
  await writeFile(
    resolve(artifacts, 'boundary-observation.json'),
    JSON.stringify(
      {
        project: info.project.name,
        sourceDate: '2026-11-03',
        currentDate: '2026-11-04',
        sameSavedRevision: 2,
        originalPositiveRejected,
        staleSnapshotRemainedZero: true,
        explicitReloadConfirmed: 1,
        runtimeEdited: false,
      },
      null,
      2,
    ) + '\n',
  );
});
