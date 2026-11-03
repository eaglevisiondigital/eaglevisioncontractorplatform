import { test, expect } from '@playwright/test';
test('production keeps saved evidence and operating actions closed', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:4411') &&
      !r.url().startsWith('data:')
    )
      requests.push(r.url());
  });
  await page.goto('/preview/operating-center');
  for (const label of [
    'Use saved evidence files',
    'Use saved source continuity',
  ])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Prepare multi-job local environment',
      exact: true,
    }),
  ).toHaveCount(0);
  for (const name of [
    'Saved source workbench',
    'Work order evidence continuity',
    'Recorded cost continuity',
    'Published service continuity',
    'Maintenance renewal evidence',
    'Recorded priority navigation',
    'Local draft visit editor',
    'Organization labor preparation',
    'Inspected priority source navigation',
    'Shared record search',
  ])
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(
      0,
    );
  expect(requests).toEqual([]);
});
