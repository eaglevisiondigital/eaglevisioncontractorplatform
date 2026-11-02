import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle13-browser-helpers';
for (const company of sampleCompanies) {
  test(`follow-up original requirements and irreversible cancellation / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Follow-up readiness');
    const r = page.getByRole('region', {
      name: 'Follow-up readiness',
      exact: true,
    });
    await r.getByRole('checkbox').first().check();
    await r
      .getByRole('button', { name: 'Load follow-up readiness', exact: true })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Available follow-up sources',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r).toContainText('Current communication BLOCKED');
    await r
      .getByRole('button', { name: /^Inspect exact follow-up source/ })
      .first()
      .click();
    await expect(
      r.getByRole('heading', { name: 'Exact follow-up source', exact: true }),
    ).toBeFocused();
    await r
      .getByLabel('Human proposed follow-up date', { exact: true })
      .fill('2026-12-30');
    await r.getByRole('checkbox').last().check();
    await r
      .getByRole('button', {
        name: 'Review original follow-up requirements',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Original follow-up requirements',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r).toContainText('current channel UNKNOWN');
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle13/growth-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', {
        name: 'Cancel original follow-up review',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', {
        name: 'Reconcile original follow-up review',
        exact: true,
      })
      .click();
    await expect(r).toContainText('CANCELLED');
    await expect(
      r.getByRole('button', {
        name: 'Review original follow-up requirements',
        exact: true,
      }),
    ).toBeDisabled();
    await audit(page, r);
  });
  test(`verified daily suggestion opens existing exact task section / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Daily task navigation');
    const r = page.getByRole('region', {
      name: 'Daily operating navigation',
      exact: true,
    });
    await r.getByRole('checkbox').first().check();
    await r
      .getByRole('button', {
        name: 'Review daily operating suggestions',
        exact: true,
      })
      .click();
    await expect(r).toContainText('Source-verified daily suggestions');
    await r
      .getByRole('button', { name: /^Inspect suggested task source:/ })
      .first()
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Exact suggested task source',
        exact: true,
      }),
    ).toBeFocused();
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle13/intelligence-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', { name: 'Open existing task review', exact: true })
      .click();
    await expect(
      page.locator('section[id^="operating-selected-"]:focus'),
    ).toHaveCount(1);
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeVisible();
    await audit(
      page,
      page.getByRole('region', { name: 'Current operating desk', exact: true }),
    );
  });
}
