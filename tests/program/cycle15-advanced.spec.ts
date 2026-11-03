import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { advancedHandoffKinds } from '../../src/lib/workflows/advanced-handoffs';
import { start, nav, audit, capture } from './cycle15-browser-helpers';
for (const company of sampleCompanies)
  test(`advanced original mounted control and exact return / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Source-bound advanced workflows');
    const r = page.getByRole('region', {
      name: 'Advanced task continuity',
      exact: true,
    });
    const viewIndex = ['desktop', 'tablet', 'mobile'].indexOf(
      info.project.name,
    );
    const kind =
      advancedHandoffKinds[
        (sampleCompanies.indexOf(company) * 3 + viewIndex) %
          advancedHandoffKinds.length
      ];
    const jobs = r.getByLabel('Task source job', { exact: true });
    const job = await jobs.inputValue();
    await r.getByLabel('Task source mode', { exact: true }).selectOption(kind);
    await r
      .getByRole('button', {
        name: 'Inspect advanced task source',
        exact: true,
      })
      .click();
    const original = r.getByRole('region', {
      name: 'Pinned advanced workflow',
      exact: true,
    });
    await expect(original).toContainText('PINNED_NOT_REVIEWED');
    await expect(original).toContainText(job);
    await expect(original.getByRole('combobox')).toHaveCount(0);
    const label = `Retained ${kind} review ${company.slug}`;
    await original
      .getByLabel('Bound review label', { exact: true })
      .fill(label);
    await original
      .getByLabel(
        'I reviewed this exact pinned source and set its fixed local review expiry.',
        { exact: true },
      )
      .check();
    await original
      .getByRole('button', { name: 'Review pinned source', exact: true })
      .click();
    await expect(
      original.getByRole('heading', {
        name: 'Original pinned-source comparison',
        exact: true,
      }),
    ).toBeFocused();
    await r
      .getByRole('button', {
        name: 'Return to advanced task context',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Advanced task source context',
        exact: true,
      }),
    ).toBeFocused();
    await expect(jobs).toHaveValue(job);
    await expect(jobs).toBeDisabled();
    await expect(original).not.toBeVisible();
    await r
      .getByRole('button', {
        name: 'Resume retained advanced review',
        exact: true,
      })
      .click();
    await expect(
      original.getByLabel('Bound review label', { exact: true }),
    ).toHaveValue(label);
    await expect(
      original.getByRole('heading', {
        name: 'Original pinned-source comparison',
        exact: true,
      }),
    ).toBeVisible();
    await original
      .getByLabel(
        'I confirm this exact original comparison for the selected local control.',
        { exact: true },
      )
      .check();
    await original
      .getByRole('button', {
        name: 'Prepare original pinned handoff',
        exact: true,
      })
      .click();
    await expect(
      original.getByRole('heading', {
        name: 'Original pinned handoff evidence',
        exact: true,
      }),
    ).toBeFocused();
    await expect(original).toContainText('operational ready: false');
    await expect(
      original.getByRole('button', {
        name: 'Prepare original pinned handoff',
        exact: true,
      }),
    ).toBeDisabled();
    await audit(page, r);
    await capture(page, r, `advanced-${kind}`, company.slug, info.project.name);
    await r
      .getByRole('button', {
        name: 'Return to advanced task context',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', {
        name: 'Resume retained advanced review',
        exact: true,
      })
      .click();
    await expect(
      original.getByRole('heading', {
        name: 'Original pinned handoff evidence',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      original.getByRole('button', {
        name: 'Prepare original pinned handoff',
        exact: true,
      }),
    ).toBeDisabled();
    await audit(page, r);
  });
