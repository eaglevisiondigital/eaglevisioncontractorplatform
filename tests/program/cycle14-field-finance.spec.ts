import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle14-browser-helpers';
import { visualCapture } from './cycle14-visual-capture';
for (const company of sampleCompanies) {
  test(`schedule to exact work-order continuity / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Schedule and work orders');
    const r = page.getByRole('region', {
      name: 'Schedule and work-order continuity',
      exact: true,
    });
    await expect(
      r.getByRole('button', {
        name: 'Review continuity schedule proposal',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByLabel(
        'I confirm this schedule and working window are human proposals only.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', {
        name: 'Review continuity schedule proposal',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Retained schedule-to-work-order sources',
        exact: true,
      }),
    ).toBeFocused();
    await r
      .getByRole('textbox', {
        name: 'Continuity operational instructions',
        exact: true,
      })
      .fill(
        'Review exact property access with the assigned worker. No dispatch or repair authorization.',
      );
    await r.getByRole('checkbox').last().check();
    await r
      .getByRole('button', {
        name: 'Prepare exact work-order handoff',
        exact: true,
      })
      .click();
    await expect(r).toContainText(
      'Prepared review revision 2 from schedule revision 1',
    );
    await r
      .getByRole('button', {
        name: 'Inspect exact continuity source',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', { name: 'Exact continuity source', exact: true }),
    ).toBeFocused();
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle14/field-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', { name: 'Cancel continuity review', exact: true })
      .click();
    await r
      .getByRole('button', {
        name: 'Reconcile exact continuity read only',
        exact: true,
      })
      .click();
    await expect(r).toContainText('CANCELLED');
    await expect(
      r.getByRole('button', {
        name: 'Review continuity schedule proposal',
        exact: true,
      }),
    ).toBeDisabled();
  });
  test(`canonical financial case continuity and visual comparison / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await page.getByText('Cycle 13 operating desks', { exact: true }).click();
    await page
      .getByRole('navigation', {
        name: 'Cycle 13 operating desks',
        exact: true,
      })
      .getByRole('button', { name: 'Financial casework', exact: true })
      .click();
    const old = page.getByRole('region', {
      name: 'Financial casework desk',
      exact: true,
    });
    await old.getByRole('checkbox').first().check();
    await old
      .getByRole('button', { name: 'Load financial casework', exact: true })
      .click();
    await old
      .getByRole('button', { name: /^Inspect job casework:/ })
      .first()
      .click();
    await visualCapture(
      old,
      'operating-panels',
      'reference',
      company.slug,
      info.project.name as 'desktop' | 'tablet' | 'mobile',
    );
    await nav(page, 'Financial source continuity');
    const r = page.getByRole('region', {
      name: 'Financial case source continuity',
      exact: true,
    });
    await r.getByRole('checkbox').check();
    await r
      .getByRole('button', { name: 'Read financial case sources', exact: true })
      .click();
    const jobs = r.getByRole('combobox', {
      name: 'Exact financial case',
      exact: true,
    });
    await jobs.selectOption({ index: 1 });
    await r
      .getByRole('button', { name: 'Inspect financial case', exact: true })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Exact financial case source',
        exact: true,
      }),
    ).toBeFocused();
    await r
      .getByRole('combobox', { name: 'Exact financial source', exact: true })
      .selectOption({ index: 1 });
    await r
      .getByRole('button', { name: 'Inspect exact case source', exact: true })
      .click();
    await expect(r).toContainText('Selected financial source');
    await r
      .getByRole('button', {
        name: 'Compare retained case source',
        exact: true,
      })
      .click();
    await expect(r).toContainText('No financial state changes');
    await audit(page, r);
    await visualCapture(
      r,
      'operating-panels',
      'current',
      company.slug,
      info.project.name as 'desktop' | 'tablet' | 'mobile',
    );
    await r
      .getByRole('button', {
        name: 'Open existing Finance review',
        exact: true,
      })
      .click();
    await expect(page.locator('#operating-selected-finance')).toBeFocused();
  });
}
