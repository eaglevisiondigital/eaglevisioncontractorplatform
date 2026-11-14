import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  frame,
  packet,
  proposedBytes,
  qualify,
  verifySourceAuthor,
  before,
  after,
  sha,
  // @ts-expect-error Offline JavaScript fixture qualifier has no declaration file.
} from '../proposals/nmi-token-boundary-fixture/qualify.mjs';

it('reproduces only the two original shape failures, qualifies their corrected assertions and keeps original G8 denied', () => {
  expect(qualify()).toMatchObject({
    originalTwo: { failed: 2, passed: 0 },
    correctedTwo: { failed: 0, passed: 2 },
    unchangedOtherParentFiles: 2409,
    originalG8: 'EXPECTED_DENIAL',
    applicationAuthorized: false,
    sourceAdmissionAuthorized: false,
  });
  expect(frame()).toBe('before');
});
it('changes only the final body expectation and adds old top-level absence without changing original case identities or budgets', () => {
  const old = readFileSync(
    'tests/nmi-two-merchant-token-boundary.test.ts',
    'utf8',
  );
  const next = proposedBytes().toString();
  expect(sha(Buffer.from(old))).toBe(before);
  expect(sha(Buffer.from(next))).toBe(after);
  const prior = `    expect(JSON.parse(String(options?.body))).toMatchObject({
      payment_details: { payment_token: s.token.value },
      order_id: s.intent.idempotencyKey,
    });`;
  const proposed = `    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      payment_details: { payment_token: s.token.value },
      order_details: { order_id: s.intent.idempotencyKey },
    });
    expect(body).not.toHaveProperty('order_id');`;
  expect(old.split(prior)).toHaveLength(2);
  expect(next).toBe(old.replace(prior, proposed));
});
it.each([
  'tests/nmi-two-merchant-token-boundary.test.ts',
  'server/payments/sandbox.ts',
  'scripts/payment-response-source-admission.mjs',
  'scripts/check-payment-ack-admission.mjs',
  'tests/launch-invoice-payment-source.test.ts',
  'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json',
])('denies unknown current bytes or a mixed source frame in %s', (target) => {
  expect(() =>
    frame((path: string) =>
      path === target
        ? Buffer.concat([readFileSync(path), Buffer.from('\n// UNKNOWN')])
        : readFileSync(path),
    ),
  ).toThrow();
});
it.each(['patch', 'record'])(
  'denies a substituted %s even when its claimed result hash is rebound',
  (mode) => {
    expect(() =>
      packet((path: string) => {
        const bytes = readFileSync(path);
        if (mode === 'patch' && path.endsWith('.patch'))
          return Buffer.concat([bytes, Buffer.from('\n// UNKNOWN')]);
        if (mode === 'record' && path.endsWith('.json'))
          return Buffer.from(
            JSON.stringify({
              ...JSON.parse(bytes.toString()),
              proposedSha256: '0'.repeat(64),
              applicationAuthorized: true,
            }),
          );
        return bytes;
      }),
    ).toThrow();
  },
);
it.each(['parent', 'delta', 'mode', 'authored-bytes', 'source-patch'])(
  'denies substituted approved-source %s provenance',
  (mode) => {
    const git = (...args: string[]) =>
      execFileSync('git', ['--no-replace-objects', ...args]);
    expect(() =>
      verifySourceAuthor((...args: string[]) => {
        if (mode === 'parent' && args.includes('--format=%P'))
          return Buffer.from('0'.repeat(40));
        if (mode === 'delta' && args[0] === 'diff-tree')
          return Buffer.from('M\tserver/payments/sandbox.ts\nM\tother.ts');
        if (mode === 'mode' && args[0] === 'ls-tree')
          return Buffer.from(
            '100755 blob ' + '0'.repeat(40) + '\tserver/payments/sandbox.ts',
          );
        if (
          mode === 'authored-bytes' &&
          args[0] === 'show' &&
          args.some((argument) => argument.includes(':'))
        )
          return Buffer.from('UNKNOWN');
        if (mode === 'source-patch' && args[0] === 'diff')
          return Buffer.from('UNKNOWN');
        return git(...args);
      }),
    ).toThrow();
  },
);
