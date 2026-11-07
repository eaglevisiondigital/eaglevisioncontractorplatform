import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import original from './playwright.cycle11.config';
export default defineConfig({
  ...original,
  testMatch: 'cycle33-v1-acceptance-dashboard.spec.ts',
  testIgnore: [],
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          'artifacts/cycle33/v1-dashboard/browser-results.json',
        ),
      },
    ],
  ],
});
