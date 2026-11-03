import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle14-browser-helpers';
for (const company of sampleCompanies) {
  test(`service exact report/version/finding navigation / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Service source continuity');
    const r = page.getByRole('region', {
      name: 'Service source continuity',
      exact: true,
    });
    await r
      .getByRole('button', {
        name: 'Inspect selected service source',
        exact: true,
      })
      .click();
    const report = r
      .getByRole('button', { name: /^Open exact published report / })
      .first();
    const name = (await report.innerText()).replace(/\s+/g, ' ').trim();
    await report.click();
    await expect(
      r.getByRole('heading', {
        name: name.replace(/^Open exact/, 'Exact'),
        exact: true,
      }),
    ).toBeFocused();
    await expect(r).toContainText('This does not verify physical completion');
    await r
      .getByRole('button', { name: /^Inspect exact published finding / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', { name: /^Exact original finding / }),
    ).toBeFocused();
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle14/service-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', {
        name: 'Back to published report selection',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('button', { name: /^Open exact published report / }).first(),
    ).toBeVisible();
    await r.getByRole('button', { name, exact: true }).click();
    await r
      .getByRole('button', { name: /^Open continuity existing job / })
      .click();
    await expect(page.locator('#operating-selected-heading')).toBeFocused();
  });
  test(`maintenance requested purpose stays blocked and cancel reconciles / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Maintenance planning continuity');
    const r = page.getByRole('region', {
      name: 'Maintenance planning continuity',
      exact: true,
    });
    await r.getByRole('checkbox').first().check();
    await r
      .getByRole('button', {
        name: 'Review maintenance continuity sources',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', { name: /^Inspect maintenance planning source / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Exact maintenance planning handoff',
        exact: true,
      }),
    ).toBeFocused();
    await r.getByRole('checkbox').last().check();
    await r
      .getByRole('button', {
        name: 'Review maintenance planning requirements',
        exact: true,
      })
      .click();
    await expect(r).toContainText('Communication authority BLOCKED');
    await r
      .getByRole('button', {
        name: 'Open exact maintenance continuity source',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Exact maintenance continuity source',
        exact: true,
      }),
    ).toBeFocused();
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle14/growth-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', {
        name: 'Cancel maintenance planning review',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', {
        name: 'Reconcile exact maintenance planning read only',
        exact: true,
      })
      .click();
    await expect(r).toContainText('CANCELLED');
    await expect(
      r.getByRole('button', {
        name: 'Review maintenance continuity sources',
        exact: true,
      }),
    ).toBeDisabled();
  });
  test(`Copilot inspected task opens exact existing review / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Verified Copilot handoff');
    const r = page.getByRole('region', {
      name: 'Verified task handoff',
      exact: true,
    });
    await r.getByRole('checkbox').check();
    await r
      .getByRole('button', { name: 'Read verified task sources', exact: true })
      .click();
    await r
      .getByRole('button', { name: /^Inspect task handoff source:/ })
      .first()
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Retained exact task identity',
        exact: true,
      }),
    ).toBeFocused();
    await r
      .getByRole('button', {
        name: 'Recheck retained task handoff',
        exact: true,
      })
      .click();
    await expect(r).toContainText('Missing evidence and blocked actions');
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle14/intelligence-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', { name: 'Open retained task review', exact: true })
      .click();
    await expect(page.locator('[id^="operating-selected-"]:focus')).toHaveCount(
      1,
    );
  });
}
