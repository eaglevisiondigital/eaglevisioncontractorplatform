import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const groups = [
  'Scope & Source Evidence',
  'Quantities & Measurements',
  'Materials & Labor',
  'Pricing & Profitability',
  'Tax Applicability',
  'Terms & Completeness',
];
async function check(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function capture(page: Page, path: string, target?: Locator) {
  await mkdir('artifacts/property', { recursive: true });
  if (target)
    await target.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  else await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `artifacts/property/contractor-polish-${path}.png`,
  });
  if (target && path.includes('readiness'))
    await target.screenshot({
      path: `artifacts/property/contractor-polish-${path}-full.png`,
    });
  if (path.endsWith('-queue'))
    await page.screenshot({
      path: `artifacts/property/contractor-polish-${path}-full.png`,
      fullPage: true,
    });
}
async function repair(page: Page) {
  const center = page.getByRole('region', {
    name: 'Maintenance & follow-up center',
    exact: true,
  });
  await center
    .getByRole('button', { name: 'Review Finding', exact: true })
    .first()
    .click();
  const prep = center.getByRole('region', {
    name: 'Repair estimate preparation',
    exact: true,
  });
  await prep
    .getByRole('button', { name: 'Prepare Repair Estimate', exact: true })
    .click();
  await prep.getByRole('checkbox').check();
  await prep
    .getByRole('button', {
      name: 'Confirm & Prepare Repair Draft',
      exact: true,
    })
    .click();
  return center.getByRole('region', {
    name: 'Exact repair estimate workflow',
    exact: true,
  });
}
test('populated contractor concept preserves triage, scheduling and exact published navigation across three brands', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4173/')) outside.push(r.url());
  });
  await page.goto('/preview/contractor-design');
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await page
      .getByRole('combobox', { name: 'Company Context', exact: true })
      .selectOption(org);
    const center = page.getByRole('region', {
      name: 'Maintenance & follow-up center',
      exact: true,
    });
    await expect(center.locator('.maintenance-card')).toHaveCount(3);
    await expect(page.getByLabel('Queue overview')).toContainText(
      '3Published Findings',
    );
    await check(page);
    await capture(page, `${info.project.name}-${org}-queue`);
    const card = center.locator('.maintenance-card').first();
    const id = await card.getAttribute('data-report-id'),
      version = await card.getAttribute('data-report-version');
    await card
      .getByRole('button', {
        name: 'Open Exact Source Inspection',
        exact: true,
      })
      .click();
    const source = page.locator(`details[data-report-id="${id}"]`);
    await expect(source).toHaveAttribute('open', '');
    await expect(source).toHaveAttribute('data-report-version', version!);
    await expect(source).toContainText('Published evidence is immutable.');
    await page
      .getByRole('button', { name: 'Maintenance & Follow-Up', exact: true })
      .click();
    await center.getByText('Filter Work Queue', { exact: true }).click();
    await center
      .getByRole('combobox', { name: 'Attention Needed', exact: true })
      .selectOption('recurring');
    await expect(center.locator('.maintenance-card')).toHaveCount(2);
    await center
      .getByRole('button', { name: 'Reset Maintenance Filters', exact: true })
      .click();
    await center
      .getByRole('button', { name: 'Review Finding', exact: true })
      .first()
      .click();
    await expect(center.locator('.maintenance-grid')).not.toBeVisible();
    const review = center.getByRole('region', {
      name: 'Maintenance review',
      exact: true,
    });
    await review
      .getByRole('combobox', { name: 'Manual Priority', exact: true })
      .selectOption({ value: 'urgent' });
    await review
      .getByRole('combobox', { name: 'Responsible Staff', exact: true })
      .selectOption(org + '-field');
    await review
      .getByLabel('Internal Follow-Up Date', { exact: true })
      .fill('2026-11-20');
    await review
      .getByLabel('Append Internal Follow-Up Note', { exact: true })
      .fill('PRIVATE design review: coordinate the follow-up inspection only.');
    await review
      .getByRole('button', { name: 'Save Internal Review', exact: true })
      .click();
    await expect(review).toContainText('Triage revision 1');
    await check(page);
    await capture(
      page,
      `${info.project.name}-${org}-finding`,
      center.locator('.concept-finding-heading'),
    );
    await review
      .getByRole('button', {
        name: 'Prepare Follow-Up Inspection Draft',
        exact: true,
      })
      .click();
    await expect(review).toContainText('Triage revision 2');
    await expect(
      review.getByRole('button', {
        name: 'Prepare Follow-Up Inspection Draft',
        exact: true,
      }),
    ).toBeDisabled();
    await review
      .getByRole('button', {
        name: 'Open Prepared Inspection Draft',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Maintenance & Follow-Up',
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'false');
    await page
      .getByRole('button', { name: 'Maintenance & Follow-Up', exact: true })
      .click();
    await expect(center.locator('.maintenance-card').first()).toContainText(
      'Staff Review StatusScheduled',
    );
  }
  expect(outside).toEqual([]);
});

