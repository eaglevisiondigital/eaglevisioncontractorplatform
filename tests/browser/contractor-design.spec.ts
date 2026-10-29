import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const groups = [
  'Scope & source evidence',
  'Quantities & measurements',
  'Materials & labor',
  'Pricing & profitability',
  'Tax applicability',
  'Terms & completeness',
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
    path: `artifacts/property/contractor-design-${path}.png`,
  });
  if (target && path.includes('readiness'))
    await target.screenshot({
      path: `artifacts/property/contractor-design-${path}-full.png`,
    });
  if (path.endsWith('-queue'))
    await page.screenshot({
      path: `artifacts/property/contractor-design-${path}-full.png`,
      fullPage: true,
    });
}
async function repair(page: Page) {
  const center = page.getByRole('region', {
    name: 'Maintenance & follow-up center',
    exact: true,
  });
  await center
    .getByRole('button', { name: 'Review finding', exact: true })
    .first()
    .click();
  const prep = center.getByRole('region', {
    name: 'Repair estimate preparation',
    exact: true,
  });
  await prep
    .getByRole('button', { name: 'Prepare repair estimate', exact: true })
    .click();
  await prep.getByRole('checkbox').check();
  await prep
    .getByRole('button', {
      name: 'Confirm & prepare repair draft',
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
      .getByRole('combobox', { name: 'Company context', exact: true })
      .selectOption(org);
    const center = page.getByRole('region', {
      name: 'Maintenance & follow-up center',
      exact: true,
    });
    await expect(center.locator('.maintenance-card')).toHaveCount(3);
    await expect(page.getByLabel('Queue overview')).toContainText(
      '3Published findings',
    );
    await check(page);
    await capture(page, `${info.project.name}-${org}-queue`);
    const card = center.locator('.maintenance-card').first();
    const id = await card.getAttribute('data-report-id'),
      version = await card.getAttribute('data-report-version');
    await card
      .getByRole('button', {
        name: 'Open exact source inspection',
        exact: true,
      })
      .click();
    const source = page.locator(`details[data-report-id="${id}"]`);
    await expect(source).toHaveAttribute('open', '');
    await expect(source).toHaveAttribute('data-report-version', version!);
    await expect(source).toContainText('Published evidence is immutable.');
    await page
      .getByRole('button', { name: 'Maintenance & follow-up', exact: true })
      .click();
    await center.getByText('Filter work queue', { exact: true }).click();
    await center
      .getByRole('combobox', { name: 'Attention needed', exact: true })
      .selectOption('recurring');
    await expect(center.locator('.maintenance-card')).toHaveCount(2);
    await center
      .getByRole('button', { name: 'Reset maintenance filters', exact: true })
      .click();
    await center
      .getByRole('button', { name: 'Review finding', exact: true })
      .first()
      .click();
    await expect(center.locator('.maintenance-grid')).not.toBeVisible();
    const review = center.getByRole('region', {
      name: 'Maintenance review',
      exact: true,
    });
    await review
      .getByRole('combobox', { name: 'Manual priority', exact: true })
      .selectOption('urgent');
    await review
      .getByRole('combobox', { name: 'Responsible staff', exact: true })
      .selectOption(org + '-field');
    await review
      .getByLabel('Internal follow-up date', { exact: true })
      .fill('2026-11-20');
    await review
      .getByLabel('Append internal follow-up note', { exact: true })
      .fill('PRIVATE design review: coordinate the follow-up inspection only.');
    await review
      .getByRole('button', { name: 'Save internal review', exact: true })
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
        name: 'Prepare follow-up inspection draft',
        exact: true,
      })
      .click();
    await expect(review).toContainText('Triage revision 2');
    await expect(
      review.getByRole('button', {
        name: 'Prepare follow-up inspection draft',
        exact: true,
      }),
    ).toBeDisabled();
    await review
      .getByRole('button', {
        name: 'Open prepared inspection draft',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Maintenance & follow-up',
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'false');
    await page
      .getByRole('button', { name: 'Maintenance & follow-up', exact: true })
      .click();
    await expect(center.locator('.maintenance-card').first()).toContainText(
      'scheduled · priority urgent',
    );
  }
  expect(outside).toEqual([]);
});

