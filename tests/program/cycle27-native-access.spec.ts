import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
let server: ViteDevServer, baseUrl: string, cache: string;
function fixture(kind: 'field' | 'growth') {
  const component =
    kind === 'field' ? 'TaskReceiptActions' : 'MaintenanceCancellationActions';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><main><h1>Disposable original native access regression</h1><div id="root"></div></main><script type="module">
import React from 'react'; import { createRoot } from 'react-dom/client';
import { ${component} } from '/src/components/workflows/${component}.tsx';
import { prepareOperatingSources } from '/src/lib/workflows/operating-center-runtime.ts';
import { sampleCompanies } from '/src/domain/platform.ts';
const brand=Number(new URL(location.href).searchParams.get('brand'));
const all=await prepareOperatingSources(sampleCompanies[brand],{enabled:true,confirmed:true});
const entry=all.entries[${kind === 'field' ? 0 : 2}],sources={...all,entries:[entry]},org=sources.company.id,job=entry.target.job_id;
await sources.operations.manageMember(org,org+'-estimator',true,'admin','office_manager');entry.target.actor_id=org+'-estimator';
let id='';
if('${kind}'==='field'){
id=await sources.estimates.recordTime(org,entry.worker_id,{job_id:job,overhead_center:null,task:'Original exact private task',kind:'work',started_at:'2026-10-01T08:00:00Z',ended_at:'2026-10-01T09:00:00Z',billable:false,corrects_id:null});
await sources.estimates.submitTime(org,id); await sources.estimates.reviewTime(org,id,'approved','Private native review');
}
const root=createRoot(document.getElementById('root')),tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const render=()=>root.render(React.createElement(${component},{sources,enabled:true,selectedJobId:job,onContinue:async()=>{}}));
render();await tick();
window.__fixture={id,async revoke(){await sources.operations.manageMember(org,entry.target.actor_id,false,'admin','office_manager');render();await tick();}};
</script></body></html>`;
}
test.beforeAll(async () => {
  execFileSync('git', ['diff', '--exit-code']);
  cache = mkdtempSync(join(tmpdir(), 'propel-cycle27-access-'));
  server = await createServer({
    root: process.cwd(),
    cacheDir: cache,
    appType: 'custom',
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  });
  for (const kind of ['field', 'growth'] as const) {
    const path = '/__cycle27_' + kind + '_access__.html';
    server.middlewares.use(path, async (_request, response, next) => {
      try {
        response.setHeader('Content-Type', 'text/html');
        response.end(await server.transformIndexHtml(path, fixture(kind)));
      } catch (error) {
        next(error);
      }
    });
  }
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string')
    throw Error('Original local server required');
  baseUrl = 'http://127.0.0.1:' + address.port;
});
test.afterAll(async () => {
  await server?.close();
  if (cache) rmSync(cache, { recursive: true, force: true });
});
for (const kind of ['field', 'growth'] as const)
  for (const brand of [0, 1, 2])
    test(`${kind} brand${brand}: native revocation withholds retained private source`, async ({
      page,
    }, info) => {
      const outside: string[] = [];
      page.on('request', (r) => {
        if (new URL(r.url()).origin !== baseUrl) outside.push(r.url());
      });
      await page.goto(
        baseUrl + '/__cycle27_' + kind + '_access__.html?brand=' + brand,
      );
      await page.waitForFunction('Boolean(window.__fixture)');
      let key: string;
      if (kind === 'field') {
        key = await page.evaluate('window.__fixture.id');
        await page
          .getByRole('button', {
            name: 'Read current task continuity',
            exact: true,
          })
          .click();
        await page
          .getByRole('combobox', { name: /^Exact recorded task/ })
          .selectOption(key);
        await page
          .getByRole('button', {
            name: 'Open original task correction controls',
            exact: true,
          })
          .click();
        await expect(
          page.getByText('Original field controls retained for task ' + key, {
            exact: false,
          }),
        ).toBeVisible();
      } else {
        await page
          .getByRole('button', {
            name: 'Read staff cancellation sources',
            exact: true,
          })
          .click();
        const select = page.getByRole('combobox', {
          name: /^Exact cancellation review occurrence/,
        });
        key = (await select.locator('option').nth(1).getAttribute('value'))!;
        expect(key).toBeTruthy();
        await select.selectOption(key);
        await page
          .getByLabel('Proposed staff review date', { exact: true })
          .fill('2026-11-19');
        await page
          .getByRole('button', {
            name: 'Verify selected maintenance requirements',
            exact: true,
          })
          .click();
      }
      await page.screenshot({
        path: info.outputPath('before.png'),
        fullPage: true,
      });
      await page.evaluate('window.__fixture.revoke()');
      await expect
        .poll(async () =>
          (await page.locator('body').innerText()).includes(key),
        )
        .toBe(false);
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: 'Access unavailable.' })
          .first(),
      ).toBeVisible();
      expect(outside).toEqual([]);
      await page.screenshot({
        path: info.outputPath('after.png'),
        fullPage: true,
      });
      info.annotations.push({
        type: 'source_commit',
        description: execFileSync('git', ['rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
      });
    });
