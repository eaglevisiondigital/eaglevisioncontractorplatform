import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
const dir = resolve('artifacts/cycle28');
mkdirSync(dir, { recursive: true });
const path = '/__cycle28_field_selection__.html',
  document = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><main><h1>Disposable original task source absence</h1><div id="root"></div></main><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{TaskReceiptActions}from'/src/components/workflows/TaskReceiptActions.tsx';import{prepareOperatingSources}from'/src/lib/workflows/operating-center-runtime.ts';import{sampleCompanies}from'/src/domain/platform.ts';
const all=await prepareOperatingSources(sampleCompanies[Number(new URL(location.href).searchParams.get('brand'))],{enabled:true,confirmed:true}),entry=all.entries[0],sources={...all,entries:[entry]},org=sources.company.id,job=entry.target.job_id;
const ids=[];for(const hour of[8,10]){const id=await sources.estimates.recordTime(org,entry.worker_id,{job_id:job,overhead_center:null,task:'Exact native task '+hour,kind:'work',started_at:'2026-10-01T'+String(hour).padStart(2,'0')+':00:00Z',ended_at:'2026-10-01T'+String(hour+1).padStart(2,'0')+':00:00Z',billable:false,corrects_id:null});ids.push(id);}
const root=createRoot(document.getElementById('root'));root.render(React.createElement(TaskReceiptActions,{sources,selectedJobId:job,enabled:true}));
window.__fixture={ids,disappear(){const original=sources.estimates.readSyntheticPrototypeSources.bind(sources.estimates);sources.estimates.readSyntheticPrototypeSources=(...args)=>{const result=original(...args);result.workforce.entries=result.workforce.entries.filter(t=>t.id!==ids[0]);return result;};}};
</script></body></html>`;
const server = await createServer({
  root: process.cwd(),
  cacheDir: resolve(dir, 'vite-field-selection'),
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
      await page.waitForFunction(() => !!window.__fixture);
      const ids = await page.evaluate(() => window.__fixture.ids),
        read = page.getByRole('button', {
          name: 'Read current task continuity',
          exact: true,
        }),
        select = page.getByRole('combobox', { name: /^Exact recorded task/ });
      await read.click();
      await select.selectOption(ids[0]);
      await page.evaluate(() => window.__fixture.disappear());
      await read.click();
      await page
        .getByText('Unavailable exact task · ' + ids[0], { exact: true })
        .waitFor({ state: 'attached' });
      if ((await select.inputValue()) !== ids[0])
        throw Error('Unavailable exact selection substituted');
      if (
        (await page
          .getByRole('button', {
            name: 'Verify original task source',
            exact: true,
          })
          .count()) !== 0
      )
        throw Error('Missing selection exposes correction control');
      await page.screenshot({
        path: resolve(
          dir,
          'field-selection-green-brand' + brand + '-unavailable.png',
        ),
        fullPage: true,
      });
      await select.selectOption(ids[1]);
      await page
        .getByText('INTERNAL_REVIEW_INCOMPLETE', { exact: true })
        .waitFor();
      await page.screenshot({
        path: resolve(
          dir,
          'field-selection-green-brand' + brand + '-explicit.png',
        ),
        fullPage: true,
      });
      results.push({
        brand,
        passed: true,
        missing_selection_retained: true,
        explicit_existing_alternative: true,
        outside: outside.length,
      });
    } catch (e) {
      results.push({
        brand,
        passed: false,
        error: String(e),
        body: await page.locator('body').innerText(),
      });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
writeFileSync(
  resolve(dir, 'field-browser-green.json'),
  JSON.stringify(
    { success: results.every((r) => r.passed && r.outside === 0), results },
    null,
    2,
  ),
);
console.log(results);
if (!results.every((r) => r.passed && r.outside === 0)) process.exitCode = 1;
