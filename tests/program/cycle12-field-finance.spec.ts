import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, measureClicks } from './cycle12-browser-helpers';
import { mkdir, writeFile } from 'node:fs/promises';
for (const company of sampleCompanies) {
  test(`schedule revision, exact source and irrevocable withdrawal / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    const clicks = await measureClicks(page, async () => {
      await nav(page, 'Schedule revisions');
      const r = page.getByRole('region', {
        name: 'Schedule proposal revisions',
        exact: true,
      });
      await r.getByRole('checkbox').check();
      await r
        .getByRole('button', {
          name: 'Review schedule proposal revision',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Source-bound proposal revision',
          exact: true,
        }),
      ).toBeFocused();
      await expect(r).toContainText('Local review revision 1');
      await r
        .getByLabel('Revised proposed start', { exact: true })
        .fill('12:00');
      await r.getByLabel('Revised proposed end', { exact: true }).fill('14:00');
      await r.getByRole('checkbox').check();
      await r
        .getByRole('button', {
          name: 'Review schedule proposal revision',
          exact: true,
        })
        .click();
      await expect(r).toContainText('Local review revision 2');
      await r
        .getByRole('button', {
          name: 'Open exact proposal revision source',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('region', {
          name: 'Exact proposal revision source',
          exact: true,
        }),
      ).toBeVisible();
      await audit(page, r);
      await r.screenshot({
        path: `artifacts/cycle12/field-${info.project.name}-${company.slug}.png`,
      });
    });
    await page
      .getByRole('button', {
        name: 'Display existing proposal revision job workflow',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    await nav(page, 'Schedule revisions');
    const r = page.getByRole('region', {
      name: 'Schedule proposal revisions',
      exact: true,
    });
    await r
      .getByRole('combobox', {
        name: 'Existing job and assigned technician',
        exact: true,
      })
      .selectOption({ index: 1 });
    await r.getByRole('checkbox').check();
    await r
      .getByRole('button', {
        name: 'Review schedule proposal revision',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', {
        name: 'Revoke same-tab proposal review',
        exact: true,
      })
      .click();
    await expect(r).toContainText('REVOKED');
    await expect(
      r.getByRole('button', {
        name: 'Review schedule proposal revision',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByRole('button', {
        name: 'Reconcile exact retained proposal revision',
        exact: true,
      })
      .click();
    await expect(r).toContainText('Exact retained review: REVOKED');
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle12/field-revoked-${info.project.name}-${company.slug}.png`,
    });
    await mkdir('artifacts/cycle12', { recursive: true });
    await writeFile(
      `artifacts/cycle12/clicks-field-${info.project.name}-${company.slug}.json`,
      JSON.stringify(
        {
          task: 'Two explicit human proposal revisions and source inspection, after environment preparation; typing/scrolling excluded.',
          company: company.slug,
          viewport: info.project.name,
          clicks,
        },
        null,
        2,
      ) + '\n',
    );
  });
  test(`canonical financial evidence and unchanged ledger / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    const clicks = await measureClicks(page, async () => {
      await nav(page, 'Financial source evidence');
      const r = page.getByRole('region', {
        name: 'Canonical financial evidence review',
        exact: true,
      });
      await r.getByRole('checkbox').check();
      await r
        .getByRole('button', {
          name: 'Load canonical financial evidence',
          exact: true,
        })
        .click();
      await r
        .getByRole('button', { name: /^Inspect source:/ })
        .first()
        .click();
      await expect(
        r.getByRole('heading', { name: /^Inspected financial source:/ }),
      ).toBeFocused();
      await expect(r).toContainText(
        'No exact linked canonical invoice is available',
      );
      await r.getByLabel('materials', { exact: true }).fill('120');
      await r
        .getByLabel('Staff explanation', { exact: true })
        .fill(
          'Synthetic staff forecast review; missing canonical linkage remains UNKNOWN.',
        );
      await r.getByRole('checkbox').last().check();
      await r
        .getByRole('button', {
          name: 'Prepare source-bound financial comparison',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Immutable Financial Evidence — Staff Review Only',
          exact: true,
        }),
      ).toBeVisible();
      await expect(r).toContainText('Bank settlement: UNKNOWN');
      await r
        .getByRole('button', {
          name: 'Reconcile exact retained proposal',
          exact: true,
        })
        .click();
      await audit(page, r);
      await r.screenshot({
        path: `artifacts/cycle12/finance-${info.project.name}-${company.slug}.png`,
      });
    });
    await mkdir('artifacts/cycle12', { recursive: true });
    await writeFile(
      `artifacts/cycle12/clicks-finance-${info.project.name}-${company.slug}.json`,
      JSON.stringify(
        {
          task: 'Canonical evidence inspection and explicitly confirmed comparison/reconciliation; typing/scrolling excluded.',
          company: company.slug,
          viewport: info.project.name,
          clicks,
        },
        null,
        2,
      ) + '\n',
    );
  });
}
