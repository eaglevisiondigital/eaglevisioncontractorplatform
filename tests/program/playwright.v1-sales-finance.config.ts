import { defineConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import original from '../../playwright.config';
import operating from './playwright.cycle8.config';
import off from './playwright.cycle6-off.config';

const mode = process.env.V1_SALES_FINANCE_BROWSER_MODE ?? 'operating';
if (!['operating', 'finance', 'off'].includes(mode))
  throw Error('Exact reviewed browser mode required');
const base =
  mode === 'operating' ? operating : mode === 'finance' ? original : off;
const git = (...args: string[]) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    encoding: 'utf8',
  }).trim();
const checkout = git('rev-parse', 'HEAD');
const directory = resolve('artifacts/cycle33/v1-sales-finance');

// Select unchanged original tests/configuration. No test, expectation, action or
// hook timeout is widened; the three original production-OFF cases stay separate.
export default defineConfig({
  ...base,
  testDir: resolve(
    mode === 'finance' || mode === 'off' ? 'tests/browser' : 'tests/program',
  ),
  testMatch:
    mode === 'operating'
      ? 'cycle8-operating-desks.spec.ts'
      : mode === 'finance'
        ? 'job-margin.spec.ts'
        : 'cycle6-default-off.spec.ts',
  projects: base.projects!.filter((p) =>
    ['desktop', 'tablet', 'mobile'].includes(p.name!),
  ),
  workers: 2,
  retries: 0,
  outputDir: resolve(directory, `results-${mode}`),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(directory, `${mode}.json`) }],
  ],
  metadata: {
    source_candidate: process.env.CANDIDATE_HEAD || checkout,
    source_checkout: checkout,
    source_tree: git('rev-parse', 'HEAD^{tree}'),
    reviewed_mode: mode,
    operational_acceptance: false,
  },
});
