import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
const dir = resolve('artifacts/cycle29/growth'),
  phase = process.argv[2] || 'red';
mkdirSync(dir, { recursive: true });
const path = '/__cycle29_maintenance_clear__.html',
  document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Disposable maintenance source selection</title></head><body><main><h1>Maintenance source selection</h1><h2>Exact-source local review</h2><div id="root"></div></main><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MaintenanceCancellationActions}from'/src/components/workflows/MaintenanceCancellationActions.tsx';import{prepareOperatingSources}from'/src/lib/workflows/operating-center-runtime.ts';import{sampleCompanies}from'/src/domain/platform.ts';
const brand=Number(new URL(location.href).searchParams.get('brand')),all=await prepareOperatingSources(sampleCompanies[brand],{enabled:true,confirmed:true}),entry=all.entries[2],sources={...all,entries:[entry]},org=sources.company.id,root=createRoot(document.getElementById('root'));window.__writes=0;for(const[o,k]of[[sources.property,'savePlan'],[sources.operations,'recordConsent']]){const native=o[k].bind(o);o[k]=(...args)=>{window.__writes++;return native(...args);};}window.__before=JSON.stringify(sources.property.read(org));window.__sourceUnchanged=()=>window.__before===JSON.stringify(sources.property.read(org));root.render(React.createElement(MaintenanceCancellationActions,{sources,selectedJobId:entry.target.job_id,enabled:true}));document.body.style.setProperty('--journey-primary',sources.company.primary_color);document.body.style.setProperty('--journey-accent',sources.company.accent_color);window.__ready=true;
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
            name: 'Read staff cancellation sources',
            exact: true,
          }),
          purpose = page.getByRole('combobox', {
            name: /^Requested staff review purpose/,
          }),
          select = page.getByRole('combobox', {
            name: /^Exact cancellation review occurrence/,
          });
        await read.click();
        const exact = await select
          .locator('option')
          .nth(1)
          .getAttribute('value');
        await select.selectOption(exact);
        await page
          .getByRole('button', {
            name: 'Verify selected maintenance requirements',
            exact: true,
          })
          .click();
        await page.getByRole('checkbox').check();
        await select.selectOption('');
        if (
          (await select.inputValue()) !== '' ||
          (await page.getByText('Exact source:', { exact: false }).count()) !==
            0
        )
          throw Error(
            'Explicit empty selection retained the previous exact maintenance source',
          );
        if (
          (await page.getByRole('checkbox').count()) !== 0 ||
          (await page
            .getByRole('button', {
              name: 'Prepare blocked staff review',
              exact: true,
            })
            .count()) !== 0
        )
          throw Error(
            'Cleared selection retained confirmation or preparation controls',
          );
        await read.click();
        if ((await select.inputValue()) !== '')
          throw Error('Reread silently reselected cleared occurrence');
        await select.selectOption(exact);
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
          .getByText('BLOCKED_LOCAL_REVIEW · recurring_maintenance', {
            exact: false,
          })
          .waitFor();
        if (
          (await select.isEnabled()) ||
          (await purpose.isEnabled()) ||
          (await read.isEnabled())
        )
          throw Error('Original attempted hold became clearable');
        if (
          !(await page.evaluate(
            () => window.__sourceUnchanged() && window.__writes === 0,
          ))
        )
          throw Error(
            'Selection or blocked staff review changed native business state',
          );
        const axe = await new AxeBuilder({ page })
          .include('[aria-label="Maintenance staff review actions"]')
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
        results.push({
          brand,
          viewport,
          passed: true,
          explicit_clear: true,
          held_after_attempt: true,
          native_writes: 0,
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
