import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

test('all companies review exact published evidence, prepare one repair draft, edit scope and navigate both directions', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4173/')) outside.push(r.url());
  });
  await page.goto('/preview');
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    await page
      .getByRole('button', { name: 'Property operations', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Maintenance & follow-up', exact: true })
      .click();
    const center = page.getByRole('region', {
      name: 'Maintenance & follow-up center',
      exact: true,
    });
    await center
      .getByText('Development-only maintenance examples & states', {
        exact: true,
      })
      .click();
    await center
      .getByRole('button', {
        name: 'Prepare synthetic maintenance examples',
        exact: true,
      })
      .click();
    await expect(center.locator('.maintenance-card')).toHaveCount(3);
    const card = center.locator('.maintenance-card').first();
    const report = await card.getAttribute('data-report-id'),
      version = await card.getAttribute('data-report-version');
    await card
      .getByRole('button', { name: 'Review finding', exact: true })
      .click();
    const repair = center.getByRole('region', {
      name: 'Repair estimate preparation',
      exact: true,
    });
    await repair
      .getByRole('button', { name: 'Prepare repair estimate', exact: true })
      .click();
    await expect(repair).toContainText(report!);
    await expect(repair).toContainText('Published v' + version);
    await expect(repair).toContainText('Observation:');
    await expect(repair).toContainText('Recommendation:');
    const prepare = repair.getByRole('button', {
      name: 'Confirm & prepare repair draft',
      exact: true,
    });
    await expect(prepare).toBeDisabled();
    await repair
      .getByRole('button', { name: 'Cancel repair preparation', exact: true })
      .click();
    await expect(prepare).toHaveCount(0);
    await expect(center.locator('.maintenance-card').first()).not.toContainText(
      'Repair preparation:',
    );
    await repair
      .getByRole('button', { name: 'Prepare repair estimate', exact: true })
      .click();
    await repair.getByRole('checkbox').focus();
    await page.keyboard.press('Space');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await prepare.click();
    const workflow = center.getByRole('region', {
      name: 'Exact repair estimate workflow',
      exact: true,
    });
    await expect(workflow).toContainText('Report ' + report);
    await expect(workflow).toContainText('Published v' + version);
    await expect(workflow).toContainText('Prepared by ' + org + '-owner');
    await expect(
      workflow.getByRole('button', { name: 'All estimates', exact: true }),
    ).toHaveCount(0);
    await expect(
      workflow.getByRole('button', {
        name: 'Issue internal snapshot',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      workflow.getByRole('button', { name: 'Duplicate estimate', exact: true }),
    ).toBeDisabled();
    await expect(
      workflow.getByRole('combobox', {
        name: 'Estimate customer',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      workflow.getByRole('combobox', { name: 'Job location', exact: true }),
    ).toBeDisabled();
    const scope = workflow.getByRole('textbox', {
      name: 'Scope item 1',
      exact: true,
    });
    await scope.fill('Contractor-reviewed synthetic joint repair scope');
    await workflow
      .getByRole('button', { name: 'Save estimate draft', exact: true })
      .click();
    await expect(workflow).toContainText('Saved revision 2');
    await expect(scope).toHaveValue(
      'Contractor-reviewed synthetic joint repair scope',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/property', { recursive: true });
    await workflow
      .getByRole('heading', {
        name: 'Repair draft · contractor review required',
        exact: true,
      })
      .evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await page.screenshot({
      path: `artifacts/property/repair-${info.project.name}-${org}.png`,
    });
    await workflow
      .getByRole('button', {
        name: 'Return to originating maintenance finding',
        exact: true,
      })
      .click();
    await expect(center.locator('.maintenance-card').first()).toContainText(
      'Repair preparation: prepared',
    );
    await expect(
      repair.getByRole('button', {
        name: 'Prepare repair estimate',
        exact: true,
      }),
    ).toHaveCount(0);
    await repair
      .getByRole('button', { name: 'Open exact repair draft', exact: true })
      .click();
    await expect(workflow).toContainText('Saved revision 2');
    await expect(scope).toHaveValue(
      'Contractor-reviewed synthetic joint repair scope',
    );
    await workflow
      .getByRole('button', {
        name: 'Open originating published report',
        exact: true,
      })
      .click();
    const source = page.locator(`details[data-report-id="${report}"]`);
    await expect(source).toHaveAttribute('open', '');
    await expect(source).toHaveAttribute('data-report-version', version!);
    await expect(source).toContainText('Weathered joint material documented.');
    await expect(source).not.toContainText(
      'Contractor-reviewed synthetic joint repair scope',
    );
    await page
      .getByRole('button', { name: 'Maintenance & follow-up', exact: true })
      .click();
    await center
      .locator('.maintenance-card')
      .first()
      .getByRole('button', { name: 'Review finding', exact: true })
      .click();
    await repair
      .getByRole('button', { name: 'Open exact repair draft', exact: true })
      .click();
    await expect(workflow).toContainText(report!);
    await page
      .getByRole('button', { name: 'Client project view', exact: true })
      .click();
    const customer = page.getByRole('region', {
      name: 'Client property report',
    });
    for (const privateText of [
      'Contractor-reviewed synthetic joint repair scope',
      'Prepared by',
      'Repair preparation',
      'unit_cost_minor',
    ])
      await expect(customer).not.toContainText(privateText);
  }
  expect(outside).toEqual([]);
});
