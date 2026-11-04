import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let server: ViteDevServer;
let baseUrl: string;
let cache: string;
const pagePath = '/__cycle26_request_access__.html';

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
window.__cycle26Request={job,async revoke(){await sources.operations.revokeOwner(sources.company.id,entry.target.actor_id);render();await tick();},dispose(){root.unmount();}};
</script></body></html>`;

test.beforeAll(async () => {
  cache = mkdtempSync(join(tmpdir(), 'propel-cycle26-request-vite-'));
  server = await createServer({
    root: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
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
  test(`brand ${brand}: revoked original staff cannot retain private observed request fields`, async ({
    page,
  }) => {
    const outside: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).origin !== new URL(baseUrl).origin)
        outside.push(r.url());
    });
    await page.goto(baseUrl + pagePath + '?brand=' + brand);
    await expect
      .poll(() => page.evaluate('Boolean(window.__cycle26Request)'))
      .toBe(true);
    await page
      .getByRole('button', { name: 'Load exact service request', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Original intake review',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Observe exact request read only',
        exact: true,
      })
      .click();
    const observed = page.getByRole('region', {
      name: 'Exact request observation',
      exact: true,
    });
    await expect(observed).toBeVisible();
    await expect(observed).toContainText('durable receipt false');
    await page.evaluate('window.__cycle26Request.revoke()');
    await expect(page.getByRole('alert')).toContainText('stale or denied');
    await expect(
      page.getByRole('heading', {
        name: 'Original intake review',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(observed).toHaveCount(0);
    expect(outside).toEqual([]);
  });
