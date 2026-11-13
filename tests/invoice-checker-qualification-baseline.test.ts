import { expect, it } from 'vitest';
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const baseline = await import(
  new URL(
    '../proposals/invoice-checker-qualification/baseline.mjs',
    import.meta.url,
  ).href
);
const guard = 'tests/launch-invoice-payment-source.test.ts',
  helper = 'scripts/invoice-caller-source-admission.mjs';
const git = (...args: string[]) =>
  execFileSync('git', ['--no-replace-objects', ...args]);
it('identifies exact authored or explicitly proposed test bytes without granting admission', () => {
  const r = baseline.qualificationBaseline();
  expect(r.checkerAuthor).toBe('82c3ffd11499f9addbb92d6d5d7d1deb7e34d64c');
  expect([
    'APPROVED_CHECKER_AUTHOR_ONLY',
    'UNAPPLIED_AMENDMENT_TEST_BYTES',
  ]).toContain(r.frame);
  expect(r.current).toEqual(readFileSync(guard));
  expect(r.original).toEqual(
    git('show', `177fa209f81f03e6d1d1e2cba2dab8c4a90e18b7:${guard}`),
  );
  expect(baseline.proposedAmendment.admissionAuthorized).toBe(false);
});
it('preserves the original absent-helper qualification frame', () => {
  const original = git(
    'show',
    `177fa209f81f03e6d1d1e2cba2dab8c4a90e18b7:${guard}`,
  );
  const read = (p: string) => (p === guard ? original : readFileSync(p));
  expect(
    baseline.qualificationBaseline({
      read,
      stat: () => {
        throw Object.assign(Error('absent'), { code: 'ENOENT' });
      },
    }).frame,
  ).toBe('ORIGINAL_UNAPPLIED_PROPOSAL');
  expect(() => baseline.qualificationBaseline({ read })).toThrow(
    'Original proposal requires absent helper',
  );
});
it.each([guard, helper])('rejects unknown current bytes in %s', (target) => {
  expect(() =>
    baseline.qualificationBaseline({
      read: (p: string) =>
        p === target
          ? Buffer.concat([readFileSync(p), Buffer.from('\n// UNKNOWN')])
          : readFileSync(p),
    }),
  ).toThrow();
});
it.each(['parent', 'delta', 'mode', 'guard-history', 'helper-history'])(
  'rejects %s Git evidence',
  (mode) => {
    const proof = (...args: string[]) => {
      if (mode === 'parent' && args.includes('--format=%P'))
        return Buffer.from('0'.repeat(40));
      if (mode === 'delta' && args[0] === 'diff-tree')
        return Buffer.from('M\tother.ts');
      if (mode === 'mode' && args[0] === 'ls-tree')
        return Buffer.from(`120000 blob ${'0'.repeat(40)}\t${guard}`);
      if (
        args[0] === 'show' &&
        ((mode === 'guard-history' &&
          args.includes(`${baseline.checkerAuthor}:${guard}`)) ||
          (mode === 'helper-history' &&
            args.includes(`${baseline.checkerAuthor}:${helper}`)))
      )
        return Buffer.from('UNKNOWN');
      return git(...args);
    };
    expect(() => baseline.qualificationBaseline({ git: proof })).toThrow();
  },
);
it('rejects a symlinked active helper', () => {
  expect(() =>
    baseline.qualificationBaseline({
      stat: (p: string) =>
        p === helper
          ? { isFile: () => true, isSymbolicLink: () => true }
          : lstatSync(p),
    }),
  ).toThrow('Regular active checker');
});
it('keeps original admission records and frozen proposal bytes unchanged', () => {
  for (const p of [
    'proposals/invoice-caller-admission/evidence.json',
    'proposals/invoice-caller-admission/admission.patch',
    'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json',
    'docs/COMMERCIAL_INVOICE_DRAFT_CANDIDATE.json',
  ])
    expect(readFileSync(p)).toEqual(
      git('show', `177fa209f81f03e6d1d1e2cba2dab8c4a90e18b7:${p}`),
    );
});