test('repair editing, six-section review, stale evidence and exact return work in the isolated premium presentation', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto('/preview/contractor-design');
  const workflow = await repair(page);
  await expect(
    page.getByRole('region', { name: 'Maintenance review', exact: true }),
  ).not.toBeVisible();
  const readiness = workflow.getByRole('region', {
    name: 'Repair scope readiness',
    exact: true,
  });
  await expect(readiness).toContainText('0 of 6 sections confirmed');
  await workflow
    .getByRole('textbox', { name: 'Scope item 1', exact: true })
    .fill('Remove and replace measured joint seal within stated boundaries');
  await workflow
    .getByRole('textbox', { name: 'Scope description', exact: true })
    .fill(
      'Prepare the exterior surface and replace eight feet of joint seal; concealed work excluded.',
    );
  await workflow
    .getByRole('textbox', { name: 'Quantity 1', exact: true })
    .fill('8');
  await workflow
    .getByRole('combobox', { name: 'Unit 1', exact: true })
    .selectOption('linear_ft');
  await workflow
    .getByRole('textbox', { name: 'Internal unit cost 1', exact: true })
    .fill('10.00');
  await workflow
    .getByRole('textbox', { name: 'Selling unit price 1', exact: true })
    .fill('20.00');
  await workflow
    .getByRole('textbox', { name: 'Estimate terms', exact: true })
    .fill(
      'Synthetic contractor terms exclude concealed damage pending separate scope review.',
    );
  await workflow
    .getByRole('combobox', { name: 'Tax policy', exact: true })
    .selectOption({ label: 'Synthetic zero-tax review · 0% · reviewed' });
  await expect(readiness).toContainText('Unsaved estimate changes');
  await workflow
    .getByRole('button', { name: 'Save estimate draft', exact: true })
    .click();
  await expect(readiness).toContainText('saved revision 2');
  await check(page);
  await capture(
    page,
    `${info.project.name}-repair`,
    workflow.getByRole('heading', {
      name: 'Repair draft · contractor review required',
      exact: true,
    }),
  );
  await capture(
    page,
    `${info.project.name}-repair-editor`,
    workflow.locator('.estimate-grid'),
  );
  await page
    .getByRole('link', { name: 'Review readiness', exact: false })
    .click();
  for (let i = 0; i < groups.length; i++) {
    const card = readiness.locator(
      `[data-review-section="${['scope', 'measurements', 'resources', 'pricing', 'tax', 'terms'][i]}"]`,
    );
    if ((await card.getAttribute('open')) === null)
      await card.locator('summary').click();
    if (i === 1) {
      await card
        .getByRole('combobox', { name: 'Measurement basis 1', exact: true })
        .selectOption('measured');
      await card
        .getByLabel('Supporting measurement reference 1', { exact: true })
        .fill('Synthetic staff tape measurement M-008: eight feet.');
    }
    await card
      .getByRole('textbox', {
        name: i === 0 ? /^Scope review note/ : /^Supporting review note/,
      })
      .fill(
        'Synthetic staff reviewed exact scope, packaged labor/materials, calculation and applicability.',
      );
    await card.getByRole('checkbox').focus();
    await page.keyboard.press('Space');
    await card
      .getByRole('button', {
        name: 'Confirm ' + groups[i].toLowerCase(),
        exact: true,
      })
      .click();
    await expect(readiness).toContainText(`${i + 1} of 6 sections confirmed`);
  }
  await expect(readiness.locator('[data-state="confirmed"]')).toHaveCount(6);
  await expect(readiness).toContainText(
    'Internal review complete · issuance remains blocked',
  );
  await check(page);
  await capture(page, `${info.project.name}-readiness-current`, readiness);
  await workflow
    .getByRole('textbox', { name: 'Selling unit price 1', exact: true })
    .fill('21.00');
  await workflow
    .getByRole('button', { name: 'Save estimate draft', exact: true })
    .click();
  await expect(readiness).toContainText(
    '0 of 6 sections confirmed for saved revision 3',
  );
  await expect(readiness.locator('[data-state="stale"]')).toHaveCount(6);
  await check(page);
  await capture(page, `${info.project.name}-readiness-stale`, readiness);
  await readiness
    .getByRole('link', { name: /Quantities & measurements/ })
    .click();
  await expect(
    readiness.locator('#concept-review-measurements'),
  ).toHaveAttribute('open', '');
  await workflow
    .getByRole('button', {
      name: 'Return to originating maintenance finding',
      exact: true,
    })
    .click();
  const prep = page.getByRole('region', {
    name: 'Repair estimate preparation',
    exact: true,
  });
  await prep
    .getByRole('button', { name: 'Open exact repair draft', exact: true })
    .click();
  await expect(readiness).toContainText('saved revision 3');
  await workflow
    .getByRole('button', {
      name: 'Open originating published report',
      exact: true,
    })
    .click();
  await expect(page.locator('details[data-report-id][open]')).toContainText(
    'Weathered joint material documented.',
  );
  await expect(page.locator('details[data-report-id][open]')).not.toContainText(
    'Synthetic staff reviewed',
  );
  await page
    .getByRole('button', { name: 'Maintenance & follow-up', exact: true })
    .click();
  await expect(page.locator('.maintenance-card').first()).toContainText(
    'Internal readiness: 0/6 sections for saved revision 3',
  );
});

test('concept state and CSS stay isolated from original workspace and locked customer presentation; empty/error reload works', async ({
  page,
}) => {
  const navigate = async (path: string) =>
    page.evaluate((path) => {
      history.pushState(null, '', path);
      dispatchEvent(new PopStateEvent('popstate'));
    }, path);
  await page.goto('/preview/property-portal');
  await expect(page.locator('.concept-metrics')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const portalBefore = await page
    .locator('.concept-body')
    .screenshot({ animations: 'disabled' });
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
  const originalBefore = await page
    .locator('.maintenance-center')
    .screenshot({ animations: 'disabled' });
  await navigate('/preview/contractor-design');
  await expect(page.locator('.maintenance-card')).toHaveCount(3);
  await page.getByText('Filter work queue', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Queue priority', exact: true })
    .selectOption('low');
  await expect(
    page.getByText('No maintenance findings match these filters.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Reset maintenance filters', exact: true })
    .click();
  await page
    .getByText('Development-only maintenance examples & states', {
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Simulate maintenance error', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('simulated error');
  await check(page);
  await page
    .getByRole('button', { name: 'Reload maintenance queue', exact: true })
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
      await page
        .locator('.maintenance-center')
        .screenshot({ animations: 'disabled' })
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
  expect(
    (
      await page.locator('.concept-body').screenshot({ animations: 'disabled' })
    ).equals(portalBefore),
  ).toBe(true);
  await check(page);
});
