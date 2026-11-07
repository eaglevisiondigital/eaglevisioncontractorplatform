import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import type { Row } from '../../src/lib/operations';

interface NativeObservation {
  organization_id: string;
  held: {
    org: string;
    status: string;
    page: number;
    summaries: string[];
    ids: string[];
  }[];
  assignment_calls: number;
  assignments: {
    org: string;
    id: string;
    assignee: string | null;
    status: string;
  }[];
  canonical_rows: Row<'intake_requests'>[];
  canonical_unchanged: boolean;
}
async function inspect(page: Page): Promise<NativeObservation> {
  return page.evaluate(async () =>
    (
      window as unknown as {
        intakeSourceContextTest: { inspect: () => Promise<NativeObservation> };
      }
    ).intakeSourceContextTest.inspect(),
  );
}
async function openControl(page: Page, brand: number) {
  const external: string[] = [],
    errors: string[] = [];
  const url = 'http://127.0.0.1:4173/__intake_source_context_test__';
  await page.route('**/*', (route) => {
    if (route.request().url() === url)
      return route.fulfill({
        contentType: 'text/html',
        body: '<!DOCTYPE html><html lang="en"><head><title>Intake source context</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
      });
    external.push(route.request().url());
    return route.abort();
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.getByLabel('Fixture contractor')).toBeVisible();
  await page.getByLabel('Fixture contractor').selectOption(String(brand));
  await expect(page.locator('.request-card')).toHaveCount(10);
  return { external, errors };
}

let script = '',
  css = '';
test.beforeAll(async () => {
  const bundled = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL(
            './fixtures/v1-intake-source-context-harness.tsx',
            import.meta.url,
          ),
        ),
        formats: ['iife'],
        name: 'IntakeSourceContextTest',
      },
    },
  });
  const output = Array.isArray(bundled) ? bundled[0] : bundled;
  if (!('output' in output))
    throw Error('Original intake component bundle unavailable');
  script = output.output
    .filter((item) => item.type === 'chunk')
    .map((item) => item.code)
    .join('\n');
  css = output.output
    .filter((item) => item.type === 'asset' && item.fileName.endsWith('.css'))
    .map((item) => (item.type === 'asset' ? String(item.source) : ''))
    .join('\n');
});

