import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, measureClicks } from './cycle11-browser-helpers';
for (const company of sampleCompanies) {
  test(`crew, finance, service and acceptance / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    const clicks: Record<string, number> = {};
    clicks.crew_source = await measureClicks(page, async () => {
      await nav(page, 'Crew assignment lab');
      const r = page.getByRole('region', {
        name: 'Crew assignment lab',
        exact: true,
      });
      await r.getByRole('checkbox').check();
      await r
        .getByRole('button', {
          name: 'Review crew assignment readiness',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Source-bound assignment proposal',
          exact: true,
        }),
      ).toBeFocused();
      await r
        .getByRole('button', {
          name: 'Open exact assignment job source',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('region', { name: 'Exact assignment source', exact: true }),
      ).toBeVisible();
      await audit(page, r);
      await r.screenshot({
        path: `artifacts/cycle11/field-${info.project.name}-${company.slug}.png`,
      });
    });
    await page
      .getByRole('button', {
        name: 'Display existing assignment job workflow',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    clicks.finance_proposal = await measureClicks(page, async () => {
      await nav(page, 'Financial corrections');
      const r = page.getByRole('region', {
        name: 'Financial correction review',
        exact: true,
      });
      await r.getByRole('checkbox').check();
      await r
        .getByRole('button', {
          name: 'Load saved financial exceptions',
          exact: true,
        })
        .click();
      await r
        .getByRole('button', { name: /^Inspect / })
        .first()
        .click();
      await expect(
        r.getByRole('heading', { name: /^Inspected exception:/ }),
      ).toBeFocused();
      await r.getByLabel('materials', { exact: true }).fill('120');
      await r
        .getByLabel('Staff explanation', { exact: true })
        .fill(
          'Synthetic reviewed forecast proposal; original ledger remains unchanged.',
        );
      await r.getByRole('checkbox').last().check();
      await r
        .getByRole('button', {
          name: 'Prepare immutable proposal comparison',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('article', {
          name: 'Immutable financial proposal',
          exact: true,
        }),
      ).toBeVisible();
      await audit(page, r);
      await r.screenshot({
        path: `artifacts/cycle11/finance-${info.project.name}-${company.slug}.png`,
      });
    });
    clicks.customer_passport = await measureClicks(page, async () => {
      await nav(page, 'Service continuity');
      const r = page.getByRole('region', {
        name: 'Service continuity',
        exact: true,
      });
      await r
        .getByRole('button', { name: 'Review service continuity', exact: true })
        .click();
      await r
        .getByRole('button', { name: 'Follow exact service job', exact: true })
        .first()
        .click();
      await expect(
        r.getByRole('region', {
          name: 'Exact service continuity detail',
          exact: true,
        }),
      ).toBeVisible();
      await r
        .getByRole('navigation', { name: 'Service continuity trail' })
        .getByRole('button', { name: 'Property Passport', exact: true })
        .click();
      const passport = r.getByRole('region', {
        name: 'Customer-safe property Passport continuity',
        exact: true,
      });
      await expect(passport).toBeVisible();
      await passport
        .getByRole('button', { name: /^Open report / })
        .first()
        .click();
      await expect(
        r.getByRole('region', {
          name: 'Exact service continuity report',
          exact: true,
        }),
      ).toBeVisible();
      await audit(page, r);
      await r.screenshot({
        path: `artifacts/cycle11/customer-${info.project.name}-${company.slug}.png`,
      });
    });
    await nav(page, 'Pilot acceptance');
    const score = page.getByRole('region', {
      name: 'Pilot acceptance scorecard',
      exact: true,
    });
    await expect(score).toContainText(
      '25 matching of 25 retained capabilities',
    );
    await expect(score.getByRole('table')).toBeVisible();
    await score
      .getByLabel('Find capability', { exact: true })
      .fill('no such capability');
    await expect(score).toContainText('No matching capability.');
    await score.getByLabel('Find capability', { exact: true }).fill('');
    await audit(page, score);
    await score.screenshot({
      path: `artifacts/cycle11/scorecard-${info.project.name}-${company.slug}.png`,
    });
    await mkdir('artifacts/cycle11', { recursive: true });
    await writeFile(
      `artifacts/cycle11/clicks-${info.project.name}-${company.slug}.json`,
      JSON.stringify(
        {
          company: company.slug,
          viewport: info.project.name,
          basis:
            'Actual trusted click events after shared environment preparation; typing, scrolling and native selection keystrokes excluded.',
          clicks,
        },
        null,
        2,
      ) + '\n',
    );
  });
}
