import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  cycle16Packages,
  validateCycle16Manifest,
} from '../../scripts/check-cycle16-integrity.mjs';
import { sourceOwner } from '../../scripts/feature-evidence.mjs';
const load = () =>
  JSON.parse(readFileSync('docs/program/CYCLE16_DELIVERY_INDEX.json', 'utf8'));
for (const [i, [module, component]] of cycle16Packages.entries())
  it(`exact metadata ownership:${module}`, () => {
    const owner = ['A3', 'A4', 'A5', 'A6', 'A6', 'A7'][i];
    expect(sourceOwner(`src/lib/workflows/${module}.ts`)).toBe(owner);
    expect(sourceOwner(`src/components/workflows/${component}.tsx`)).toBe(
      owner,
    );
    expect(sourceOwner(`src/components/workflows/${module}.css`)).toBe('A8');
  });
it('binds all six exact authored packages and independent review', () =>
  expect(validateCycle16Manifest(load())).toEqual({
    packages: 6,
    author_files: 30,
    independent_files: 2,
    retained_author_files: 313,
  }));
it('rejects changed author bytes', () => {
  const m = load();
  m.packages[0].owned_files[0].sha256 = '0'.repeat(64);
  expect(() => validateCycle16Manifest(m)).toThrow('Reviewed Cycle16');
});
it('rejects overlap, omitted and extra source files', () => {
  const overlap = load();
  overlap.packages[1].owned_files[0] = overlap.packages[0].owned_files[0];
  expect(() => validateCycle16Manifest(overlap)).toThrow('out-of-scope');
  for (const extra of [true, false]) {
    const m = load();
    if (extra)
      m.packages[0].owned_files.push({ ...m.packages[0].owned_files[0] });
    else m.packages[0].owned_files.pop();
    expect(() => validateCycle16Manifest(m)).toThrow('finite author');
  }
});
it('rejects wrong source/plan/release identities', () => {
  for (const [key, value] of [
    ['parent_commit', '0'.repeat(40)],
    ['plan_commit', '0'.repeat(40)],
    ['release', 'READY'],
    ['independent_status', 'PASS_PRODUCTION'],
    ['coordination_branch', 'main'],
  ]) {
    const m = load();
    m[key] = value;
    expect(() => validateCycle16Manifest(m)).toThrow('bounded Cycle16');
  }
});
it('rejects foreign author branches, duplicate PR and invalid review identity', () => {
  const m = load();
  m.packages[0].branch = 'codex/foreign';
  expect(() => validateCycle16Manifest(m)).toThrow('author identity');
  const n = load();
  n.packages[1].draft_pr = n.packages[0].draft_pr;
  expect(() => validateCycle16Manifest(n)).toThrow('author identity');
  const r = load();
  r.independent_review_commit = null;
  expect(() => validateCycle16Manifest(r)).toThrow('review commit');
});
it('preserves the successful Foundation validation workflow byte for byte', () => {
  expect(
    createHash('sha256')
      .update(readFileSync('.github/workflows/ci.yml'))
      .digest('hex'),
  ).toBe('df337433bfde1768ccbe396326793559f21113aa7c24e37fbd5955c4c29f87be');
});
it('preserves default-false opt-in and the single original repository host', () => {
  const text = readFileSync(
    'src/components/workflows/OperatingCenterCycleFifteen.tsx',
    'utf8',
  );
  expect(text).toContain('useState(false)');
  expect(text).toContain('dailyGuides ? cycle16DailyGroups : retained');
  expect(text).not.toMatch(
    /prepareOperatingSources|new (Operations|Phase3Repository|PropertyRepository)/,
  );
  const host = readFileSync(
    'src/components/workflows/OperatingCenterPreview.tsx',
    'utf8',
  );
  expect(host.match(/await prepareSources\(/g)).toHaveLength(1);
  expect(host).toContain('prepareSources = prepareOperatingSources');
  expect(host).toContain('selectedJobId: detail?.target.job_id');
});
