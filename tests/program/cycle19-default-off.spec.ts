import { test, expect } from '@playwright/test';
test('production keeps the operating center and guided paths closed', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:4391') &&
      !r.url().startsWith('data:')
    )
      requests.push(r.url());
  });
  await page.goto('/preview/operating-center');
  await expect(
    page.getByLabel('Use saved source continuity', { exact: true }),
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
    'Saved source workbench',
    'Saved field revisions',
    'Saved cost revisions',
    'Service revision review',
    'Saved maintenance revisions',
    'Saved priority revisions',
    'Daily contractor workbench',
    'Field agenda',
    'Cost and invoice review',
    'Service update review',
    'Maintenance agenda',
    'Daily priority actions',
    'Advanced task actions',
    'Field workspace',
    'Finance case desk',
    'Service Passport path',
    'Retained maintenance desk',
    'Owner action desk',
    'Add-on task desk',
    'Shared record search',
  ])
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(
      0,
    );
  expect(requests).toEqual([]);
});
