import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle15-browser-helpers';
for (const company of sampleCompanies)
  test(`maintenance purpose, requirements and exact return / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Maintenance planning continuity');
    const r = page.getByRole('region', {
      name: 'Maintenance review path',
      exact: true,
    });
    await expect(
      r.getByRole('button', {
        name: 'Review maintenance path sources',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByLabel(
        'I confirm this is a source review only, with no permission to send.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', {
        name: 'Review maintenance path sources',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', { name: /^Inspect maintenance item / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Retained maintenance planning item',
        exact: true,
      }),
    ).toBeFocused();
    const context = await r.locator('dl').first().innerText();
    await r
      .getByLabel(
        'I confirm this plan only inspects original missing consent requirements.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', {
        name: 'Prepare maintenance path requirements',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', {
        name: 'Open exact maintenance requirements',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Exact consent and suppression requirements',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r).toContainText('Send authority BLOCKED');
    await expect(r).toContainText('UNKNOWN');
    await audit(page, r);
    await capture(
      page,
      r,
      'maintenance-requirements',
      company.slug,
      info.project.name,
    );
    await r
      .getByRole('button', {
        name: 'Return to maintenance planning item',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Retained maintenance planning item',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r.locator('dl').first()).toHaveText(context);
    await expect(
      r.getByRole('button', {
        name: 'Prepare maintenance path requirements',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByRole('button', {
        name: 'Revoke maintenance path review',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', {
        name: 'Reconcile maintenance path read only',
        exact: true,
      })
      .click();
    await expect(r).toContainText('REVOKED');
    await expect(
      r.getByRole('button', {
        name: 'Open exact maintenance requirements',
        exact: true,
      }),
    ).toHaveCount(0);
    await audit(page, r);
  });
