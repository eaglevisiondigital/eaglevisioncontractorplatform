import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  adaptReviewed,
  failureInventory,
  git,
  loadReviewed,
  replaceExact,
  run,
  selectMode,
  target,
  verifyCanonical,
  // @ts-expect-error Offline qualification JavaScript has no declaration file.
} from '../../proposals/performance426-context/qualify.mjs';
import {
  patchSha256,
  proposalBytes,
  qualifyPromotion,
  // @ts-expect-error Offline qualification JavaScript has no declaration file.
} from '../../proposals/performance426-context/promotion.mjs';

it('binds exact426 callback lineage and all twelve421 measured source hashes before reuse', () => {
  const reviewed = loadReviewed();
  expect(reviewed.size).toBe(5);
  expect(verifyCanonical().size).toBe(6);
  expect(target.source).toBe('e6b437e1e4b8f72a057207b29923deb8eacd1d18');
});
it('qualifies the existing exact optimization/checkers only in disposable426 archives', () => {
  expect(run('critical')).toMatchObject({
    context: target.source,
    cycle9: 'PASS',
    cycle24Critical: 5,
    unknownRuntime: 'DENIED',
    unrelatedRuntime: 'DENIED',
    helperMutantsDenied: 4,
    canonicalChanges: false,
    admissionAuthorized: false,
    integrationAuthorized: false,
    sourcePromotionAuthorized: false,
  });
});
it.each([
  'evidence.json',
  'qualify.mjs',
  'measure.mjs',
  'inputs.fixture.ts',
  'regress.mjs',
])(
  'rejects substituted reviewed427 %s before adapting or importing it',
  (path) => {
    expect(() =>
      loadReviewed((...args: string[]) =>
        args[0] === 'show' && args[1]?.endsWith('/' + path)
          ? Buffer.from('UNREVIEWED')
          : git(...args),
      ),
    ).toThrow();
  },
);
it.each([
  [
    'source parent',
    (a: string[]) => a.includes('--format=%P') && a.at(-1) === target.source,
  ],
  [
    'helper parent',
    (a: string[]) =>
      a.includes('--format=%P') && a.at(-1) === target.helperAuthor,
  ],
  [
    'helper delta',
    (a: string[]) => a[0] === 'diff-tree' && a.at(-1) === target.helperAuthor,
  ],
  [
    'callback delta',
    (a: string[]) => a[0] === 'diff-tree' && a.at(-1) === target.source,
  ],
  [
    'helper source',
    (a: string[]) =>
      a[0] === 'show' && a[1]?.startsWith(target.helperAuthor + ':'),
  ],
  [
    'measured source',
    (a: string[]) => a[0] === 'show' && a[1]?.endsWith(':src/lib/phase3.ts'),
  ],
] as const)('denies contradictory %s evidence', (_name, match) => {
  expect(() =>
    loadReviewed((...a: string[]) =>
      match(a) ? Buffer.from('UNKNOWN') : git(...a),
    ),
  ).toThrow();
});
it('rejects incomplete and coordinated changes to the exact original eighteen-case inventory', () => {
  const original = failureInventory();
  expect(JSON.parse(original).failures).toHaveLength(18);
  const changed = JSON.parse(original);
  changed.failures.pop();
  changed.source = '0'.repeat(40);
  const bytes = Buffer.from(JSON.stringify(changed));
  expect(() => failureInventory(bytes)).toThrow(
    'Exact captured426 failures required',
  );
  expect(() => adaptReviewed(loadReviewed(), bytes)).toThrow(
    'Exact captured426 failures required',
  );
});
it('adapts only the sealed harness context and fixed measurement/regression selectors', () => {
  const before = loadReviewed(),
    after = adaptReviewed(before);
  expect(after.get('inputs.fixture.ts')).toEqual(
    before.get('inputs.fixture.ts'),
  );
  expect(after.get('qualify.mjs').toString()).toBe(
    before.get('qualify.mjs').toString().replace(target.parent, target.source),
  );
  const evidence = JSON.parse(after.get('evidence.json'));
  expect(evidence.context).toBe(target.source);
  evidence.context = target.parent;
  expect(evidence).toEqual(JSON.parse(before.get('evidence.json')));
  expect(JSON.parse(after.get('hosted-ten.json')).failures).toHaveLength(18);
});
it('does not accept ambiguous textual adapters or coerce CLI options', () => {
  expect(replaceExact('old', 'old', 'new')).toBe('new');
  expect(() => replaceExact('old old', 'old', 'new')).toThrow(
    'Exact reviewed adapter span',
  );
  expect(() => replaceExact('absent', 'old', 'new')).toThrow(
    'Exact reviewed adapter span',
  );
  let coerced = false;
  for (const value of [
    undefined,
    'all',
    'full',
    {
      toString: () => {
        coerced = true;
        return 'critical';
      },
    },
  ])
    expect(() => selectMode(value)).toThrow('Exact bounded mode');
  expect(coerced).toBe(false);
});
it('denies current canonical source substitution before any candidate execution', () => {
  expect(() =>
    verifyCanonical((path: string) =>
      path.endsWith('check-cycle24.mjs')
        ? Buffer.from('UNKNOWN')
        : readFileSync(path),
    ),
  ).toThrow('Exact unchanged426 source required');
});
it('applies only the finite four-file proposal inside an exact426 disposable archive', () => {
  const result = qualifyPromotion();
  expect(result.patchSha256).toBe(patchSha256);
  expect(Object.keys(result.exactAfter)).toEqual([
    'src/lib/workflows/operating-center-runtime.ts',
    'scripts/operating-source-signature-admission.mjs',
    'scripts/check-cycle9-integrity.mjs',
    'scripts/check-cycle24.mjs',
  ]);
  expect(result.canonicalChanges).toBe(false);
  expect(result.sourcePromotionAuthorized).toBe(false);
  expect(() =>
    proposalBytes(Buffer.concat([proposalBytes(), Buffer.from('\nUNKNOWN')])),
  ).toThrow('Exact finite426 patch required');
});
