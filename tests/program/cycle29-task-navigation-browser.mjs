import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
const dir = resolve('artifacts/cycle29/field'),
  phase = process.argv[2] || 'green';
mkdirSync(dir, { recursive: true });
const path = '/__cycle29_task_navigation__.html',
  document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Disposable original task navigation</title></head><body><main><h1>Original task navigation</h1><h2>Exact-source local review</h2><div id="root"></div></main><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{TaskReceiptActions}from'/src/components/workflows/TaskReceiptActions.tsx';import{prepareOperatingSources}from'/src/lib/workflows/operating-center-runtime.ts';import{readTaskCorrectionReview,saveTaskCorrectionReview}from'/src/lib/workflows/task-correction-review.ts';import{sampleCompanies}from'/src/domain/platform.ts';
const brand=Number(new URL(location.href).searchParams.get('brand')),gate={enabled:true,confirmed:true},all=await prepareOperatingSources(sampleCompanies[brand],gate),entry=all.entries[0],sources={...all,entries:[entry]},org=sources.company.id,job=entry.target.job_id,actor=org+'-estimator';await sources.operations.manageMember(org,actor,true,'admin','office_manager');entry.target.actor_id=actor;const id=await sources.estimates.recordTime(org,entry.worker_id,{job_id:job,overhead_center:null,task:'Exact original technician task',kind:'work',started_at:'2026-10-01T08:00:00Z',ended_at:'2026-10-01T09:00:00Z',billable:false,corrects_id:null});await sources.estimates.submitTime(org,id);await sources.estimates.reviewTime(org,id,'approved','Private review');const original=await readTaskCorrectionReview(sources,job,gate,id),input={source_entry_id:id,task:'Explicit confirmed correction',started_at:original.source.started_at,ended_at:original.source.ended_at,billable:true},root=createRoot(document.getElementById('root'));window.__writes=0;window.__continue=0;window.__id=id;window.__loseAck=async()=>{const native=sources.estimates.recordTime.bind(sources.estimates);sources.estimates.recordTime=async()=>{window.__writes++;throw Error('Lost original ACK');};try{await saveTaskCorrectionReview(original,input,true);}catch{}finally{sources.estimates.recordTime=(...args)=>{window.__writes++;return native(...args);};}};const render=()=>root.render(React.createElement(TaskReceiptActions,{sources,selectedJobId:job,enabled:true,onContinue:async()=>{window.__continue++;}}));window.__revoke=async()=>{await sources.operations.manageMember(org,actor,false,'admin','office_manager');render();};render();document.body.style.setProperty('--journey-primary',sources.company.primary_color);document.body.style.setProperty('--journey-accent',sources.company.accent_color);window.__ready=true;
</script></body></html>`;
const server = await createServer({
  root: process.cwd(),
  cacheDir: resolve(dir, 'vite'),
  appType: 'custom',
  logLevel: 'silent',
  server: { host: '127.0.0.1', port: 0 },
});
server.middlewares.use(path, async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/html');
    res.end(await server.transformIndexHtml(path, document));
  } catch (error) {
    next(error);
  }
});
let browser;
const results = [],
  sizes = [
    ['desktop', 1365, 900],
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
  ];
try {
  await server.listen();
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch();
  for (const brand of [0, 1, 2])
    for (const [viewport, width, height] of sizes) {
      const context = await browser.newContext({ viewport: { width, height } }),
        page = await context.newPage(),
        outside = [];
      page.setDefaultTimeout(15000);
      page.on('request', (request) => {
        if (new URL(request.url()).origin !== origin)
          outside.push(request.url());
      });
      try {
        await page.goto(origin + path + '?brand=' + brand);
        await page.waitForFunction(() => window.__ready);
        const read = page.getByRole('button', {
            name: 'Read current task continuity',
            exact: true,
          }),
          select = page.getByRole('combobox', {
            name: 'Exact recorded task',
            exact: true,
          }),
          open = page.getByRole('button', {
            name: 'Open original task correction controls',
            exact: true,
          }),
          verify = page.getByRole('button', {
            name: 'Verify original task source',
            exact: true,
          }),
          reconcile = page.getByRole('button', {
            name: 'Reconcile original task receipt',
            exact: true,
          }),
          id = await page.evaluate(() => window.__id);
        await read.click();
        await select.selectOption(id);
        if (!(await open.isEnabled()))
          throw Error('Eligible original-control navigation removed');
        await page.evaluate(() => window.__loseAck());
        await read.click();
        if ((await select.inputValue()) !== id)
          throw Error('Exact task selection lost after explicit reread');
        if (!(await open.isDisabled()))
          throw Error('UNKNOWN original custody offers unsupported navigation');
        await verify.click();
        await reconcile.click();
        await page.getByText('Custody: UNKNOWN', { exact: false }).waitFor();
        if (!(await open.isDisabled()))
          throw Error('Read-only reconciliation revived control navigation');
        if (
          !(await page.evaluate(
            () => window.__writes === 1 && window.__continue === 0,
          ))
        )
          throw Error(
            'Held control or read-only action invoked a writer or navigation',
          );
        const axe = await new AxeBuilder({ page })
          .include('[aria-label="Original task receipt actions"]')
          .analyze();
        if (axe.violations.length)
          throw Error(
            'Accessibility violations: ' +
              axe.violations.map((v) => v.id).join(','),
          );
        if (
          !(await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ))
        )
          throw Error('Page overflow');
        await page.screenshot({
          path: resolve(dir, `${phase}-${brand}-${viewport}.png`),
          fullPage: true,
        });
        await page.evaluate(() => window.__revoke());
        await page
          .getByText(
            'Access unavailable. Retained private receipt detail is withheld',
            { exact: false },
          )
          .waitFor();
        if ((await page.locator('body').innerText()).includes(id))
          throw Error('Revoked staff retained private task identity');
        results.push({
          brand,
          viewport,
          passed: true,
          unknown_held: true,
          source_retained: true,
          revoked_identity_withheld: true,
          writer_invocations: 1,
          outside: outside.length,
        });
      } catch (error) {
        results.push({
          brand,
          viewport,
          passed: false,
          error: String(error),
          outside: outside.length,
        });
      } finally {
        await context.close();
      }
    }
} finally {
  await browser?.close();
  await server.close();
}
const success =
  results.length === 9 &&
  results.every((row) => row.passed && row.outside === 0);
writeFileSync(
  resolve(dir, phase + '.json'),
  JSON.stringify({ success, results }, null, 2),
);
console.log(JSON.stringify({ success, results }));
if (!success) process.exitCode = 1;
