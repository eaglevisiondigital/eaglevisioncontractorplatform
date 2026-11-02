import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle10-browser-helpers';
for (const company of sampleCompanies)
  test(`seven advanced modes use explicit current requirements / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Advanced handoffs');
    const r = page.getByRole('region', {
      name: 'Advanced review handoff preparation',
      exact: true,
    });
    for (const kind of [
      'offline',
      'voice',
      'receptionist',
      'storm_network',
      'accounting',
      'procurement',
      'trade',
    ]) {
      await r
        .getByRole('combobox', { name: 'Advanced handoff mode', exact: true })
        .selectOption(kind);
      if (kind === 'voice')
        await r
          .getByLabel('Literal review note or typed transcript')
          .fill('2 each Exterior review');
      if (kind === 'trade')
        await r
          .getByRole('combobox', {
            name: 'Human trade review edition',
            exact: true,
          })
          .selectOption('roofing');
      await r
        .getByRole('button', {
          name: 'Review advanced handoff requirements',
          exact: true,
        })
        .click();
      const requirements = r.getByRole('region', {
        name: 'Current advanced handoff requirements',
        exact: true,
      });
      await expect(requirements).toContainText(company.name);
      await expect(requirements).toContainText(
        'MISSING_RECORDED_CATALOG_ASSOCIATION',
      );
      const prepare = r.getByRole('button', {
        name: 'Prepare confirmed advanced review handoff',
        exact: true,
      });
      await expect(prepare).toBeDisabled();
      await r
        .getByLabel(
          'I reviewed the exact source and missing requirements; prepare a local review handoff only.',
        )
        .check();
      await prepare.click();
      const result = r.getByRole('region', {
        name: 'Immutable advanced review handoff',
        exact: true,
      });
      await expect(
        result.getByRole('heading', {
          name: 'Immutable advanced review handoff',
          exact: true,
        }),
      ).toBeFocused();
      await expect(result).toContainText('Execution BLOCKED');
      await r
        .getByRole('button', {
          name: 'Inspect exact advanced review handoff',
          exact: true,
        })
        .click();
      await expect(result).toContainText('CURRENT_REVIEW_ONLY');
      await expect(prepare).toBeDisabled();
      await audit(page, r);
      if (kind === 'trade' || kind === 'offline')
        await r.screenshot({
          path: `artifacts/cycle10/advanced-${kind}-${info.project.name}-${company.slug}.png`,
        });
    }
    await r
      .getByRole('button', { name: 'Open handoff source job', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    await expect(page.locator('.oc-identities')).toContainText(company.id);
  });
