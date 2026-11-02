import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import {
  start,
  nav,
  audit,
  captureVisualSourceCommit,
} from './cycle13-browser-helpers';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
for (const company of sampleCompanies)
  test(`one shared environment and withdrawn company context / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    for (const [name, count] of [
      ['Operating center sections', 8],
      ['Daily workflow reviews', 6],
      ['Cycle 11 workflow labs', 7],
      ['Cycle 12 workflow reviews', 6],
      ['Cycle 13 operating desks', 6],
    ] as const)
      await expect(
        page.locator(`nav[aria-label="${name}"] button`),
      ).toHaveCount(count);
    await audit(
      page,
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    );
    await page.evaluate(() => scrollTo(0, 0));
    const id = `operating-center-current-${info.project.name}-${company.slug}`;
    const path = `artifacts/cycle13/${id}.png`;
    await page.screenshot({ path, fullPage: true });
    await writeFile(
      `artifacts/cycle13/operating-visual-${info.project.name}-${company.slug}.json`,
      JSON.stringify(
        {
          id,
          pair: `operating-center-${info.project.name}-${company.slug}`,
          side: 'current',
          surface: 'operating-center',
          brand: company.slug,
          viewport: info.project.name,
          path,
          sourceCommit: captureVisualSourceCommit(),
          sha256: createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
          caption:
            'Actual current Operating Center. No original owner-approved visual reference has been found; this is an isolated local review, not approval.',
        },
        null,
        2,
      ) + '\n',
    );
    await nav(page, 'Service and Passport');
    const r = page.getByRole('region', {
      name: 'Service and Passport desk',
      exact: true,
    });
    await r
      .getByRole('button', { name: 'Explore service evidence', exact: true })
      .click();
    const job = await r
      .getByRole('combobox', { name: 'Job', exact: true })
      .locator('option')
      .nth(1)
      .getAttribute('value');
    expect(job).toMatch(/^[a-f0-9-]{36}$/);
    await r
      .getByRole('button', { name: /^Open service source / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', { name: /^Service source:/ }),
    ).toBeFocused();
    const control = page.locator('.oc-development').first();
    await control.locator('summary').click();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(
        sampleCompanies[(sampleCompanies.indexOf(company) + 1) % 3].id,
      );
    await expect(
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', {
        name: 'Service and Passport desk',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', {
        name: 'Prepare multi-job local environment',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(page.locator('main')).not.toContainText(job!);
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    await expect(
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', {
        name: 'Prepare multi-job local environment',
        exact: true,
      }),
    ).toBeDisabled();
    await page.getByRole('checkbox').check();
    await expect(
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    ).toBeVisible();
    if ((await control.getAttribute('open')) === null)
      await control.locator('summary').click();
    await expect(
      page.getByRole('button', {
        name: 'Prepare multi-job local environment',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole('navigation', {
        name: 'Operating center sections',
        exact: true,
      }),
    ).toBeVisible();
  });
