import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sourceOwner } from '../../scripts/feature-evidence.mjs';
import {
  validateCycle11Manifest,
  readCycle11File,
} from '../../scripts/check-cycle11-integrity.mjs';
const load = () =>
  JSON.parse(readFileSync('docs/program/CYCLE11_DELIVERY_INDEX.json', 'utf8'));
for (const [path, owner] of [
  ['src/lib/workflows/crew-assignment-lab.ts', 'A3'],
  ['src/components/workflows/FinancialCorrectionReview.tsx', 'A4'],
  ['src/lib/workflows/service-continuity.ts', 'A5'],
  ['src/lib/workflows/atomic-consent-lab.ts', 'A6'],
  ['src/lib/workflows/daily-action-center.ts', 'A6'],
  ['src/lib/workflows/sync-admission-review.ts', 'A7'],
  ['src/components/workflows/OperatingCenterCycleEleven.tsx', 'A8'],
  ['src/components/workflows/service-continuity.css', 'A8'],
])
  it(`Cycle11 ownership precedence: ${path}`, () =>
    expect(sourceOwner(path)).toBe(owner));
it('binds all six exact additive source packages and independent evidence', () =>
  expect(validateCycle11Manifest(load())).toEqual({
    packages: 6,
    author_files: 34,
    independent_files: 2,
  }));
it('denies changed author bytes against the exact reviewed source hash', () => {
  const m = load();
  m.packages[0].owned_files[0].sha256 = '0'.repeat(64);
  expect(() => validateCycle11Manifest(m)).toThrow(
    'Reviewed Cycle11 source changed',
  );
});
it('denies package source substitution and overlapping ownership', () => {
  const m = load();
  m.packages[1].owned_files[0] = { ...m.packages[0].owned_files[0] };
  expect(() => validateCycle11Manifest(m)).toThrow(
    'Overlapping or out-of-scope',
  );
});
it('denies missing package and duplicate author PR evidence', () => {
  const m = load();
  m.packages.pop();
  expect(() => validateCycle11Manifest(m)).toThrow('six-package');
  const n = load();
  n.packages[1].draft_pr = n.packages[0].draft_pr;
  expect(() => validateCycle11Manifest(n)).toThrow('author identity');
});
it('denies release promotion and unreviewed baseline substitution', () => {
  const m = load();
  m.release = 'READY';
  expect(() => validateCycle11Manifest(m)).toThrow('six-package');
  const n = load();
  n.parent_commit = '0'.repeat(40);
  expect(() => validateCycle11Manifest(n)).toThrow('six-package');
});
it('denies private traversal and executable source paths before opening files', () => {
  for (const path of [
    '.staging/action-d/private.json',
    'docs/program/../../private.json',
    'src/lib/workflows/./service-continuity.ts',
    '/tmp/x',
    'src/lib/workflows//service-continuity.ts',
  ])
    expect(() => readCycle11File(path)).toThrow('finite public');
});
it('retains one existing environment host and finite optional reviews', () => {
  const host = readFileSync(
      'src/components/workflows/OperatingCenterPreview.tsx',
      'utf8',
    ),
    wrapper = readFileSync(
      'src/components/workflows/OperatingCenterCycleEleven.tsx',
      'utf8',
    );
  expect(host.match(/await prepareSources\(/g)).toHaveLength(1);
  expect(host).toContain('prepareSources = prepareOperatingSources');
  expect(wrapper).not.toMatch(
    /prepareOperatingSources|new (Operations|Phase3Repository|PropertyRepository)/,
  );
  expect(wrapper.match(/id: '/g)).toHaveLength(7);
  expect(host).toContain('Operating center sections');
  expect(host).toContain('Daily workflow reviews');
});

it('rejects a missing laboratory worker or altered common brief', () => {
  const m = load();
  m.packages[0].owned_files.pop();
  expect(() => validateCycle11Manifest(m)).toThrow('finite source');
  const n = load();
  n.shared_brief.sha256 = '0'.repeat(64);
  expect(() => validateCycle11Manifest(n)).toThrow('common brief');
});
it('classifies server-only labs without granting operational authority', () => {
  expect(sourceOwner('server/field-lab/crew-transaction.ts')).toBe('A3');
  expect(sourceOwner('server/consent-lab/atomic-boundary.ts')).toBe('A6');
  expect(sourceOwner('src/lib/workflows/pilot-scorecard.ts')).toBe('A8');
});
