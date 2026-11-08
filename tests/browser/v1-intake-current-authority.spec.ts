import { test, expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import type { Row } from '../../src/lib/operations';

interface Observation {
  organization_id: string;
  rows: Row<'intake_requests'>[];
  canonical_unchanged: boolean;
  members: Row<'memberships'>[];
  assignments: {
    org: string;
    id: string;
    assignee: string | null;
    status: string;
    outcome: string;
    error?: string;
  }[];
  held_member_reads: { ids: string[] }[];
  held_intake_reads: {
    org: string;
    status: string;
    page: number;
    ids: string[];
    summaries: string[];
  }[];
  member_errors: number;
  read_errors: number;
  visibility_only_canManage: boolean;
  caller_authority: string;
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
            './fixtures/v1-intake-current-authority-harness.tsx',
            import.meta.url,
          ),
        ),
        formats: ['iife'],
        name: 'IntakeCurrentAuthorityFixture',
      },
    },
  });
  const output = Array.isArray(bundled) ? bundled[0] : bundled;
  if (!('output' in output))
    throw Error('Actual original intake fixture bundle unavailable');
  script = output.output
    .filter((item) => item.type === 'chunk')
    .map((item) => item.code)
    .join('\n');
  css = output.output
    .filter((item) => item.type === 'asset' && item.fileName.endsWith('.css'))
    .map((item) => (item.type === 'asset' ? String(item.source) : ''))
    .join('\n');
});
async function observe(page: Page): Promise<Observation> {
  return page.evaluate(async () =>
    (
      window as unknown as {
        intakeAuthorityTest: { inspect: () => Promise<Observation> };
      }
    ).intakeAuthorityTest.inspect(),
  );
}
async function open(
  page: Page,
  brand: number,
  members: 'normal' | 'hold' | 'fail' = 'normal',
) {
  const external: string[] = [],
    errors: string[] = [];
  const url = 'http://127.0.0.1:4173/__intake_current_authority_test__';
  await page.route('**/*', (route) => {
    if (route.request().url() === url)
      return route.fulfill({
        contentType: 'text/html',
        body: '<!DOCTYPE html><html lang="en"><head><title>Intake current authority fixture</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
      });
    external.push(route.request().url());
    return route.abort();
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.evaluate(
    (value) => {
      (
        window as unknown as { intakeAuthorityConfiguration: typeof value }
      ).intakeAuthorityConfiguration = value;
    },
    { brand, members },
  );
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(
    page.getByRole('heading', { name: 'Estimate request inbox', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.request-card')).toHaveCount(10);
  return { external, errors };
}
async function keyboard(page: Page, name: string) {
  const control = page.getByRole('button', { name, exact: true });
  await control.focus();
  await expect(control).toBeFocused();
  await control.press('Enter');
}
async function finish(
  page: Page,
  info: TestInfo,
  activity: { external: string[]; errors: string[] },
  detail: unknown,
) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth,
  );
  await info.attach('actual-source-witness', {
    body: JSON.stringify(
      {
        detail,
        activity,
        final: await observe(page),
        accessibility_violations: accessibility.violations,
        no_document_overflow: noOverflow,
        caller_authority: 'NATIVE_SQL_SCOPE_ONLY_NOT_SAMPLE_UI',
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  await info.attach('current-ui-state', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  expect(activity).toEqual({ external: [], errors: [] });
  expect(accessibility.violations.map((value) => value.id)).toEqual([]);
  expect(noOverflow).toBe(true);
}
for (const brand of [0, 1, 2]) {
  test(`brand ${brand}: pending original member result cannot assign an actually revoked assignee`, async ({
    page,
  }, info) => {
    const activity = await open(page, brand, 'hold');
    await expect(page.getByLabel('Held member reads')).toHaveText('1');
    const before = await observe(page),
      assignee = before.organization_id + '-field';
    expect(before.members.find((row) => row.user_id === assignee)?.active).toBe(
      true,
    );
    await keyboard(page, 'Revoke original field assignee');
    expect(
      (await observe(page)).members.find((row) => row.user_id === assignee)
        ?.active,
    ).toBe(false);
    await keyboard(page, 'Release original member read');
    const card = page.locator('.request-card').first();
    await card
      .getByRole('combobox', { name: 'Assign to employee', exact: true })
      .selectOption(assignee);
    await card
      .getByRole('combobox', { name: 'Update request status', exact: true })
      .selectOption('reviewing');
    const submit = card.getByRole('button', {
      name: 'Save assignment',
      exact: true,
    });
    await submit.focus();
    await expect(submit).toBeFocused();
    await submit.press('Enter');
    await expect(
      page.getByText('Assignee unavailable', { exact: true }),
    ).toBeVisible();
    const after = await observe(page);
    expect(after.rows).toEqual(before.rows);
    expect(after.canonical_unchanged).toBe(true);
    expect(after.assignments).toHaveLength(1);
    expect(after.assignments[0]).toMatchObject({
      org: before.organization_id,
      assignee,
      status: 'reviewing',
      outcome: 'REJECTED',
      error: 'Assignee unavailable',
    });
    await finish(page, info, activity, {
      before,
      after,
      captured_member_result_was_not_current_authority: true,
    });
  });
  test(`brand ${brand}: actual assignee withdrawal after an exact result denies the original assignment writer`, async ({
    page,
  }, info) => {
    const activity = await open(page, brand),
      before = await observe(page),
      assignee = before.organization_id + '-field';
    const card = page.locator('.request-card').first();
    await card
      .getByRole('combobox', { name: 'Assign to employee', exact: true })
      .selectOption(assignee);
    await card
      .getByRole('combobox', { name: 'Update request status', exact: true })
      .selectOption('reviewing');
    await keyboard(page, 'Revoke original field assignee');
    const revoked = await observe(page);
    expect(
      revoked.members.find((row) => row.user_id === assignee)?.active,
    ).toBe(false);
    const submit = card.getByRole('button', {
      name: 'Save assignment',
      exact: true,
    });
    await submit.focus();
    await expect(submit).toBeFocused();
    await submit.press('Enter');
    await expect(
      page.getByText('Assignee unavailable', { exact: true }),
    ).toBeVisible();
    const after = await observe(page);
    expect(after.rows).toEqual(before.rows);
    expect(after.canonical_unchanged).toBe(true);
    expect(after.assignments).toHaveLength(1);
    expect(after.assignments[0].outcome).toBe('REJECTED');
    await finish(page, info, activity, { before, revoked, after });
  });
  test(`brand ${brand}: query error and explicit visibility withdrawal withhold former pagination and forms`, async ({
    page,
  }, info) => {
    const activity = await open(page, brand),
      before = await observe(page);
    const visibility = page.getByLabel('UI-only read visibility', {
      exact: true,
    });
    await visibility.focus();
    await expect(visibility).toBeFocused();
    await visibility.press('Space');
    await expect(
      page.getByRole('button', { name: 'Save assignment', exact: true }),
    ).toHaveCount(0);
    await visibility.press('Space');
    await expect(
      page.getByRole('button', { name: 'Save assignment', exact: true }),
    ).toHaveCount(10);
    await keyboard(page, 'Fail next original inquiry read');
    await keyboard(page, 'Next');
    await expect(
      page.getByText('Synthetic original intake read unavailable', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('.request-card')).toHaveCount(0);
    await expect(page.locator('.pagination')).toHaveCount(0);
    await keyboard(page, 'Hold next original inquiry read');
    await page
      .getByRole('combobox', { name: 'Request status', exact: true })
      .selectOption('closed');
    await expect(page.getByLabel('Held inquiry reads')).toHaveText('1');
    const pending = (await observe(page)).held_intake_reads[0];
    expect(pending.status).toBe('closed');
    expect(pending.page).toBe(0);
    await visibility.focus();
    await visibility.press('Space');
    await keyboard(page, 'Release original inquiry read');
    await expect
      .poll(() => page.locator('.request-card h3 + p').allTextContents())
      .toEqual(pending.summaries);
    await expect(
      page.getByRole('button', { name: 'Save assignment', exact: true }),
    ).toHaveCount(0);
    const after = await observe(page);
    expect(after.rows).toEqual(before.rows);
    expect(after.assignments).toEqual([]);
    expect(after.read_errors).toBe(1);
    expect(after.visibility_only_canManage).toBe(false);
    await finish(page, info, activity, {
      before,
      pending,
      after,
      visibility_is_not_authorization: true,
    });
  });
  test(`brand ${brand}: failed original member lookup fabricates no employee choice or mutation`, async ({
    page,
  }, info) => {
    const activity = await open(page, brand, 'fail');
    const source = await observe(page);
    expect(source.member_errors).toBe(1);
    expect(source.members.filter((row) => row.active)).toHaveLength(3);
    const options = await page
      .locator('.request-card')
      .first()
      .getByRole('combobox', { name: 'Assign to employee', exact: true })
      .locator('option')
      .allTextContents();
    expect(options).toEqual(['Unassigned']);
    expect(source.assignments).toEqual([]);
    expect(source.canonical_unchanged).toBe(true);
    await finish(page, info, activity, {
      source,
      visible_employee_choices: options,
      member_error_does_not_establish_caller_authority: true,
    });
  });
}
