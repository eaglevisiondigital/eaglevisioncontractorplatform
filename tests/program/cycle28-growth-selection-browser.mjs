import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
const dir = resolve('artifacts/cycle28'),
  phase = process.argv[2] || 'red';
mkdirSync(dir, { recursive: true });
const path = '/__cycle28_growth_selection__.html',
  document = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><main><h1>Disposable native maintenance selection</h1><div id="root"></div></main><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MaintenanceCancellationActions}from'/src/components/workflows/MaintenanceCancellationActions.tsx';import{prepareOperatingSources}from'/src/lib/workflows/operating-center-runtime.ts';import{sampleCompanies}from'/src/domain/platform.ts';
const brand=Number(new URL(location.href).searchParams.get('brand')),all=await prepareOperatingSources(sampleCompanies[brand],{enabled:true,confirmed:true}),entry=all.entries[2],sources={...all,entries:[entry]},root=createRoot(document.getElementById('root'));root.render(React.createElement(MaintenanceCancellationActions,{sources,selectedJobId:entry.target.job_id,enabled:true}));window.__ready=true;
</script></body></html>`;
const server = await createServer({
  root: process.cwd(),
  cacheDir: resolve(dir, 'vite-growth-selection'),
  appType: 'custom',
  logLevel: 'silent',
  server: { host: '127.0.0.1', port: 0 },
});
server.middlewares.use(path, async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/html');
    res.end(await server.transformIndexHtml(path, document));
  } catch (e) {
    next(e);
  }
});
let browser,
  results = [];
try {
  await server.listen();
  const url = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch();
  for (const brand of [0, 1, 2]) {
    const page = await browser.newPage({
        viewport: { width: 1365, height: 900 },
      }),
      outside = [];
    page.setDefaultTimeout(15000);
    page.on('request', (r) => {
      if (new URL(r.url()).origin !== url) outside.push(r.url());
    });
    try {
      await page.goto(url + path + '?brand=' + brand);
      await page.waitForFunction(() => window.__ready);
      const read = page.getByRole('button', {
        name: 'Read staff cancellation sources',
        exact: true,
      });
      await read.click();
      const occurrence = page.getByRole('combobox', {
          name: /^Exact cancellation review occurrence/,
        }),
        purpose = page.getByRole('combobox', {
          name: /^Requested staff review purpose/,
        }),
        first = await occurrence.locator('option').nth(1).getAttribute('value'),
        second = await occurrence
          .locator('option')
          .nth(2)
          .getAttribute('value');
      await occurrence.selectOption(first);
      await page.screenshot({
        path: resolve(
          dir,
          'growth-selection-' + phase + '-brand' + brand + '-chosen.png',
        ),
        fullPage: true,
      });
      const enabled =
        (await occurrence.isEnabled()) && (await purpose.isEnabled());
      if (!enabled) {
        results.push({
          brand,
          phase,
          passed: false,
          pre_admission_selects_enabled: false,
          outside: outside.length,
        });
        continue;
      }
      await occurrence.selectOption(second);
      if (!(await page.locator('body').innerText()).includes(second))
        throw Error('Exact explicit second occurrence not retained');
      await purpose.selectOption('marketing');
      if ((await page.locator('body').innerText()).includes('Exact source:'))
        throw Error(
          'Prior selected source retained across explicit purpose change',
        );
      await read.click();
      await occurrence.selectOption(second);
      await page
        .getByRole('button', {
          name: 'Verify selected maintenance requirements',
          exact: true,
        })
        .click();
      await page.getByRole('checkbox').check();
      await page
        .getByRole('button', {
          name: 'Prepare blocked staff review',
          exact: true,
        })
        .click();
      await page
        .getByText('BLOCKED_LOCAL_REVIEW · marketing', { exact: false })
        .waitFor();
      if (
        (await purpose.isEnabled()) ||
        (await occurrence.isEnabled()) ||
        (await read.isEnabled())
      )
        throw Error('Original attempted hold was reset by selection controls');
      await page.screenshot({
        path: resolve(
          dir,
          'growth-selection-' + phase + '-brand' + brand + '-held.png',
        ),
        fullPage: true,
      });
      results.push({
        brand,
        phase,
        passed: true,
        explicit_source_and_purpose: true,
        original_hold_retained: true,
        outside: outside.length,
      });
    } catch (e) {
      results.push({ brand, phase, passed: false, error: String(e) });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
writeFileSync(
  resolve(dir, 'growth-browser-' + phase + '.json'),
  JSON.stringify(
    { success: results.every((r) => r.passed && r.outside === 0), results },
    null,
    2,
  ),
);
console.log(results);
if (!results.every((r) => r.passed && r.outside === 0)) process.exitCode = 1;
