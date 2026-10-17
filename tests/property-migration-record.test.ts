import { afterEach, expect, it } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'propel-record-'));
  roots.push(root);
  for (const d of ['docs', 'scripts', 'supabase/migrations'])
    mkdirSync(join(root, d), { recursive: true });
  const review = JSON.parse(
    readFileSync('docs/PROPERTY_MIGRATION_REVIEW.json', 'utf8'),
  );
  for (const f of [
    'docs/MIGRATION_BUNDLE.json',
    'docs/PROVIDER_MIGRATION_REVIEW.json',
    'docs/PROPERTY_P0_MIGRATION_REVIEW.json',
    'scripts/check-migration-bundle.mjs',
    ...[
      ...review.historicalMigrations,
      ...review.migrations,
      ...JSON.parse(
        readFileSync('docs/PROPERTY_P0_MIGRATION_REVIEW.json', 'utf8'),
      ).migrations,
    ].map((m: { file: string }) => 'supabase/migrations/' + m.file),
  ])
    copyFileSync(f, join(root, f));
  const save = () =>
    writeFileSync(
      join(root, 'docs/PROPERTY_MIGRATION_REVIEW.json'),
      JSON.stringify(review),
    );
  const run = () => {
    save();
    return spawnSync(process.execPath, ['scripts/check-migration-bundle.mjs'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
    });
  };
  return { root, review, run };
}
it('accepts the exact applied dormant record without conferring replay authority', () => {
  const r = fixture().run();
  expect(r.status).toBe(0);
  expect(r.stdout).toContain('FEATURES DISABLED');
  expect(r.stdout).toContain('not replay or activation authority');
});
it.each(['missing evidence', 'feature activation', 'public wrapper'] as const)(
  'rejects an applied record with %s',
  (mode) => {
    const f = fixture();
    if (mode === 'missing evidence') delete f.review.developmentExecution;
    if (mode === 'feature activation')
      f.review.developmentExecution.featuresEnabled = true;
    if (mode === 'public wrapper') f.review.publicWrappers = ['unreviewed'];
    expect(f.run().status).not.toBe(0);
  },
);
it('rejects changed applied SQL even when every mutable manifest digest is recomputed', () => {
  const f = fixture(),
    file = join(f.root, 'supabase/migrations', f.review.migrations[0].file);
  writeFileSync(
    file,
    readFileSync(file, 'utf8') + '\n-- unapproved mutation\n',
  );
  const hash = (s: string | Buffer) =>
    createHash('sha256').update(s).digest('hex');
  f.review.migrations[0].sha256 = hash(readFileSync(file));
  f.review.pendingBundleSha256 = hash(JSON.stringify(f.review.migrations));
  f.review.fullProposedBundleSha256 = hash(
    JSON.stringify([...f.review.historicalMigrations, ...f.review.migrations]),
  );
  f.review.developmentExecution.fileSha256 = f.review.migrations[0].sha256;
  f.review.developmentExecution.bundleSha256 = f.review.pendingBundleSha256;
  expect(f.run().status).not.toBe(0);
});
it('rejects an extra unreviewed migration beside the applied bundle', () => {
  const f = fixture();
  writeFileSync(
    join(f.root, 'supabase/migrations/20990101000000_unapproved.sql'),
    'select 1;',
  );
  expect(f.run().status).not.toBe(0);
});

it.each([
  'featureRows',
  'reportAccessRows',
  'fullProposedBundleSha256',
  'publicWrappers',
] as const)('rejects P0 proposed scope drift in %s', (key) => {
  const f = fixture();
  const path = join(f.root, 'docs/PROPERTY_P0_MIGRATION_REVIEW.json');
  const p0 = JSON.parse(readFileSync(path, 'utf8'));
  if (key === 'fullProposedBundleSha256') p0[key] = '0'.repeat(64);
  else if (key === 'publicWrappers') p0[key].push('unreviewed');
  else p0[key] = 1;
  writeFileSync(path, JSON.stringify(p0));
  expect(f.run().status).not.toBe(0);
});
