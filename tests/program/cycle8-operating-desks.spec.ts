import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleCompanies } from '../../src/domain/platform';

for (const company of sampleCompanies)
  test(`weekly crew, finance and sales / ${company.slug}`, async ({
    page,
  }, info) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (
        !r.url().startsWith('http://127.0.0.1:4218') &&
        !r.url().startsWith('data:')
      )
        external.push(r.url());
    });
    await page.goto('/preview/contractor-journey');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    await page
      .getByLabel(
        'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
      )
      .check();
    await page
      .getByRole('button', {
        name: 'Prepare local synthetic journey',
        exact: true,
      })
      .click();
    const context = page.getByRole('region', {
      name: 'Exact shared journey context',
    });
    await expect(context).toBeVisible();
    const original = await context.innerText();

    const weekly = page.getByRole('region', {
      name: 'Weekly crew scheduling review',
      exact: true,
    });
    const confirmWeekly = weekly.getByLabel(
      'I confirm this exact local weekly source and proposal review.',
    );
    await confirmWeekly.focus();
    await confirmWeekly.press('Space');
    await weekly
      .getByRole('button', { name: 'Review weekly crew board', exact: true })
      .click();
    await expect(
      weekly.getByRole('heading', {
        name: 'Seven-day crew evidence',
        exact: true,
      }),
    ).toBeFocused();
    await expect(weekly.locator('.wc-week > button')).toHaveCount(7);
    await weekly
      .getByRole('button', { name: 'Inspect exact source 1', exact: true })
      .click();
    await expect(
      weekly.getByRole('heading', { name: 'Exact field source' }),
    ).toBeFocused();
    await weekly
      .getByRole('button', { name: 'Retain snapshot A for source comparison' })
      .click();
    await weekly.getByLabel('Proposal day', { exact: true }).fill('2026-12-29');
    await weekly
      .getByRole('combobox', { name: 'Assigned technician', exact: true })
      .selectOption({ index: 1 });
    await weekly.getByLabel('Proposed start', { exact: true }).fill('09:00');
    await weekly.getByLabel('Proposed end', { exact: true }).fill('10:00');
    await weekly
      .getByLabel('Proposed working-hours start', { exact: true })
      .fill('08:00');
    await weekly
      .getByLabel('Proposed working-hours end', { exact: true })
      .fill('17:00');
    await weekly
      .getByRole('button', {
        name: 'Add unsaved proposal to review',
        exact: true,
      })
      .click();
    await expect(
      weekly.getByRole('heading', { name: 'Seven-day crew evidence' }),
    ).toHaveCount(0);
    await confirmWeekly.check();
    await weekly
      .getByRole('button', { name: 'Review weekly crew board', exact: true })
      .click();
    await expect(
      weekly.getByRole('heading', {
        name: 'Seven-day crew evidence',
        exact: true,
      }),
    ).toBeFocused();
    await weekly.getByRole('button', { name: /^2026-12-29 / }).click();
    await expect(weekly.locator('.wc-event')).toContainText('PROPOSED WINDOW');
    await weekly
      .getByRole('button', { name: 'Inspect exact source 1', exact: true })
      .click();
    await expect(weekly).toContainText('No visit moved or created');
    await expect(weekly).toContainText('Job window only');
    await weekly
      .getByLabel(
        'Compare these exact captured snapshot references without applying either proposal.',
      )
      .check();
    await weekly
      .getByRole('button', {
        name: 'Compare retained weekly snapshots',
        exact: true,
      })
      .click();
    await expect(weekly).toContainText('MATCHING SOURCE REVIEW ONLY');
    await expect(weekly).toContainText(
      'No lock acquired, assignment written or proposal applied.',
    );
    await weekly.screenshot({
      path: `artifacts/cycle8/weekly-${info.project.name}-${company.slug}.png`,
    });

    const finance = page.getByRole('region', {
      name: 'Finance operating review',
      exact: true,
    });
    await finance
      .getByRole('button', {
        name: 'Use saved forecast as starting values',
        exact: true,
      })
      .click();
    await finance.getByLabel('Materials · USD', { exact: true }).fill('125.50');
    await finance
      .getByLabel(
        'These additional forecasts exclude recorded actual costs and existing unpaid commitments.',
      )
      .check();
    await finance
      .getByLabel(
        'I confirm the exact saved source and these unsaved additional forecasts. No posting, invoice, supplier order or payment is authorized.',
      )
      .check();
    await finance
      .getByRole('button', { name: 'Review cost to complete', exact: true })
      .click();
    await expect(
      finance.getByRole('region', { name: 'Category forecast comparison' }),
    ).toContainText('$125.50');
    await expect(
      finance.getByRole('region', { name: 'Unsaved cost to complete' }),
    ).toContainText('UNKNOWN');
    await expect(
      finance.getByRole('region', {
        name: 'Finance desk invoice requirements',
      }),
    ).toContainText('NO_GO');
    await finance
      .getByRole('button', { name: 'Inspect exact Finance desk review' })
      .click();
    await expect(finance.getByRole('status')).toContainText(
      'CURRENT_LOCAL_SOURCE',
    );
    await finance.screenshot({
      path: `artifacts/cycle8/finance-${info.project.name}-${company.slug}.png`,
    });
    await finance.getByLabel('Materials · USD', { exact: true }).fill('-1');
    await expect(
      finance.getByRole('region', { name: 'Category forecast comparison' }),
    ).toHaveCount(0);
    await expect(
      finance.getByRole('button', {
        name: 'Review cost to complete',
        exact: true,
      }),
    ).toBeDisabled();

    const sales = page.getByRole('region', {
      name: 'Booking and scope review',
      exact: true,
    });
    await sales
      .getByRole('button', {
        name: 'Review booking and exact scope',
        exact: true,
      })
      .click();
    await expect(
      sales.getByRole('region', { name: 'Exact source handoff' }),
    ).toBeVisible();
    const confirmations = sales.getByRole('checkbox');
    for (let i = 0; i < (await confirmations.count()); i++)
      await confirmations.nth(i).check();
    await sales
      .getByRole('button', {
        name: 'Prepare booking-to-contract staff snapshot',
        exact: true,
      })
      .click();
    const packet = sales.getByRole('region', {
      name: 'Booking-to-contract staff snapshot',
      exact: true,
    });
    await expect(packet).toContainText('Contract execution BLOCKED');
    await sales
      .getByRole('button', {
        name: 'Inspect exact retained sales snapshot',
        exact: true,
      })
      .click();
    await expect(packet).toContainText('CURRENT_REVIEW_ONLY');
    await expect(
      sales.getByRole('button', {
        name: 'Prepare booking-to-contract staff snapshot',
        exact: true,
      }),
    ).toBeDisabled();
    await sales.screenshot({
      path: `artifacts/cycle8/sales-${info.project.name}-${company.slug}.png`,
    });
    expect(await context.innerText()).toBe(original);
    for (const panel of [weekly, finance, sales]) {
      expect(
        await panel.evaluate((el) =>
          getComputedStyle(el).getPropertyValue('--company-color').trim(),
        ),
      ).toBe(company.primary_color);
      for (const button of await panel.getByRole('button').all()) {
        if (await button.isVisible())
          expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(
            43,
          );
      }
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(external).toEqual([]);
  });
