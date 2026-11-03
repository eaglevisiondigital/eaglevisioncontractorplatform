import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle15-browser-helpers';
for (const company of sampleCompanies)
  test(`explainable suggestion original deadline and return / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Verified Copilot handoff');
    const r = page.getByRole('region', {
      name: 'Explainable daily task links',
      exact: true,
    });
    await expect(
      r.getByRole('button', {
        name: 'Read explainable task sources',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByLabel(
        'I confirm the current local company, sources and review day.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', {
        name: 'Read explainable task sources',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', { name: /^Explain selected suggestion:/ })
      .first()
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Selected suggestion explanation',
        exact: true,
      }),
    ).toBeFocused();
    const identity = await r.locator('dl').first().textContent();
    await expect(r).toContainText(
      'Return and stage changes retain this deadline',
    );
    await r
      .getByRole('button', {
        name: 'Inspect original review destination',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Original task review destination',
        exact: true,
      }),
    ).toBeFocused();
    const section = (await r.getByText(/^Existing section:/).textContent())!
      .split(':')[1]
      .trim();
    expect([
      'sales',
      'field',
      'finance',
      'completion',
      'maintenance',
      'daily',
    ]).toContain(section);
    await expect(r).toContainText('Missing evidence and blocked actions');
    await audit(page, r);
    await capture(
      page,
      r,
      'explainable-destination',
      company.slug,
      info.project.name,
    );
    await r
      .getByRole('button', {
        name: 'Return to selected suggestion',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Selected suggestion explanation',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r.locator('dl').first()).toHaveText(identity!);
    await r
      .getByRole('button', {
        name: 'Inspect original review destination',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', { name: 'Open original task review', exact: true })
      .click();
    await expect(page.locator(`#operating-selected-${section}`)).toBeFocused();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeVisible();
  });
