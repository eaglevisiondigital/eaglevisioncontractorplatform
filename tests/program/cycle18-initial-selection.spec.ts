import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { audit } from './cycle18-browser-helpers';
for (const [brand, company] of sampleCompanies.entries())
  test(`initial priorities require one exact selection before continuation / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto('/preview/operating-center');
    await page.evaluate(async (brand) => {
      const path = '/tests/program/cycle18-browser-harness.tsx';
      const { mountDailyWorkbench } = await import(path);
      const fixture = await mountDailyWorkbench(brand, false);
      (window as unknown as { c18Fixture: typeof fixture }).c18Fixture =
        fixture;
    }, brand);
    const root = page.getByRole('region', {
      name: 'Daily contractor workbench',
      exact: true,
    });
    await expect(root.locator('.daily-workbench-context')).toHaveCount(0);
    await expect(root).toContainText('use Find another record');
    const priorities = root.getByRole('region', {
      name: 'Daily priority actions',
      exact: true,
    });
    await priorities
      .getByRole('button', {
        name: 'Review daily priority sources',
        exact: true,
      })
      .click();
    await expect(priorities).toContainText('available source cards');
    await expect(
      priorities.getByRole('button', { name: /^Continue to / }),
    ).toHaveCount(0);
    await root
      .getByRole('button', { name: 'Find another record', exact: true })
      .click();
    const search = root.getByRole('region', {
      name: 'Shared record search',
      exact: true,
    });
    await search
      .getByRole('button', { name: 'Search shared records', exact: true })
      .click();
    await search
      .getByRole('button', { name: /^Open exact record in / })
      .first()
      .click();
    await expect(root.locator('.daily-workbench-context')).toBeVisible();
    await expect(
      root
        .getByRole('navigation', { name: 'Daily review steps', exact: true })
        .getByRole('button', { name: /^Work orders/ }),
    ).toHaveAttribute('aria-current', 'step');
    await audit(page, root);
    await page.evaluate(() => {
      (
        window as unknown as { c18Fixture: { dispose(): void } }
      ).c18Fixture.dispose();
    });
  });
