import { afterAll, beforeAll, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
const proposal: {
  prepareArchive: () => string;
  checkArchive: (root: string) => void;
  runControl: (
    root: string,
    name: string,
  ) => { control: string; passed: boolean; canonicalApplied: boolean };
} = await import(
  new URL(
    '../../proposals/c22-default-git-history/qualify.mjs',
    import.meta.url,
  ).href
);
let archive: string;
beforeAll(() => {
  archive = proposal.prepareArchive();
});
afterAll(() => {
  if (archive) {
    try {
      proposal.checkArchive(archive);
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  }
});
it.each([
  'natural-retained-source',
  'captured-default-reader',
  'unknown-current-source',
  'mixed-current-source',
  'injected-proxy-denial',
  'copied-history-buffer',
])('qualifies the on-disk C22 proposal: %s', (control) => {
  expect(proposal.runControl(archive, control)).toEqual({
    control,
    passed: true,
    canonicalApplied: false,
  });
});
