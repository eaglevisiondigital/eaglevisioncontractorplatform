import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const parent = '429981149ddeaa2af1b0ce086b81e63a192ba451';
const path = '.github/workflows/cycle33-foundation-runtime.yml';
const original = (file: string) =>
  execFileSync('git', ['--no-replace-objects', 'show', `${parent}:${file}`], {
    encoding: 'utf8',
  });
const oldTrigger =
  "    branches: ['codex/program-cycle-thirty-two-integration']";
const newTrigger = `    branches:
      [
        'codex/program-cycle-thirty-two-integration',
        'codex/launch-current-session-integration',
      ]`;
const before = original(path);
// Retain the exact original #382 trigger contract; this historical read never
// substitutes for the separate current-parent trigger proof below.
const retained382 = execFileSync(
  'git',
  [
    '--no-replace-objects',
    'show',
    `f636d916811974d9f46f89df41a052c0c3630f2a:${path}`,
  ],
  { encoding: 'utf8' },
);
function requireExactTriggerOnly(value: string) {
  expect(before.split(oldTrigger)).toHaveLength(2);
  expect(value).toBe(before.replace(oldTrigger, newTrigger));
}

it('collects the launch successor through the existing supplement with every job byte unchanged', () => {
  requireExactTriggerOnly(retained382);
  expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toBe(
    original('.github/workflows/ci.yml'),
  );
});

it.each(['old-only', 'budget', 'assertion', 'extra-target'])(
  'rejects %s scope instead of widening or weakening the existing supplement',
  (mode) => {
    let value = before.replace(oldTrigger, newTrigger);
    if (mode === 'old-only') value = before;
    if (mode === 'budget')
      value = value.replace('timeout-minutes: 45', 'timeout-minutes: 46');
    if (mode === 'assertion')
      value = value.replace('npm run test:recovery', 'echo skipped');
    if (mode === 'extra-target')
      value = value.replace(
        "'codex/launch-current-session-integration',",
        "'codex/**',",
      );
    expect(() => requireExactTriggerOnly(value)).toThrow();
  },
);

const currentParent = '461a9017b526dae9bc3a88577fd5ad5b1c71963e';
const parentWorkflow = execFileSync(
  'git',
  ['--no-replace-objects', 'show', `${currentParent}:${path}`],
  { encoding: 'utf8' },
);
const previousBase = "        'codex/launch-current-session-integration',";
const currentBase =
  previousBase + "\n        'codex/invoice-checker-transition-author',";
function requireCurrentTriggerOnly(value: string) {
  expect(parentWorkflow.split(previousBase)).toHaveLength(2);
  expect(value).toBe(parentWorkflow.replace(previousBase, currentBase));
}
it('collects the exact invoice checker launch base with all path and job bytes unchanged', () => {
  requireCurrentTriggerOnly(readFileSync(path, 'utf8'));
  expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toBe(
    execFileSync(
      'git',
      [
        '--no-replace-objects',
        'show',
        `${currentParent}:.github/workflows/ci.yml`,
      ],
      { encoding: 'utf8' },
    ),
  );
});
it.each(['old-only', 'wildcard', 'paths', 'budget', 'partition', 'assertion'])(
  'rejects current %s expansion or weakening',
  (mode) => {
    let value = parentWorkflow.replace(previousBase, currentBase);
    if (mode === 'old-only') value = parentWorkflow;
    if (mode === 'wildcard')
      value = value.replace(
        "'codex/invoice-checker-transition-author'",
        "'codex/**'",
      );
    if (mode === 'paths')
      value = value.replace("'tests/cycle33-foundation-*'", "'tests/**'");
    if (mode === 'budget')
      value = value.replace('timeout-minutes: 45', 'timeout-minutes: 46');
    if (mode === 'partition')
      value = value.replace(
        'shard: [1, 2, 3, 4, 5, 6, 7, 8]',
        'shard: [1, 2, 3, 4, 5, 6, 7]',
      );
    if (mode === 'assertion')
      value = value.replace('npm run test:recovery', 'echo skipped');
    expect(() => requireCurrentTriggerOnly(value)).toThrow();
  },
);