for (const repairOrg of [
  'sample-property',
  'sample-construction',
  'sample-roofing',
]) {
  test(
    'repair editing, six-section review and stale evidence · ' + repairOrg,
    async ({ page }, info) => {
      test.setTimeout(120000);
      await page.goto('/preview/contractor-design');
      await page
        .getByRole('combobox', { name: 'Company Context', exact: true })
        .selectOption(repairOrg);
      const workflow = await repair(page);
      await expect(
        page.getByRole('region', { name: 'Maintenance review', exact: true }),
      ).not.toBeVisible();
      const readiness = workflow.getByRole('region', {
        name: 'Repair Scope Readiness',
        exact: true,
      });
      await expect(readiness).toContainText('0 of 6 sections confirmed');
      await workflow
        .getByRole('textbox', { name: 'Scope Item 1', exact: true })
        .fill(
          'Remove and replace measured joint seal within stated boundaries',
        );
      await workflow
        .getByRole('textbox', { name: 'Scope Description', exact: true })
        .fill(
          'Prepare the exterior surface and replace eight feet of joint seal; concealed work excluded.',
        );
      await workflow
        .getByRole('textbox', { name: 'Quantity 1', exact: true })
        .fill('8');
      await workflow
        .getByRole('combobox', { name: 'Unit 1', exact: true })
        .selectOption({ value: 'linear_ft' });
      await workflow
        .getByRole('textbox', { name: 'Internal Unit Cost 1', exact: true })
        .fill('10.00');
      await workflow
        .getByRole('textbox', { name: 'Selling Unit Price 1', exact: true })
        .fill('20.00');
      await workflow
        .getByRole('textbox', { name: 'Estimate Terms', exact: true })
        .fill(
          'Synthetic contractor terms exclude concealed damage pending separate scope review.',
        );
      await workflow
        .getByRole('combobox', { name: 'Tax Policy', exact: true })
        .selectOption({ label: 'Synthetic zero-tax review · 0% · reviewed' });
      await workflow
        .getByRole('textbox', { name: 'Private Estimate Notes', exact: true })
        .fill('PRIVATE_COPY_SENTINEL · Manual priority');
      await expect(readiness).toContainText('Unsaved estimate changes');
      await workflow
        .getByRole('button', { name: 'Save Estimate Draft', exact: true })
        .click();
      await expect(readiness).toContainText('saved revision 2');
      await workflow
        .getByRole('button', { name: 'Customer Preview', exact: true })
        .click();
      const customer = workflow.getByRole('region', {
        name: 'Customer-facing estimate preview',
        exact: true,
      });
      await expect(customer).toBeVisible();
      await expect(customer).not.toContainText('PRIVATE_COPY_SENTINEL');
      await check(page);
      await workflow
        .getByRole('button', { name: 'Version History', exact: true })
        .click();
      await expect(workflow.locator('.history-row').first()).toBeVisible();
      await workflow
        .getByRole('button', { name: 'Estimate Builder', exact: true })
        .click();
      await expect(
        workflow.getByRole('textbox', {
          name: 'Private Estimate Notes',
          exact: true,
        }),
      ).toHaveValue('PRIVATE_COPY_SENTINEL · Manual priority');
      await check(page);
      await capture(
        page,
        `${info.project.name}-${repairOrg}-repair`,
        workflow.getByRole('heading', {
          name: 'Repair Draft · Contractor Review Required',
          exact: true,
        }),
      );
      await capture(
        page,
        `${info.project.name}-${repairOrg}-repair-editor`,
        workflow.locator('.estimate-grid'),
      );
      await page
        .getByRole('link', { name: 'Review Readiness', exact: false })
        .click();
      for (let i = 0; i < groups.length; i++) {
        const card = readiness.locator(
          `[data-review-section="${['scope', 'measurements', 'resources', 'pricing', 'tax', 'terms'][i]}"]`,
        );
        if ((await card.getAttribute('open')) === null)
          await card.locator('summary').click();
        if (i === 1) {
          await card
            .getByRole('combobox', { name: 'Measurement Basis 1', exact: true })
            .selectOption('measured');
          await card
            .getByLabel('Supporting Measurement Reference 1', { exact: true })
            .fill('Synthetic staff tape measurement M-008: eight feet.');
        }
        await card
          .getByRole('textbox', {
            name: i === 0 ? /^Scope Review Note/ : /^Supporting Review Note/,
          })
          .fill(
            'Synthetic staff reviewed exact scope, packaged labor/materials, calculation and applicability.',
          );
        await card.getByRole('checkbox').focus();
        await page.keyboard.press('Space');
        await card
          .getByRole('button', {
            name: 'Confirm ' + groups[i],
            exact: true,
          })
          .click();
        await expect(readiness).toContainText(
          `${i + 1} of 6 sections confirmed`,
        );
      }
      await expect(readiness.locator('[data-state="confirmed"]')).toHaveCount(
        6,
      );
      await expect(
        workflow.getByRole('button', {
          name: 'Issue Internal Snapshot',
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(readiness).toContainText(
        'Internal Review Complete · Issuance Remains Blocked',
      );
      await check(page);
      await capture(
        page,
        `${info.project.name}-${repairOrg}-readiness-current`,
        readiness,
      );
      await workflow
        .getByRole('textbox', { name: 'Selling Unit Price 1', exact: true })
        .fill('21.00');
      await workflow
        .getByRole('button', { name: 'Save Estimate Draft', exact: true })
        .click();
      await expect(readiness).toContainText(
        '0 of 6 sections confirmed for saved revision 3',
      );
      await expect(readiness.locator('[data-state="stale"]')).toHaveCount(6);
      await check(page);
      await capture(
        page,
        `${info.project.name}-${repairOrg}-readiness-stale`,
        readiness,
      );
      await readiness
        .getByRole('link', { name: /Quantities & Measurements/ })
        .click();
      await expect(
        readiness.locator('#concept-review-measurements'),
      ).toHaveAttribute('open', '');
      await workflow
        .getByRole('button', {
          name: 'Return to Originating Maintenance Finding',
          exact: true,
        })
        .click();
      const prep = page.getByRole('region', {
        name: 'Repair estimate preparation',
        exact: true,
      });
      await prep
        .getByRole('button', { name: 'Open Exact Repair Draft', exact: true })
        .click();
      await expect(readiness).toContainText('saved revision 3');
      await workflow
        .getByRole('button', {
          name: 'Open Originating Published Report',
          exact: true,
        })
        .click();
      await expect(page.locator('details[data-report-id][open]')).toContainText(
        'Weathered joint material documented.',
      );
      await expect(
        page.locator('details[data-report-id][open]'),
      ).not.toContainText('Synthetic staff reviewed');
      await page
        .getByRole('button', { name: 'Maintenance & Follow-Up', exact: true })
        .click();
      await expect(page.locator('.maintenance-card').first()).toContainText(
        'Internal readiness: 0/6 sections for saved revision 3',
      );
    },
  );
}
test('concept state and CSS stay isolated from original workspace and locked customer presentation; empty/error reload works', async ({
  page,
}, info) => {
  const pixelCapture = async (locator: Locator, state: string) => {
    await mkdir('artifacts/property', { recursive: true });
    await page.mouse.move(0, 0);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      scrollTo(0, 0);
    });
    await page.evaluate(() => document.fonts.ready);
    return locator.screenshot({
      animations: 'disabled',
      path: `artifacts/property/contractor-isolation-${info.project.name}-${state}.png`,
    });
  };
  const navigate = async (path: string) =>
    page.evaluate((path) => {
      history.pushState(null, '', path);
      dispatchEvent(new PopStateEvent('popstate'));
    }, path);
  await page.goto('/preview/property-portal');
  await expect(page.locator('.concept-metrics')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const portalBefore = await pixelCapture(
    page.locator('.concept-body'),
    'portal-before',
  );
  await navigate('/preview');
  await page
    .getByRole('button', { name: 'Property operations', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Maintenance & follow-up', exact: true })
    .click();
  await expect(page.locator('.maintenance-card')).toHaveCount(0);
  const before = await page
    .locator('.maintenance-center > .section-title')
    .evaluate((e) => ({
      font: getComputedStyle(e).fontSize,
      color: getComputedStyle(e).color,
    }));
  await expect(page.locator('.maintenance-center')).toContainText(
    'No published concerns are available.',
  );
  const originalBefore = await pixelCapture(
    page.locator('.maintenance-center'),
    'queue-before',
  );
  await navigate('/preview/contractor-design');
  await expect(page.locator('.maintenance-card')).toHaveCount(3);
  await page.getByText('Filter Work Queue', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Queue Priority', exact: true })
    .selectOption({ value: 'low' });
  await expect(
    page.getByText('No maintenance findings match these filters.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Reset Maintenance Filters', exact: true })
    .click();
  await page
    .getByText('Development-Only Maintenance Examples & States', {
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Simulate Maintenance Error', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('simulated error');
  await check(page);
  await page
    .getByRole('button', { name: 'Reload Maintenance Queue', exact: true })
    .click();
  await expect(page.locator('.maintenance-card')).toHaveCount(3);
  await expect(
    page.getByRole('link', {
      name: 'Compare current back office',
      exact: false,
    }),
  ).toHaveAttribute('href', '/preview');
  await navigate('/preview');
  await page
    .getByRole('button', { name: 'Property operations', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Maintenance & follow-up', exact: true })
    .click();
  await expect(page.locator('.maintenance-card')).toHaveCount(0);
  expect(
    await page
      .locator('.maintenance-center > .section-title')
      .evaluate((e) => ({
        font: getComputedStyle(e).fontSize,
        color: getComputedStyle(e).color,
      })),
  ).toEqual(before);
  await expect(page.locator('.maintenance-center')).toContainText(
    'No published concerns are available.',
  );
  expect(
    (
      await pixelCapture(page.locator('.maintenance-center'), 'queue-after')
    ).equals(originalBefore),
  ).toBe(true);
  await expect(page.locator('.backoffice-concept')).toHaveCount(0);
  await navigate('/preview/property-portal');
  await expect(page.locator('.portal-concept')).toBeVisible();
  await expect(
    page.locator('link[rel="stylesheet"][href*="ContractorBackOfficeDesign"]'),
  ).toHaveCount(1);
  await expect(page.locator('.concept-metrics')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // Route changes retain pointer state. Exercise hover first, then compare the
  // same neutral state rather than a transient card highlight on one platform.
  await page.locator('.concept-metrics button').first().hover();
  expect(
    (await pixelCapture(page.locator('.concept-body'), 'portal-after')).equals(
      portalBefore,
    ),
  ).toBe(true);
  await check(page);
});

test('polished labels, selectors and navigation retain source values across all brands', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto('/preview/contractor-design');
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    const company = page.getByRole('combobox', {
      name: 'Company Context',
      exact: true,
    });
    await company.selectOption(org);
    await expect(company).toHaveValue(org);
    const card = page.locator('.maintenance-card').first();
    await expect(card).toBeVisible();
    await expect(card.locator('.concept-inspection-date time')).toHaveText(
      '2026-11-06',
    );
    await expect(card.locator('.badge')).toHaveText('Staff Priority: Normal');
    await expect(card.locator('dt')).toHaveText([
      'Reported Severity',
      'Staff Review Status',
      'Follow-Up Date',
    ]);
    await expect(card).toContainText('Weathered joint material documented.');
    const reload = page.getByRole('button', {
      name: 'Reload Maintenance Queue',
      exact: true,
    });
    const box = await reload.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThan(190);
    await reload.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.maintenance-card')).toHaveCount(3);
    await page.getByText('Filter Work Queue', { exact: true }).click();
    const priority = page.getByRole('combobox', {
      name: 'Queue Priority',
      exact: true,
    });
    await expect(priority.locator('option')).toHaveText([
      'All Priorities',
      'Low',
      'Normal',
      'High',
      'Urgent',
    ]);
    await priority.selectOption({ label: 'High' });
    await expect(priority).toHaveValue('high');
    await page
      .getByRole('button', { name: 'Reset Maintenance Filters', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Inspections', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'CRM Property & Inspection Plans',
        exact: true,
      }),
    ).toBeVisible();
    const plan = page.getByRole('combobox', {
      name: 'Active Inspection Plan',
      exact: true,
    });
    await expect(plan).toBeVisible();
    const options = await plan
      .locator('option')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
    await plan.selectOption(options[options.length - 1]);
    await expect(plan).toHaveValue(options[options.length - 1]);
    await check(page);
    await capture(page, `${info.project.name}-${org}-inspections`);
    await page
      .getByRole('button', { name: 'Media & Galleries', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Private Project Media', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Upload to Quarantine · Disabled',
        exact: true,
      }),
    ).toBeDisabled();
    await check(page);
    await capture(page, `${info.project.name}-${org}-media`);
    await page
      .getByRole('button', { name: 'Unbilled Materials', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Purchased Materials & Supplemental Scope',
        exact: true,
      }),
    ).toBeVisible();
    await check(page);
    await capture(page, `${info.project.name}-${org}-unbilled`);
    await page
      .getByRole('button', { name: 'Maintenance & Follow-Up', exact: true })
      .click();
  }
});
