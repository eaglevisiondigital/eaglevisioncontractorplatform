import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let server: ViteDevServer;
let baseUrl: string;
let cache: string;
const pagePath = '/__cycle24_callback_review__.html';

// A transient local test document imports the actual React/workbench/native
// preparer. No product route, fixture command, source replacement or writer.
const document = `<!doctype html><html><head><meta charset="utf-8"></head>
<body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SavedRevisionWorkbench } from '/src/components/workflows/SavedRevisionWorkbench.tsx';
import { prepareCorrectionPreviewSources } from '/src/lib/workflows/correction-preview-sources.ts';
import { sampleCompanies } from '/src/domain/platform.ts';
const gate = { enabled: true, confirmed: true };
const sources = await prepareCorrectionPreviewSources(sampleCompanies[0], gate);
const job = sources.entries[0].target.job_id;
const nextJob = sources.entries[1].target.job_id;
const seen = { panels: {}, actions: {} };
const tabs = ['field','finance','customer','maintenance','priorities'];
function probes(kind) {
  return Object.fromEntries(tabs.map(tab => [tab, props => {
    seen[kind][tab] = props;
    return React.createElement('p', null, kind + ':' + tab);
  }]));
}
const reviewPanels = probes('panels'), taskActions = probes('actions');
const root = createRoot(document.getElementById('root'));
const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
function render(currentSources, selectedJobId) {
  root.render(React.createElement(SavedRevisionWorkbench, {
    sources: currentSources, selectedJobId, enabled: true, reviewPanels, taskActions,
  }));
}
const equal = (a,b) => ['onSelectJob','onContinue','onSourcesSaved'].every(key => a[key] === b[key]);
render(sources,job);
await tick();
window.__cycle24Lease = {
  async sameJob() {
    const first = seen.panels.field;
    first.onContinue(job,'finance');
    await tick();
    const afterTab = seen.panels.field;
    afterTab.onSourcesSaved();
    await tick();
    const afterRefresh = seen.panels.field;
    return {
      sameJob: afterRefresh.selectedJobId === job,
      sameSources: afterRefresh.sources === sources,
      tabCallbacksStable: equal(first,afterTab),
      refreshCallbacksStable: equal(afterTab,afterRefresh),
      panelActionCallbacksEqual: equal(afterRefresh,seen.actions.field),
    };
  },
  async changedJob() {
    const before = seen.panels.field;
    before.onSelectJob(nextJob,'finance');
    await tick();
    const after = seen.panels.field;
    return {
      exactNewJob: after.selectedJobId === nextJob,
      continuationRotated: after.onContinue !== before.onContinue,
      selectorStable: after.onSelectJob === before.onSelectJob,
      refreshStable: after.onSourcesSaved === before.onSourcesSaved,
      panelActionCallbacksEqual: equal(after,seen.actions.field),
    };
  },
  async changedSources() {
    const before = seen.panels.field;
    const wrapper = { ...sources };
    render(wrapper,nextJob);
    await tick();
    const after = seen.panels.field;
    return {
      exactSources: after.sources === wrapper,
      exactJob: after.selectedJobId === nextJob,
      continuationRotated: after.onContinue !== before.onContinue,
      selectorRotated: after.onSelectJob !== before.onSelectJob,
      panelActionCallbacksEqual: equal(after,seen.actions.field),
    };
  },
};
</script></body></html>`;

test.beforeAll(async () => {
  cache = mkdtempSync(join(tmpdir(), 'propel-cycle24-lease-vite-'));
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

test('same-job React rerenders retain original callback leases; new jobs and sources rotate exact context', async ({
  page,
}) => {
  await page.goto(baseUrl + pagePath);
  await expect
    .poll(() => page.evaluate('Boolean(window.__cycle24Lease)'))
    .toBe(true);
  const sameJob = await page.evaluate('window.__cycle24Lease.sameJob()');
  expect(sameJob).toEqual({
    sameJob: true,
    sameSources: true,
    tabCallbacksStable: true,
    refreshCallbacksStable: true,
    panelActionCallbacksEqual: true,
  });
  expect(await page.evaluate('window.__cycle24Lease.changedJob()')).toEqual({
    exactNewJob: true,
    continuationRotated: true,
    selectorStable: true,
    refreshStable: true,
    panelActionCallbacksEqual: true,
  });
  expect(await page.evaluate('window.__cycle24Lease.changedSources()')).toEqual(
    {
      exactSources: true,
      exactJob: true,
      continuationRotated: true,
      selectorRotated: true,
      panelActionCallbacksEqual: true,
    },
  );
});
