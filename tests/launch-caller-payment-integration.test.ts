import { expect, it } from 'vitest';
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const directory = 'proposals/launch-caller-payment-integration';
const invoice = '461a9017b526dae9bc3a88577fd5ad5b1c71963e';
const payments = '912639a07146b6f7f55d2c983f78334f3dfd63aa';
const base = 'af36a27e34b77bfef3700d7cd87fdb39c4dc50d5';
const ci = '5108f01369fc9d81e7cba3e8cb9100070e654aa6';
const ciPaths = [
  '.github/workflows/cycle33-foundation-runtime.yml',
  'tests/launch-foundation-trigger.test.ts',
];
const authors = {
  '8f498f2c657608c64d40a3527be13b47a189b7b7':
    '0e49670e6cc05473d3fd4e033b2c0f42b5fc10e0',
  '6063aea60588975bbe88c8ccf8b1d864721b7082':
    '8f498f2c657608c64d40a3527be13b47a189b7b7',
  '82c3ffd11499f9addbb92d6d5d7d1deb7e34d64c':
    '177fa209f81f03e6d1d1e2cba2dab8c4a90e18b7',
  ec74da65382841eb20749873fc3873623be56eb2:
    '82c3ffd11499f9addbb92d6d5d7d1deb7e34d64c',
  '461a9017b526dae9bc3a88577fd5ad5b1c71963e':
    'ec74da65382841eb20749873fc3873623be56eb2',
  '912639a07146b6f7f55d2c983f78334f3dfd63aa':
    '2d39359299a091456cf47196cef6f3257dddec9d',
};
const nmi = 'tests/database/nmi-refund-unknown-composition.test.ts';
const protectedPaths = [
  'server/invoices/commercial-draft-client.ts',
  'server/invoices/commercial-caller-connection.ts',
  'scripts/invoice-caller-source-admission.mjs',
  'tests/launch-invoice-payment-source.test.ts',
  'tests/invoice-caller-migration-source.test.ts',
];
const immutable = [
  'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json',
  'docs/COMMERCIAL_INVOICE_DRAFT_CANDIDATE.json',
  'docs/INVOICE_CALLER_FIXTURE_SUCCESSOR.json',
  'server/invoices/commercial-drafts.proposed.sql',
  'server/customer/broker-auth.ts',
];
const state = {
  sourceAuthor: 'EXACT_PATCHES_APPROVED',
  integrationPreparation: 'OWNER_DIRECTED',
  protectedPromotion: 'HELD_SEPARATE_APPROVAL',
  SQLInstallation: 'NOT_AUTHORIZED',
  operationalRoutes: 'UNWIRED',
  release: 'NO_GO',
};
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const git = (...args: string[]) =>
  execFileSync('git', ['--no-replace-objects', ...args]);
