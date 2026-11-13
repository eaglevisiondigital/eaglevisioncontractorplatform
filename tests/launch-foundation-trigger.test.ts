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
function requireExactTriggerOnly(value: string) {
  expect(before.split(oldTrigger)).toHaveLength(2);
  expect(value).toBe(before.replace(oldTrigger, newTrigger));
}

it('collects the launch successor through the existing supplement with every job byte unchanged', () => {
  requireExactTriggerOnly(readFileSync(path, 'utf8'));
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
