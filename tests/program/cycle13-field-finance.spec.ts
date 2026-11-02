import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle13-browser-helpers';
for (const company of sampleCompanies) {
  test(`work-order instruction revisions and exact withdrawal / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Work-order revisions');
    const r = page.getByRole('region', {
      name: 'Work-order revisions',
      exact: true,
    });
    await expect(
      r.getByRole('button', {
        name: 'Review work-order revision',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByRole('textbox', {
        name: 'Proposed operational instructions',
        exact: true,
      })
      .fill(
        'Inspect access conditions before proposing any work. No dispatch authorization.',
      );
    await r.getByRole('checkbox').check();
    await r
      .getByRole('button', { name: 'Review work-order revision', exact: true })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Source-bound work-order comparison',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r).toContainText('Saved same-tab revision 1');
    await r
      .getByRole('textbox', {
        name: 'Proposed operational instructions',
        exact: true,
      })
      .fill(
        'Review revised access instructions with the responsible staff member.',
      );
    await r.getByRole('checkbox').check();
    await r
      .getByRole('button', { name: 'Review work-order revision', exact: true })
      .click();
    await expect(r).toContainText('Saved same-tab revision 2');
    await r
      .getByRole('button', {
        name: 'Open exact work-order revision source',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Exact work-order revision source',
        exact: true,
      }),
    ).toBeFocused();
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle13/field-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', {
        name: 'Revoke work-order revision review',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', {
        name: 'Reconcile exact work-order revision',
        exact: true,
      })
      .click();
    await expect(r).toContainText('REVOKED');
    await expect(
      r.getByRole('button', {
        name: 'Review work-order revision',
        exact: true,
      }),
    ).toBeDisabled();
    await audit(page, r);
  });
  test(`financial casework filters and canonical source drill-down / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Financial casework');
    const r = page.getByRole('region', {
      name: 'Financial casework desk',
      exact: true,
    });
    await r.getByRole('checkbox').first().check();
    await r
      .getByRole('button', { name: 'Load financial casework', exact: true })
      .click();
    await expect(r).toContainText('4 matching of 4 admitted jobs');
    await r
      .getByLabel('Search financial casework', { exact: true })
      .fill('no-such-source');
    await expect(r).toContainText('0 matching');
    await r.getByLabel('Search financial casework', { exact: true }).fill('');
    await r
      .getByRole('button', { name: /^Inspect job casework:/ })
      .first()
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Exact financial casework source',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r).toContainText('Why invoice preparation is blocked');
    await r
      .getByRole('button', {
        name: 'Check retained source review',
        exact: true,
      })
      .click();
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle13/finance-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', {
        name: 'Open original financial review workflow',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('region', {
        name: 'Canonical financial evidence review',
        exact: true,
      }),
    ).toBeVisible();
    await audit(page, r);
  });
}
