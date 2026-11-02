import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle11-browser-helpers';
for (const company of sampleCompanies) {
  test(`consent, intelligence and external reference review / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Consent boundary lab');
    const growth = page.getByRole('region', {
      name: 'Atomic consent requirements',
      exact: true,
    });
    await growth.getByRole('checkbox').check();
    await growth
      .getByRole('button', {
        name: 'Load consent-bound maintenance sources',
        exact: true,
      })
      .click();
    await growth
      .getByRole('combobox', {
        name: 'Exact maintenance opportunity',
        exact: true,
      })
      .selectOption({ index: 1 });
    await growth.getByRole('checkbox').last().check();
    await growth
      .getByRole('button', {
        name: 'Inspect atomic consent requirements',
        exact: true,
      })
      .click();
    await expect(
      growth.getByRole('heading', {
        name: 'Atomic consent remains blocked',
        exact: true,
      }),
    ).toBeFocused();
    await expect(growth).toContainText('BLOCKED');
    await audit(page, growth);
    await growth.screenshot({
      path: `artifacts/cycle11/growth-${info.project.name}-${company.slug}.png`,
    });
    await nav(page, 'Daily action center');
    const daily = page.getByRole('region', {
      name: 'Daily action center',
      exact: true,
    });
    await daily.getByRole('checkbox').check();
    await daily
      .getByRole('button', { name: 'Prepare daily action review', exact: true })
      .click();
    await daily
      .getByRole('combobox', { name: 'Area', exact: true })
      .selectOption('finance');
    await daily
      .getByLabel('Search facts and review suggestions', { exact: true })
      .fill('no available source matches');
    await expect(daily).toContainText('No matching');
    await daily
      .getByRole('button', { name: 'Reset action filters', exact: true })
      .click();
    await daily
      .getByRole('button', { name: /^Open exact source:/ })
      .first()
      .click();
    await expect(
      daily.getByRole('heading', { name: 'Exact source review', exact: true }),
    ).toBeFocused();
    await audit(page, daily);
    await daily.screenshot({
      path: `artifacts/cycle11/intelligence-${info.project.name}-${company.slug}.png`,
    });
    await daily
      .getByRole('button', { name: 'Open exact source job', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    await nav(page, 'Reference admission');
    const sync = page.getByRole('region', {
      name: 'External reference admission review',
      exact: true,
    });
    await sync
      .getByRole('button', {
        name: 'Read current reference requirements',
        exact: true,
      })
      .click();
    await sync
      .getByLabel('External reference label', { exact: true })
      .fill('SYNTHETIC-CYCLE11-REFERENCE');
    await sync
      .getByRole('button', {
        name: 'Use current source references as proposal',
        exact: true,
      })
      .click();
    await sync
      .getByRole('button', {
        name: 'Inspect reference differences',
        exact: true,
      })
      .click();
    await expect(sync).toContainText('MATCH');
    await sync.getByRole('checkbox').check();
    await sync
      .getByRole('button', {
        name: 'Prepare existing review handoff',
        exact: true,
      })
      .click();
    await expect(sync).toContainText('No retry');
    await audit(page, sync);
    await sync.screenshot({
      path: `artifacts/cycle11/advanced-${info.project.name}-${company.slug}.png`,
    });
    await sync
      .getByRole('button', {
        name: 'Display canonical exact job workflow',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
  });
}
test('original navigation, keyboard and company withdrawal', async ({
  page,
}) => {
  await start(page, sampleCompanies[0]);
  await expect(
    page
      .getByRole('navigation', {
        name: 'Operating center sections',
        exact: true,
      })
      .getByRole('button'),
  ).toHaveCount(8);
  await expect(
    page
      .getByRole('navigation', { name: 'Daily workflow reviews', exact: true })
      .getByRole('button'),
  ).toHaveCount(6);
  const nav = page.getByRole('navigation', {
    name: 'Cycle 11 workflow labs',
    exact: true,
  });
  await expect(nav.getByRole('button')).toHaveCount(7);
  await nav
    .getByRole('button', { name: 'Pilot acceptance', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('region', {
      name: 'Pilot acceptance scorecard',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByText('Disposable development controls', { exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Contractor', exact: true })
    .selectOption(sampleCompanies[1].id);
  await expect(
    page.getByRole('region', { name: 'Shared operating environment' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', {
      name: 'Pilot acceptance scorecard',
      exact: true,
    }),
  ).toHaveCount(0);
});
