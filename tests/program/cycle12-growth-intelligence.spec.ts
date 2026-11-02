import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, measureClicks } from './cycle12-browser-helpers';
import { writeFile } from 'node:fs/promises';
for (const company of sampleCompanies) {
  test(`verified suggestions and blocked consent cancellation / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    const suggestionClicks = await measureClicks(page, async () => {
      await nav(page, 'Verified daily suggestions');
      const r = page.getByRole('region', {
        name: 'Source-checked operating suggestions',
        exact: true,
      });
      await r
        .getByLabel(
          'I confirm this exact company, selected-job set and review criteria for human review only.',
        )
        .check();
      await r
        .getByRole('button', {
          name: 'Review source-checked suggestions',
          exact: true,
        })
        .click();
      await r
        .getByRole('button', { name: /^Open exact source:/ })
        .first()
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Inspected suggestion source',
          exact: true,
        }),
      ).toBeFocused();
      await expect(r).toContainText('BLOCKED');
      await audit(page, r);
      await r.screenshot({
        path: `artifacts/cycle12/intelligence-${info.project.name}-${company.slug}.png`,
      });
    });
    const r = page.getByRole('region', {
      name: 'Source-checked operating suggestions',
      exact: true,
    });
    await r
      .getByLabel('Search facts and review suggestions')
      .fill('zz-no-matching-evidence-zz');
    await expect(
      r.getByRole('heading', {
        name: 'No matching available review items',
        exact: true,
      }),
    ).toBeVisible();
    await r
      .getByRole('button', { name: 'Reset suggestion filters', exact: true })
      .click();
    await r
      .getByRole('combobox', { name: 'Recorded-state check', exact: true })
      .selectOption('UNKNOWN');
    await expect(
      r.getByRole('combobox', { name: 'Recorded-state check', exact: true }),
    ).toHaveValue('UNKNOWN');
    await r
      .getByRole('button', { name: 'Reset suggestion filters', exact: true })
      .click();
    await r
      .getByRole('button', { name: /^Open exact source:/ })
      .first()
      .click();
    await r
      .getByRole('button', { name: 'Open exact source job', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    const growthClicks = await measureClicks(page, async () => {
      await nav(page, 'Consent cancellation');
      const g = page.getByRole('region', {
        name: 'Consent cancellation review',
        exact: true,
      });
      await g
        .getByLabel(
          'I confirm this is an internal review of actual blocked maintenance evidence only.',
        )
        .check();
      await g
        .getByRole('button', {
          name: 'Load cancellation review sources',
          exact: true,
        })
        .click();
      await expect(
        g.getByRole('heading', {
          name: 'Actual source-bound maintenance records',
          exact: true,
        }),
      ).toBeFocused();
      await g
        .getByRole('combobox', {
          name: 'Exact maintenance opportunity',
          exact: true,
        })
        .selectOption({ index: 1 });
      await g
        .getByLabel(
          'I confirm the exact source and proposed purpose. Cancellation is a local review action only.',
        )
        .check();
      await g
        .getByRole('button', {
          name: 'Review consent cancellation requirements',
          exact: true,
        })
        .click();
      await expect(
        g.getByRole('heading', {
          name: 'Original blocked evidence and local withdrawal',
          exact: true,
        }),
      ).toBeFocused();
      await g
        .getByRole('button', {
          name: 'Open exact cancellation source',
          exact: true,
        })
        .click();
      await expect(
        g.getByRole('heading', {
          name: 'Exact cancellation source',
          exact: true,
        }),
      ).toBeFocused();
      await expect(g).toContainText('Operational authority: BLOCKED');
      await audit(page, g);
      await g.screenshot({
        path: `artifacts/cycle12/growth-${info.project.name}-${company.slug}.png`,
      });
    });
    const g = page.getByRole('region', {
      name: 'Consent cancellation review',
      exact: true,
    });
    await g
      .getByRole('button', {
        name: 'Cancel same-tab consent review',
        exact: true,
      })
      .click();
    await expect(g).toContainText('Local review state: CANCELLED');
    await expect(
      g.getByRole('button', {
        name: 'Review consent cancellation requirements',
        exact: true,
      }),
    ).toBeDisabled();
    await g
      .getByRole('button', {
        name: 'Reconcile exact cancellation review',
        exact: true,
      })
      .click();
    await expect(g).toContainText(
      'Exact retained cancellation review: CANCELLED',
    );
    await audit(page, g);
    await g.screenshot({
      path: `artifacts/cycle12/growth-cancelled-${info.project.name}-${company.slug}.png`,
    });
    await g
      .getByRole('button', {
        name: 'Display existing cancellation job workflow',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    await writeFile(
      `artifacts/cycle12/clicks-suggestions-growth-${info.project.name}-${company.slug}.json`,
      JSON.stringify(
        {
          company: company.slug,
          viewport: info.project.name,
          task: 'Exact suggestion source / exact blocked cancellation source after environment; trusted clicks only. Suggestion includes initial review-group expansion.',
          suggestionClicks,
          growthClicks,
        },
        null,
        2,
      ) + '\n',
    );
  });
}
