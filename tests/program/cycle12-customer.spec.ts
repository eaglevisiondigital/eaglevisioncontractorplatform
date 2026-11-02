import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, measureClicks } from './cycle12-browser-helpers';
import { mkdir, writeFile } from 'node:fs/promises';
for (const company of sampleCompanies) {
  test(`service lifecycle and public scorecard / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    const clicks = await measureClicks(page, async () => {
      await nav(page, 'Service lifecycle');
      const r = page.getByRole('region', {
        name: 'Service lifecycle review',
        exact: true,
      });
      await r
        .getByRole('button', { name: 'Review lifecycle sources', exact: true })
        .click();
      await r
        .getByRole('button', { name: /^Review lifecycle requirements ·/ })
        .first()
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Exact service lifecycle requirements',
          exact: true,
        }),
      ).toBeFocused();
      await expect(r).toContainText('UNKNOWN');
      await r
        .getByRole('button', { name: /^Inspect exact published report ·/ })
        .first()
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Exact published lifecycle evidence',
          exact: true,
        }),
      ).toBeFocused();
      await audit(page, r);
      await r.screenshot({
        path: `artifacts/cycle12/customer-${info.project.name}-${company.slug}.png`,
      });
    });
    await page
      .getByRole('button', {
        name: 'Display existing exact job workflow',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    await page
      .getByRole('navigation', { name: 'Cycle 11 workflow labs', exact: true })
      .getByRole('button', { name: 'Pilot acceptance', exact: true })
      .click();
    const score = page.getByRole('region', {
      name: 'Pilot acceptance scorecard',
      exact: true,
    });
    await expect(score).toContainText(
      '25 matching of 25 retained capabilities',
    );
    await score
      .getByText('Evidence and next gate', { exact: true })
      .first()
      .click();
    await expect(
      score.getByRole('list', {
        name: 'Public source evidence for SEC-001',
        exact: true,
      }),
    ).toBeVisible();
    await audit(page, score);
    await score.screenshot({
      path: `artifacts/cycle12/scorecard-${info.project.name}-${company.slug}.png`,
    });
    await mkdir('artifacts/cycle12', { recursive: true });
    await writeFile(
      `artifacts/cycle12/clicks-customer-${info.project.name}-${company.slug}.json`,
      JSON.stringify(
        {
          company: company.slug,
          viewport: info.project.name,
          task: 'Open lifecycle source and exact published report after prepared environment; includes expanding new review group. Trusted clicks only, excluding typing/scrolling.',
          clicks,
        },
        null,
        2,
      ) + '\n',
    );
  });
}
