import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
let script = '',
  css = '';
test.beforeAll(async () => {
  const bundled = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    define: {
      'import.meta.env': '{"DEV":true,"VITE_SALES_HANDOFF_TEST":"true"}',
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.DEV': 'true',
      'import.meta.env.VITE_SALES_HANDOFF_TEST': '"true"',
    },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/sales-handoff-harness.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'SalesHandoffTest',
      },
    },
  });
  const output = Array.isArray(bundled) ? bundled[0] : bundled;
  if (!('output' in output))
    throw Error('Actual sales handoff test bundle unavailable');
  script = output.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  css = output.output
    .filter((x) => x.type === 'asset' && x.fileName.endsWith('.css'))
    .map((x) => (x.type === 'asset' ? String(x.source) : ''))
    .join('\n');
});
async function open(page: import('@playwright/test').Page) {
  await page.route('**/__sales_handoff_test__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Sales handoff test</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('/__sales_handoff_test__');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(
    page.getByRole('button', { name: 'Prepare local test evidence' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('region', { name: 'Estimate to contract handoff' }),
  ).toHaveCount(0);
}
async function prepare(
  page: import('@playwright/test').Page,
  choice = 'accepted',
) {
  await page
    .getByRole('combobox', { name: 'Test preference', exact: true })
    .selectOption(choice);
  await page
    .getByRole('button', { name: 'Prepare local test evidence', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Reload exact evidence', exact: true }),
  ).toBeEnabled();
}
test('all three contractors inspect exact immutable scope and actual test receipt with keyboard, axe and responsive evidence', async ({
  page,
}, info) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:') &&
      !r.url().startsWith('data:')
    )
      external.push(r.url());
  });
  await open(page);
  for (const [index, org] of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ].entries()) {
    await page.getByLabel('Fixture contractor').selectOption(String(index));
    await prepare(page);
    await expect(page.getByRole('status')).toHaveText(
      'Exact scope and accepted test preference match. Contract approval is unverified.',
    );
    await expect(
      page.getByRole('heading', { name: 'Issued scope', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        '<img src=x onerror=alert(1)> Customer-visible estimate note',
        { exact: true },
      ),
    ).toBeVisible();
    expect(await page.locator('.sales-handoff img').count()).toBe(0);
    expect(await page.locator('.sales-handoff').innerText()).not.toMatch(
      /PRIVATE|unit_cost_minor|internal_notes|profit_margin/,
    );
    await expect(
      page.getByRole('button', {
        name: /create contract|sign|send|invoice|pay|approve/i,
      }),
    ).toHaveCount(0);
    const summary = page.getByText('Exact source and receipt references', {
      exact: true,
    });
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByText('Scope integrity hash', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('internal-test-v1', { exact: true }),
    ).toBeVisible();
    const header = await page.locator('.sales-handoff > header').boundingBox();
    const intro = await page.locator('.sales-handoff > header p').boundingBox();
    const reload = await page
      .getByRole('button', { name: 'Reload exact evidence', exact: true })
      .boundingBox();
    expect(header).not.toBeNull();
    expect(intro).not.toBeNull();
    expect(reload).not.toBeNull();
    expect(header!.y + header!.height).toBeGreaterThanOrEqual(
      intro!.y + intro!.height,
    );
    expect(reload!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    const retain = page.getByRole('button', {
      name: 'Retain review-only scope reference',
      exact: true,
    });
    await expect(retain).toBeDisabled();
    await page
      .getByRole('checkbox', { name: /I reviewed the exact issued scope/ })
      .check();
    await retain.focus();
    await page.keyboard.press('Enter');
    const retained = page.getByRole('region', {
      name: 'Retained scope reference',
      exact: true,
    });
    await expect(retained).toBeVisible();
    await expect(retained).toContainText(
      'Immutable scope reference — staff review only',
    );
    await page
      .getByRole('button', {
        name: 'Verify retained exact reference',
        exact: true,
      })
      .click();
    await expect(retained).toContainText(
      'Exact retained scope and accepted local test receipt match current original evidence.',
    );
    await expect(retained).toContainText('Contract execution: BLOCKED.');
    await expect(retain).toBeDisabled();
    await page.screenshot({
      path:
        'artifacts/phase3/' +
        info.project.name +
        '-sales-approved-scope-' +
        org +
        '.png',
      fullPage: true,
    });
    await page
      .getByRole('region', {
        name: 'Immutable scope reference review',
        exact: true,
      })
      .screenshot({
        path:
          'artifacts/phase3/' +
          info.project.name +
          '-sales-approved-scope-reference-' +
          org +
          '.png',
      });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByText('Controlled evidence fault controls', { exact: true })
      .click();
    await page.getByRole('button', { name: 'Toggle component off/on' }).click();
    await expect(
      page.getByRole('region', { name: 'Estimate to contract handoff' }),
    ).toHaveCount(0);
  }
  expect(external).toEqual([]);
});
test('declined, changes requested, missing, stale and UNKNOWN states preserve read-only blockers', async ({
  page,
}) => {
  await open(page);
  for (const choice of ['declined', 'changes_requested', 'missing']) {
    await prepare(page, choice);
    await expect(page.getByRole('status')).toContainText('Handoff blocked');
    await expect(
      page.getByRole('region', { name: 'Handoff blockers' }),
    ).toContainText(
      choice === 'declined'
        ? 'Customer declined'
        : choice === 'changes_requested'
          ? 'Customer requested changes'
          : 'UNKNOWN customer preference',
    );
  }
  await prepare(page);
  await page
    .getByText('Controlled evidence fault controls', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Prepare newer private draft' })
    .click();
  await page.getByRole('button', { name: 'Reload exact evidence' }).click();
  await expect(
    page.getByRole('region', { name: 'Handoff blockers' }),
  ).toContainText('Stale source');
  await expect(
    page.getByRole('heading', { name: 'Reviewed entryway work', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fail source reads' }).click();
  await page.getByRole('button', { name: 'Reload exact evidence' }).click();
  await expect(page.getByRole('status')).toContainText('UNKNOWN — no scope');
  await expect(
    page.getByRole('region', { name: 'Exact issued selling scope' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Restore source reads' }).click();
  await page.getByRole('button', { name: 'Reload exact evidence' }).click();
  await expect(
    page.getByRole('region', { name: 'Handoff blockers' }),
  ).toContainText('Stale source');
  await page.getByRole('button', { name: 'Revoke reviewer' }).click();
  await page.getByRole('button', { name: 'Reload exact evidence' }).click();
  await expect(page.getByRole('status')).toContainText('UNKNOWN — no scope');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('late source reads cannot restore the prior company scope after context switch', async ({
  page,
}) => {
  await open(page);
  await prepare(page);
  await page
    .getByText('Controlled evidence fault controls', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Hold source reads', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Reload exact evidence', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText(
    'Reading exact source and receipt…',
  );
  await expect(
    page.getByRole('region', { name: 'Exact issued selling scope' }),
  ).toHaveCount(0);
  await page.getByLabel('Fixture contractor').selectOption('1');
  await page
    .getByRole('button', { name: 'Release prior held response', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Estimate to contract handoff' }),
  ).toHaveCount(0);
  await prepare(page);
  await expect(page.locator('.sales-handoff')).toContainText(
    'Cunningham Construction',
  );
  await expect(page.locator('.sales-handoff')).not.toContainText(
    'Straight Edge',
  );
});

test('retained reference stays immutable after a new draft and exact verification shows stale or UNKNOWN without replacement', async ({
  page,
}) => {
  await open(page);
  await prepare(page);
  const retain = page.getByRole('button', {
    name: 'Retain review-only scope reference',
    exact: true,
  });
  await page
    .getByRole('checkbox', { name: /I reviewed the exact issued scope/ })
    .check();
  await retain.click();
  const retained = page.getByRole('region', {
    name: 'Retained scope reference',
    exact: true,
  });
  await expect(retained).toBeVisible();
  const facts = retained.locator('dl');
  const originalFacts = await facts.innerText();
  await page
    .getByText('Controlled evidence fault controls', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Prepare newer private draft', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Verify retained exact reference',
      exact: true,
    })
    .click();
  await expect(retained).toContainText(
    'STALE — original scope and receipt are retained',
  );
  await expect(facts).toHaveText(originalFacts, { useInnerText: true });
  await page
    .getByRole('button', { name: 'Reload exact evidence', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Handoff blocked');
  await expect(retain).toBeDisabled();
  await expect(facts).toHaveText(originalFacts, { useInnerText: true });
  await page
    .getByRole('button', { name: 'Fail source reads', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Verify retained exact reference',
      exact: true,
    })
    .click();
  await expect(page.getByRole('status')).toContainText('UNKNOWN — no scope');
  await expect(retained).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Restore source reads', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Reload exact evidence', exact: true })
    .click();
  await expect(retained).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Verify retained exact reference',
      exact: true,
    })
    .click();
  await expect(retained).toContainText(
    'STALE — original scope and receipt are retained',
  );
  await expect(facts).toHaveText(originalFacts, { useInnerText: true });
  await page
    .getByRole('button', { name: 'Revoke reviewer', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Verify retained exact reference',
      exact: true,
    })
    .click();
  await expect(page.getByRole('status')).toContainText('UNKNOWN — no scope');
  await expect(retained).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('late capture reads cannot retain a previous company reference after switching context', async ({
  page,
}) => {
  await open(page);
  await prepare(page);
  await page
    .getByRole('checkbox', { name: /I reviewed the exact issued scope/ })
    .check();
  await page
    .getByText('Controlled evidence fault controls', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Hold source reads', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Retain review-only scope reference',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Reading original evidence…',
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByLabel('Fixture contractor').selectOption('2');
  await page
    .getByRole('button', { name: 'Release prior held response', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Estimate to contract handoff' }),
  ).toHaveCount(0);
  await prepare(page);
  await expect(page.locator('.sales-handoff')).toContainText('Roofing');
  await expect(
    page.getByRole('region', { name: 'Retained scope reference', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('checkbox', { name: /I reviewed the exact issued scope/ }),
  ).not.toBeChecked();
});
