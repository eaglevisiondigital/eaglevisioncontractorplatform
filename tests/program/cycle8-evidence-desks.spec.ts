import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleCompanies } from '../../src/domain/platform';

for (const company of sampleCompanies)
  test(`completion, maintenance and daily evidence / ${company.slug}`, async ({
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

    const customer = page.getByRole('region', {
      name: 'Customer completion evidence review',
      exact: true,
    });
    await customer
      .getByRole('button', {
        name: 'Review scope and completion documentation',
        exact: true,
      })
      .click();
    await expect(
      customer.getByRole('region', {
        name: 'Original issued job scope',
        exact: true,
      }),
    ).toBeVisible();
    await customer
      .getByRole('button', {
        name: 'Open exact completion evidence source',
        exact: true,
      })
      .click();
    const detail = customer.getByRole('region', {
      name: 'Exact completion evidence source',
      exact: true,
    });
    await expect(
      detail.getByRole('heading', { name: 'Exact completion evidence source' }),
    ).toBeFocused();
    await expect(detail).toContainText(
      'A weathered exterior joint was documented.',
    );
    await expect(detail).toContainText('Recommendation:');
    const confirmations = customer.getByRole('checkbox');
    for (let i = 0; i < (await confirmations.count()); i++)
      await confirmations.nth(i).check();
    await customer
      .getByRole('button', {
        name: 'Prepare completion documentation summary',
        exact: true,
      })
      .click();
    const packet = customer.getByRole('region', {
      name: 'Immutable completion documentation summary',
      exact: true,
    });
    await expect(packet).toContainText('NOT SENT');
    await expect(packet).toContainText('UNVERIFIED');
    await customer
      .getByRole('button', {
        name: 'Inspect retained completion review',
        exact: true,
      })
      .click();
    await expect(packet).toContainText('CURRENT_REVIEW_ONLY');
    await expect(customer).not.toContainText(
      /PRIVATE|unit_cost_minor|cash_hour|supplier_cost|payroll/,
    );
    await expect(
      customer.getByRole('button', {
        name: 'Prepare completion documentation summary',
        exact: true,
      }),
    ).toBeDisabled();
    await customer.screenshot({
      path: `artifacts/cycle8/customer-${info.project.name}-${company.slug}.png`,
    });

    const maintenance = page.getByRole('region', {
      name: 'Maintenance and renewal planning',
      exact: true,
    });
    const confirmMaintenance = maintenance.getByLabel(
      'I confirm this exact local maintenance planning review.',
    );
    await confirmMaintenance.check();
    await maintenance
      .getByRole('button', {
        name: 'Review maintenance opportunities',
        exact: true,
      })
      .click();
    await expect(
      maintenance.getByRole('heading', {
        name: 'Available maintenance review desk',
        exact: true,
      }),
    ).toBeFocused();
    await maintenance
      .getByRole('button', {
        name: 'Inspect published finding source',
        exact: true,
      })
      .first()
      .click();
    await expect(
      maintenance.getByRole('heading', {
        name: 'Exact published maintenance source',
        exact: true,
      }),
    ).toBeFocused();
    await expect(maintenance).toContainText(
      'A weathered exterior joint was documented.',
    );
    await maintenance
      .getByLabel('Search available planning evidence', { exact: true })
      .fill('no such recorded opportunity');
    await confirmMaintenance.check();
    await maintenance
      .getByRole('button', {
        name: 'Review maintenance opportunities',
        exact: true,
      })
      .click();
    await expect(
      maintenance.getByText(/No matching available occurrence candidates/),
    ).toBeVisible();
    await maintenance
      .getByLabel('Search available planning evidence', { exact: true })
      .fill('');
    await maintenance
      .getByRole('combobox', { name: 'Staff planning readiness', exact: true })
      .selectOption('preparable');
    await confirmMaintenance.check();
    await maintenance
      .getByRole('button', {
        name: 'Review maintenance opportunities',
        exact: true,
      })
      .click();
    await maintenance
      .getByRole('button', {
        name: 'Review exact occurrence 2027-01-04',
        exact: true,
      })
      .click();
    await maintenance
      .getByLabel(
        'I confirm this exact source for an unsaved staff visit proposal.',
      )
      .check();
    await maintenance
      .getByRole('button', {
        name: 'Prepare exact staff planning proposal',
        exact: true,
      })
      .click();
    await expect(
      maintenance.getByRole('heading', {
        name: 'Immutable staff planning snapshot',
        exact: true,
      }),
    ).toBeVisible();
    await expect(maintenance).toContainText(
      'Scheduling, messages and billing BLOCKED.',
    );
    await maintenance
      .getByRole('button', {
        name: 'Reconcile exact retained preparation',
        exact: true,
      })
      .click();
    await expect(maintenance.getByRole('status')).toContainText(
      'exact retained planning snapshot is available',
    );
    await maintenance
      .getByLabel(
        'Check this exact customer/channel/purpose boundary without sending.',
      )
      .check();
    await maintenance
      .getByRole('button', {
        name: 'Review consent-at-send boundary',
        exact: true,
      })
      .click();
    await expect(
      maintenance.getByRole('heading', {
        name: 'Decision BLOCKED · current consent UNKNOWN',
        exact: true,
      }),
    ).toBeVisible();
    await maintenance
      .getByRole('button', {
        name: 'Check exact retained consent review',
        exact: true,
      })
      .click();
    await expect(maintenance.getByRole('status')).toContainText(
      'UNKNOWN and BLOCKED',
    );
    await maintenance.screenshot({
      path: `artifacts/cycle8/growth-${info.project.name}-${company.slug}.png`,
    });

    const daily = page.getByRole('region', {
      name: 'Daily operating priorities',
      exact: true,
    });
    await daily
      .getByLabel(
        'I confirm this exact local job and day context for read-only staff review.',
      )
      .check();
    await daily
      .getByRole('button', { name: 'Review daily priorities', exact: true })
      .click();
    await expect(
      daily.getByLabel('Search available cards', { exact: true }),
    ).toBeVisible();
    await expect(daily).toContainText('Finance coverage: UNKNOWN');
    await daily
      .getByRole('combobox', { name: 'Review area', exact: true })
      .selectOption('documentation');
    await expect(daily.getByRole('status')).toContainText('1 matching of');
    await daily
      .getByRole('button', { name: 'Inspect exact report source', exact: true })
      .click();
    await expect(
      daily.getByRole('heading', {
        name: 'Exact retained source evidence',
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      daily.getByRole('region', {
        name: 'Daily priority exact source',
        exact: true,
      }),
    ).toContainText('A weathered exterior joint was documented.');
    await daily
      .getByLabel('Search available cards', { exact: true })
      .fill('no recorded evidence has these words');
    await expect(
      daily.getByRole('heading', {
        name: 'No matching available evidence',
        exact: true,
      }),
    ).toBeVisible();
    await daily
      .getByRole('button', { name: 'Clear priority filters', exact: true })
      .click();
    await daily
      .getByRole('button', { name: 'Inspect exact daily review', exact: true })
      .click();
    await expect(daily).toContainText('CURRENT_LOCAL_SOURCE');
    await daily.screenshot({
      path: `artifacts/cycle8/daily-${info.project.name}-${company.slug}.png`,
    });
    expect(await context.innerText()).toBe(original);
    for (const panel of [customer, maintenance, daily]) {
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
