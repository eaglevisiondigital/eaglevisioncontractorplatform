import { defineConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import field from './playwright.cycle16.config';
import off from './playwright.cycle16-off.config';

const mode = process.env.V1_FIELD_INTAKE_BROWSER_MODE ?? 'field';
if (!['field', 'off'].includes(mode))
  throw Error('Exact Field/OFF browser evidence mode required');
const git = (...args: string[]) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    encoding: 'utf8',
  }).trim();
const base = mode === 'off' ? off : field;
const directory = resolve('artifacts/cycle33/v1-field-intake/core');
const checkout = git('rev-parse', 'HEAD');
const candidate = process.env.CANDIDATE_HEAD ?? checkout;
if (!/^[a-f0-9]{40}$/.test(candidate))
  throw Error('Exact candidate SHA required');

export default defineConfig({
  ...base,
  testMatch:
    mode === 'field' ? 'cycle16-field.spec.ts' : 'cycle16-default-off.spec.ts',
  workers: 2,
  retries: 0,
  captureGitInfo: { commit: true, diff: true },
  outputDir: resolve(directory, mode + '-results'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(directory, mode + '.json') }],
  ],
  metadata: {
    schema: 'propel-v1-field-intake-browser-v1',
    candidate,
    source_checkout: checkout,
    source_tree: git('rev-parse', 'HEAD^{tree}'),
    mode,
    operational_acceptance: false,
  },
});
