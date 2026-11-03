import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle15-browser-helpers';
for (const company of sampleCompanies) {
  test(`service exact report, finding and retained request / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Service source continuity');
    const r = page.getByRole('region', {
      name: 'Service review path',
      exact: true,
    });
    await expect(
      r.getByRole('button', { name: 'Open service review path', exact: true }),
    ).toBeDisabled();
    const request = r.getByRole('combobox', {
        name: 'Service request',
        exact: true,
      }),
      job = r.getByRole('combobox', {
        name: 'Service review job',
        exact: true,
      });
    await expect(request).not.toHaveValue('');
    const originalRequest = await request.inputValue(),
      originalJob = await job.inputValue();
    await expect(r).toContainText('Request-to-job relationship UNKNOWN');
    await r
      .getByLabel(
        'I confirm this exact job as staff-selected review context.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', { name: 'Open service review path', exact: true })
      .click();
    await expect(
      r.getByRole('heading', { name: /exact service evidence$/ }),
    ).toBeFocused();
    await expect(r).toContainText(originalRequest);
    await expect(r).toContainText(originalJob);
    await r
      .getByRole('button', { name: /^Open original published report / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', { name: /^Original published report / }),
    ).toBeFocused();
    const reportIdentity = await r
      .getByRole('heading', { name: /^Original published report / })
      .textContent();
    await r
      .getByRole('button', { name: /^Inspect original finding / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', { name: /^Original exact finding / }),
    ).toBeFocused();
    await expect(r).toContainText('physical completion remain UNKNOWN');
    await audit(page, r);
    await capture(page, r, 'service-source', company.slug, info.project.name);
    await r
      .getByRole('button', { name: 'Return to service request', exact: true })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Service request selection',
        exact: true,
      }),
    ).toBeFocused();
    await expect(request).toHaveValue(originalRequest);
    await expect(job).toHaveValue(originalJob);
    await r
      .getByRole('button', {
        name: 'Resume retained service evidence',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', { name: /^Original exact finding / }),
    ).toBeFocused();
    await expect(
      r.getByRole('heading', { name: /^Original published report / }),
    ).toHaveText(reportIdentity!);
    await r
      .getByRole('button', { name: 'Return to report selection', exact: true })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Safe Property Passport documentation',
        exact: true,
      }),
    ).toBeFocused();
    await audit(page, r);
  });
  test(`existing navigation, source withdrawal and no company leakage / ${company.slug}`, async ({
    page,
  }) => {
    await start(page, company);
    for (const [name, count] of [
      ['Operating center sections', 8],
      ['Daily workflow reviews', 6],
      ['Cycle 11 workflow labs', 7],
      ['Cycle 12 workflow reviews', 6],
      ['Cycle 13 operating desks', 6],
      ['Cycle 14 source continuity', 6],
    ] as const)
      await expect(
        page.locator(`nav[aria-label="${name}"] button`),
      ).toHaveCount(count);
    await nav(page, 'Service source continuity');
    const r = page.getByRole('region', {
      name: 'Service review path',
      exact: true,
    });
    await expect(
      r.getByRole('combobox', { name: 'Service request', exact: true }),
    ).not.toHaveValue('');
    await r
      .getByLabel(
        'I confirm this exact job as staff-selected review context.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', { name: 'Open service review path', exact: true })
      .click();
    const requestText = await r
      .getByRole('navigation', {
        name: 'Service request evidence path',
        exact: true,
      })
      .textContent();
    const controls = page.locator('.oc-development').first();
    await controls.locator('summary').click();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(
        sampleCompanies[(sampleCompanies.indexOf(company) + 1) % 3].id,
      );
    await expect(r).toHaveCount(0);
    await expect(
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(requestText!);
    await expect(
      page.getByRole('button', {
        name: 'Prepare multi-job local environment',
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    await expect(
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    ).toHaveCount(0);
  });
}
