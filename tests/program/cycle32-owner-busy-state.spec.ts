import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let server: ViteDevServer;
let base: string;
let cache: string;
const path = '/__cycle32_owner_busy__.html';
// Transient test document only. Real component, canonical four-job preparer and
// original digest result; only delivery of one native promise is deferred.
const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main><h1>Disposable owner pending-state regression</h1><button id="outside">Other workspace control</button><div id="panel"><div id="root"></div></div></main><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {RecordedOwnerActions} from '/src/components/workflows/RecordedOwnerActions.tsx';
import {prepareCorrectionPreviewSources} from '/src/lib/workflows/correction-preview-sources.ts';
import {sampleCompanies} from '/src/domain/platform.ts';
const company=sampleCompanies[Number(new URL(location.href).searchParams.get('brand')??0)];
const sources=await prepareCorrectionPreviewSources(company,{enabled:true,confirmed:true});
const entry=sources.entries[2],job=entry.target.job_id;
await sources.operations.configure(company.id,'active','synthetic',{},company.id+'-field');
let reads=0,heldReads=0,armed=false,pending=false,resume,callbacks=0;
const nativeRead=sources.estimates.readSyntheticPrototypeSources.bind(sources.estimates);
sources.estimates.readSyntheticPrototypeSources=(...args)=>{reads++;return nativeRead(...args);};
const digest=crypto.subtle.digest.bind(crypto.subtle);
crypto.subtle.digest=(...args)=>{const native=digest(...args);if(!armed)return native;armed=false;pending=true;heldReads=reads;return Promise.all([native,new Promise(resolve=>resume=resolve)]).then(([result])=>result);};
const root=createRoot(document.getElementById('root'));
root.render(React.createElement(RecordedOwnerActions,{sources,selectedJobId:job,enabled:true,onContinue:(selected,step)=>{if(selected!==job||!['field','finance','invoice','customer','maintenance','priorities'].includes(step))throw Error('Exact original destination required');callbacks++;document.getElementById('panel').hidden=true;}}));
window.__ownerBusy={job,arm(){if(armed||pending)throw Error('One native promise only');armed=true;},release(){const done=resume;resume=undefined;pending=false;if(done)done();},sample(){return {pending,reads,heldReads,pendingReadDelta:reads-heldReads,callbacks};},async revoke(){await sources.operations.revokeOwner(company.id,entry.target.actor_id);},unmount(){root.unmount();}};
</script></body></html>`;

test.beforeAll(async () => {
  cache = mkdtempSync(join(tmpdir(), 'propel-owner-busy-vite-'));
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
    throw Error('Isolated loopback test server required');
  base = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  await server?.close();
  if (cache) rmSync(cache, { recursive: true, force: true });
});

for (const brand of [0, 1, 2]) {
  test(`brand ${brand}: pending privacy preserves disclosure/filter context, owned focus and hidden navigation`, async ({
    page,
  }, info) => {
    await page.goto(base + path + '?brand=' + brand);
    await expect
      .poll(() => page.evaluate('Boolean(window.__ownerBusy)'))
      .toBe(true);
    const root = page.getByRole('region', {
      name: 'Recorded owner actions',
      exact: true,
    });
    const read = root.getByRole('button', {
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
    await query.fill('Retain literal query');
    await root.getByRole('combobox', { name: /^Area/ }).selectOption('field');
    await root.getByLabel('Show changed rows only').check();
    const details = root.locator('details').first();
    await details.locator('summary').click();
    await expect(details).toHaveJSProperty('open', true);
    await page.evaluate('window.__ownerBusy.arm()');
    await inspect.focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate('window.__ownerBusy.sample().pending'))
      .toBe(true);
    await expect(root.getByRole('status')).toContainText(
      'Verifying exact current source state',
    );
    await expect(root.locator('.recorded-owner-cards')).toHaveCount(0);
    await expect(
      root.getByRole('region', { name: 'Recorded priority changes' }),
    ).toHaveCount(0);
    expect(
      await page.evaluate('window.__ownerBusy.sample().pendingReadDelta'),
    ).toBe(0);
    await page.evaluate('window.__ownerBusy.release()');
    const inspected = root.getByRole('region', {
      name: 'Exact owner priority source',
      exact: true,
    });
    await expect(inspected).toBeVisible();
    await expect(inspect).toBeFocused();
    await expect(details).toHaveJSProperty('open', true);
    await expect(query).toHaveValue('Retain literal query');
    await expect(root.getByRole('combobox', { name: /^Area/ })).toHaveValue(
      'field',
    );
    await expect(root.getByLabel('Show changed rows only')).toBeChecked();
    await page.evaluate('window.__ownerBusy.arm()');
    await read.focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate('window.__ownerBusy.sample().pending'))
      .toBe(true);
    const outside = page.getByRole('button', {
      name: 'Other workspace control',
      exact: true,
    });
    await outside.click();
    await page.evaluate('window.__ownerBusy.release()');
    await expect(inspect).toBeVisible();
    await expect(outside).toBeFocused();
    await expect(details).toHaveJSProperty('open', true);
    await expect(query).toHaveValue('Retain literal query');
    await details.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(details).toHaveJSProperty('open', false);
    await page.keyboard.press('Space');
    await expect(details).toHaveJSProperty('open', true);
    await inspect.click();
    await expect(inspected).toBeVisible();
    await page.evaluate('window.__ownerBusy.arm()');
    await inspected
      .getByRole('button', {
        name: 'Open exact owner priority review',
        exact: true,
      })
      .click();
    await expect
      .poll(() => page.evaluate('window.__ownerBusy.sample().pending'))
      .toBe(true);
    await page.evaluate('window.__ownerBusy.release()');
    await expect
      .poll(() => page.evaluate('window.__ownerBusy.sample().callbacks'))
      .toBe(1);
    await expect(root).toBeHidden();
    expect(
      await page.evaluate(
        'document.getElementById("panel").contains(document.activeElement)',
      ),
    ).toBe(false);
    await outside.click();
    await expect(outside).toBeFocused();
    await page.screenshot({
      path: info.outputPath('hidden-navigation.png'),
      fullPage: true,
    });
  });

  test(`brand ${brand}: revocation across a genuine pending native promise withholds private facts and navigation`, async ({
    page,
  }, info) => {
    await page.goto(base + path + '?brand=' + brand);
    await expect
      .poll(() => page.evaluate('Boolean(window.__ownerBusy)'))
      .toBe(true);
    const root = page.getByRole('region', {
      name: 'Recorded owner actions',
      exact: true,
    });
    const read = root.getByRole('button', {
      name: 'Read current owner priorities',
      exact: true,
    });
    await read.click();
    const inspect = root
      .getByRole('button', { name: /^Inspect owner priority source: / })
      .first();
    await expect(inspect).toBeVisible();
    await page.evaluate('window.__ownerBusy.arm()');
    await inspect.focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate('window.__ownerBusy.sample().pending'))
      .toBe(true);
    await expect(root.locator('.recorded-owner-cards')).toHaveCount(0);
    expect(
      await page.evaluate('window.__ownerBusy.sample().pendingReadDelta'),
    ).toBe(0);
    await page.evaluate('window.__ownerBusy.revoke()');
    await page.evaluate('window.__ownerBusy.release()');
    await expect(root.getByRole('alert')).toContainText(
      'stale, revoked, missing or UNKNOWN',
    );
    await expect(root.locator('.recorded-owner-cards')).toHaveCount(0);
    await expect(
      root.getByRole('region', { name: 'Exact owner priority source' }),
    ).toHaveCount(0);
    await expect(read).toBeFocused();
    await read.click();
    await expect(root.getByRole('alert')).toContainText('UNKNOWN');
    expect(await page.evaluate('window.__ownerBusy.sample().callbacks')).toBe(
      0,
    );
    await page.screenshot({
      path: info.outputPath('revoked.png'),
      fullPage: true,
    });
    await page.evaluate('window.__ownerBusy.unmount()');
    const outside = page.getByRole('button', {
      name: 'Other workspace control',
      exact: true,
    });
    await outside.click();
    await expect(outside).toBeFocused();
  });
}
