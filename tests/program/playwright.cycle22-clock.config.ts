import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import original from './playwright.cycle18.config';

export default defineConfig({
  ...original,
  testMatch: 'cycle22-daily-clock-retention.spec.ts',
  workers: 1,
  outputDir: resolve('artifacts/cycle22/c18-clock-playwright'),
  reporter: [
    ['list'],
    [
      'json',
      { outputFile: resolve('artifacts/cycle22/c18-clock-results.json') },
    ],
  ],
  projects: original.projects?.filter((project) => project.name === 'desktop'),
});
