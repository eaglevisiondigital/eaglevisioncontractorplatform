import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { confirmPreference } from './helpers/property-portal';

for (const approved of [false, true]) {
  const route = approved
    ? '/preview/property-portal'
    : '/preview/property-portal-design';
  const screenshotRoot = approved
    ? 'artifacts/property'
    : 'artifacts/property-design';
  const screenshotPrefix = approved ? 'phase-b-' : '';
  test(
    (approved ? 'Phase B: ' : 'Phase A: ') +
      'premium concept renders actual populated evidence and review screenshots with accessible responsive navigation',
    async ({ page }, info) => {
      if (info.project.name === 'desktop')
        await page.setViewportSize({ width: 1440, height: 1000 });
      const outside: string[] = [];
      page.on('request', (r) => {
        if (!r.url().startsWith('http://127.0.0.1:4173/'))
          outside.push(r.url());
      });
      await page.goto(route);
      await expect(
        page.getByRole('heading', { name: /Your property.*Clearly in view/ }),
      ).toBeVisible();
      await expect(
        page.getByRole('group', { name: 'Property summary' }),
      ).toContainText('07');
      await expect(
        page
          .getByRole('region', { name: 'Recent inspection activity' })
          .locator('li'),
      ).toHaveCount(3);
      const dev = page.locator('.concept-developer');
      await expect(dev).not.toHaveAttribute('open', '');
      await expect(
        page.getByRole('button', { name: 'Simulate loading error' }),
      ).not.toBeVisible();
      const logo = page.getByRole('img', {
        name: 'Propel Contractor Suite by Eagle Vision',
        exact: true,
      });
      await expect(logo).toHaveCount(1);
      const bytes = await (
        await page.request.get((await logo.getAttribute('src'))!)
      ).body();
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        approved
          ? 'dd6e8161dc4be20b97ca10cdb58a191b2bb5d4b92c2e58a2c4dcceed500a9a27'
          : 'b77d8e9e9db486c32ea24031033e4bec758342a4a3418fb438cfad23e0629bb0',
      );
      await mkdir(screenshotRoot, { recursive: true });
      async function capture(name: string) {
        await expect(page.locator('.portal-concept')).toContainText(
          'Synthetic property data',
        );
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `${screenshotRoot}/${screenshotPrefix}${info.project.name}-${name}.png`,
          fullPage: true,
          animations: 'disabled',
          scale: 'css',
        });
      }
      await capture('overview');
      if (approved) {
        expect(
          await logo.locator('..').evaluate((e) => {
            const s = getComputedStyle(e);
            return [s.backgroundColor, s.padding, s.borderRadius];
          }),
        ).toEqual(['rgba(0, 0, 0, 0)', '0px', '0px']);
        expect(
          await logo.evaluate((e) => {
            const image = e as HTMLImageElement;
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(image, 0, 0);
            return [
              ctx.getImageData(0, 0, 1, 1).data[3],
              ctx.getImageData(
                image.naturalWidth - 1,
                image.naturalHeight - 1,
                1,
                1,
              ).data[3],
            ];
          }),
        ).toEqual([0, 0]);
        await page.locator('.concept-footer').screenshot({
          path: `artifacts/property/phase-b-${info.project.name}-logo.png`,
          scale: 'css',
        });
      }
      await page
        .getByRole('button', { name: 'Property reports', exact: true })
        .click();
      await expect(
        page
          .getByRole('region', { name: 'Published inspection history' })
          .locator('article'),
      ).toHaveCount(7);
      await capture('reports');
      await page
        .getByRole('button', { name: 'Attention center', exact: true })
        .click();
      const center = page.getByRole('region', {
        name: 'Property attention center',
        exact: true,
      });
      await center
        .getByRole('combobox', { name: 'Attention view' })
        .selectOption('changed');
      await expect(center.locator('article')).toHaveCount(2);
      // Use the exact source-supported attention example for a focused owner-review image.
      const card = center.locator('article').filter({
        has: page.getByRole('heading', {
          name: 'Damage · East window seal',
          exact: true,
        }),
      });
      await card
        .getByText('Source inspection evidence (2)', { exact: true })
        .click();
      await expect(card).toContainText('not independently confirmed');
      await capture('attention');
      await card.screenshot({
        path: `${screenshotRoot}/${screenshotPrefix}${info.project.name}-attention-detail.png`,
        scale: 'css',
      });
      await page
        .getByRole('button', { name: 'Compare inspections', exact: true })
        .click();
      const comparison = page.getByRole('region', {
        name: 'Published inspection comparison',
        exact: true,
      });
      await comparison
        .getByRole('button', { name: 'Compare selected inspections' })
        .click();
      await expect(
        comparison.getByRole('region', {
          name: 'Earlier inspection',
          exact: true,
        }),
      ).toContainText('2026-12-07');
      await expect(
        comparison.getByRole('region', {
          name: 'Later inspection',
          exact: true,
        }),
      ).toContainText('2026-12-14');
      await expect(comparison).toContainText(
        'Reported checklist result differs',
      );
      await capture('comparison');
      await comparison
        .locator('.comparison-finding')
        .first()
        .screenshot({
          path: `${screenshotRoot}/${screenshotPrefix}${info.project.name}-comparison-detail.png`,
          scale: 'css',
        });
      await page
        .getByRole('button', { name: 'Estimates & repairs', exact: true })
        .click();
      const review = page.getByRole('region', {
        name: 'Customer estimate review',
      });
      await expect(review.locator('article')).toHaveCount(2);
      if (approved)
        await expect(
          review.getByRole('button', { name: 'Preview approve version 2' }),
        ).toBeEnabled();
      else
        await expect(
          review.getByRole('button', { name: 'Preview approve version 2' }),
        ).toBeDisabled();
      await capture('estimates');
      for (const word of [
        'INTERNAL',
        'unit_cost_minor',
        'payroll',
        'margin',
        'internal_notes',
      ])
        await expect(page.locator('.concept-view')).not.toContainText(word);
      await page
        .getByRole('combobox', { name: 'Your property', exact: true })
        .selectOption({ label: '200 Synthetic Garden Lane' });
      await expect(
        page.getByRole('heading', { name: 'Your journal starts here.' }),
      ).toBeVisible();
      await capture('empty');
      await dev.locator('summary').click();
      await page
        .getByRole('button', { name: 'Simulate loading error' })
        .click();
      await expect(page.getByRole('alert')).toContainText('simulated error');
      await expect(page.locator('.concept-view')).toHaveCount(0);
      await expect(page.locator('.concept-property-bar')).toHaveCount(0);
      await capture('error');
      await page.getByRole('button', { name: 'Reload preview status' }).click();
      await expect(
        page.getByRole('region', { name: 'Property overview' }),
      ).toBeVisible();
      expect(outside).toEqual([]);
    },
  );

  test(
    (approved ? 'Phase B: ' : 'Phase A: ') +
      'concept preserves exact sources, synthetic preference semantics, contractor switching and keyboard focus',
    async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route);
      await page
        .getByRole('button', { name: 'Attention center', exact: true })
        .click();
      const center = page.getByRole('region', {
        name: 'Property attention center',
        exact: true,
      });
      await center
        .getByRole('combobox', { name: 'Attention view' })
        .selectOption('estimates');
      const scope = center.getByRole('button', {
        name: 'Review linked issued scope · Version 2',
        exact: true,
      });
      const version = await scope.getAttribute('data-version-id');
      await scope.click();
      const review = page.getByRole('region', {
        name: 'Customer estimate review',
      });
      await expect(review.locator('article')).toHaveCount(1);
      await expect(review.locator('article')).toHaveAttribute(
        'data-version-id',
        version!,
      );
      if (!approved)
        await review
          .getByRole('checkbox', {
            name: 'Confirm this is a synthetic review only',
          })
          .check();
      await review
        .getByRole('button', { name: 'Preview decline version 2' })
        .click();
      if (approved) await confirmPreference(page);
      await expect(review).toContainText('Declined · synthetic preference');
      await expect(
        review.getByRole('button', { name: 'Preview approve version 2' }),
      ).toBeDisabled();
      await review
        .getByRole('button', { name: 'View inspection reports' })
        .click();
      const history = page.getByRole('region', {
        name: 'Published inspection history',
      });
      await expect(history.locator('article')).toHaveCount(1);
      await expect(history.locator('article')).toHaveAttribute(
        'data-report-version',
        '1',
      );
      const id = await history
        .locator('article')
        .getAttribute('data-report-id');
      await history
        .getByRole('button', { name: 'Compare this inspection' })
        .click();
      await expect(
        page.getByRole('combobox', { name: 'First published inspection' }),
      ).toHaveValue(id!);
      await page.locator('.concept-developer summary').click();
      for (const org of [
        'sample-construction',
        'sample-roofing',
        'sample-property',
      ]) {
        const select = page.getByRole('combobox', {
          name: 'Sample contractor',
        });
        if (!(await select.isVisible()))
          await page.locator('.concept-developer summary').click();
        await select.selectOption(org);
        await expect(
          page.getByRole('region', { name: 'Property overview' }),
        ).toBeVisible();
        await expect(page.locator('.portal-concept')).not.toContainText(
          'Declined · synthetic preference',
        );
        const color = await page
          .locator('.portal-concept')
          .evaluate((e) =>
            getComputedStyle(e).getPropertyValue('--company-color').trim(),
          );
        expect(color).toBe(
          org === 'sample-construction'
            ? '#a85a32'
            : org === 'sample-roofing'
              ? '#355ea0'
              : '#247364',
        );
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
      }
      await page.keyboard.press('ControlOrMeta+Home');
      await page.keyboard.press('Tab');
      // The design's explicit skip link provides keyboard access to the content landmark.
      const skip = page.getByRole('link', { name: 'Skip to property content' });
      await skip.focus();
      await expect(skip).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#concept-content')).toBeFocused();
    },
  );
}

test('approved portal retains Phase A layout and connected customer routes stay closed', async ({
  page,
}) => {
  await page.goto('/preview/property-portal-design');
  await expect(page.locator('.concept-metrics')).toBeVisible();
  await page
    .getByRole('link', { name: 'View existing functional preview' })
    .click();
  await expect(page.locator('.portal-concept--approved')).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Property summary' }),
  ).toContainText('07');
  await page.evaluate(() => document.fonts.ready);
  const actual = await page
    .locator('.concept-body')
    .screenshot({ animations: 'disabled' });
  await page.getByRole('link', { name: 'View Phase A design concept' }).click();
  await expect(page.locator('.portal-concept--approved')).toHaveCount(0);
  await expect(page.locator('.concept-metrics')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const concept = await page
    .locator('.concept-body')
    .screenshot({ animations: 'disabled' });
  expect(actual.equals(concept)).toBe(true);
  await page.goto('/portal/property-portal-design?sample=true');
  await expect(page.locator('.portal-concept')).toHaveCount(0);
  await expect(
    page.getByText('The customer portal is reserved', { exact: false }),
  ).toBeVisible();
});
