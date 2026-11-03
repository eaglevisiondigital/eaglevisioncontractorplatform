import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { audit } from './cycle18-browser-helpers';
for (const [brand, company] of sampleCompanies.entries())
  test(`StrictMode retained hint admits once then revoked staff withholds / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto('/preview/operating-center');
    const job = await page.evaluate(async (brand) => {
      const modulePath = '/tests/program/cycle18-browser-harness.tsx';
      const { mountDailyWorkbench } = await import(modulePath);
      const fixture = await mountDailyWorkbench(brand);
      (window as unknown as { c18Fixture: typeof fixture }).c18Fixture =
        fixture;
      return fixture.job;
    }, brand);
    const r = page.getByRole('region', {
      name: 'Daily contractor workbench',
      exact: true,
    });
    await expect(r.locator('.daily-workbench-context')).toContainText(job);
    await expect(
      r
        .getByRole('navigation', { name: 'Daily review steps', exact: true })
        .getByRole('button', { name: /^Today’s priorities/ }),
    ).toHaveAttribute('aria-current', 'step');
    await audit(page, r);
    await page.evaluate(() => {
      (
        window as unknown as { c18Fixture: { revoke(): void } }
      ).c18Fixture.revoke();
    });
    await expect(r.locator('.daily-workbench-context')).toHaveCount(0);
    await expect(r).toContainText('authorized sources are unavailable');
    await expect(
      r.getByRole('region', { name: 'Daily priority actions', exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => {
      (
        window as unknown as { c18Fixture: { dispose(): void } }
      ).c18Fixture.dispose();
    });
  });
