import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture, measure } from './cycle15-browser-helpers';
import { writeFileSync } from 'node:fs';
for (const company of sampleCompanies) {
  test(`field exact evidence and retained return / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Schedule and work orders');
    const r = page.getByRole('region', {
      name: 'Field task continuity',
      exact: true,
    });
    await r
      .getByRole('combobox', { name: 'Field task job', exact: true })
      .selectOption({ index: 1 });
    await expect(
      r.getByRole('button', {
        name: 'Review field task schedule',
        exact: true,
      }),
    ).toBeDisabled();
    const clicks = await measure(page, async () => {
      await r
        .getByLabel('I confirm these time windows are human proposals only.', {
          exact: true,
        })
        .check();
      await r
        .getByRole('button', {
          name: 'Review field task schedule',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Retained field task review',
          exact: true,
        }),
      ).toBeFocused();
      await r
        .getByLabel('Field task instructions', { exact: true })
        .fill(
          'Inspect the exact source and technician-day evidence. No dispatch authorized.',
        );
      await r
        .getByLabel(
          'I confirm these instructions preserve issued scope and exact sources.',
          { exact: true },
        )
        .check();
      await r
        .getByRole('button', {
          name: 'Prepare field task instructions',
          exact: true,
        })
        .click();
      await expect(r).toContainText('Prepared instruction revision 2');
      await r
        .getByRole('button', {
          name: 'Open exact technician-day evidence',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Exact technician-day evidence',
          exact: true,
        }),
      ).toBeFocused();
    });
    await expect(r).toContainText('Actual availability UNKNOWN');
    await audit(page, r);
    await capture(page, r, 'field-evidence', company.slug, info.project.name);
    writeFileSync(
      `artifacts/cycle15/field-clicks-${info.project.name}-${company.slug}.json`,
      JSON.stringify({
        clicks,
        includes:
          'explicit confirmations,preparation,evidence; excludes setup/typing/scroll',
        authority: false,
      }) + '\n',
    );
    await r
      .getByRole('button', { name: 'Return to field task review', exact: true })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Retained field task review',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r).toContainText('Prepared instruction revision 2');
    await expect(
      r.getByRole('button', {
        name: 'Prepare field task instructions',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByRole('button', { name: 'Cancel field task review', exact: true })
      .click();
    await r
      .getByRole('button', {
        name: 'Reconcile field task read only',
        exact: true,
      })
      .click();
    await expect(r).toContainText('CANCELLED');
    await audit(page, r);
  });
}
