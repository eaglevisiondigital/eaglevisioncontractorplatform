import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import index from '../docs/program/CYCLE6_DELIVERY_INDEX.json';

const coordinator = '7b83aff9810c4055bcdcd73fd2d20f6f53c3c893';
// Explicit Git-object review: ordinary shallow CI need not retain unmerged heads.
const inspectGit = process.env.PROPEL_CYCLE7_BASELINE_REVIEW === 'true';
const root = process.cwd();
it('binds seven recorded author packages to disjoint exact combined source bytes', () => {
  if (inspectGit)
    execFileSync('git', ['merge-base', '--is-ancestor', coordinator, 'HEAD'], {
      cwd: root,
    });
  expect(index.packages.map((p) => p.draft_pr).sort((a, b) => a - b)).toEqual([
    39, 40, 41, 42, 43, 44, 45,
  ]);
  const paths = new Set<string>();
  for (const candidate of index.packages)
    for (const file of candidate.owned_files) {
      expect(paths.has(file.path)).toBe(false);
      paths.add(file.path);
      const current = readFileSync(resolve(root, file.path));
      expect(createHash('sha256').update(current).digest('hex')).toBe(
        file.sha256,
      );
      if (inspectGit) {
        const committed = execFileSync(
          'git',
          ['show', `${candidate.head_commit}:${file.path}`],
          { cwd: root },
        );
        expect(
          current.equals(committed),
          `${candidate.draft_pr}:${file.path}`,
        ).toBe(true);
      }
    }
  expect(paths.size).toBe(38);
});
