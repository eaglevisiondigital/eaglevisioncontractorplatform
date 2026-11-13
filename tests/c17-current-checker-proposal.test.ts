import { expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const proposal = await import(
  new URL('../proposals/c17-current-checker/qualify.mjs', import.meta.url).href
);
const sha = (p: string) =>
  createHash('sha256').update(readFileSync(p)).digest('hex');
it('binds the real approved C17 source author and retains a separately unapproved checker proposal', () => {
  const r = JSON.parse(
    readFileSync('proposals/c17-current-checker/evidence.json', 'utf8'),
  );
  expect(r.sourceAuthor).toBe('76ee5226c52a850d5f692c8aac965d0487e0f544');
  expect(r.sourceParent).toBe('2c63cfd8175fe23d6c7f80a7879af9c73b27dceb');
  expect(r.status).toBe(
    'UNAPPLIED_REQUIRES_SEPARATE_EXACT_CHECKER_AUTHORIZATION',
  );
  expect(r.patchSha256).toBe(
    '9688a87aa6d0f3bc8b3cbcf5b034d925a8389aae2dc0e3935c1f2a62bd144aa2',
  );
  expect(sha('proposals/c17-current-checker/admission.patch')).toBe(
    r.patchSha256,
  );
  expect(sha('proposals/c17-current-checker/qualify.mjs')).toBe(
    r.qualifierSha256,
  );
});
it('qualifies original31 and new17 controls separately without changing strict31 CLI bytes or canonical files', () => {
  expect(proposal.qualify()).toMatchObject({
    author: '76ee5226c52a850d5f692c8aac965d0487e0f544',
    passed: 48,
    failed: 0,
    skipped: 0,
    originalCases: 31,
    newCases: 17,
    admissionApplied: false,
    businessAuthority: false,
  });
  expect(sha('scripts/v1-c17-inventory-source.mjs')).toBe(
    'e0ffeb3ba80b74474c0864ada76d531dcbb0e8c4d3f1ca299c0d59c5e3648f9e',
  );
  expect(sha('tests/v1-c17-inventory-source.test.mjs')).toBe(
    '6e4ea84eaf1511a09c863a139adb06f947a2a9ee7539730cf2047e2c8c8b841c',
  );
  expect(existsSync('tests/v1-c17-field-closeout-source.test.mjs')).toBe(false);
});