function evidence() {
  return JSON.parse(readFileSync(`${directory}/evidence.json`, 'utf8'));
}
// This is a source-composition check, never an admission switch or business port.
function verify(record = evidence(), read = readFileSync) {
  expect(record.parent).toBe(invoice);
  expect(record.historicalLaunchBase).toBe(base);
  expect(record.classification).toBe(
    'ISOLATED_PROPOSED_INTEGRATION_NOT_PROMOTED',
  );
  expect(record.authorization).toEqual(state);
  expect(record.authors).toEqual(authors);
  expect(record.sources.map((s: { path: string }) => s.path)).toEqual([
    ...protectedPaths,
    nmi,
  ]);
  for (const source of record.sources) {
    const author = source.path === nmi ? payments : invoice;
    expect(source.authorCommit).toBe(author);
    const bytes = git('show', `${author}:${source.path}`);
    expect(source.authoredSha256).toBe(hash(bytes));
    const originalTree = git('ls-tree', base, '--', source.path).toString();
    expect(source.beforeSha256).toBe(
      originalTree ? hash(git('show', `${base}:${source.path}`)) : null,
    );
    expect(read(source.path)).toEqual(bytes);
    expect(lstatSync(source.path).isFile()).toBe(true);
    expect(git('ls-tree', author, '--', source.path).toString()).toMatch(
      /^100644 blob [a-f0-9]{40}\t/,
    );
  }
  expect(record.ordinaryCI.map((s: { path: string }) => s.path)).toEqual(
    ciPaths,
  );
  for (const source of record.ordinaryCI) {
    expect(source.authorCommit).toBe(ci);
    const bytes = git('show', `${ci}:${source.path}`);
    expect(source.sha256).toBe(hash(bytes));
    expect(read(source.path)).toEqual(bytes);
  }
  expect(record.immutableRecords).toEqual(immutable);
  for (const p of immutable)
    expect(read(p)).toEqual(git('show', `${invoice}:${p}`));
  expect(record.protectedDiff).toEqual({
    path: `${directory}/protected-sources.patch`,
    sha256: '01ba7ffe88d5504fd014bfcc2b70deecb971bef03266676c1ec14835a6a0b42d',
    scope: 'ONLY_FIVE_PROTECTED_AUTHOR_FILES_NOT_A_STANDALONE_INSTALLER',
  });
  const patch = read(record.protectedDiff.path);
  expect(hash(patch)).toBe(record.protectedDiff.sha256);
  expect(patch).toEqual(
    git(
      'diff',
      '--binary',
      '--full-index',
      '--no-ext-diff',
      '--no-renames',
      base,
      invoice,
      '--',
      ...protectedPaths,
    ),
  );
  expect(record.optionalExcluded).toEqual([
    '84bdc4a369190a9e304fabea1ce38cc8f18ccfab',
  ]);
  for (const p of ['src/components/Customers.tsx', 'src/lib/operations.ts'])
    expect(read(p)).toEqual(git('show', `${invoice}:${p}`));
}
it('composes exact approved authors and NMI evidence without promotion or optional-source drift', () => {
  verify();
  for (const [author, parent] of Object.entries(evidence().authors))
    expect(
      git('show', '--no-patch', '--format=%P', author).toString().trim(),
    ).toBe(parent);
  expect(Object.keys(evidence().authors)).toHaveLength(6);
});
it.each([...protectedPaths, nmi, ...ciPaths])(
  'rejects unknown current source bytes in %s',
  (p) => {
    expect(() =>
      verify(evidence(), ((path: string) =>
        path === p
          ? Buffer.concat([readFileSync(path), Buffer.from('\n// UNKNOWN')])
          : readFileSync(path)) as typeof readFileSync),
    ).toThrow();
  },
);
it('cannot rebind a source hash to qualify an unknown current client', () => {
  const record = evidence(),
    bytes = Buffer.from('UNKNOWN SOURCE');
  record.sources[0].authoredSha256 = hash(bytes);
  expect(() =>
    verify(record, ((p: string) =>
      p === protectedPaths[0]
        ? bytes
        : readFileSync(p)) as typeof readFileSync),
  ).toThrow();
});
it.each(['protectedPromotion', 'SQLInstallation'])(
  'rejects invented %s authority',
  (key) => {
    const record = evidence();
    record.authorization[key] = 'APPROVED';
    expect(() => verify(record)).toThrow();
  },
);
it('rejects a changed promotion proposal without executing it', () => {
  expect(() =>
    verify(evidence(), ((p: string) =>
      p.endsWith('protected-sources.patch')
        ? Buffer.from('UNKNOWN PATCH')
        : readFileSync(p)) as typeof readFileSync),
  ).toThrow();
});
it('preserves the original financial/source records instead of rewriting their hashes', () => {
  expect(() =>
    verify(evidence(), ((p: string) =>
      p === immutable[0]
        ? Buffer.from('{}')
        : readFileSync(p)) as typeof readFileSync),
  ).toThrow();
});
