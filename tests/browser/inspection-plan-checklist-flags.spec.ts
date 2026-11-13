import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openModule } from './helpers/contractor-workspace';
test('editing checklist labels preserves saved optional requirements; appended rows remain explicitly required by default', async ({
  page,
}) => {
  await page.goto('/preview');
  await openModule(page, 'Property operations');
  await page.getByRole('button', { name: 'Inspections', exact: true }).click();
  const form = page.locator('form').filter({
    has: page.getByRole('textbox', {
      name: /^Checklist template \(one item per line\)$/i,
      exact: true,
    }),
  });
  const first = form.getByRole('checkbox', {
    name: /^Require checklist item 1$/i,
    exact: true,
  });
  await first.uncheck();
  await form
    .getByRole('button', { name: /^Save inspection plan$/i, exact: true })
    .click();
  const labels = form.getByRole('textbox', {
    name: /^Checklist template \(one item per line\)$/i,
    exact: true,
  });
  const lines = (await labels.inputValue()).split('\n');
  lines[1] += ' · explicit reviewed label';
  await labels.fill(lines.join('\n'));
  await expect(first).not.toBeChecked();
  await labels.fill(lines.join('\n') + '\nNew explicit final inspection item');
  await expect(first).not.toBeChecked();
  await expect(
    form.getByRole('checkbox', {
      name: new RegExp(
        '^Require checklist item ' + (lines.length + 1) + '$',
        'i',
      ),
      exact: true,
    }),
  ).toBeChecked();
  await form
    .getByRole('button', { name: /^Save inspection plan$/i, exact: true })
    .click();
  await page
    .getByRole('combobox', { name: /Company context/i })
    .selectOption('sample-construction');
  await page
    .getByRole('combobox', { name: /Company context/i })
    .selectOption('sample-property');
  await openModule(page, 'Property operations');
  await page.getByRole('button', { name: 'Inspections', exact: true }).click();
  await expect(first).not.toBeChecked();
  await expect(labels).toHaveValue(
    lines.join('\n') + '\nNew explicit final inspection item',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
