import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
// @ts-expect-error JavaScript build-time admission checker; no runtime capability.
import { checkPaymentAckAdmission } from '../scripts/check-payment-ack-admission.mjs';

interface Source {
  path: string;
  originCommit: string;
  originSha256: string;
  currentSha256: string;
  rootTestDelta?: string;
}
const composition = JSON.parse(
  readFileSync('docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json', 'utf8'),
);
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const current = (path: string) => readFileSync(path);
const original = (commit: string, path: string) =>
  execFileSync('git', ['--no-replace-objects', 'show', `${commit}:${path}`]);
function verify(readCurrent = current, readOriginal = original) {
  expect(composition.baselineCommit).toBe(
    'abbe34522672d6b69dc9b7e566fcf80241c68b23',
  );
  expect(composition.invoiceProposalCommit).toBe(
    '835702cc85e41fde689f54bb56810276e6ba9fda',
  );
  expect(composition.classification).toBe(
    'UNAPPLIED_UNWIRED_DEVELOPMENT_COMPOSITION',
  );
  expect(composition.sources).toHaveLength(26);
  const paths = new Set<string>();
  const deltas: Record<string, string> = {
    'tests/workflows/invoice-read-boundary.test.ts':
      'FINITE_HISTORICAL_CONTROL_STORE_ADMISSION',
    'tests/database/commercial-invoice-drafts.test.ts':
      'TWO_TENANT_DRAFT_RECEIPT_PAYMENT_DENIAL',
  };
  for (const source of composition.sources as Source[]) {
    expect(paths.has(source.path)).toBe(false);
    paths.add(source.path);
    expect(hash(readOriginal(source.originCommit, source.path))).toBe(
      source.originSha256,
    );
    if (source.path === 'tests/database/commercial-invoice-drafts.test.ts') {
      const fix = JSON.parse(
        readFileSync('docs/INVOICE_REVOCATION_TEST_CORRECTION.json', 'utf8'),
      );
      expect(fix.baseline).toBe('78cf1d3eb0ce37862a7f34d727e45e7ccb6417ad');
      expect(fix.classification).toBe(
        'TEST_HARNESS_ONLY_NO_RUNTIME_SQL_CHANGE',
      );
      expect(fix.originalSha256).toBe(source.currentSha256);
      expect(hash(readOriginal(fix.baseline, source.path))).toBe(
        source.currentSha256,
      );
      const next = JSON.parse(
        readCurrent('docs/LAUNCH_CURRENT_SESSION_SUCCESSOR.json').toString(
          'utf8',
        ),
      );
      expect(next.baseline).toBe('bcaf72deeb45417a7a9c01dd1b0a9380be291666');
      expect(next.classification).toBe(
        'NATIVE_SESSION_AUTHORITY_COVERAGE_ONLY',
      );
      expect(next.parentTestSha256).toBe(fix.successorSha256);
      expect(hash(readOriginal(next.baseline, source.path))).toBe(
        fix.successorSha256,
      );
      expect(next.currentTestSha256).toBe(
        '94d06410bdd267726f57aa1b1a90c3357af3ed51cadf69f2a39e610a09416b47',
      );
      expect(hash(readCurrent(source.path))).toBe(next.currentTestSha256);
    } else expect(hash(readCurrent(source.path))).toBe(source.currentSha256);
    if (source.rootTestDelta) {
      expect(deltas[source.path]).toBe(source.rootTestDelta);
    } else expect(source.currentSha256).toBe(source.originSha256);
  }
  const proposal = composition.sources.find(
    (s: Source) => s.path === 'server/invoices/commercial-drafts.proposed.sql',
  );
  expect(proposal.originCommit).toBe(composition.invoiceProposalCommit);
  expect(proposal.currentSha256).toBe(
    'da35d098727eff68ae7905c3709d6982cf89560cae538923f5d7e570dab0306e',
  );
  expect(
    (composition.sources as Source[])
      .filter((s) => s.rootTestDelta)
      .map((s) => s.path)
      .sort(),
  ).toEqual(Object.keys(deltas).sort());
}
it('binds the combined sources to exact author objects and retains finite payment admission', () => {
  verify();
  expect(checkPaymentAckAdmission().classification).toBe(
    'DEVELOPMENT_SOURCE_ONLY',
  );
});
it.each([
  'server/invoices/commercial-drafts.proposed.sql',
  'server/invoices/commercial-draft-client.ts',
  'tests/database/commercial-invoice-drafts.test.ts',
  'server/payments/control-store.ts',
  'src/lib/release.ts',
])('rejects an unknown combined source edit in %s', (target) => {
  expect(() =>
    verify((path) =>
      path === target
        ? Buffer.concat([current(path), Buffer.from('\nUNKNOWN EDIT')])
        : current(path),
    ),
  ).toThrow();
});
it('rejects substituted original author evidence', () => {
  expect(() =>
    verify(current, (commit, path) =>
      path === 'server/invoices/commercial-drafts.proposed.sql'
        ? Buffer.from('substituted history')
        : original(commit, path),
    ),
  ).toThrow();
});

it('rejects a source edit even when the mutable successor record is rebound to it', () => {
  const target = 'tests/database/commercial-invoice-drafts.test.ts';
  const changed = Buffer.concat([
    current(target),
    Buffer.from('\nUNKNOWN EDIT'),
  ]);
  const recordPath = 'docs/LAUNCH_CURRENT_SESSION_SUCCESSOR.json';
  const record = JSON.parse(current(recordPath).toString('utf8'));
  record.currentTestSha256 = hash(changed);
  expect(() =>
    verify((path) =>
      path === target
        ? changed
        : path === recordPath
          ? Buffer.from(JSON.stringify(record))
          : current(path),
    ),
  ).toThrow();
});
