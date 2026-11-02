import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, measureClicks } from './cycle12-browser-helpers';
import { mkdir, writeFile } from 'node:fs/promises';
for (const company of sampleCompanies) {
  test(`advanced proposal source, original handoff and withdrawal / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    const clicks = await measureClicks(page, async () => {
      await nav(page, 'External proposal controls');
      const r = page.getByRole('region', {
        name: 'External proposal lifecycle',
        exact: true,
      });
      await r
        .getByRole('button', {
          name: 'Read exact proposal source',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Exact source and missing requirements',
          exact: true,
        }),
      ).toBeFocused();
      await r
        .getByRole('button', {
          name: 'Use exact source references',
          exact: true,
        })
        .click();
      await r
        .getByLabel(
          'I set this local review expiry against the synthetic clock.',
        )
        .check();
      await r
        .getByRole('button', {
          name: 'Review controlled proposal',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Retained proposal lifecycle comparison',
          exact: true,
        }),
      ).toBeFocused();
      await expect(r).toContainText('Local lifecycle: REVIEWED');
      await r
        .getByLabel('I confirm this exact local lifecycle action.')
        .check();
      await r
        .getByRole('button', {
          name: 'Prepare original review handoff',
          exact: true,
        })
        .click();
      await expect(
        r.getByRole('heading', {
          name: 'Original review-only handoff evidence',
          exact: true,
        }),
      ).toBeFocused();
      await expect(r).toContainText('Local lifecycle: PREPARED');
      await audit(page, r);
      await r.screenshot({
        path: `artifacts/cycle12/advanced-${info.project.name}-${company.slug}.png`,
      });
    });
    const r = page.getByRole('region', {
      name: 'External proposal lifecycle',
      exact: true,
    });
    await r.getByLabel('I confirm this exact local lifecycle action.').check();
    await r
      .getByRole('button', { name: 'Revoke local proposal', exact: true })
      .click();
    await expect(r).toContainText('Local lifecycle: REVOKED');
    await expect(
      r.getByRole('button', {
        name: 'Prepare original review handoff',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByRole('button', {
        name: 'Inspect retained original evidence',
        exact: true,
      })
      .click();
    await expect(r).toContainText('REVOKED');
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle12/advanced-revoked-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', {
        name: 'Display existing exact job workflow',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    await mkdir('artifacts/cycle12', { recursive: true });
    await writeFile(
      `artifacts/cycle12/clicks-advanced-${info.project.name}-${company.slug}.json`,
      JSON.stringify(
        {
          company: company.slug,
          viewport: info.project.name,
          task: 'Exact proposal source through original delegated review handoff; after environment preparation, includes group expansion. Trusted clicks only.',
          clicks,
        },
        null,
        2,
      ) + '\n',
    );
  });
}
