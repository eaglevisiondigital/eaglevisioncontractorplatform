import { readFileSync as nodeReadFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  captureIssuanceAuthorFixture,
  qualifyIssuanceAuthorFixture,
  issuanceAuthorHashes,
} from '../proposals/commercial-invoice-issuance/author-fixture';

// Seal the ordinary historical-fixture adapter before evaluating any bytes.
const guardFixturePath =
  'proposals/invoice-guard-admission/fixture-adapter.mjs';
const guardFixtureStat = (await import('node:fs')).lstatSync;
let guardFixturePrefix = '';
for (const part of guardFixturePath.split('/')) {
  guardFixturePrefix = guardFixturePrefix
    ? guardFixturePrefix + '/' + part
    : part;
  if (guardFixtureStat(guardFixturePrefix).isSymbolicLink())
    throw Error('Reviewed guard fixture required');
}
const guardFixtureInfo = guardFixtureStat(guardFixturePath);
if (!guardFixtureInfo.isFile() || (guardFixtureInfo.mode & 0o777) !== 0o644)
  throw Error('Reviewed guard fixture required');
const guardFixtureBytes = nodeReadFileSync(guardFixturePath);
if (
  (await import('node:crypto'))
    .createHash('sha256')
    .update(guardFixtureBytes)
    .digest('hex') !==
  '6c6a5758d3a3219b4fac88e5dbbeb2e24f6182bf73c8eba3f7bc5c44c8cd61bc'
)
  throw Error('Reviewed guard fixture required');
const { createHistoricalRead } = await import(
  'data:text/javascript;base64,' + guardFixtureBytes.toString('base64')
);
const readFileSync = createHistoricalRead(nodeReadFileSync, {
  includeSql: false,
}) as typeof nodeReadFileSync;

const sourcePath = 'server/invoices/commercial-drafts.proposed.sql';
const patchPath =
  'proposals/commercial-invoice-issuance/draft-projection-guard.patch';
const currentSource = readFileSync(sourcePath, 'utf8');
const patch = readFileSync(patchPath, 'utf8');
const source = qualifyIssuanceAuthorFixture(currentSource, patch).original;
const anchor =
  " if not found then raise exception 'Exact invoice draft unavailable' using errcode='42501';end if;\n";
const guard =
  " if to_jsonb(h)->>'issued_revision' is not null then raise exception 'Invoice already issued; use issued reader' using errcode='42501';end if;\n";
const authored = source.replace(anchor, anchor + guard);
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const callerCheckerBytes = readFileSync(
  'scripts/invoice-caller-source-admission.mjs',
);
if (
  hash(callerCheckerBytes.toString('utf8')) !==
  'f3fb04f429f2e43493bf57ecce38a7435f346fa4d2fd17d790ff170e366b11bb'
)
  throw Error('Exact original invoice source checker required');
const { admitInvoiceCallerSource } = await import(
  'data:text/javascript;base64,' + callerCheckerBytes.toString('base64')
);
const originalClientHash =
  '12c1eb303f10f8cb9e6c5f765839419f55e4b6cfd16c6c6ef9f8812ccbb76194';

