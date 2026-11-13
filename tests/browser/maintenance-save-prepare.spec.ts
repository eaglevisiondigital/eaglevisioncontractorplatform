import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openModule, prepareMaintenance } from './helpers/contractor-workspace';
test('explicitly save review and prepare one follow-up draft without discarding the entered note', async ({
  page,
}) => {
  await page.goto('/preview');
  await openModule(page, 'Property operations');
  await page
    .getByRole('button', { name: /^Maintenance & follow-up$/i, exact: true })
    .click();
  const center = await prepareMaintenance(page);
  await center
    .locator('.maintenance-card')
    .first()
    .getByRole('button', { name: /^Review finding$/i, exact: true })
    .click();
  const review = center.getByRole('region', {
    name: 'Maintenance review',
    exact: true,
  });
  await expect(
    review.getByRole('button', {
      name: /^Save review and prepare inspection draft$/i,
      exact: true,
    }),
  ).toBeVisible();
  await review
    .getByRole('textbox', {
      name: /^Append internal follow-up note$/i,
      exact: true,
    })
    .fill('PRIVATE fictional saved-before-preparation note.');
  await review
    .getByRole('combobox', { name: /^Manual priority$/i, exact: true })
    .selectOption('urgent');
  await review
    .getByLabel(/^Draft inspection date$/i, { exact: true })
    .fill('2026-12-10');
  await review
    .getByLabel(
      'I confirm saving this review and preparing one inspection draft.',
    )
    .check();
  await review
    .getByRole('button', {
      name: /^Save review and prepare inspection draft$/i,
      exact: true,
    })
    .click();
  await expect(review).toContainText('Triage revision 2');
  await review
    .getByText(/^Internal follow-up notes \(1\)$/i, { exact: true })
    .click();
  await expect(review).toContainText(
    'PRIVATE fictional saved-before-preparation note.',
  );
  await expect(
    review.getByRole('button', {
      name: /^Prepare follow-up inspection draft$/i,
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    review.getByRole('button', {
      name: /^Save review and prepare inspection draft$/i,
      exact: true,
    }),
  ).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
async function fixture(page: import('@playwright/test').Page) {
  await page.goto(
    'http://127.0.0.1:4206/preview-maintenance-save-prepare-test.html',
  );
  const center = page.getByRole('region', {
    name: 'Maintenance & follow-up center',
    exact: true,
  });
  await center
    .locator('.maintenance-card')
    .first()
    .getByRole('button', { name: /^Review finding$/i, exact: true })
    .click();
  const review = center.getByRole('region', {
    name: 'Maintenance review',
    exact: true,
  });
  await review
    .getByRole('textbox', {
      name: /^Append internal follow-up note$/i,
      exact: true,
    })
    .fill('PRIVATE fictional partial outcome note');
  await review
    .getByLabel(/^Draft inspection date$/i, { exact: true })
    .fill('2026-12-10');
  await review
    .getByLabel(
      'I confirm saving this review and preparing one inspection draft.',
    )
    .check();
  return { center, review };
}
test('revocation between the two original writers leaves saved review and retained inputs, without preparing or enabling replacement actions', async ({
  page,
}) => {
  const { center, review } = await fixture(page);
  await page
    .getByRole('button', {
      name: 'Revoke fixture reviewer after review save',
      exact: true,
    })
    .click();
  await review
    .getByRole('button', {
      name: /^Save review and prepare inspection draft$/i,
      exact: true,
    })
    .click();
  await expect(
    center.getByRole('status').filter({
      hasText:
        'Review saved at revision 1; inspection preparation was not attempted',
    }),
  ).toBeVisible();
  await expect(
    review.getByRole('textbox', {
      name: /^Append internal follow-up note$/i,
      exact: true,
    }),
  ).toHaveValue('PRIVATE fictional partial outcome note');
  await expect(
    review.getByRole('button', {
      name: /^Save internal review$/i,
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    review.getByRole('button', {
      name: /^Prepare follow-up inspection draft$/i,
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole('button', {
      name: 'Inspect fixture Save/Prepare/drafts',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Fixture Save Prepare drafts')).toHaveText(
    '1/0/0',
  );
});
test('uncertain Prepare acknowledgment holds both original controls across reload; exactly one saved note and draft remain', async ({
  page,
}) => {
  const { center, review } = await fixture(page);
  await page
    .getByRole('button', {
      name: 'Lose fixture Prepare acknowledgment',
      exact: true,
    })
    .click();
  await review
    .getByRole('button', {
      name: /^Save review and prepare inspection draft$/i,
      exact: true,
    })
    .click();
  await expect(
    center
      .getByRole('status')
      .filter({ hasText: 'outcome UNKNOWN; review saved at revision 1' }),
  ).toBeVisible();
  await expect(
    review.getByRole('textbox', {
      name: /^Append internal follow-up note$/i,
      exact: true,
    }),
  ).toHaveValue('PRIVATE fictional partial outcome note');
  await center
    .getByRole('button', { name: /^Reload maintenance queue$/i, exact: true })
    .click();
  await expect(review).toContainText('Triage revision 2');
  await expect(
    review.getByRole('button', {
      name: /^Save internal review$/i,
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    review.getByRole('button', {
      name: /^Save review and prepare inspection draft$/i,
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole('button', {
      name: 'Inspect fixture Save/Prepare/drafts',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Fixture Save Prepare drafts')).toHaveText(
    '1/1/1',
  );
});
