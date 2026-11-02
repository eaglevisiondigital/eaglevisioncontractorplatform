import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle10-browser-helpers';
for (const company of sampleCompanies) {
  test(`follow-up proposal and blocked final admission / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Follow-up admission');
    const r = page.getByRole('region', {
      name: 'Source-safe follow-up desk',
      exact: true,
    });
    await r
      .getByLabel(
        'I confirm this source-bound maintenance planning review only.',
      )
      .check();
    await r
      .getByRole('button', {
        name: 'Review follow-up opportunities',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Available maintenance opportunities',
        exact: true,
      }),
    ).toBeFocused();
    await r
      .getByRole('button', { name: 'Review proposed follow-up 1', exact: true })
      .click();
    await r
      .getByLabel(
        'I confirm this exact proposed date and purpose; inspect blocked requirements only.',
      )
      .check();
    await r
      .getByRole('button', {
        name: 'Inspect final admission gates',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Follow-up admission blocked',
        exact: true,
      }),
    ).toBeFocused();
    const packet = r.getByRole('region', {
      name: 'Immutable blocked follow-up review',
      exact: true,
    });
    await expect(packet).toContainText('UNVERIFIED');
    await expect(packet).toContainText('Current channel authority UNKNOWN');
    await r
      .getByRole('button', {
        name: 'Reconcile exact admission review',
        exact: true,
      })
      .click();
    await expect(r).toContainText(
      'Exact retained blocked review still matches',
    );
    await expect(
      r.getByRole('button', {
        name: 'Inspect final admission gates',
        exact: true,
      }),
    ).toBeDisabled();
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle10/growth-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', {
        name: 'Open exact follow-up source 1',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('region', {
        name: 'Exact follow-up source detail',
        exact: true,
      }),
    ).toBeVisible();
    await audit(page, r);
    await r
      .getByRole('button', {
        name: 'Display existing job workflow',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
  });
  test(`explainable priorities, filters and source evidence / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Priority explanations');
    const r = page.getByRole('region', {
      name: 'Explainable operating priorities',
      exact: true,
    });
    await r
      .getByLabel(
        'I confirm this exact selected-job set and day for source-based human review only.',
      )
      .check();
    await r
      .getByRole('button', {
        name: 'Explain daily review priorities',
        exact: true,
      })
      .click();
    await expect(r).toContainText('matching explanations of');
    await r
      .getByRole('combobox', { name: 'Area', exact: true })
      .selectOption('finance');
    await expect(r.locator('.priority-explanation-list>li')).not.toHaveCount(0);
    await r
      .getByLabel('Search source facts and recommendations')
      .fill('no recorded fact matches');
    await expect(
      r.getByRole('heading', { name: 'No matching explanations', exact: true }),
    ).toBeVisible();
    await r.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await r
      .getByRole('button', {
        name: 'Open exact source and explanation',
        exact: true,
      })
      .first()
      .click();
    const detail = r.getByRole('region', {
      name: 'Exact priority explanation source',
      exact: true,
    });
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('heading').first()).toBeFocused();
    await detail
      .getByText('Inspect unchanged safe source detail', { exact: true })
      .click();
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle10/intelligence-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', {
        name: 'Display existing job workflow',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
  });
}
test('original desks, keyboard navigation and contractor withdrawal remain intact', async ({
  page,
}) => {
  await start(page, sampleCompanies[0]);
  const original = page.getByRole('navigation', {
    name: 'Operating center sections',
    exact: true,
  });
  await expect(original.getByRole('button')).toHaveCount(8);
  const added = page.getByRole('navigation', {
    name: 'Daily workflow reviews',
    exact: true,
  });
  await expect(added.getByRole('button')).toHaveCount(6);
  const first = added.getByRole('button', {
    name: 'Crew plan comparison',
    exact: true,
  });
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('region', {
      name: 'Weekly crew plan comparison',
      exact: true,
    }),
  ).toBeVisible();
  await original.getByRole('button', { name: 'Sources', exact: true }).click();
  await page
    .getByRole('button', { name: 'Search operating sources', exact: true })
    .click();
  await expect(
    page.getByRole('region', {
      name: 'Operating source selection',
      exact: true,
    }),
  ).toContainText('4 matching of 4');
  await page
    .getByText('Disposable development controls', { exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Contractor', exact: true })
    .selectOption(sampleCompanies[1].id);
  await expect(
    page.getByRole('region', {
      name: 'Shared operating environment',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(added).toHaveCount(0);
  await page
    .getByLabel(
      'I confirm this disposable multi-job simulation; no dispatch, contract, invoice, payment or message is authorized.',
    )
    .check();
  await page
    .getByRole('button', {
      name: 'Prepare multi-job local environment',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('region', {
      name: 'Shared operating environment',
      exact: true,
    }),
  ).toContainText('4 admitted jobs');
  await expect(
    page.getByRole('heading', { name: sampleCompanies[1].name, exact: true }),
  ).toBeVisible();
  await nav(page, 'Financial exceptions');
  await audit(page, page.locator('.oc-panel'));
});
