import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav } from './cycle18-browser-helpers';

for (const company of sampleCompanies) {
  test(`retained owner task becomes UNKNOWN on returning after its original expiry / ${company.slug}`, async ({
    page,
  }) => {
    const outside: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        url.protocol !== 'data:' &&
        !(
          ['http:', 'blob:'].includes(url.protocol) &&
          url.origin === 'http://127.0.0.1:4361'
        )
      )
        outside.push(request.url());
    });
    await page.clock.install({ time: new Date() });
    await start(page, company);
    await nav(page, 'Daily contractor workflow');
    const root = page.getByRole('region', {
      name: 'Daily contractor workbench',
      exact: true,
    });
    const search = root.getByRole('region', {
      name: 'Shared record search',
      exact: true,
    });
    await search
      .getByRole('button', { name: 'Find another record', exact: true })
      .click();
    await search
      .getByRole('button', { name: 'Search shared records', exact: true })
      .click();
    const article = search.locator('article').first();
    const job = await article.locator('span').first().innerText();
    await article
      .getByRole('button', { name: /^Open exact record in / })
      .click();
    const context = root.locator('.daily-workbench-context');
    await expect(context).toContainText(job);
    const retainedContext = await context.innerText();
    const steps = root.getByRole('navigation', {
      name: 'Daily review steps',
      exact: true,
    });
    await steps.getByRole('button', { name: /^Today’s priorities/ }).click();
    const priorities = root.getByRole('region', {
      name: 'Daily priority actions',
      exact: true,
    });
    await priorities
      .getByRole('button', {
        name: 'Review daily priority sources',
        exact: true,
      })
      .click();
    await priorities
      .getByRole('button', { name: /^Open original owner review for / })
      .first()
      .click();
    const owner = priorities.getByRole('region', {
      name: 'Owner action desk',
      exact: true,
    });
    await owner
      .getByLabel(
        'I confirm the current company, review day and saved operating sources.',
        { exact: true },
      )
      .check();
    await owner
      .getByRole('button', { name: 'Read owner action desk', exact: true })
      .click();
    await owner
      .getByRole('button', { name: /^Review next action: owner task / })
      .first()
      .click();
    const task = owner.getByRole('region', {
      name: 'Inspected owner next review',
      exact: true,
    });
    await expect(task).toBeVisible();
    await expect(task).toContainText(`exact job ${job}`);
    const expiry = await task
      .locator('dt', { hasText: /^Original inspection expiry$/ })
      .locator('xpath=following-sibling::dd[1]')
      .innerText();
    const currentTime = await page.evaluate(() => Date.now());
    expect(Date.parse(expiry)).toBeGreaterThan(currentTime);
    await owner.evaluate((element) =>
      element.setAttribute('data-c22-retained-owner', 'same-owner-instance'),
    );
    await steps.getByRole('button', { name: /^Work orders/ }).click();
    await expect(owner).toBeHidden();
    // Advance browser wall time only. Keep the original task's exact expiry and
    // retained component/callback/custody; no action or fresh inspection occurs.
    await page.clock.setSystemTime(new Date(Date.parse(expiry) + 1));
    await steps.getByRole('button', { name: /^Today’s priorities/ }).click();
    await expect(owner).toBeVisible();
    await expect(owner).toHaveAttribute(
      'data-c22-retained-owner',
      'same-owner-instance',
    );
    await expect(context).toHaveText(retainedContext, { useInnerText: true });
    await expect(owner.getByRole('alert')).toHaveText(
      'UNKNOWN — original task expired or no longer matches. No new expiry, replay or alternate destination.',
    );
    await expect(task).toHaveCount(0);
    await expect(
      owner.getByRole('button', {
        name: 'Open original job review',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(context).toHaveText(retainedContext, { useInnerText: true });
    expect(outside).toEqual([]);
  });
}