for (const brand of [0, 1, 2]) {
  for (const change of ['status', 'page'] as const) {
    test(`brand ${brand}: pending original ${change} read withholds former assignment affordances`, async ({
      page,
    }, info) => {
      const external: string[] = [],
        errors: string[] = [];
      const url = 'http://127.0.0.1:4173/__intake_source_context_test__';
      await page.route('**/*', (route) => {
        if (route.request().url() === url)
          return route.fulfill({
            contentType: 'text/html',
            body: '<!DOCTYPE html><html lang="en"><head><title>Intake source context</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
          });
        external.push(route.request().url());
        return route.abort();
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(url);
      await page.addStyleTag({ content: css });
      await page.addScriptTag({ content: script });
      await expect(page.getByLabel('Fixture contractor')).toBeVisible();
      await page.getByLabel('Fixture contractor').selectOption(String(brand));
      await expect(page.locator('.request-card')).toHaveCount(10);
      const previous = await page
        .locator('.request-card h3 + p')
        .allTextContents();
      await page
        .getByRole('button', { name: 'Hold next original read', exact: true })
        .click();
      if (change === 'status')
        await page
          .getByRole('combobox', { name: 'Request status', exact: true })
          .selectOption('closed');
      else
        await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByLabel('Held original intake reads')).toHaveText(
        '1',
      );
      await expect(
        page.getByText('Loading workspace records…', { exact: true }),
      ).toBeVisible();
      const witness = await page.evaluate(async () => {
        const bridge = (
          window as unknown as {
            intakeSourceContextTest: { inspect: () => Promise<unknown> };
          }
        ).intakeSourceContextTest;
        return bridge.inspect();
      });
      const visible = await page
        .locator('.request-card h3 + p')
        .allTextContents();
      const enabled = await page
        .getByRole('button', { name: 'Save assignment', exact: true })
        .evaluateAll(
          (buttons) =>
            buttons.filter((button) => !(button as HTMLButtonElement).disabled)
              .length,
        );
      await info.attach('actual-original-source-witness', {
        body: JSON.stringify(
          {
            brand,
            change,
            previous,
            visible,
            enabled_assignment_buttons: enabled,
            native: witness,
            external,
            errors,
          },
          null,
          2,
        ),
        contentType: 'application/json',
      });
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
      expect(witness).toMatchObject({
        assignment_calls: 0,
        canonical_unchanged: true,
      });
      expect(visible).toEqual([]);
      expect(enabled).toBe(0);
      const pending = (await inspect(page)).held[0];
      await page
        .getByRole('button', {
          name: 'Release oldest original read',
          exact: true,
        })
        .click();
      await expect
        .poll(() => page.locator('.request-card h3 + p').allTextContents())
        .toEqual(pending.summaries);
      await expect(
        page.getByRole('button', { name: 'Save assignment', exact: true }),
      ).toHaveCount(pending.ids.length);
      expect(await inspect(page)).toMatchObject({
        assignment_calls: 0,
        canonical_unchanged: true,
        held: [],
      });
    });
  }

  test(`brand ${brand}: control: exact newly loaded request keeps original assignment authority`, async ({
    page,
  }, info) => {
    const activity = await openControl(page, brand);
    await page
      .getByRole('button', { name: 'Hold next original read', exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Request status', exact: true })
      .selectOption('closed');
    await expect(page.getByLabel('Held original intake reads')).toHaveText('1');
    const pending = (await inspect(page)).held[0];
    await page
      .getByRole('button', {
        name: 'Release oldest original read',
        exact: true,
      })
      .click();
    await expect
      .poll(() => page.locator('.request-card h3 + p').allTextContents())
      .toEqual(pending.summaries);
    const before = await inspect(page);
    const original = before.canonical_rows.find(
      (row) => row.id === pending.ids[0],
    )!;
    expect(original.organization_id).toBe(before.organization_id);
    expect(original.status).toBe('closed');
    const card = page
      .locator('.request-card')
      .filter({ hasText: original.summary });
    await card
      .getByRole('combobox', { name: 'Assign to employee', exact: true })
      .selectOption(`${before.organization_id}-estimator`);
    await card
      .getByRole('combobox', { name: 'Update request status', exact: true })
      .selectOption('reviewing');
    await card
      .getByRole('button', { name: 'Save assignment', exact: true })
      .click();
    await expect(
      page.getByText('Changes saved', { exact: true }),
    ).toBeVisible();
    await expect(card).toHaveCount(0);
    await expect(page.locator('.request-card')).toHaveCount(2);
    const after = await inspect(page);
    expect(after.assignment_calls).toBe(1);
    expect(after.assignments).toEqual([
      {
        org: before.organization_id,
        id: original.id,
        assignee: `${before.organization_id}-estimator`,
        status: 'reviewing',
      },
    ]);
    const changed = after.canonical_rows.find((row) => row.id === original.id)!;
    expect(changed).toEqual({
      ...original,
      assigned_to: `${before.organization_id}-estimator`,
      status: 'reviewing',
      updated_at: changed.updated_at,
    });
    expect(
      after.canonical_rows.filter((row) => row.id !== original.id),
    ).toEqual(before.canonical_rows.filter((row) => row.id !== original.id));
    expect(activity).toEqual({ external: [], errors: [] });
    await info.attach('original-assignment-source-witness', {
      body: JSON.stringify({ before, after, activity }),
      contentType: 'application/json',
    });
  });

  test(`brand ${brand}: control: read-only caller has source rows without assignment affordances`, async ({
    page,
  }, info) => {
    const activity = await openControl(page, brand);
    await page.getByLabel('Read-only fixture view', { exact: true }).check();
    await expect(
      page.getByRole('button', { name: 'Save assignment', exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('combobox', { name: 'Request status', exact: true })
      .selectOption('closed');
    await expect(page.locator('.request-card')).toHaveCount(3);
    await expect(
      page.getByRole('button', { name: 'Save assignment', exact: true }),
    ).toHaveCount(0);
    const native = await inspect(page);
    expect(native).toMatchObject({
      assignment_calls: 0,
      canonical_unchanged: true,
    });
    expect(activity).toEqual({ external: [], errors: [] });
    await info.attach('read-only-source-witness', {
      body: JSON.stringify({ native, activity }),
      contentType: 'application/json',
    });
  });

  test(`brand ${brand}: control: a late former query cannot replace newer original results`, async ({
    page,
  }, info) => {
    const activity = await openControl(page, brand);
    await page
      .getByRole('button', { name: 'Hold next original read', exact: true })
      .click();
    const status = page.getByRole('combobox', {
      name: 'Request status',
      exact: true,
    });
    await status.selectOption('closed');
    await expect(page.getByLabel('Held original intake reads')).toHaveText('1');
    const pending = (await inspect(page)).held[0];
    await status.selectOption('qualified');
    const native = await inspect(page);
    const current = native.canonical_rows
      .filter((row) => row.status === 'qualified')
      .map((row) => row.summary)
      .sort();
    await expect
      .poll(async () =>
        (await page.locator('.request-card h3 + p').allTextContents()).sort(),
      )
      .toEqual(current);
    expect(pending.summaries.some((value) => current.includes(value))).toBe(
      false,
    );
    await page
      .getByRole('button', {
        name: 'Release oldest original read',
        exact: true,
      })
      .click();
    await expect(page.getByLabel('Held original intake reads')).toHaveText('0');
    await expect
      .poll(async () =>
        (await page.locator('.request-card h3 + p').allTextContents()).sort(),
      )
      .toEqual(current);
    await expect(status).toHaveValue('qualified');
    expect(await inspect(page)).toMatchObject({
      assignment_calls: 0,
      canonical_unchanged: true,
    });
    expect(activity).toEqual({ external: [], errors: [] });
    await info.attach('late-query-source-witness', {
      body: JSON.stringify({ pending, current, native, activity }),
      contentType: 'application/json',
    });
  });
}
