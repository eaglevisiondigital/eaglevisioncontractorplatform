import { test, expect } from '@playwright/test';
test('production keeps the operating center and guided paths closed', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:4351') &&
      !r.url().startsWith('data:')
    )
      requests.push(r.url());
  });
  await page.goto('/preview/operating-center');
  await expect(
    page.getByLabel('Use retained daily workspaces', { exact: true }),
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
