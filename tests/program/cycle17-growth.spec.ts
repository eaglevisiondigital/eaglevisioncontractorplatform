import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle17-browser-helpers';
for (const company of sampleCompanies)
  test(`retained maintenance review / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Maintenance planning continuity');
    const r = page.getByRole('region', {
      name: 'Retained maintenance desk',
      exact: true,
    });
    await r
      .getByLabel(
        'I confirm this is a maintenance source review, with no permission to send.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', {
        name: 'Load retained maintenance desk',
        exact: true,
      })
      .click();
    const q = r.getByRole('searchbox', {
      name: 'Search maintenance desk',
      exact: true,
    });
    await q.fill('no-such-occurrence');
    await expect(r).toContainText('No matching available occurrences');
    await q.fill('');
    await r
      .getByRole('button', { name: /^Inspect retained occurrence / })
      .first()
      .click();
    const original = r.getByRole('region', {
      name: 'Maintenance review path',
      exact: true,
    });
    await expect(original).toBeVisible();
    await original.evaluate((e) =>
      e.setAttribute('data-c17-retained', 'maintenance-original'),
    );
    await r
      .getByRole('button', {
        name: 'Occurrence source and consent',
        exact: true,
      })
      .click();
    await expect(original).toBeHidden();
    await expect(
      r.getByRole('heading', {
        name: 'Exact occurrence and consent evidence',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r).toContainText('send authority BLOCKED');
    await audit(page, r);
    await capture(
      page,
      r,
      'retained-maintenance-desk',
      company.slug,
      info.project.name,
    );
    await r
      .getByRole('button', {
        name: 'Return to retained maintenance controls',
        exact: true,
      })
      .last()
      .click();
    await expect(original).toBeVisible();
    await expect(original).toHaveAttribute(
      'data-c17-retained',
      'maintenance-original',
    );
    await r
      .getByRole('button', { name: 'Maintenance queue', exact: true })
      .click();
    await expect(q).toHaveValue('');
    await r
      .getByRole('button', {
        name: 'Return to retained maintenance controls',
        exact: true,
      })
      .first()
      .click();
    await audit(page, r);
  });
