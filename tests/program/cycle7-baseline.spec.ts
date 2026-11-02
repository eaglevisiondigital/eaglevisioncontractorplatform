import { expect, test } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';

test('returning to a retained contractor attempt never enables a silent fresh Prepare action', async ({
  page,
}) => {
  const company = page.getByRole('combobox', {
      name: 'Contractor',
      exact: true,
    }),
    confirmation = page.getByLabel(
      'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
    ),
    prepare = page.getByRole('button', {
      name: 'Prepare local synthetic journey',
      exact: true,
    }),
    context = page.getByRole('region', {
      name: 'Exact shared journey context',
    });
  await page.goto('/preview/contractor-journey');
  for (const c of sampleCompanies.slice(0, 2)) {
    await company.selectOption(c.id);
    await confirmation.check();
    await prepare.click();
    await context.waitFor({ state: 'visible' });
  }
  await company.selectOption(sampleCompanies[0].id);
  await confirmation.check();
  expect((await context.isVisible()) || (await prepare.isDisabled())).toBe(
    true,
  );
});
