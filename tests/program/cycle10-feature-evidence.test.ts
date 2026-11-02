import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sourceOwner } from '../../scripts/feature-evidence.mjs';
import {
  validateCycle10Manifest,
  readCycle10File,
} from '../../scripts/check-cycle10-integrity.mjs';
const load = () =>
  JSON.parse(readFileSync('docs/program/CYCLE10_DELIVERY_INDEX.json', 'utf8'));
for (const [path, owner] of [
  ['src/lib/workflows/crew-plan-review.ts', 'A3'],
  ['src/components/workflows/FinancialExceptions.tsx', 'A4'],
  ['src/lib/workflows/service-desk.ts', 'A2'],
  ['src/lib/workflows/follow-up-admission.ts', 'A6'],
  ['src/lib/workflows/priority-explanations.ts', 'A6'],
  ['src/lib/workflows/advanced-handoffs.ts', 'A7'],
  ['src/components/workflows/OperatingCenterCycleTen.tsx', 'A8'],
  ['src/components/workflows/service-desk.css', 'A8'],
])
  it(`Cycle10 ownership precedence: ${path}`, () =>
    expect(sourceOwner(path)).toBe(owner));
it('binds all six exact additive source packages and independent evidence', () =>
  expect(validateCycle10Manifest(load())).toEqual({
    packages: 6,
    author_files: 30,
    independent_files: 2,
  }));
it('denies changed author bytes against the exact reviewed source hash', () => {
  const m = load();
  m.packages[0].owned_files[0].sha256 = '0'.repeat(64);
  expect(() => validateCycle10Manifest(m)).toThrow(
    'Reviewed Cycle10 source changed',
  );
});
it('denies package source substitution and overlapping ownership', () => {
  const m = load();
  m.packages[1].owned_files[0] = { ...m.packages[0].owned_files[0] };
  expect(() => validateCycle10Manifest(m)).toThrow(
    'Overlapping or out-of-scope',
  );
});
it('denies missing package and duplicate author PR evidence', () => {
  const m = load();
  m.packages.pop();
  expect(() => validateCycle10Manifest(m)).toThrow('six-package');
  const n = load();
  n.packages[1].draft_pr = n.packages[0].draft_pr;
  expect(() => validateCycle10Manifest(n)).toThrow('author identity');
});
it('denies release promotion and unreviewed baseline substitution', () => {
  const m = load();
  m.release = 'READY';
  expect(() => validateCycle10Manifest(m)).toThrow('six-package');
  const n = load();
  n.parent_commit = '0'.repeat(40);
  expect(() => validateCycle10Manifest(n)).toThrow('six-package');
});
it('denies private traversal and executable source paths before opening files', () => {
  for (const path of [
    '.staging/action-d/private.json',
    'docs/program/../../private.json',
    'src/lib/workflows/./service-desk.ts',
    '/tmp/x',
    'src/lib/workflows//service-desk.ts',
  ])
    expect(() => readCycle10File(path)).toThrow('finite public');
});
it('retains one existing environment host and finite optional reviews', () => {
  const host = readFileSync(
      'src/components/workflows/OperatingCenterPreview.tsx',
      'utf8',
    ),
    wrapper = readFileSync(
      'src/components/workflows/OperatingCenterCycleTen.tsx',
      'utf8',
    );
  expect(host.match(/await prepareOperatingSources\(/g)).toHaveLength(1);
  expect(wrapper).not.toMatch(
    /prepareOperatingSources|new (Operations|Phase3Repository|PropertyRepository)/,
  );
  expect(wrapper.match(/id: '/g)).toHaveLength(6);
  expect(host).toContain('Operating center sections');
  expect(host).toContain('Daily workflow reviews');
});
