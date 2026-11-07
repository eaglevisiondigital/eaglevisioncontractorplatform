import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle11-browser-helpers';
for (const company of sampleCompanies)
  test(`unified V1 evidence categories and original gates / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Pilot acceptance');
    const score = page.getByRole('region', {
      name: 'Pilot acceptance scorecard',
      exact: true,
    });
    await expect(
      score.getByRole('heading', {
        name: 'Unified V1 acceptance dashboard',
        exact: true,
      }),
    ).toBeVisible();
    await expect(score.getByRole('status')).toHaveText(
      '25 matching of 25 retained capabilities',
    );
    const category = score.getByRole('combobox', {
      name: 'Evidence category',
      exact: true,
    });
    await expect(category).toHaveValue('all');
    await category.selectOption('operational');
    await expect(score.getByRole('status')).toHaveText(
      '0 matching of 25 retained capabilities',
    );
    await category.selectOption('ci');
    await expect(score.getByRole('status')).toHaveText(
      '24 matching of 25 retained capabilities',
    );
    await category.selectOption('optional');
    const search = score.getByRole('searchbox', {
      name: 'Find capability',
      exact: true,
    });
    await search.fill('FIN-002');
    await expect(score.getByRole('status')).toHaveText(
      '1 matching of 25 retained capabilities',
    );
    await score.getByText('Evidence and next gate', { exact: true }).click();
    await expect(score).toContainText('Essential core; Optional integrations');
    await expect(score).toContainText(
      'Genuine operational acceptance: NOT_ACCEPTED',
    );
    await search.fill('QA-001');
    await category.selectOption('ci');
    await expect(score.getByRole('status')).toHaveText(
      '0 matching of 25 retained capabilities',
    );
    await search.fill('');
    await category.selectOption('all');
    const decisions = score.getByText(
      'D1 operational roles and separate owner decisions',
      { exact: true },
    );
    await decisions.focus();
    await decisions.press('Enter');
    await expect(score.locator('ol > li')).toHaveCount(11);
    await expect(score).toContainText('All A01–A12 remain NOT RUN');
    await expect(score).toContainText('Return the completed copy privately');
    await score
      .getByText('Hosted CI evidence and incomplete coverage', { exact: true })
      .click();
    await expect(score).toContainText(
      'PASS 22 · FAIL 3 · CANCELLED 4 · PENDING 0',
    );
    await expect(score).toContainText('not CI for this dashboard commit');
    await expect(score).toContainText(
      'PASS 7 · FAIL 0 · CANCELLED 2 · PENDING 0',
    );
    await expect(
      score.getByText('Release NOT READY / NOT AUTHORIZED', { exact: false }),
    ).toBeVisible();
    await audit(page, score);
    expect((await category.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await mkdir('artifacts/cycle33/v1-dashboard', { recursive: true });
    await score.screenshot({
      path: `artifacts/cycle33/v1-dashboard/${info.project.name}-${company.slug}.png`,
    });
  });
