import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  linkSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCycle17VisualReview,
  readCycle17Png,
  writeCycle17VisualOutput,
} from '../../scripts/cycle17-visual-review.mjs';
const png = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001',
  'hex',
);
const sha = createHash('sha256').update(png).digest('hex');
const manifest = (): Record<string, unknown> & {
  screenshots: Record<string, string | number>[];
} => ({
  schema: 'propel-cycle17-owner-visual-v1',
  visual_approval: 'PENDING',
  screenshots: ['operating-panels', 'advanced-panels'].flatMap((scope) =>
    ['straight-edge', 'cunningham', 'roofing-example'].flatMap((brand) =>
      ['desktop', 'tablet', 'mobile'].flatMap((viewport) =>
        ['reference', 'current'].map((side) => ({
          scope,
          brand,
          viewport,
          side,
          path: `artifacts/cycle17/${side}-${scope}-${viewport}-${brand}.png`,
          sha256: sha,
          width: 1,
          height: 1,
          source: 'a'.repeat(40),
          approval: 'PENDING',
        })),
      ),
    ),
  ),
});
it('requires exactly18 complete current/reference pairs and retains missing-approval limits', () => {
  const result = createCycle17VisualReview(manifest(), () => png);
  expect(result.screenshots).toBe(36);
  expect(result.completePairs).toBe(18);
  expect(result.approval).toBe('PENDING');
  expect(result.html).toContain('MISSING');
  expect(result.html).toContain('not an approved original');
  expect(result.html).toContain('Release 1.0 NOT READY / NOT AUTHORIZED');
  expect(result.html).not.toMatch(/<script|<form|https?:\/\//);
  expect(result.html.match(/<img /g)).toHaveLength(36);
});
for (const key of ['schema', 'visual_approval'])
  it(`rejects nonreview ${key}`, () => {
    const m = manifest();
    m[key] = 'APPROVED';
    expect(() => createCycle17VisualReview(m, () => png)).toThrow(
      'exact two-scope',
    );
  });
it('rejects missing comparison', () => {
  const m = manifest();
  m.screenshots.pop();
  expect(() => createCycle17VisualReview(m, () => png)).toThrow(
    'exact two-scope',
  );
});
it('rejects duplicate screenshot context', () => {
  const m = manifest();
  m.screenshots[1] = { ...m.screenshots[0] };
  expect(() => createCycle17VisualReview(m, () => png)).toThrow('duplicate');
});
for (const [key, value] of [
  ['brand', 'foreign'],
  ['viewport', 'private'],
  ['scope', 'customer-portal'],
  ['source', 'WORKING_TREE_UNCOMMITTED'],
  ['approval', 'APPROVED'],
  ['path', '../private.png'],
])
  it(`rejects invalid image ${key}`, () => {
    const m = manifest();
    m.screenshots[0][key] = value;
    expect(() => createCycle17VisualReview(m, () => png)).toThrow(
      'exact public',
    );
  });
it('rejects crossed brand/filename identity', () => {
  const m = manifest();
  m.screenshots[0].brand = 'cunningham';
  expect(() => createCycle17VisualReview(m, () => png)).toThrow(
    'filename/context',
  );
});
for (const key of ['sha256', 'width', 'height'])
  it(`rejects changed PNG ${key}`, () => {
    const m = manifest();
    m.screenshots[0][key] = key === 'sha256' ? 'b'.repeat(64) : 2;
    expect(() => createCycle17VisualReview(m, () => png)).toThrow(
      'PNG bytes/hash/dimensions',
    );
  });
it('rejects non-PNG bytes even with a supplied hash', () => {
  expect(() =>
    createCycle17VisualReview(manifest(), () => Buffer.from('not png')),
  ).toThrow('PNG bytes/hash/dimensions');
});
const roots: string[] = [];
afterEach(() => {
  for (const p of roots) rmSync(p, { recursive: true, force: true });
  roots.length = 0;
});
function root() {
  const p = mkdtempSync(join(tmpdir(), 'propel-c17-visual-'));
  roots.push(p);
  mkdirSync(join(p, 'artifacts/cycle17'), { recursive: true });
  return p;
}
it('writes only the two finite private-mode regular outputs', () => {
  const r = root();
  writeCycle17VisualOutput(
    r,
    'artifacts/cycle17/owner-visual-review.html',
    'exact',
  );
  const p = join(r, 'artifacts/cycle17/owner-visual-review.html');
  expect(readFileSync(p, 'utf8')).toBe('exact');
  expect(lstatSync(p).mode & 0o777).toBe(0o600);
  expect(() => writeCycle17VisualOutput(r, '../elsewhere', 'bad')).toThrow(
    'bounded exact',
  );
});
for (const kind of ['symlink', 'hardlink'])
  it(`rejects ${kind} output without altering sentinel`, () => {
    const r = root(),
      sentinel = join(r, 'sentinel');
    writeFileSync(sentinel, 'unchanged');
    const output = join(r, 'artifacts/cycle17/owner-visual-review.html');
    if (kind === 'symlink') symlinkSync(sentinel, output);
    else linkSync(sentinel, output);
    expect(() =>
      writeCycle17VisualOutput(
        r,
        'artifacts/cycle17/owner-visual-review.html',
        'replacement',
      ),
    ).toThrow('single-link');
    expect(readFileSync(sentinel, 'utf8')).toBe('unchanged');
  });
it('rejects source image symlink and traversal', () => {
  const r = root();
  const path = 'artifacts/cycle17/test.png';
  writeFileSync(join(r, 'sentinel.png'), png);
  symlinkSync(join(r, 'sentinel.png'), join(r, path));
  expect(() => readCycle17Png(r, path)).toThrow('image links');
  expect(() => readCycle17Png(r, '../sentinel.png')).toThrow('finite public');
});