it.each(['baseline', 'authored'] as const)(
  'captures the exact %s fixture phase without changing a protected file',
  (phase) => {
    const candidate = phase === 'baseline' ? source : authored;
    const read = (p: string) =>
      p === sourcePath ? Buffer.from(candidate) : readFileSync(p);
    const result = captureIssuanceAuthorFixture(read);
    expect(result).toMatchObject({
      original: source,
      sourceHash:
        phase === 'baseline'
          ? issuanceAuthorHashes.before
          : issuanceAuthorHashes.after,
      classification:
        phase === 'baseline'
          ? 'UNAPPLIED_BASELINE'
          : 'EXACT_AUTHOR_FIXTURE_ONLY',
      admission: 'HELD',
    });
    expect(captureIssuanceAuthorFixture().sourceHash).toBe(hash(currentSource));
    expect(hash(readFileSync(sourcePath, 'utf8'))).toBe(hash(currentSource));
  },
);
it('qualifies only the exact held author endpoint in memory and preserves native fixture SQL', () => {
  expect(hash(authored)).toBe(issuanceAuthorHashes.after);
  const result = qualifyIssuanceAuthorFixture(authored, patch);
  expect(result).toMatchObject({
    original: source,
    sourceHash: issuanceAuthorHashes.after,
    classification: 'EXACT_AUTHOR_FIXTURE_ONLY',
    admission: 'HELD',
  });
  expect(hash(result.original.replace(anchor, anchor + guard))).toBe(
    issuanceAuthorHashes.after,
  );
  expect(hash(readFileSync(sourcePath, 'utf8'))).toBe(hash(currentSource));
});
it.each([
  source + '\n',
  authored + '\n',
  authored.replace("'issued_revision'", "'current_revision'"),
  authored.replace("errcode='42501'", "errcode='00000'"),
  source.replace('for update', 'for share'),
  authored.replace('select * into h', 'select id into h'),
])('denies unknown before/after source substitution %#', (value) => {
  expect(() => qualifyIssuanceAuthorFixture(value, patch)).toThrow(
    'Exact held',
  );
});
it.each([
  '',
  patch + '\n',
  patch.replace('commercial-drafts.proposed.sql', 'other.sql'),
  patch.replace('42501', '00000'),
])('denies omitted or rebound patch %#', (value) => {
  expect(() => qualifyIssuanceAuthorFixture(source, value)).toThrow(
    'Exact held',
  );
});
it.each([
  sourcePath,
  'server',
  'server/invoices',
  patchPath,
  'proposals',
  'proposals/commercial-invoice-issuance',
])('denies symlink file or ancestor %s', (path) => {
  const stat = (p: string) =>
    p === path ? { ...lstatSync(p), isSymbolicLink: () => true } : lstatSync(p);
  expect(() =>
    captureIssuanceAuthorFixture(readFileSync, stat as typeof lstatSync),
  ).toThrow('Exact held');
});
it.each([0o600, 0o755])('denies wrong source mode %i', (mode) => {
  const stat = (p: string) =>
    p === sourcePath
      ? {
          ...lstatSync(p),
          mode,
          isSymbolicLink: () => false,
          isFile: () => true,
        }
      : lstatSync(p);
  expect(() =>
    captureIssuanceAuthorFixture(readFileSync, stat as typeof lstatSync),
  ).toThrow('Exact held');
});
it('denies path replacement after capture before allowing the fixture projection', () => {
  let reads = 0;
  const read = (p: string) => {
    reads++;
    return readFileSync(p);
  };
  const stat = (p: string) =>
    p === sourcePath && reads > 0
      ? { ...lstatSync(p), isSymbolicLink: () => true }
      : lstatSync(p);
  expect(() =>
    captureIssuanceAuthorFixture(read, stat as typeof lstatSync),
  ).toThrow('Exact held');
});
it('does not accept caller-supplied rebinding hashes or a fake approval', () => {
  expect(Object.isFrozen(issuanceAuthorHashes)).toBe(true);
  const fake = {
    ...issuanceAuthorHashes,
    after: hash(authored + '\n'),
    approval: 'APPROVED',
  };
  expect(fake.after).not.toBe(issuanceAuthorHashes.after);
  expect(() => qualifyIssuanceAuthorFixture(authored + '\n', patch)).toThrow(
    'Exact held',
  );
});
it('keeps the unchanged caller checker accepting the explicitly original baseline fixture', () => {
  const readCurrent = (p: string) =>
    p === sourcePath ? Buffer.from(source) : readFileSync(p);
  expect(
    admitInvoiceCallerSource(
      'server/invoices/commercial-draft-client.ts',
      readFileSync('server/invoices/commercial-draft-client.ts'),
      originalClientHash,
      { readCurrent },
    ),
  ).toBe(true);
});
it('keeps the actual canonical source admission denied for the held author endpoint', () => {
  const readCurrent = (p: string) =>
    p === sourcePath ? Buffer.from(authored) : readFileSync(p);
  expect(() =>
    admitInvoiceCallerSource(
      'server/invoices/commercial-draft-client.ts',
      readFileSync('server/invoices/commercial-draft-client.ts'),
      originalClientHash,
      { readCurrent },
    ),
  ).toThrow('Exact finite invoice caller source');
});
it('rejects simultaneous authored SQL and manifest rebinding through the original checker', () => {
  const readCurrent = (p: string) =>
    p === sourcePath
      ? Buffer.from(authored)
      : p === 'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json'
        ? Buffer.from(
            JSON.stringify({
              approval: 'APPROVED',
              currentSha256: issuanceAuthorHashes.after,
            }),
          )
        : readFileSync(p);
  expect(() =>
    admitInvoiceCallerSource(
      'server/invoices/commercial-draft-client.ts',
      readFileSync('server/invoices/commercial-draft-client.ts'),
      originalClientHash,
      { readCurrent },
    ),
  ).toThrow('Exact finite invoice caller source');
});
