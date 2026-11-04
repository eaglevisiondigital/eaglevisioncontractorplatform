import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Finance source facts</title></head><body><main><div id="root"></div></main><script type="module">
import React from 'react'; import { createRoot } from 'react-dom/client';
import { prepareCorrectionPreviewSources } from '/src/lib/workflows/correction-preview-sources.ts';
import { readRecordedCostRequirements } from '/src/lib/workflows/recorded-cost-requirements.ts';
import { validateCostCoverageAction } from '/src/lib/workflows/cost-coverage-actions.ts';
import { sampleCompanies } from '/src/domain/platform.ts';
import { CostCoverageActions } from '/src/components/workflows/CostCoverageActions.tsx';
const brand=Number(new URL(location.href).searchParams.get('brand')); const gate={enabled:true,confirmed:true}; const all=await prepareCorrectionPreviewSources(sampleCompanies[brand],gate); const entry=all.entries[2]; const sources={...all,entries:[entry]};
window.financeExpected=async(value)=>{const view=await readRecordedCostRequirements(sources,entry.target.job_id,gate);const row=view.original.rows.find(r=>r.key===value);const validation=validateCostCoverageAction(view,{kind:row.kind,id:row.id,expected_job_revision:view.original.original.costs.evidence.job_revision,purpose:'cost_review'});return {facts:[...validation.source.facts],job:entry.target.job_id,id:row.id,brand:sampleCompanies[brand].slug};};
createRoot(document.getElementById('root')).render(React.createElement(CostCoverageActions,{sources,selectedJobId:entry.target.job_id,enabled:true,onContinue:()=>{}}));
</script></body></html>`;
let server, browser;
const results = [];
mkdirSync('artifacts/cycle28/screenshots', { recursive: true });
try {
  server = await createServer({
    root: process.cwd(),
    appType: 'custom',
    logLevel: 'silent',
    cacheDir: process.cwd() + '/artifacts/cycle28/vite-cache',
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use('/__finance28__.html', async (_req, res, next) => {
    try {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/__finance28__.html', document));
    } catch (e) {
      next(e);
    }
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const brand of [0, 1, 2])
    for (const [size, viewport] of process.env.CYCLE28_FULL
      ? [
          ['desktop', { width: 1440, height: 1000 }],
          ['tablet', { width: 834, height: 1112 }],
          ['mobile', { width: 390, height: 844 }],
        ]
      : [['desktop', { width: 1440, height: 1000 }]]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [],
        outside = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('request', (r) => {
        if (!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
          outside.push(r.url());
      });
      await page.goto(
        'http://127.0.0.1:' +
          server.httpServer.address().port +
          '/__finance28__.html?brand=' +
          brand,
      );
      await page
        .getByRole('button', {
          name: 'Load original cost action sources',
          exact: true,
        })
        .click();
      const select = page.getByLabel('Exact recorded cost action source', {
        exact: true,
      });
      await select.waitFor();
      const value = await select
        .locator('option')
        .filter({ hasText: 'time ·' })
        .first()
        .getAttribute('value');
      const expected = await page.evaluate(
        (value) => window.financeExpected(value),
        value,
      );
      await select.selectOption(value);
      await page
        .getByRole('button', {
          name: 'Verify selected cost action',
          exact: true,
        })
        .click();
      await page
        .getByRole('checkbox', { name: /Open only this exact original review/ })
        .waitFor();
      const root = page.getByRole('region', {
        name: 'Cost action requirements',
        exact: true,
      });
      const facts = root.getByRole('list', {
        name: 'Exact selected source facts',
        exact: true,
      });
      const visible = (await facts.count()) === 1 && expected.facts.length > 0;
      const actual = visible ? await facts.innerText() : '';
      const allFacts = expected.facts.every((f) => actual.includes(f));
      let axe = [];
      if (process.env.CYCLE28_FULL)
        axe = (
          await new AxeBuilder({ page })
            .include('.cost-coverage-actions')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations;
      await root.screenshot({
        path: `artifacts/cycle28/screenshots/finance-${brand}-${size}.png`,
      });
      results.push({
        brand,
        size,
        expected,
        facts_visible: visible,
        exact_native_facts_visible: allFacts,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        axe: axe.map((x) => x.id),
        outside,
        errors,
      });
      await context.close();
    }
  writeFileSync(
    process.env.CYCLE28_BROWSER_RESULT ??
      'artifacts/cycle28/finance-browser-original.json',
    JSON.stringify(results, null, 2) + '\n',
  );
  if (
    results.some(
      (x) =>
        !x.exact_native_facts_visible ||
        x.overflow ||
        x.axe.length ||
        x.outside.length ||
        x.errors.length,
    )
  )
    process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
