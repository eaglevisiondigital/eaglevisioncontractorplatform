import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const parent = '8f9cab9a6b42c057a12f1923bf35a514abc068b1';
const { dashboardSource: source } = (await import(
  await (async () => {
    const bytes = readFileSync(
      'proposals/dashboard-forms-fixture-compatibility/current-fixture.mjs',
    );
    if (
      createHash('sha256').update(bytes).digest('hex') !==
      '83a629d02a81d3f1a8b36bd39dc92839eebecfb79c0f9d7f66122c41d5ef8951'
    )
      throw Error('Exact approved dashboard/forms source fixture required');
    return 'data:text/javascript;base64,' + bytes.toString('base64');
  })()
)) as { dashboardSource(path: string): string };
const baseline = (path: string) =>
  execFileSync('git', ['show', `${parent}:${path}`], { encoding: 'utf8' });

describe('readonly dashboard parity source boundary', () => {
  it('keeps the original tenant module router and canonical repository exact', () => {
    const router = (text: string) =>
      text.slice(
        text.indexOf('export function CompanyOperations'),
        text.indexOf('export function NewLeadDashboard'),
      );
    expect(router(source('src/components/CompanyOperations.tsx'))).toBe(
      router(baseline('src/components/CompanyOperations.tsx')),
    );
    for (const path of [
      'src/lib/operations.ts',
      'src/App.tsx',
      'src/components/IntakeQueue.tsx',
      'src/components/forms-state.ts',
      'src/components/forms.tsx',
    ])
      expect(source(path), path).toBe(baseline(path));
  });

  it('preserves every independently pinned protected source byte', () => {
    const manifest: {
      count: number;
      files: { path: string; sha256: string }[];
    } = JSON.parse(source('docs/program/CYCLE4_PROTECTED_SOURCE.json'));
    expect(manifest.count).toBe(128);
    expect(manifest.files).toHaveLength(128);
    expect(
      manifest.files.some(
        (entry) => entry.path === 'src/components/CompanyOperations.tsx',
      ),
    ).toBe(false);
    for (const entry of manifest.files)
      expect(
        createHash('sha256').update(readFileSync(entry.path)).digest('hex'),
        entry.path,
      ).toBe(entry.sha256);
  });
});
