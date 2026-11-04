import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let server: ViteDevServer;
let baseUrl: string;
let cache: string;
const pagePath = '/__cycle29_report_access__.html';

// A transient local test document imports the actual React/workbench/native
// preparer. No product route, fixture command, source replacement or writer.
const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><main><h1>Disposable original request access regression</h1><div id="root"></div></main><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ServiceRequestActions } from '/src/components/workflows/ServiceRequestActions.tsx';
import { prepareOperatingSources } from '/src/lib/workflows/operating-center-runtime.ts';
import { sampleCompanies } from '/src/domain/platform.ts';
const brand=Number(new URL(location.href).searchParams.get('brand') ?? 0);
const sources=await prepareOperatingSources(sampleCompanies[brand],{enabled:true,confirmed:true});
const entry=sources.entries[0],job=entry.target.job_id;
// Native synthetic control-plane API: keep an existing second owner before
// revoking this original actor. No monkeypatched member reader or hosted Auth.
await sources.operations.configure(sources.company.id,'active','synthetic',{},sources.company.id+'-field');
const root=createRoot(document.getElementById('root'));
const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const render=()=>root.render(React.createElement(ServiceRequestActions,{sources,selectedJobId:job,enabled:true}));
render();await tick();
window.__cycle29Report={job,async revoke(){await sources.operations.revokeOwner(sources.company.id,entry.target.actor_id);render();await tick();},dispose(){root.unmount();}};
</script></body></html>`;

test.beforeAll(async () => {
  cache = mkdtempSync(join(tmpdir(), 'propel-cycle29-report-vite-'));
  server = await createServer({
    root: process.cwd(),
    cacheDir: cache,
    appType: 'custom',
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(pagePath, async (_request, response, next) => {
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml(pagePath, document));
    } catch (error) {
      next(error);
    }
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string')
    throw Error('Bounded original local test server required');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await server?.close();
  if (cache) rmSync(cache, { recursive: true, force: true });
});

for (const brand of [0, 1, 2])
  test(`brand ${brand}: exact published report inspection focuses its committed report rather than the intake overview`, async ({
    page,
  }) => {
    await page.goto(baseUrl + pagePath + '?brand=' + brand);
    await expect
      .poll(() => page.evaluate('Boolean(window.__cycle29Report)'))
      .toBe(true);
    const load = page.getByRole('button', {
      name: 'Load exact service request',
      exact: true,
    });
    await load.focus();
    await page.keyboard.press('Enter');
    const heading = page.getByRole('heading', {
      name: 'Original intake review',
      exact: true,
    });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(
      page.getByText(
        'Request → selected job: UNKNOWN — no recorded foreign key.',
        { exact: false },
      ),
    ).toBeVisible();
    const inspect = page
      .getByRole('button', {
        name: 'Inspect original published evidence: version',
        exact: false,
      })
      .first();
    await inspect.focus();
    await page.keyboard.press('Enter');
    const region = page.getByRole('region', {
      name: 'Inspected original published report',
      exact: true,
    });
    const reportHeading = region.getByRole('heading').first();
    await expect(region).toBeVisible();
    await expect(reportHeading).toBeFocused();
    await expect(heading).not.toBeFocused();
    await page.screenshot({
      path: test.info().outputPath('review.png'),
      fullPage: true,
    });
    await page.evaluate('window.__cycle29Report.revoke()');
    await expect(heading).toHaveCount(0);
    await expect(region).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('stale or denied');
  });
