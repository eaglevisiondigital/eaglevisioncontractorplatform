import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  validateCycle14Manifest,
  cycle14Packages,
} from '../../scripts/check-cycle14-integrity.mjs';
import { sourceOwner } from '../../scripts/feature-evidence.mjs';
const load = () =>
  JSON.parse(readFileSync('docs/program/CYCLE14_DELIVERY_INDEX.json', 'utf8'));

it('changes only the finite Foundation budget, retaining every prior validation byte', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(workflow.match(/timeout-minutes: 45/g)).toHaveLength(1);
  expect(
    createHash('sha256')
      .update(workflow.replace('timeout-minutes: 45', 'timeout-minutes: 25'))
      .digest('hex'),
  ).toBe('212dcb1c82beffe749725359c42ba771ec482e1412194e8912122ad8929a01cf');
});
for (const [module, component] of cycle14Packages)
  it(`Cycle14 disjoint metadata owner: ${module}`, () => {
    const expected = module.startsWith('schedule')
      ? 'A3'
      : module.startsWith('finance')
        ? 'A4'
        : module.startsWith('service')
          ? 'A5'
          : module.startsWith('source')
            ? 'A7'
            : 'A6';
    expect(sourceOwner(`src/lib/workflows/${module}.ts`)).toBe(expected);
    expect(sourceOwner(`src/components/workflows/${component}.tsx`)).toBe(
      expected,
    );
    expect(sourceOwner(`src/components/workflows/${module}.css`)).toBe('A8');
  });
it('binds exact six authored packages and independent evidence', () =>
  expect(validateCycle14Manifest(load())).toEqual({
    packages: 6,
    author_files: 30,
    independent_files: 2,
    retained_author_files: 253,
  }));
it('rejects changed author evidence', () => {
  const m = load();
  m.packages[0].owned_files[0].sha256 = '0'.repeat(64);
  expect(() => validateCycle14Manifest(m)).toThrow('Reviewed Cycle14');
});
it('rejects overlapping author ownership', () => {
  const m = load();
  m.packages[1].owned_files[0] = m.packages[0].owned_files[0];
  expect(() => validateCycle14Manifest(m)).toThrow('out-of-scope');
});
it('rejects omitted or extra author sources', () => {
  for (const extra of [true, false]) {
    const m = load();
    if (extra)
      m.packages[0].owned_files.push({ ...m.packages[0].owned_files[0] });
    else m.packages[0].owned_files.pop();
    expect(() => validateCycle14Manifest(m)).toThrow('finite author');
  }
});
it('rejects replacement parent, release promotion and duplicate PR evidence', () => {
  const m = load();
  m.parent_commit = '0'.repeat(40);
  expect(() => validateCycle14Manifest(m)).toThrow('bounded');
  const n = load();
  n.release = 'READY';
  expect(() => validateCycle14Manifest(n)).toThrow('bounded');
  const p = load();
  p.packages[1].draft_pr = p.packages[0].draft_pr;
  expect(() => validateCycle14Manifest(p)).toThrow('author identity');
});
it('retains one actual environment and current captured job presentation hint', () => {
  const host = readFileSync(
    'src/components/workflows/OperatingCenterPreview.tsx',
    'utf8',
  );
  expect(host.match(/await prepareOperatingSources\(/g)).toHaveLength(1);
  expect(host).toContain('selectedJobId: detail?.target.job_id');
  expect(host).toContain('selected.check()');
  expect(host).toContain('setSelected(null)');
});
it('retains original groups and adds one collapsed six-panel continuity group', () => {
  const host = readFileSync(
    'src/components/workflows/OperatingCenterCycleFourteen.tsx',
    'utf8',
  );
  expect(host).toContain('OperatingCenterCycleThirteen');
  expect(host).toContain('initiallyOpen: false');
  expect(host.match(/id: '/g)).toHaveLength(6);
  for (const c of [10, 11, 12, 13])
    expect(
      readFileSync(
        `src/components/workflows/OperatingCenterCycle${({ 10: 'Ten', 11: 'Eleven', 12: 'Twelve', 13: 'Thirteen' } as const)[c as 10 | 11 | 12 | 13]}.tsx`,
        'utf8',
      ),
    ).not.toContain('SourceBoundAddonEntry');
  expect(host).not.toMatch(
    /prepareOperatingSources|new (Operations|Phase3Repository|PropertyRepository)/,
  );
});
it('retains approved artwork, portal and back-office scopes without extra approval claims', () => {
  const d = readFileSync(
    'docs/program/CYCLE14_VISUAL_REVIEW.md',
    'utf8',
  ).replace(/\s+/g, ' ');
  expect(d).toContain('NOT owner-approved');
  expect(d).toContain('MISSING');
  expect(d).toContain('three existing');
});
