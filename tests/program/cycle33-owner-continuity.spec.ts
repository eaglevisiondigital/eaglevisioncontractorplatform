import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let server: ViteDevServer, base: string, cache: string;
const path = '/__cycle33_owner_continuity__.html';
// Existing native fixture and original component. Only one original digest
// delivery is rejected; no source facts, native guards or custody are mocked.
const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main><h1>Disposable owner inspection continuity</h1><div id="root"></div></main><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {RecordedOwnerActions} from '/src/components/workflows/RecordedOwnerActions.tsx';
import {prepareCorrectionPreviewSources} from '/src/lib/workflows/correction-preview-sources.ts';
import {sampleCompanies} from '/src/domain/platform.ts';
const company=sampleCompanies[Number(new URL(location.href).searchParams.get('brand')??0)];
const sources=await prepareCorrectionPreviewSources(company,{enabled:true,confirmed:true});
const entry=sources.entries[2],job=entry.target.job_id;
let armed=false,callbacks=0,rejected=0;
const digest=crypto.subtle.digest.bind(crypto.subtle);
crypto.subtle.digest=async(...args)=>{const bytes=await digest(...args);if(!armed)return bytes;armed=false;rejected++;throw Error('Native read digest result unavailable');};
createRoot(document.getElementById('root')).render(React.createElement(RecordedOwnerActions,{sources,selectedJobId:job,enabled:true,onContinue:(id,step)=>{if(id!==job||!['field','finance','invoice','customer','maintenance','priorities'].includes(step))throw Error('Original authorized destination required');callbacks++;}}));
window.__ownerContinuity={job,arm(){if(armed)throw Error('One read failure only');armed=true;},sample(){return {callbacks,rejected};}};
</script></body></html>`;
test.beforeAll(async () => {
  cache = mkdtempSync(join(tmpdir(), 'propel-owner-continuity-'));
  server = await createServer({
    root: process.cwd(),
    cacheDir: cache,
    appType: 'custom',
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(path, async (_request, response, next) => {
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml(path, document));
    } catch (error) {
      next(error);
    }
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string')
    throw Error('Loopback test server required');
  base = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  await server?.close();
  if (cache) rmSync(cache, { recursive: true, force: true });
});
for (const brand of [0, 1, 2])
  test(`brand ${brand}: failed fresh read clears earlier inspection and requires explicit source inspection`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + path + '?brand=' + brand);
    await expect
      .poll(() => page.evaluate('Boolean(window.__ownerContinuity)'))
      .toBe(true);
    const root = page.getByRole('region', {
        name: 'Recorded owner actions',
        exact: true,
      }),
      read = root.getByRole('button', {
        name: 'Read current owner priorities',
        exact: true,
      });
    await read.click();
    const inspect = root
      .getByRole('button', { name: /^Inspect owner priority source: / })
      .first();
    await expect(inspect).toBeVisible();
    await read.click();
    const query = root.getByLabel('Literal source search');
    await query.fill('Retained literal query');
    const detail = root.locator('details').first();
    await detail.locator('summary').click();
    await expect(detail).toHaveJSProperty('open', true);
    const exactLabel = await inspect.getAttribute('aria-label');
    await inspect.click();
    const inspected = root.getByRole('region', {
      name: 'Exact owner priority source',
      exact: true,
    });
    await expect(inspected).toBeVisible();
    await page.evaluate('window.__ownerContinuity.arm()');
    await read.click();
    await expect(root.getByRole('alert')).toContainText('UNKNOWN');
    await expect(inspect).toBeVisible();
    expect(await page.evaluate('window.__ownerContinuity.sample()')).toEqual({
      callbacks: 0,
      rejected: 1,
    });
    await expect(inspected).toHaveCount(0);
    await expect(
      root.getByRole('button', {
        name: 'Open exact owner priority review',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(query).toHaveValue('Retained literal query');
    await expect(detail).toHaveJSProperty('open', true);
    await expect(inspect).toHaveAttribute('aria-label', exactLabel!);
    await inspect.focus();
    await page.keyboard.press('Enter');
    await expect(inspected).toBeVisible();
    await expect(inspect).toBeFocused();
    expect(
      await page.evaluate('window.__ownerContinuity.sample().callbacks'),
    ).toBe(0);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),
    ).toBe(true);
  });
