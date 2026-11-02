import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleCompanies } from '../../src/domain/platform';
for (const company of sampleCompanies) {
  test(`${company.id}: selected exact immutable pack, source focus, stale/context/late/OFF privacy and accessibility`, async ({
    page,
  }, testInfo) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).hostname !== '127.0.0.1') external.push(r.url());
    });
    await page.goto('/tests/browser/fixtures/proof-of-work.html');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    await page
      .getByRole('button', {
        name: 'Prepare existing synthetic evidence',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Proof of Work', exact: true }),
    ).toBeVisible();
    const load = page.getByRole('button', {
      name: 'Load available evidence',
      exact: true,
    });
    await load.click();
    const choices = page.getByRole('checkbox', { name: /^Select evidence / });
    await expect(choices.first()).toBeVisible();
    await choices.first().check();
    await page.locator('input[data-source-kind="issued-job-scope"]').check();
    const confirm = page.getByRole('checkbox', {
      name: 'I confirm the selected source evidence for this local documentation pack.',
      exact: true,
    });
    const prepare = page.getByRole('button', {
      name: 'Prepare documentation pack',
      exact: true,
    });
    await expect(prepare).toBeDisabled();
    await confirm.check();
    await prepare.focus();
    await page.keyboard.press('Enter');
    const packet = page.getByRole('region', {
      name: 'Immutable documentation pack',
      exact: true,
    });
    await expect(
      page.getByRole('heading', {
        name: 'Property documentation pack',
        exact: true,
      }),
    ).toBeFocused();
    await expect(packet).toContainText('CURRENT — documentation only');
    await expect(packet).toContainText('Photos and media — UNAVAILABLE');
    await expect(
      packet.getByRole('button', { name: /^Open exact source · / }),
    ).toHaveCount(2);
    await expect(packet).toContainText(
      'No delivery, acceptance, verified completion or warranty is established.',
    );
    await expect(page.locator('body')).not.toContainText('PRIVATE');
    await expect(packet.locator('a[href^="http"]')).toHaveCount(0);
    await expect(packet.locator('img')).toHaveCount(0);
    const sourceButton = packet.getByRole('button', {
      name: /^Open exact source · report /,
    });
    const sourceLabel = await sourceButton.getAttribute('aria-label');
    await sourceButton.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', {
        name: 'Exact published report',
        exact: true,
      }),
    ).toBeFocused();
    const source = page.getByRole('region', {
      name: 'Exact selected source',
      exact: true,
    });
    const identity = sourceLabel!.match(/report (.+) version (\d+)$/)!;
    await expect(source).toContainText(
      `Report ${identity[1]} · published version ${identity[2]}`,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByText('Local synthetic test controls', { exact: true })
      .click();
    await packet.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `artifacts/property/proof-of-work-${testInfo.project.name}-${company.id}-pack.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Close exact source', exact: true })
      .click();
    await packet
      .getByText('Pack identity and integrity', { exact: true })
      .click();
    const identityBefore = await packet.locator('details').innerText();
    await page
      .getByText('Local synthetic test controls', { exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Add published evidence', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Verify exact retained pack', exact: true })
      .click();
    await expect(packet).toContainText('STALE — documentation only');
    expect(await packet.locator('details').innerText()).toBe(identityBefore);
    await expect(
      packet.getByRole('button', { name: /^Open exact source · report / }),
    ).toBeDisabled();
    await expect(
      packet.getByRole('button', { name: /^Open exact source · job / }),
    ).toBeDisabled();
    await page.screenshot({
      path: `artifacts/property/proof-of-work-${testInfo.project.name}-${company.id}-stale.png`,
      fullPage: true,
    });
    // Real model replacement, without a caller key, removes all old evidence.
    await page
      .getByRole('button', {
        name: 'Replace synthetic source model',
        exact: true,
      })
      .click();
    await expect(packet).toHaveCount(0);
    await expect(choices).toHaveCount(0);
    await load.click();
    await choices.first().check();
    await confirm.check();
    await page
      .getByRole('button', { name: 'Pause next source read', exact: true })
      .click();
    await prepare.click();
    await expect(
      page.getByText('Source read paused', { exact: true }),
    ).toBeVisible();
    await confirm.uncheck();
    await page
      .getByRole('button', { name: 'Release source read', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('UNKNOWN');
    await expect(packet).toHaveCount(0);
    // Same model, real reader paused: property switch must discard late evidence.
    await page
      .getByRole('button', { name: 'Pause next source read', exact: true })
      .click();
    await load.click();
    await expect(
      page.getByText('Source read paused', { exact: true }),
    ).toBeVisible();
    const property = page.getByRole('combobox', {
      name: 'Property',
      exact: true,
    });
    const options = await property
      .locator('option')
      .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
    await property.selectOption(options[1]);
    await page
      .getByRole('button', { name: 'Release source read', exact: true })
      .click();
    await expect(
      page.getByText('Source read paused', { exact: true }),
    ).toHaveCount(0);
    await expect(choices).toHaveCount(0);
    await expect(packet).toHaveCount(0);
    await load.click();
    await expect(
      page.getByRole('heading', {
        name: 'No available documentation',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'End synthetic session', exact: true })
      .click();
    await load.click();
    await expect(page.getByRole('alert')).toContainText('UNKNOWN');
    await expect(packet).toHaveCount(0);
    expect(external).toEqual([]);
  });
}
test('default OFF makes no evidence controls or customer reads', async ({
  page,
}) => {
  await page.goto('/tests/browser/fixtures/proof-of-work-off.html');
  await expect(
    page.getByRole('heading', { name: 'Proof of Work preview is off' }),
  ).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
