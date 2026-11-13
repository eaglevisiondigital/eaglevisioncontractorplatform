import { expect, it } from 'vitest';
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const helper = await import(
  new URL('../proposals/invoice-caller-admission/helper.mjs', import.meta.url)
    .href
);
const proposal = await import(
  new URL('../proposals/invoice-caller-admission/qualify.mjs', import.meta.url)
    .href
);
const qualification = await import(
  new URL(
    '../proposals/invoice-checker-qualification/baseline.mjs',
    import.meta.url,
  ).href
);
const path = 'server/invoices/commercial-draft-client.ts';
const old = '12c1eb303f10f8cb9e6c5f765839419f55e4b6cfd16c6c6ef9f8812ccbb76194';
const original = (commit: string, p: string) =>
  execFileSync('git', ['--no-replace-objects', 'show', `${commit}:${p}`]);
// These cases exercise the immutable #397 helper, not current checker admission.
// Verify the exact live frame separately, then retain only its original companion.
const readHistoricalCompanion = (p: string) =>
  p === 'tests/invoice-caller-migration-source.test.ts'
    ? original('6063aea60588975bbe88c8ccf8b1d864721b7082', p)
    : readFileSync(p);
function historicalAdmission(
  p: string,
  bytes: Buffer,
  oldHash: string,
  ports: Record<string, unknown> = {},
) {
  qualification.qualificationBaseline();
  return helper.admitInvoiceCallerSource(p, bytes, oldHash, {
    readCurrent: readHistoricalCompanion,
    ...ports,
  });
}

it('passes all eight actual guard cases only in a disposable proposed tree', () => {
  expect(proposal.qualify()).toEqual({
    mode: 'positive',
    status: 'PASS',
    guardCases: 8,
    canonicalGuardChanged: false,
    admissionAuthorized: false,
  });
});
it.each(['helper-mutation', 'record-rebind'])(
  'denies actual %s before it can qualify source',
  (mode) => {
    expect(proposal.qualify({ mode }).status).toBe('DENIED');
  },
);
it('admits only the exact source and fixture authors, not an unrelated path or rebound old pin', () => {
  expect(historicalAdmission(path, readFileSync(path), old)).toBe(true);
  expect(
    historicalAdmission(
      'server/payments/control-store.ts',
      Buffer.from('unknown'),
      old,
    ),
  ).toBe(false);
  expect(() =>
    historicalAdmission(path, readFileSync(path), '0'.repeat(64)),
  ).toThrow('Exact finite');
});
it.each([
  'server/invoices/commercial-draft-client.ts',
  'server/invoices/commercial-caller-connection.ts',
  'tests/database/commercial-invoice-drafts.test.ts',
  'tests/fixtures/commercial-caller-unit.ts',
  'tests/fixtures/commercial-caller-native.ts',
  'proposals/invoice-caller-fixture-migration/source-author-baseline.mjs',
  'proposals/invoice-caller-reconciliation/qualify.mjs',
  'proposals/invoice-caller-reconciliation/qualify.d.mts',
  'tests/invoice-caller-migration-source.test.ts',
  'docs/INVOICE_CALLER_FIXTURE_SUCCESSOR.json',
])('rejects an unknown read-port companion edit in %s', (target) => {
  const readCurrent = (p: string) =>
    p === target
      ? Buffer.concat([readHistoricalCompanion(p), Buffer.from('\n// UNKNOWN')])
      : readHistoricalCompanion(p);
  expect(() =>
    historicalAdmission(path, readFileSync(path), old, {
      readCurrent,
    }),
  ).toThrow('Exact finite');
});
it.each([
  'source-parent',
  'fixture-parent',
  'source-delta',
  'fixture-delta',
  'mode',
])('rejects %s Git evidence', (mode) => {
  const metadata = (...args: string[]) => {
    const source = args.includes('8f498f2c657608c64d40a3527be13b47a189b7b7');
    const fixture = args.includes('6063aea60588975bbe88c8ccf8b1d864721b7082');
    if (
      args.includes('--format=%P') &&
      ((mode === 'source-parent' && source) ||
        (mode === 'fixture-parent' && fixture))
    )
      return Buffer.from('0'.repeat(40));
    if (
      args[0] === 'diff-tree' &&
      ((mode === 'source-delta' && source) ||
        (mode === 'fixture-delta' && fixture))
    )
      return Buffer.from('M\tother.ts');
    if (mode === 'mode' && args[0] === 'ls-tree' && source)
      return Buffer.from(`120000 blob ${'0'.repeat(40)}\t${path}`);
    return execFileSync('git', ['--no-replace-objects', ...args]);
  };
  expect(() =>
    historicalAdmission(path, readFileSync(path), old, {
      metadata,
    }),
  ).toThrow('Exact finite');
});
it('rejects substituted published bytes and a symlink ancestor', () => {
  expect(() =>
    historicalAdmission(path, readFileSync(path), old, {
      readOriginal: (c: string, p: string) =>
        p === path ? Buffer.from('unknown') : original(c, p),
    }),
  ).toThrow('Exact finite');
  expect(() =>
    historicalAdmission(path, readFileSync(path), old, {
      stat: (p: string) =>
        p === 'tests' ? { isSymbolicLink: () => true } : lstatSync(p),
    }),
  ).toThrow('Exact finite');
});
it.each(['approval', 'metadata-extra', 'rebound-patch'])(
  'rejects %s qualification metadata before execution',
  (mode) => {
    const evidence = JSON.parse(
      readFileSync('proposals/invoice-caller-admission/evidence.json', 'utf8'),
    );
    let patch = readFileSync(
      'proposals/invoice-caller-admission/admission.patch',
    );
    if (mode === 'approval') evidence.admissionAuthorized = true;
    if (mode === 'metadata-extra') evidence.hostedAccepted = true;
    if (mode === 'rebound-patch') {
      patch = Buffer.from(
        patch
          .toString()
          .replace(
            'Reviewed invoice caller helper required',
            'Unreviewed invoice caller helper required',
          ),
      );
      evidence.patchSha256 = createHash('sha256').update(patch).digest('hex');
    }
    expect(() => proposal.qualify({ patch, evidence })).toThrow(
      'Exact unapplied',
    );
  },
);
it('rejects a valid unknown patch without metadata rebinding', () => {
  const patch = Buffer.from(
    readFileSync(
      'proposals/invoice-caller-admission/admission.patch',
      'utf8',
    ).replace(
      'Reviewed invoice caller helper required',
      'Unreviewed invoice caller helper required',
    ),
  );
  expect(() => proposal.qualify({ patch })).toThrow(
    'Exact invoice admission patch',
  );
});
