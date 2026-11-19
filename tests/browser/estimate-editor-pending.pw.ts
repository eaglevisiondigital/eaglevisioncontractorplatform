import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
let script = '',
  css = '';
test.beforeAll(async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/estimate-editor-pending.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'EstimateEditorPendingTest',
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result))
    throw Error('Existing-engine fixture bundle required');
  script = result.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  css = result.output
    .filter((x) => x.type === 'asset' && x.fileName.endsWith('.css'))
    .map((x) => (x.type === 'asset' ? String(x.source) : ''))
    .join('\n');
});
const state = (page: Page) =>
  page.evaluate(() => window.estimateEditorReview.snapshot());
const back = (page: Page) =>
  page.getByRole('button', { name: 'All estimates', exact: true });
const save = (page: Page) =>
  page.getByRole('button', { name: 'Save estimate draft', exact: true });
const baseline = (page: Page) =>
  page.getByRole('button', { name: 'Approve job baseline', exact: true });
async function open(page: Page, issued = false, canIssue = false) {
  await page.route('**/*', (route) => route.abort());
  await page.route('https://estimate-editor.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Estimate editor</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto(
    `https://estimate-editor.test/fixture?mode=${issued ? 'issued' : 'draft'}&canIssue=${canIssue ? 'yes' : 'no'}`,
  );
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.locator('.estimate-list-row')).toHaveCount(2);
  const initial = await state(page);
  await page
    .locator('.estimate-list-row')
    .filter({ hasText: initial.target.number })
    .click();
  await expect(page.locator('.estimate-editor')).toBeVisible();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(
    initial.saved.name,
  );
  return initial;
}
test('saving holds the editor and commits one exact draft before returning to the list', async ({
  page,
}, info) => {
  const initial = await open(page);
  const name = page.getByLabel('Project name', { exact: true });
  await name.fill('Reviewed roof scope');
  await save(page).click();
  await expect.poll(async () => (await state(page)).waiting).toBe('save');
  await expect(back(page)).toBeDisabled();
  await expect(name).toBeDisabled();
  await expect(save(page)).toBeDisabled();
  await expect(page.locator('.estimate-editor')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await expect(
    page.getByRole('status').filter({ hasText: /^Updating estimate…$/ }),
  ).toBeVisible();
  expect((await state(page)).saved).toEqual(initial.saved);
  expect(await state(page)).toMatchObject({
    saveCalls: 1,
    jobCalls: 0,
    otherWrites: 0,
  });
  await page.screenshot({
    path: info.outputPath('draft-save-pending.png'),
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => window.estimateEditorReview.release());
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue('Reviewed roof scope');
  const saved = await state(page);
  expect(saved.saved).toEqual({
    name: 'Reviewed roof scope',
    lock: initial.saved.lock + 1,
    status: 'draft',
  });
  expect(saved.target).toEqual(initial.target);
  expect(saved).toMatchObject({
    saveCalls: 1,
    jobCalls: 0,
    otherWrites: 0,
    waiting: null,
  });
  await expect(back(page)).toBeEnabled();
  await back(page).click();
  await expect(page.locator('.estimate-editor')).toHaveCount(0);
  await expect(
    page
      .locator('.estimate-list-row')
      .filter({ hasText: initial.target.number }),
  ).toContainText('Reviewed roof scope');
  await page.screenshot({
    path: info.outputPath('saved-draft-list.png'),
    fullPage: true,
  });
});
test('declined save retains the unsaved working scope without changing the stored draft or replaying', async ({
  page,
}, info) => {
  const initial = await open(page);
  const name = page.getByLabel('Project name', { exact: true });
  await name.fill('Unsaved roof scope');
  await save(page).click();
  await expect.poll(async () => (await state(page)).waiting).toBe('save');
  await page.evaluate(() => window.estimateEditorReview.release(true));
  await expect(
    page.getByRole('status').filter({ hasText: /^Fixture update declined$/ }),
  ).toBeVisible();
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue('Unsaved roof scope');
  await expect(page.locator('.estimate-editor > .section-title p')).toHaveText(
    'Private working draft · USD · Unsaved changes',
  );
  await expect(page.locator('.estimate-editor')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  expect((await state(page)).saved).toEqual(initial.saved);
  expect(await state(page)).toMatchObject({
    saveCalls: 1,
    jobCalls: 0,
    otherWrites: 0,
    waiting: null,
  });
  await page.screenshot({
    path: info.outputPath('draft-save-declined.png'),
    fullPage: true,
  });
  await back(page).click();
  await expect(page.locator('.estimate-list-row')).toHaveCount(2);
  expect((await state(page)).saved).toEqual(initial.saved);
  expect((await state(page)).saveCalls).toBe(1);
});
test('issued scope captures one internal job baseline while pending controls reject a second click', async ({
  page,
}, info) => {
  const initial = await open(page, true, true);
  await baseline(page).click();
  await expect.poll(async () => (await state(page)).waiting).toBe('job');
  await expect(baseline(page)).toBeDisabled();
  await expect(back(page)).toBeDisabled();
  const box = await baseline(page).boundingBox();
  if (!box) throw Error('Visible baseline control required');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await state(page)).toMatchObject({
    saveCalls: 0,
    jobCalls: 1,
    otherWrites: 0,
  });
  expect((await state(page)).jobs).toEqual(initial.jobs);
  await page.screenshot({
    path: info.outputPath('job-baseline-pending.png'),
    fullPage: true,
  });
  await page.evaluate(() => window.estimateEditorReview.release());
  await expect(
    page.getByRole('status').filter({
      hasText: /^Job baseline captured · open Jobs to track costs$/,
    }),
  ).toBeVisible();
  const done = await state(page);
  expect(done.jobs).toHaveLength(initial.jobs.length + 1);
  expect(
    done.jobs.filter((job) => job.version === initial.target.version),
  ).toHaveLength(1);
  expect(done.saved).toEqual(initial.saved);
  expect(done).toMatchObject({
    saveCalls: 0,
    jobCalls: 1,
    otherWrites: 0,
    waiting: null,
  });
  await expect(back(page)).toBeEnabled();
  await page.screenshot({
    path: info.outputPath('job-baseline-captured.png'),
    fullPage: true,
  });
});
test('the existing permission projection does not offer job approval for a read-only issued view', async ({
  page,
}) => {
  const initial = await open(page, true, false);
  await expect(baseline(page)).toHaveCount(0);
  await expect(save(page)).toHaveCount(0);
  await expect(page.getByLabel('Project name', { exact: true })).toBeDisabled();
  await expect(page.locator('.estimate-editor > .section-title p')).toHaveText(
    `Immutable snapshot · USD · Saved revision ${initial.saved.lock}`,
  );
  await back(page).click();
  await expect(page.locator('.estimate-list-row')).toHaveCount(2);
  const done = await state(page);
  expect(done.jobs).toEqual(initial.jobs);
  expect(done.saved).toEqual(initial.saved);
  expect(done).toMatchObject({ saveCalls: 0, jobCalls: 0, otherWrites: 0 });
});
