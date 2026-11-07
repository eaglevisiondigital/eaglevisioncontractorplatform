import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import original from './playwright.cycle17-off.config';
export default defineConfig({
  ...original,
  testMatch: [
    'cycle17-default-off.spec.ts',
    'cycle33-v1-dashboard-off.spec.ts',
  ],
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve('artifacts/cycle33/v1-dashboard/off-results.json'),
      },
    ],
  ],
});
