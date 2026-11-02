import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

let script = '';
let componentStyles = '';
test.beforeAll(async () => {
  const bundled = await build({
    configFile: false,
    plugins: [react()],
    define: {
      'import.meta.env': '{}',
      'import.meta.env.DEV': 'true',
      'import.meta.env.VITE_JOB_MARGIN_PREVIEW': '"true"',
      'process.env.NODE_ENV': '"production"',
    },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/job-margin-harness.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'JobMarginTest',
      },
    },
  });
  const output = Array.isArray(bundled) ? bundled[0] : bundled;
  if (!('output' in output)) throw Error('Browser test bundle unavailable');
  const chunk = output.output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk')
    throw Error('Browser test script unavailable');
  script = chunk.code;
  componentStyles = output.output
    .filter((item) => item.type === 'asset' && item.fileName.endsWith('.css'))
    .map((item) => String(item.type === 'asset' ? item.source : ''))
    .join('\n');
});
test('actual isolated margin component is accessible across companies, denies private access and withholds UNKNOWN totals', async ({
  page,
}, info) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (
      new URL(r.url()).origin !==
      new URL(String(info.project.use.baseURL)).origin
    )
      external.push(r.url());
  });
  await page.route('**/preview-job-margin-demo.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local job margin component test</title></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('/preview-job-margin-demo.html');
  await page.addStyleTag({
    content:
      (await readFile('src/styles.css', 'utf8')) + '\n' + componentStyles,
  });
  await page.addScriptTag({ content: script });
  const panel = page.getByRole('region', {
    name: 'Local job margin analysis',
    exact: true,
  });
  for (const [index, company] of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ].entries()) {
    await page.getByLabel('Contractor example').selectOption(String(index));
    await expect(panel).toContainText('Partial cost coverage');
    await expect(panel).toContainText(
      'Approved time is not in locked labor costs',
    );
    await expect(panel.getByRole('table')).toBeVisible();
    expect(await panel.locator('tbody tr').count()).toBe(5);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/finance', { recursive: true });
    await page.screenshot({
      path: `artifacts/finance/job-margin-${info.project.name}-${company}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Use field identity' }).click();
    await expect(panel.getByRole('alert')).toContainText('eligible');
    await expect(panel.getByRole('table')).toHaveCount(0);
    await expect(
      panel.getByText('Projected contribution', { exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Use estimator identity' }).click();
    await expect(panel.getByRole('alert')).toContainText('eligible');
    await page.getByRole('button', { name: 'Use owner identity' }).click();
    await expect(panel.getByRole('table')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Toggle missing exact job' }).click();
  await expect(panel).toContainText('UNKNOWN — totals withheld');
  await expect(panel.getByRole('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle default-off reader' }).click();
  await expect(panel.getByRole('alert')).toContainText('disabled');
  expect(external).toEqual([]);
});

test('source-bound warnings and explicitly confirmed local margin review stay scoped across contractor and role changes', async ({
  page,
}, info) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (
      new URL(r.url()).origin !==
      new URL(String(info.project.use.baseURL)).origin
    )
      external.push(r.url());
  });
  await page.route('**/preview-job-margin-demo.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Source-bound margin review test</title></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('/preview-job-margin-demo.html');
  await page.addStyleTag({
    content:
      (await readFile('src/styles.css', 'utf8')) + '\n' + componentStyles,
  });
  await page.addScriptTag({ content: script });
  const panel = page.getByRole('region', {
      name: 'Local job margin analysis',
      exact: true,
    }),
    warnings = panel.getByRole('region', {
      name: 'Source-bound cost and margin warnings',
    }),
    input = panel.getByLabel('Minimum projected margin (%)'),
    confirm = panel.getByRole('checkbox', {
      name: /I confirm this percentage/,
    }),
    apply = panel.getByRole('button', { name: 'Review margin threshold' });
  for (const [index, company] of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ].entries()) {
    await page.getByLabel('Contractor example').selectOption(String(index));
    await expect(warnings).toContainText(
      'No local minimum-margin review input has been applied',
    );
    await expect(input).toHaveValue('');
    await expect(apply).toBeDisabled();
    await input.fill('100.01');
    await confirm.check();
    await apply.click();
    await expect(panel.getByRole('alert')).toContainText(
      'percentage from 0 to 100',
    );
    await expect(warnings).toContainText(
      'No local minimum-margin review input has been applied',
    );
    await input.fill('99.99');
    await expect(confirm).not.toBeChecked();
    await confirm.focus();
    await page.keyboard.press('Space');
    await apply.focus();
    await page.keyboard.press('Enter');
    await expect(warnings).toContainText(
      'Confirmed local review input: 99.99%',
    );
    await expect(warnings).toContainText(
      'Warning: projected margin is below this input',
    );
    await expect(warnings).toContainText('Coverage remains PARTIAL');
    await expect(warnings).toContainText('not final profitability');
    await page
      .getByRole('button', { name: 'Prepare synthetic cost-risk example' })
      .click();
    await expect(warnings).toContainText(
      'Warning: projected contribution is negative',
    );
    await expect(warnings).toContainText(
      'materials — projected cost exceeds budget and the saved overrun threshold',
    );
    await expect(warnings).toContainText(
      'projected margin erosion exceeds the saved threshold',
    );
    // A saved source revision change clears the prior review input; it is never a saved company policy.
    await expect(input).toHaveValue('');
    await expect(warnings).toContainText(
      'No local minimum-margin review input has been applied',
    );
    await input.fill('25.50');
    await confirm.check();
    await apply.click();
    await expect(warnings).toContainText(
      'Confirmed local review input: 25.50%',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/finance', { recursive: true });
    await page.screenshot({
      path: `artifacts/finance/job-margin-warnings-${info.project.name}-${company}.png`,
      fullPage: true,
    });
    await input.fill('30');
    await expect(warnings).toContainText(
      'No local minimum-margin review input has been applied',
    );
    await expect(confirm).not.toBeChecked();
    await page.getByRole('button', { name: 'Use field identity' }).click();
    await expect(panel.getByRole('alert')).toContainText('eligible');
    await expect(warnings).toHaveCount(0);
    await expect(panel.getByRole('table')).toHaveCount(0);
    await page.getByRole('button', { name: 'Use owner identity' }).click();
    await expect(warnings).toContainText(
      'No local minimum-margin review input has been applied',
    );
    await input.fill('25');
    await confirm.check();
    await apply.click();
    await expect(warnings).toContainText(
      'Confirmed local review input: 25.00%',
    );
    await panel.getByRole('button', { name: 'Clear review input' }).click();
    await expect(warnings).toContainText(
      'No local minimum-margin review input has been applied',
    );
  }
  expect(external).toEqual([]);
});

test('explicit cost-to-complete review preserves actual source provenance, UNKNOWNs and late-read isolation', async ({
  page,
}, info) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).origin !==
      new URL(String(info.project.use.baseURL)).origin
    )
      external.push(request.url());
  });
  await page.route('**/preview-job-margin-demo.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local cost completion review</title></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('/preview-job-margin-demo.html');
  await page.addStyleTag({
    content:
      (await readFile('src/styles.css', 'utf8')) + '\n' + componentStyles,
  });
  await page.addScriptTag({ content: script });
  const panel = page.getByRole('region', {
      name: 'Cost-to-complete review',
      exact: true,
    }),
    checkbox = panel.getByRole('checkbox'),
    review = panel.getByRole('button', {
      name: 'Review exact cost to complete',
    }),
    evidence = panel.getByRole('region', {
      name: 'Exact cost completion evidence',
    });
  for (const [index, company] of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ].entries()) {
    await page.getByLabel('Contractor example').selectOption(String(index));
    await expect(review).toBeDisabled();
    await expect(evidence).toHaveCount(0);
    await page
      .getByRole('button', {
        name: 'Prepare synthetic commitment and credit example',
      })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Prepare synthetic commitment and credit example',
      }),
    ).toBeEnabled();
    await checkbox.focus();
    await page.keyboard.press('Space');
    await review.focus();
    await page.keyboard.press('Enter');
    await expect(evidence).toContainText(
      'PARTIAL — remaining costs and coverage need review',
    );
    await expect(evidence).toContainText(
      'Cost to complete: commitments + forecast',
    );
    await expect(evidence).toContainText(
      'Void: UNKNOWN · Refund: UNKNOWN · Settlement: UNKNOWN',
    );
    await expect(evidence).toBeFocused();
    const credit = evidence
      .locator('details')
      .filter({ has: page.locator('summary').filter({ hasText: 'credit' }) });
    await credit.locator('summary').click();
    await expect(credit).toContainText('Exact original expense adjustment');
    await expect(credit).toContainText(
      'Internal approved-cost adjustment; no provider refund or void evidence',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/finance', { recursive: true });
    await page.screenshot({
      path: `artifacts/finance/job-cost-completion-${info.project.name}-${company}.png`,
      fullPage: true,
    });
    await panel.screenshot({
      path: `artifacts/finance/job-cost-completion-detail-${info.project.name}-${company}.png`,
    });
    await checkbox.uncheck();
    await expect(evidence).toHaveCount(0);
    await expect(review).toBeDisabled();
    await page
      .getByRole('button', { name: 'Pause next job-source read' })
      .click();
    await checkbox.check();
    await review.click();
    await expect(panel).toContainText('Reading exact job cost evidence');
    await checkbox.uncheck();
    await page
      .getByRole('button', { name: 'Release paused source reads' })
      .click();
    await expect(evidence).toHaveCount(0);
    await expect(review).toBeDisabled();
  }
  await page
    .getByRole('button', { name: 'Pause next job-source read' })
    .click();
  await checkbox.check();
  await review.click();
  await page.getByLabel('Contractor example').selectOption('0');
  await page
    .getByRole('button', { name: 'Release paused source reads' })
    .click();
  await expect(evidence).toHaveCount(0);
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await page.getByRole('button', { name: 'Use field identity' }).click();
  await expect(evidence).toHaveCount(0);
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await review.click();
  await expect(panel.getByRole('alert')).toContainText('eligible');
  await page.getByRole('button', { name: 'Use owner identity' }).click();
  await page.getByRole('button', { name: 'Toggle missing exact job' }).click();
  await checkbox.check();
  await review.click();
  await expect(evidence).toContainText(
    'UNKNOWN — cost-to-complete totals withheld',
  );
  await expect(
    evidence.getByText('Projected total: recorded + cost to complete', {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle default-off reader' }).click();
  await checkbox.check();
  await review.click();
  await expect(panel.getByRole('alert')).toContainText('disabled');
  await page
    .getByRole('button', { name: 'Toggle cost completion extension' })
    .click();
  await expect(panel).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Toggle cost completion extension' })
    .click();
  await expect(checkbox).not.toBeChecked();
  await expect(evidence).toHaveCount(0);
  expect(external).toEqual([]);
});
