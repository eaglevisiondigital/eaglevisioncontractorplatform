import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const proposal: {
  sourcePath: string;
  qualify: (options?: {
    patch?: Buffer;
    evidence?: Record<string, unknown>;
  }) => {
    differential: {
      passed: number;
      mutationFreshness: string;
      knownErrorClassDifferences: unknown[];
    };
    proposed: string;
  };
} = await import(
  new URL(
    '../../proposals/operating-source-signature/qualify.mjs',
    import.meta.url,
  ).href
);

it('qualifies exact unapplied bytes against 3045 cases without changing canonical source', () => {
  const result = proposal.qualify();
  expect(result.differential.passed).toBe(3045);
  expect(result.differential.mutationFreshness).toBe('PASS');
  expect(result.differential.knownErrorClassDifferences).toHaveLength(1);
});
it.each([
  'parent',
  'proposed-hash',
  'claimed-approval',
  'claimed-installation',
  'cache',
  'extra-authority',
])('rejects %s rather than letting metadata approve its own source', (mode) => {
  const evidence = JSON.parse(
    readFileSync('proposals/operating-source-signature/evidence.json', 'utf8'),
  );
  if (mode === 'parent') evidence.parent = '0'.repeat(40);
  if (mode === 'proposed-hash') evidence.proposedSha256 = '0'.repeat(64);
  if (mode === 'claimed-approval') evidence.admissionAuthorized = true;
  if (mode === 'claimed-installation') evidence.canonicalSourceChanged = true;
  if (mode === 'cache') evidence.sourceAndAuthorityCaching = true;
  if (mode === 'extra-authority') evidence.runtimeReady = true;
  expect(() => proposal.qualify({ evidence })).toThrow(
    'Exact reviewed unapplied scope',
  );
});
it('rejects an unknown patch even if its local mutable manifest is rebound', () => {
  const evidence = JSON.parse(
    readFileSync('proposals/operating-source-signature/evidence.json', 'utf8'),
  );
  const patch = Buffer.from(
    readFileSync(
      'proposals/operating-source-signature/correction.patch',
      'utf8',
    ).replace('Ordinary objects retain', 'Unreviewed objects retain'),
  );
  expect(() => proposal.qualify({ patch })).toThrow('Exact reviewed patch');
  evidence.patchSha256 = createHash('sha256').update(patch).digest('hex');
  expect(() => proposal.qualify({ patch, evidence })).toThrow(
    'Exact reviewed unapplied scope',
  );
});
it('retains the actual Cycle24 denial for the proposed bytes', async () => {
  const result = proposal.qualify();
  const checker: {
    validateCycle24CriticalSources: (ports: {
      read: (path: string) => Buffer;
      git: (commit: string, path: string) => Buffer;
    }) => unknown;
  } = await import(
    new URL('../../scripts/check-cycle24.mjs', import.meta.url).href
  );
  expect(() =>
    checker.validateCycle24CriticalSources({
      read: (path) =>
        path === proposal.sourcePath
          ? Buffer.from(result.proposed)
          : readFileSync(path),
      git: (commit, path) =>
        execFileSync('git', [
          '--no-replace-objects',
          'show',
          `${commit}:${path}`,
        ]),
    }),
  ).toThrow(`Critical frozen source changed: ${proposal.sourcePath}`);
});
