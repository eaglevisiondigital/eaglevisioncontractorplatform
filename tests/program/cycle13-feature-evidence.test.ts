import { bindCapturedVisualSource } from '../../scripts/cycle13-build-visual-evidence.mjs';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sourceOwner } from '../../scripts/feature-evidence.mjs';
import {
  validateCycle13Manifest,
  readCycle13File,
} from '../../scripts/check-cycle13-integrity.mjs';
const load = () =>
  JSON.parse(readFileSync('docs/program/CYCLE13_DELIVERY_INDEX.json', 'utf8'));
for (const [path, owner] of [
  ['src/lib/workflows/work-order-revisions.ts', 'A3'],
  ['src/components/workflows/FinancialCasework.tsx', 'A4'],
  ['src/lib/workflows/service-passport-desk.ts', 'A5'],
  ['src/lib/workflows/follow-up-readiness.ts', 'A6'],
  ['src/lib/workflows/operating-navigation.ts', 'A6'],
  ['src/lib/workflows/addon-review-desk.ts', 'A7'],
  ['src/components/workflows/OperatingCenterCycleThirteen.tsx', 'A8'],
  ['src/components/workflows/service-passport-desk.css', 'A8'],
])
  it(`Cycle13 ownership precedence: ${path}`, () =>
    expect(sourceOwner(path)).toBe(owner));
it('binds all seven exact additive source packages and independent evidence', () =>
  expect(validateCycle13Manifest(load())).toEqual({
    packages: 7,
    author_files: 37,
    independent_files: 2,
  }));
it('denies changed author bytes against the exact reviewed source hash', () => {
  const m = load();
  m.packages[0].owned_files[0].sha256 = '0'.repeat(64);
  expect(() => validateCycle13Manifest(m)).toThrow(
    'Reviewed Cycle13 source changed',
  );
});
it('denies package source substitution and overlapping ownership', () => {
  const m = load();
  m.packages[1].owned_files[0] = { ...m.packages[0].owned_files[0] };
  expect(() => validateCycle13Manifest(m)).toThrow(
    'Overlapping or out-of-scope',
  );
});
it('denies missing package and duplicate author PR evidence', () => {
  const m = load();
  m.packages.pop();
  expect(() => validateCycle13Manifest(m)).toThrow('seven-package');
  const n = load();
  n.packages[1].draft_pr = n.packages[0].draft_pr;
  expect(() => validateCycle13Manifest(n)).toThrow('author identity');
});
it('denies release promotion and unreviewed baseline substitution', () => {
  const m = load();
  m.release = 'READY';
  expect(() => validateCycle13Manifest(m)).toThrow('seven-package');
  const n = load();
  n.parent_commit = '0'.repeat(40);
  expect(() => validateCycle13Manifest(n)).toThrow('seven-package');
});
it('denies private traversal and executable source paths before opening files', () => {
  for (const path of [
    '.staging/action-d/private.json',
    'docs/program/../../private.json',
    'src/lib/workflows/./service-passport-desk.ts',
    '/tmp/x',
    'src/lib/workflows//service-passport-desk.ts',
  ])
    expect(() => readCycle13File(path)).toThrow('finite public');
});
it('retains one existing environment host and finite optional reviews', () => {
  const host = readFileSync(
      'src/components/workflows/OperatingCenterPreview.tsx',
      'utf8',
    ),
    wrapper = readFileSync(
      'src/components/workflows/OperatingCenterCycleThirteen.tsx',
      'utf8',
    );
  expect(host.match(/await prepareSources\(/g)).toHaveLength(1);
  expect(host).toContain('prepareSources = prepareOperatingSources');
  expect(wrapper).not.toMatch(
    /prepareOperatingSources|new (Operations|Phase3Repository|PropertyRepository)/,
  );
  expect(wrapper.match(/id: '/g)).toHaveLength(6);
  expect(host).toContain('Operating center sections');
  expect(host).toContain('Daily workflow reviews');
});

it('rejects missing laboratory evidence and additional undeclared sources', () => {
  const m = load();
  m.packages[0].owned_files.pop();
  expect(() => validateCycle13Manifest(m)).toThrow('finite source');
  const n = load();
  n.packages[3].owned_files.push({
    path: 'tests/extra-cycle13-source.ts',
    sha256: '0'.repeat(64),
  });
  expect(() => validateCycle13Manifest(n)).toThrow('finite source');
});
it('classifies server-only labs without granting operational authority', () => {
  expect(sourceOwner('server/field-lab/work-order-revisions.ts')).toBe('A3');
  expect(sourceOwner('src/lib/workflows/follow-up-readiness.ts')).toBe('A6');
  expect(sourceOwner('src/lib/workflows/pilot-scorecard.ts')).toBe('A8');
});

it('classifies visual inventory tooling without treating evidence as approval', () => {
  expect(sourceOwner('scripts/cycle13-visual-comparison.mjs')).toBe('A8');
  expect(sourceOwner('scripts/cycle13-build-visual-evidence.mjs')).toBe('A8');
  expect(sourceOwner('tests/program/cycle13-visual-evidence.test.ts')).toBe(
    'A8',
  );
});

it('keeps navigation a finite presentation callback over existing job components', () => {
  const host = readFileSync(
    'src/components/workflows/OperatingCenterPreview.tsx',
    'utf8',
  );
  expect(host).toContain('section?: OperatingJobSection');
  expect(host).toContain("throw Error('Unknown local job section')");
  for (const name of [
    'sales',
    'field',
    'finance',
    'completion',
    'maintenance',
    'daily',
  ])
    expect(host).toContain('id="operating-selected-' + name + '"');
  expect(host).toContain('captureOperatingSources(sources, sources.gate)');
  expect(host.match(/await prepareSources\(/g)).toHaveLength(1);
  expect(host).toContain('prepareSources = prepareOperatingSources');
});

it('never promotes pre-commit screenshots using the later gallery-build checkout', () => {
  expect(bindCapturedVisualSource([{}, { sourceCommit: null }])).toEqual({
    sourceCommit: null,
    sourceState: 'WORKING_TREE_UNCOMMITTED',
  });
  const sha = 'a'.repeat(40);
  expect(
    bindCapturedVisualSource([{ sourceCommit: sha }, { sourceCommit: sha }]),
  ).toEqual({ sourceCommit: sha, sourceState: 'COMMITTED' });
  expect(() => bindCapturedVisualSource([{ sourceCommit: sha }, {}])).toThrow(
    'Mixed captured',
  );
  expect(() =>
    bindCapturedVisualSource([
      { sourceCommit: sha },
      { sourceCommit: 'b'.repeat(40) },
    ]),
  ).toThrow('Mixed captured');
  expect(() =>
    bindCapturedVisualSource([{ sourceCommit: 'unproven' }]),
  ).toThrow('Exact captured');
  const getter = () => {
    throw Error('getter executed');
  };
  const item = Object.defineProperty({}, 'sourceCommit', { get: getter });
  expect(() => bindCapturedVisualSource([item])).toThrow(
    'Captured source data required',
  );
  expect(() => bindCapturedVisualSource([])).toThrow('Actual captured');
});
