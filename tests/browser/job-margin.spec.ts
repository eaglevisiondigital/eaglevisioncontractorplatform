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
    if (!r.url().startsWith('http://127.0.0.1:4173/')) external.push(r.url());
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
