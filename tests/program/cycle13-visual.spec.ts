import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { contractor } from '../browser/helpers/property-portal';
import {
  openModule,
  prepareMaintenance,
} from '../browser/helpers/contractor-workspace';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
for (const company of sampleCompanies)
  test(`approved reference/current visual evidence / ${company.slug}`, async ({
    page,
  }, info) => {
    const entries = [];
    await mkdir('artifacts/cycle13', { recursive: true });
    for (const [surface, side, route] of [
      ['customer-portal', 'reference', '/preview/property-portal-design'],
      ['customer-portal', 'current', '/preview/property-portal'],
      ['contractor-back-office', 'reference', '/preview/contractor-design'],
      ['contractor-back-office', 'current', '/preview'],
    ] as const) {
      await page.goto(route);
      if (surface === 'customer-portal') {
        await contractor(page, company.id);
        const controls = page.locator('.concept-developer');
        if ((await controls.getAttribute('open')) !== null)
          await controls.locator('summary').click();
        await expect(
          page.getByRole('region', { name: 'Property overview', exact: true }),
        ).toBeVisible();
      } else {
        if (side === 'reference') {
          // Let the isolated reference finish its existing initial preparation
          // before choosing another company; never retry an UNKNOWN attempt.
          await expect(
            page
              .getByRole('region', {
                name: 'Maintenance & follow-up center',
                exact: true,
              })
              .locator('.maintenance-card'),
          ).toHaveCount(3);
        }
        const selector = page.getByRole('combobox', {
          name: /^Company Context$/i,
        });
        if ((await selector.inputValue()) !== company.id)
          await selector.selectOption(company.id);
        if (side === 'current') {
          await openModule(page, 'Property Operations');
          await prepareMaintenance(page);
        }
        await expect(
          page
            .getByRole('region', {
              name: 'Maintenance & follow-up center',
              exact: true,
            })
            .locator('.maintenance-card'),
        ).toHaveCount(3);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.evaluate(() => scrollTo(0, 0));
      const id = `${surface}-${side}-${info.project.name}-${company.slug}`;
      const path = `artifacts/cycle13/${id}.png`;
      await page.screenshot({ path, fullPage: true });
      entries.push({
        id,
        pair: `${surface}-${info.project.name}-${company.slug}`,
        side,
        surface,
        brand: company.slug,
        viewport: info.project.name,
        path,
        sha256: createHash('sha256')
          .update(await readFile(path))
          .digest('hex'),
        caption: `Actual ${side} ${surface}; ${company.name}; ${info.project.name}. Existing authorized source preview only; screenshot does not grant approval.`,
      });
    }
    await writeFile(
      `artifacts/cycle13/visual-entries-${info.project.name}-${company.slug}.json`,
      JSON.stringify(entries, null, 2) + '\n',
    );
  });
