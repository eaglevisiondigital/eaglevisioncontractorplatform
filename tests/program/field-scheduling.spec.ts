import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
test('actual existing sources, filters and follow-up draft across three companies', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4186/')) external.push(r.url());
  });
  await page.goto('/preview/field-scheduling');
  await expect(
    page.getByRole('heading', { name: 'Inspection schedule', exact: true }),
  ).toBeVisible();
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    await expect(page.locator('.field-visit')).toHaveCount(1);
    expect(
      await page.evaluate(() => {
        const header = document
          .querySelector('.field-header')!
          .getBoundingClientRect();
        const company = document
          .querySelector('.field-header select')!
          .getBoundingClientRect();
        const main = document
          .querySelector('#field-main')!
          .getBoundingClientRect();
        return company.bottom <= header.bottom && header.bottom <= main.top;
      }),
    ).toBe(true);
    await page
      .getByText('Development-only examples & states', { exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Prepare synthetic follow-up example',
        exact: true,
      })
      .click();
    await expect(page.locator('.field-visit')).toHaveCount(5);
    await expect(
      page.getByRole('button', {
        name: 'Synthetic examples prepared',
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole('combobox', { name: 'Follow-up responsibility', exact: true })
      .selectOption(org + '-field');
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await expect(page.locator('.field-visit')).toContainText(
      'Draft inspection',
    );
    await page
      .getByRole('button', { name: /Open originating finding/ })
      .click();
    await expect(page.locator('.field-source')).toBeFocused();
    const source = page.locator('.field-source');
    await expect(source).toContainText('Originating finding ID');
    await expect(source).toContainText('Observation:');
    await expect(source).toContainText('Recommendation:');
    await expect(source).toContainText('v1');
    await expect(source).toContainText('Published source visit ID');
    await expect(source).not.toContainText('INTERNAL');
    await expect(page.locator('body')).not.toContainText('PRIVATE staff');
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/property', { recursive: true });
    await page.screenshot({
      path: `artifacts/property/field-schedule-${info.project.name}-${org}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Close source detail' }).click();
    await page.getByLabel('From date', { exact: true }).fill('2026-11-20');
    await page.getByLabel('Through date', { exact: true }).fill('2026-11-20');
    await page
      .getByRole('combobox', { name: 'Recorded visit status' })
      .selectOption('draft');
    await expect(page.locator('.field-count')).toHaveText(
      '1 of 5 available visit records',
    );
    await page.getByLabel('From date', { exact: true }).fill('2026-12-01');
    await expect(page.getByRole('alert')).toHaveText(
      'Start date must be on or before end date.',
    );
    await expect(page.locator('.field-visit')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Reset filters', exact: true })
      .click();
    await page.getByLabel('Through date', { exact: true }).fill('2026-01-01');
    await expect(
      page.getByRole('heading', { name: 'No visits match these filters' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Clear through date' }).click();
    await expect(page.locator('.field-visit')).toHaveCount(5);
    const property = page.getByRole('combobox', {
      name: 'Property',
      exact: true,
    });
    const options = await property.locator('option').all();
    expect(options.length).toBe(3);
    await property.selectOption((await options[2].getAttribute('value')) || '');
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await page
      .getByRole('button', { name: 'Reset filters', exact: true })
      .click();
    await page.getByRole('button', { name: 'Simulate schedule error' }).click();
    await expect(
      page.getByRole('heading', { name: 'Schedule unavailable' }),
    ).toBeVisible();
    await expect(page.locator('.field-visit')).toHaveCount(0);
    await page.getByRole('button', { name: 'Reload schedule' }).click();
    await expect(page.locator('.field-visit')).toHaveCount(5);
    await page
      .getByRole('button', { name: 'Inspect exact visit' })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact inspection visit' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close source detail' }).click();
    await page
      .getByRole('button', { name: 'Open report v1', exact: true })
      .first()
      .click();
    await expect(page.locator('.field-source')).toContainText(
      'Report ID / published version',
    );
    await page.getByRole('button', { name: 'Close source detail' }).click();
  }
  expect(external).toEqual([]);
});
test('production build cannot enable the isolated prototype and existing preview remains intact', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4187/preview/field-scheduling');
  await expect(
    page.getByRole('heading', { name: 'Field scheduling preview is disabled' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Prepare synthetic follow-up example' }),
  ).toHaveCount(0);
  await page.goto('/preview/property-portal');
  await expect(page.locator('.portal-concept')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Inspection schedule', exact: true }),
  ).toHaveCount(0);
});

for (const org of [
  'sample-property',
  'sample-construction',
  'sample-roofing',
]) {
  test(`weekly navigation retains exact ${org} visit filters and source`, async ({
    page,
  }) => {
    await page.goto('/preview/field-scheduling');
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await page
      .getByText('Development-only examples & states', { exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Prepare synthetic follow-up example',
        exact: true,
      })
      .click();
    await expect(page.locator('.field-visit')).toHaveCount(5);
    const responsibility = page.getByRole('combobox', {
      name: 'Follow-up responsibility',
      exact: true,
    });
    const property = page.getByRole('combobox', {
      name: 'Property',
      exact: true,
    });
    const status = page.getByRole('combobox', {
      name: 'Recorded visit status',
    });
    await responsibility.selectOption(org + '-field');
    await status.selectOption('draft');
    await expect(page.locator('.field-visit')).toHaveCount(1);
    const text = await page.locator('.field-visit').innerText();
    const choices = await property.locator('option').evaluateAll((options) =>
      options.map((option) => ({
        value: (option as HTMLOptionElement).value,
        label: option.textContent!,
      })),
    );
    const selectedProperty = choices.find(
      (option) => option.value && text.includes(option.label),
    )!;
    expect(selectedProperty).toBeDefined();
    await property.selectOption(selectedProperty.value);
    await page
      .getByRole('button', { name: /Open originating finding/ })
      .click();
    const source = await page.locator('.field-source').innerText();
    await page
      .getByRole('button', { name: 'Show recorded week', exact: true })
      .click();
    await expect(page.getByLabel('From date', { exact: true })).toHaveValue(
      '2026-11-16',
    );
    await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
      '2026-11-22',
    );
    await expect(page.locator('.field-source')).toHaveCount(0);
    await expect(property).toHaveValue(selectedProperty.value);
    await expect(responsibility).toHaveValue(org + '-field');
    await expect(status).toHaveValue('draft');
    await expect(page.locator('.field-visit')).toHaveCount(1);
    const next = page.getByRole('button', { name: 'Next week', exact: true });
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('From date', { exact: true })).toHaveValue(
      '2026-11-23',
    );
    await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
      '2026-11-29',
    );
    await expect(page.locator('.field-visit')).toHaveCount(0);
    await expect(property).toHaveValue(selectedProperty.value);
    await expect(responsibility).toHaveValue(org + '-field');
    await page
      .getByRole('button', { name: 'Previous week', exact: true })
      .click();
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await page
      .getByRole('button', { name: /Open originating finding/ })
      .click();
    expect(await page.locator('.field-source').innerText()).toBe(source);
    await page.getByLabel('From date', { exact: true }).fill('2026-12-30');
    await expect(page.getByRole('alert')).toHaveText(
      'Start date must be on or before end date.',
    );
    await expect(
      page.getByRole('button', { name: 'Show recorded week', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Next week', exact: true }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Reset filters', exact: true })
      .click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(
        org === 'sample-property' ? 'sample-construction' : 'sample-property',
      );
    await expect(page.getByLabel('From date', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
      '',
    );
    await expect(property).toHaveValue('');
    await expect(responsibility).toHaveValue('');
    await expect(page.locator('.field-source')).toHaveCount(0);
  });
}

for (const org of [
  'sample-property',
  'sample-construction',
  'sample-roofing',
]) {
  test(`property service history preserves ${org} schedule context`, async ({
    page,
  }) => {
    await page.goto('/preview/field-scheduling');
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await page
      .getByText('Development-only examples & states', { exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Prepare synthetic follow-up example',
        exact: true,
      })
      .click();
    await expect(page.locator('.field-visit')).toHaveCount(5);
    await page.getByLabel('From date', { exact: true }).fill('2026-11-20');
    await page.getByLabel('Through date', { exact: true }).fill('2026-11-20');
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await page
      .getByRole('button', { name: 'Inspect exact visit', exact: true })
      .click();
    const original = await page.locator('.field-source dd').first().innerText();
    const history = page.getByRole('region', {
      name: 'Recorded property service history',
    });
    const visit = history.getByRole('button', {
      name: 'Inspect recorded visit 2026-11-13',
      exact: true,
    });
    await expect(visit).toBeEnabled();
    await expect(
      history.getByRole('button', { name: /2026-11-07/ }),
    ).toHaveCount(0);
    await visit.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.field-source')).toBeFocused();
    await expect(page.locator('.field-source dd').first()).not.toHaveText(
      original,
    );
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await expect(page.getByLabel('From date', { exact: true })).toHaveValue(
      '2026-11-20',
    );
    await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
      '2026-11-20',
    );
    const report = history.getByRole('button', {
      name: 'Open 2026-11-13 report v1',
      exact: true,
    });
    await report.click();
    await expect(
      page.getByRole('heading', {
        name: 'Exact published source',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('.field-source')).toContainText('2026-11-13');
    await expect(page.locator('.field-source')).not.toContainText('PRIVATE');
    await expect(report).toBeDisabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await history
      .getByRole('button', {
        name: 'Inspect recorded visit 2026-11-20',
        exact: true,
      })
      .click();
    await expect(page.locator('.field-source dd').first()).toHaveText(original);
    await page
      .getByRole('button', { name: 'Close source detail', exact: true })
      .click();
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(
        org === 'sample-property' ? 'sample-construction' : 'sample-property',
      );
    await expect(history).toHaveCount(0);
    await expect(page.getByLabel('From date', { exact: true })).toHaveValue('');
  });
}

for (const org of [
  'sample-property',
  'sample-construction',
  'sample-roofing',
]) {
  test(`visit documentation and job-cost handoff retains ${org} context`, async ({
    page,
  }) => {
    await page.goto('/preview/field-scheduling');
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await page
      .getByText('Development-only examples & states', { exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Prepare synthetic follow-up example',
        exact: true,
      })
      .click();
    await expect(page.locator('.field-visit')).toHaveCount(5);
    await page.getByLabel('From date', { exact: true }).fill('2026-11-13');
    await page.getByLabel('Through date', { exact: true }).fill('2026-11-13');
    await page
      .getByRole('button', { name: 'Inspect exact visit', exact: true })
      .click();
    const visit = await page.locator('.field-source dd').first().innerText();
    await page
      .getByRole('button', {
        name: 'Review customer-safe documentation',
        exact: true,
      })
      .click();
    const docs = page.getByRole('region', {
      name: 'Customer-safe service documentation',
    });
    await expect(docs).toBeVisible();
    await expect(docs.locator('[data-report-id]')).toHaveCount(1);
    await expect(docs).toContainText('2026-11-13');
    await docs.getByText('Inspection checklist', { exact: true }).click();
    await expect(docs).toContainText('Completed: Inspect property condition');
    await expect(docs).toContainText('not verified physical completion');
    await expect(docs).not.toContainText('INTERNAL');
    await expect(docs).not.toContainText('Job cost variance');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
      .getByRole('button', { name: 'Back to recorded visit', exact: true })
      .click();
    await expect(docs).toHaveCount(0);
    await expect(page.locator('.field-source dd').first()).toHaveText(visit);
    await page
      .getByRole('button', {
        name: 'Review recorded visit job costs',
        exact: true,
      })
      .click();
    const costs = page.getByRole('region', {
      name: 'Staff-only linked job costs',
    });
    await expect(
      costs.getByRole('heading', { name: 'Job cost variance', exact: true }),
    ).toBeVisible();
    await expect(costs).toContainText('Job baseline property UNKNOWN');
    await expect(costs).toContainText('not attributed to this property');
    await expect(costs).toContainText('PARTIAL');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole('button', { name: 'Back to recorded visit', exact: true })
      .click();
    await expect(costs).toHaveCount(0);
    await expect(page.locator('.field-source dd').first()).toHaveText(visit);
    await expect(page.getByLabel('From date', { exact: true })).toHaveValue(
      '2026-11-13',
    );
    await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
      '2026-11-13',
    );
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await page
      .getByRole('region', { name: 'Recorded property service history' })
      .getByRole('button', {
        name: 'Inspect recorded visit 2026-11-20',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Review customer-safe documentation',
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(
        org === 'sample-property' ? 'sample-construction' : 'sample-property',
      );
    await expect(page.locator('.field-source')).toHaveCount(0);
    await expect(costs).toHaveCount(0);
    await expect(docs).toHaveCount(0);
  });
}

for (const org of [
  'sample-property',
  'sample-construction',
  'sample-roofing',
]) {
  test(`issued job source retains ${org} financial review inputs and schedule`, async ({
    page,
  }) => {
    await page.goto('/preview/field-scheduling');
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await page
      .getByText('Development-only examples & states', { exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Prepare synthetic follow-up example',
        exact: true,
      })
      .click();
    await expect(page.locator('.field-visit')).toHaveCount(5);
    await page.getByLabel('From date', { exact: true }).fill('2026-11-13');
    await page.getByLabel('Through date', { exact: true }).fill('2026-11-13');
    await page
      .getByRole('button', { name: 'Inspect exact visit', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Review recorded visit job costs',
        exact: true,
      })
      .click();
    const costs = page.getByRole('region', {
      name: 'Staff-only linked job costs',
    });
    await expect(
      costs.getByRole('heading', { name: 'Job cost variance', exact: true }),
    ).toBeVisible();
    const input = costs.getByLabel('Minimum projected margin (%)', {
      exact: true,
    });
    await input.fill('12.34');
    await costs
      .getByRole('button', {
        name: 'Review issued scope & job visits',
        exact: true,
      })
      .focus();
    await page.keyboard.press('Enter');
    const source = page.getByRole('region', {
      name: 'Issued estimate and job source review',
    });
    await expect(
      source.getByRole('heading', {
        name: 'Original issued job scope',
        exact: true,
      }),
    ).toBeVisible();
    await expect(source).toContainText('not the latest draft');
    await expect(source).toContainText('does not establish customer approval');
    await expect(source).toContainText('invoice readiness remain separate');
    const version = await costs
      .locator('dt')
      .filter({ hasText: /^Issued source version$/ })
      .locator('xpath=following-sibling::dd[1]')
      .innerText();
    await expect(source).toContainText(version);
    await expect(
      source.getByRole('button', {
        name: 'Inspect job visit 2026-11-13',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      source.getByRole('button', {
        name: 'Inspect job visit 2026-11-07',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(input).toHaveValue('12.34');
    await costs
      .getByRole('button', { name: 'Close issued scope review', exact: true })
      .click();
    await expect(source).toHaveCount(0);
    await expect(input).toHaveValue('12.34');
    await costs
      .getByRole('button', {
        name: 'Review issued scope & job visits',
        exact: true,
      })
      .click();
    await expect(
      source.getByRole('heading', {
        name: 'Original issued job scope',
        exact: true,
      }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await source
      .getByRole('button', {
        name: 'Inspect job visit 2026-11-20',
        exact: true,
      })
      .click();
    await expect(costs).toHaveCount(0);
    await expect(page.locator('.field-source')).toContainText(
      'Current recorded status: draft',
    );
    await expect(page.getByLabel('From date', { exact: true })).toHaveValue(
      '2026-11-13',
    );
    await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
      '2026-11-13',
    );
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(
        org === 'sample-property' ? 'sample-construction' : 'sample-property',
      );
    await expect(page.locator('.field-source')).toHaveCount(0);
    await expect(source).toHaveCount(0);
  });
}
