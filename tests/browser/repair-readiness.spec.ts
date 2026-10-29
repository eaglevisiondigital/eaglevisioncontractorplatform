import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

async function openRepair(page: Page) {
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
  await center
    .locator('.maintenance-card')
    .first()
    .getByRole('button', { name: 'Review finding', exact: true })
    .click();
  const prepare = center.getByRole('region', {
    name: 'Repair estimate preparation',
    exact: true,
  });
  await prepare
    .getByRole('button', { name: 'Prepare repair estimate', exact: true })
    .click();
  await prepare.getByRole('checkbox').check();
  await prepare
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
const sections = [
  'Scope & source evidence',
  'Quantities & measurements',
  'Materials & labor',
  'Pricing & profitability',
  'Tax applicability',
  'Terms & completeness',
];
test('three companies review saved scope, explicit measurements and pricing; saved changes invalidate confirmations without issuance', async ({
  page,
}, info) => {
  test.setTimeout(120000);
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
    const workflow = await openRepair(page);
    const readiness = workflow.getByRole('region', {
      name: 'Repair scope readiness',
      exact: true,
    });
    await expect(readiness).toContainText('0 of 6 sections confirmed');
    await expect(readiness).toContainText('unmeasured/placeholder');
    await expect(readiness).toContainText('Zero or missing selling prices');
    await expect(readiness).toContainText('tax applicability is unverified');
    await expect(
      readiness.getByRole('button', {
        name: 'Confirm quantities & measurements',
        exact: true,
      }),
    ).toBeDisabled();
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
        'Synthetic contractor terms: exclude concealed damage pending separate scope review.',
      );
    await workflow
      .getByRole('combobox', { name: 'Tax policy', exact: true })
      .selectOption({ label: 'Synthetic zero-tax review · 0% · reviewed' });
    await expect(readiness).toContainText('Unsaved estimate changes');
    await expect(readiness.locator('[data-review-section]')).toHaveCount(0);
    await workflow
      .getByRole('button', { name: 'Save estimate draft', exact: true })
      .click();
    await expect(readiness).toContainText('saved revision 2');
    await expect(readiness).toContainText('0 of 6 sections confirmed');
    for (let i = 0; i < sections.length; i++) {
      const section = readiness.getByRole('region', {
        name: sections[i],
        exact: true,
      });
      if (i === 1) {
        await section
          .getByRole('combobox', { name: 'Measurement basis 1', exact: true })
          .selectOption('measured');
        await section
          .getByRole('textbox', {
            name: 'Supporting measurement reference 1',
            exact: true,
          })
          .fill('Synthetic tape record M-008: staff measured eight feet.');
      }
      await section
        .getByRole('textbox', {
          name: i === 0 ? /^Scope review note/ : /^Supporting review note/,
        })
        .fill(
          'Synthetic staff review: source, scope, packaged labor/materials and policy applicability checked.',
        );
      await section.getByRole('checkbox').focus();
      await page.keyboard.press('Space');
      await section
        .getByRole('button', {
          name: 'Confirm ' + sections[i].toLowerCase(),
          exact: true,
        })
        .click();
      await expect(readiness).toContainText(`${i + 1} of 6 sections confirmed`);
      await expect(section.getByRole('checkbox')).toBeChecked();
    }
    await expect(readiness).toContainText(
      'Internal review complete · issuance remains blocked',
    );
    await expect(
      workflow.getByRole('button', {
        name: 'Issue internal snapshot',
        exact: true,
      }),
    ).toHaveCount(0);
    await workflow
      .getByRole('button', {
        name: 'Return to originating maintenance finding',
        exact: true,
      })
      .click();
    await expect(page.locator('.maintenance-card').first()).toContainText(
      'Internal readiness: 6/6 sections for saved revision 2',
    );
    await page
      .getByRole('region', { name: 'Repair estimate preparation', exact: true })
      .getByRole('button', { name: 'Open exact repair draft', exact: true })
      .click();
    await expect(readiness).toContainText('6 of 6 sections confirmed');
    await readiness.getByText('Review history (6)', { exact: true }).click();
    await expect(readiness.locator('.readiness-history')).toHaveCount(6);
    await expect(readiness).toContainText('Synthetic tape record M-008');
    await expect(readiness).toContainText('Calculation engine v1 at review');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/property', { recursive: true });
    await readiness
      .getByRole('heading', { name: 'Repair scope readiness', exact: true })
      .evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await page.screenshot({
      path: `artifacts/property/readiness-${info.project.name}-${org}.png`,
    });
    await workflow
      .getByRole('textbox', { name: 'Selling unit price 1', exact: true })
      .fill('21.00');
    await expect(readiness).toContainText('Unsaved estimate changes');
    await workflow
      .getByRole('button', { name: 'Save estimate draft', exact: true })
      .click();
    await expect(readiness).toContainText(
      '0 of 6 sections confirmed for saved revision 3',
    );
    await expect(
      readiness.getByText('Previous review is stale', { exact: true }),
    ).toHaveCount(6);
    await readiness.getByText('Review history (6)', { exact: true }).click();
    await expect(readiness).toContainText(
      'Historical only · stale for current evidence',
    );
    await workflow
      .getByRole('button', {
        name: 'Return to originating maintenance finding',
        exact: true,
      })
      .click();
    const repair = page.getByRole('region', {
      name: 'Repair estimate preparation',
      exact: true,
    });
    await repair
      .getByRole('button', { name: 'Open exact repair draft', exact: true })
      .click();
    await expect(readiness).toContainText(
      '0 of 6 sections confirmed for saved revision 3',
    );
    await page
      .getByRole('button', { name: 'Client project view', exact: true })
      .click();
    const customer = page.getByRole('region', {
      name: 'Client property report',
    });
    for (const text of [
      'readiness',
      'Synthetic tape record',
      'packaged labor/materials',
      'Estimated gross margin',
    ])
      await expect(customer).not.toContainText(text);
  }
  expect(outside).toEqual([]);
});

test('outstanding scope questions remain explicit, keyboard accessible and separate from immutable source observations', async ({
  page,
}) => {
  await page.goto('/preview');
  const workflow = await openRepair(page);
  const readiness = workflow.getByRole('region', {
    name: 'Repair scope readiness',
    exact: true,
  });
  const scope = readiness.getByRole('region', {
    name: sections[0],
    exact: true,
  });
  await scope
    .getByRole('textbox', { name: /^Scope review note/ })
    .fill(
      'Outstanding: determine whether concealed damage needs a separate scope.',
    );
  await scope
    .getByRole('button', {
      name: 'Record outstanding scope review',
      exact: true,
    })
    .focus();
  await page.keyboard.press('Enter');
  await expect(scope).toContainText(
    'Last recorded staff question: Outstanding:',
  );
  await expect(readiness).toContainText('0 of 6 sections confirmed');
  await readiness
    .getByText('Observed condition and exact source', { exact: true })
    .click();
  await expect(readiness).toContainText(
    'Observed: Weathered joint material documented.',
  );
  await expect(readiness).toContainText('Observations remain immutable');
  await readiness
    .getByRole('button', { name: 'Reload repair readiness', exact: true })
    .click();
  await expect(scope).toContainText('concealed damage');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
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
    'Outstanding:',
  );
});
