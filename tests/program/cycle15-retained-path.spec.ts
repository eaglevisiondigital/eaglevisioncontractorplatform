import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, measure, audit } from './cycle15-browser-helpers';
import { writeFileSync } from 'node:fs';
for (const company of sampleCompanies)
  test(`retained schedule review trusted click baseline / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await page.getByLabel('Use guided task paths', { exact: true }).uncheck();
    await nav(page, 'Schedule and work orders');
    const r = page.getByRole('region', {
      name: 'Schedule and work-order continuity',
      exact: true,
    });
    const clicks = await measure(page, async () => {
      await r
        .getByLabel(
          'I confirm this schedule and working window are human proposals only.',
          { exact: true },
        )
        .check();
      await r
        .getByRole('button', {
          name: 'Review continuity schedule proposal',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Retained schedule-to-work-order sources',
          exact: true,
        }),
      ).toBeFocused();
      await r
        .getByRole('textbox', {
          name: 'Continuity operational instructions',
          exact: true,
        })
        .fill(
          'Inspect the exact source and technician-day evidence. No dispatch authorized.',
        );
      await r.getByRole('checkbox').last().check();
      await r
        .getByRole('button', {
          name: 'Prepare exact work-order handoff',
          exact: true,
        })
        .click();
      await expect(r).toContainText(
        'Prepared review revision 2 from schedule revision 1',
      );
      await r
        .getByRole('button', {
          name: 'Inspect exact continuity source',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Exact continuity source',
          exact: true,
        }),
      ).toBeFocused();
    });
    expect(clicks).toBeGreaterThan(0);
    await audit(page, r);
    writeFileSync(
      `artifacts/cycle15/retained-field-clicks-${info.project.name}-${company.slug}.json`,
      JSON.stringify({
        clicks,
        includes:
          'explicit confirmations,preparation,source inspection; excludes setup/typing/scroll',
        comparability:
          'Core review controls only. Retained source inspection and guided technician-day evidence are different destinations; no speed or task-completion equivalence claimed.',
        authority: false,
      }) + '\n',
    );
  });
