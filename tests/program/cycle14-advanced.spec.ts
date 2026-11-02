import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle14-browser-helpers';
import { visualCapture } from './cycle14-visual-capture';
for (const company of sampleCompanies)
  test(`once-selected exact advanced job/mode to original engine / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await page.getByText('Cycle 13 operating desks', { exact: true }).click();
    await page
      .getByRole('navigation', {
        name: 'Cycle 13 operating desks',
        exact: true,
      })
      .getByRole('button', { name: 'Advanced review desk', exact: true })
      .click();
    const old = page.getByRole('region', {
      name: 'Advanced review desk',
      exact: true,
    });
    await old
      .getByRole('button', { name: 'Explore advanced sources', exact: true })
      .click();
    const job = await old
      .getByRole('combobox', { name: 'Advanced job', exact: true })
      .locator('option')
      .nth(1)
      .getAttribute('value');
    expect(job).toMatch(/^[a-f0-9-]{36}$/);
    await old
      .getByRole('button', { name: /^Inspect advanced source / })
      .first()
      .click();
    await expect(
      old.getByRole('heading', { name: /^Exact advanced source:/ }),
    ).toBeFocused();
    await visualCapture(
      old,
      'advanced-panels',
      'reference',
      company.slug,
      info.project.name as 'desktop' | 'tablet' | 'mobile',
    );
    await old
      .getByRole('button', { name: /^Open existing advanced job / })
      .click();
    await expect(page.locator('#operating-selected-heading')).toBeFocused();
    await nav(page, 'Source-bound advanced workflows');
    const entry = page.getByRole('region', {
      name: 'Source-bound advanced entry',
      exact: true,
    });
    await expect(
      entry.getByRole('combobox', {
        name: 'Advanced handoff job',
        exact: true,
      }),
    ).toHaveValue(job!);
    await entry
      .getByRole('combobox', { name: 'Advanced handoff mode', exact: true })
      .selectOption('procurement');
    await entry
      .getByRole('button', {
        name: 'Inspect selected advanced source',
        exact: true,
      })
      .click();
    const r = entry.getByRole('region', {
      name: 'Pinned advanced workflow',
      exact: true,
    });
    await expect(r).toContainText('PINNED_NOT_REVIEWED');
    await expect(r).toContainText(job!);
    await expect(r.getByRole('combobox')).toHaveCount(0);
    await expect(
      r.getByRole('button', { name: 'Review pinned source', exact: true }),
    ).toBeDisabled();
    await r
      .getByLabel(
        'I reviewed this exact pinned source and set its fixed local review expiry.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', { name: 'Review pinned source', exact: true })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Original pinned-source comparison',
        exact: true,
      }),
    ).toBeFocused();
    await r
      .getByLabel(
        'I confirm this exact original comparison for the selected local control.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', {
        name: 'Prepare original pinned handoff',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Original pinned handoff evidence',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r).toContainText('operational ready: false');
    await expect(
      r.getByRole('button', {
        name: 'Prepare original pinned handoff',
        exact: true,
      }),
    ).toBeDisabled();
    await audit(page, entry);
    await visualCapture(
      entry,
      'advanced-panels',
      'current',
      company.slug,
      info.project.name as 'desktop' | 'tablet' | 'mobile',
    );
    await r
      .getByRole('button', { name: 'Revoke pinned review', exact: true })
      .click();
    await r
      .getByRole('button', {
        name: 'Inspect exact retained pinned review',
        exact: true,
      })
      .click();
    await expect(r).toContainText('REVOKED');
    await expect(
      r.getByRole('button', { name: 'Review pinned source', exact: true }),
    ).toBeDisabled();
    await expect(
      r.getByRole('button', {
        name: 'Prepare original pinned handoff',
        exact: true,
      }),
    ).toBeDisabled();
  });
