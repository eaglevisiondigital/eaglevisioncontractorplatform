import { test, expect } from '@playwright/test';
test('production keeps the operating center and guided paths closed', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:4331') &&
      !r.url().startsWith('data:')
    )
      requests.push(r.url());
  });
  await page.goto('/preview/operating-center');
  await expect(
    page.getByLabel('Use daily workflow guides', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Prepare multi-job local environment',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Field task continuity', exact: true }),
  ).toHaveCount(0);
  for (const name of [
    'Daily field guide',
    'Daily financial guide',
    'Service completion guide',
    'Retention review guide',
    'Owner briefing guide',
    'Add-on readiness guide',
    'Shared record search',
  ])
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(
      0,
    );
  expect(requests).toEqual([]);
});
