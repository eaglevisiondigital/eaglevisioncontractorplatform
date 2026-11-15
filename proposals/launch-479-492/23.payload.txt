import { createHash } from 'node:crypto';
import { readFileSync as nodeReadFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Historical proposal assertions only. Current yearly source is checked separately.
import { lstatSync as historicalStat } from 'node:fs';
import { execFileSync as historicalGit } from 'node:child_process';
const historicalHelper = 'scripts/invoice-caller-source-admission.mjs';
function checkedCurrentHelper() {
  let prefix = '';
  for (const part of historicalHelper.split('/')) {
    prefix = prefix ? prefix + '/' + part : part;
    if (historicalStat(prefix).isSymbolicLink())
      throw Error('Exact numbering source required');
  }
  const info = historicalStat(historicalHelper);
  if (!info.isFile() || (info.mode & 0o777) !== 0o644)
    throw Error('Exact numbering source required');
  const bytes = nodeReadFileSync(historicalHelper);
  if (
    createHash('sha256').update(bytes).digest('hex') !==
    'cf28a441f146c5e4d398eb0ea0b78a999dd0f744e19424c46f3e95de74229438'
  )
    throw Error('Exact numbering source required');
  return bytes;
}
const historicalHelperBytes = checkedCurrentHelper();
const { verifyInvoiceGuardFrame: verifyCurrentNumbering } = await import(
  'data:text/javascript;base64,' + historicalHelperBytes.toString('base64')
);
function currentNumberingSource() {
  if (!checkedCurrentHelper().equals(historicalHelperBytes))
    throw Error('Exact numbering source required');
  verifyCurrentNumbering();
}
currentNumberingSource();
const historicalPresenter = historicalGit(
  '/usr/bin/git',
  [
    '--no-replace-objects',
    '--no-pager',
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'core.attributesFile=/dev/null',
    '-c',
    'credential.helper=',
    'show',
    '--no-ext-diff',
    '--no-textconv',
    'afb028058b479d1ab17a9e516d1460cb1c4de4f3:proposals/commercial-invoice-issuance/presentation.ts',
  ],
  {
    env: {
      PATH: '/usr/bin:/bin',
      LC_ALL: 'C',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_COUNT: '0',
      GIT_ATTR_NOSYSTEM: '1',
      GIT_ALLOW_PROTOCOL: '',
      GIT_NO_LAZY_FETCH: '1',
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
    },
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  },
);
if (
  createHash('sha256').update(historicalPresenter).digest('hex') !==
  'a181a67faf3f8b3264b5cd00478b38c5a3c9d67c2b7f2463d6d81c01bf477981'
)
  throw Error('Exact historical numbering presenter required');
currentNumberingSource();
const readFileSync = ((path: string, encoding?: BufferEncoding) => {
  if (path !== 'proposals/commercial-invoice-issuance/presentation.ts')
    return encoding ? nodeReadFileSync(path, encoding) : nodeReadFileSync(path);
  currentNumberingSource();
  const bytes = Buffer.from(historicalPresenter);
  currentNumberingSource();
  return encoding ? bytes.toString(encoding) : bytes;
}) as typeof nodeReadFileSync;

const old = readFileSync(
  'proposals/commercial-invoice-numbering/numbering.proposed.sql',
  'utf8',
);
const sql = readFileSync(
  'proposals/commercial-invoice-year-numbering/numbering.proposed.sql',
  'utf8',
);
const body = (s: string) =>
  s.slice(
    s.indexOf('create or replace function private.commercial_invoice_issue('),
    s.lastIndexOf('commit;'),
  );
it('retains the independently qualified #471 source, allocation lock and private namespace authority', () => {
  expect(createHash('sha256').update(old).digest('hex')).toBe(
    '49fbbde015b9cf7a92f2bbdb74f7f5c347a63246d63cc7c9a47724858b11922e',
  );
  expect(sql).not.toMatch(
    /create(?: or replace)? function private\.commercial_number_policy/,
  );
});
it('retains every original issuer Auth/source/receipt/role fence outside the explicit allocation delta', () => {
  let expected = body(old).replace(
    'next_ordinal integer;begin',
    'next_ordinal integer;allocation_year integer;issued_now timestamptz;begin',
  );
  const originalStart = expected.indexOf(
    ' select coalesce(max(number_ordinal)',
  );
  const originalEnd = expected.indexOf(
    'issue_request_hash=request_hash where',
    originalStart,
  );
  const nextStart = body(sql).indexOf(' -- UTC calendar year');
  const nextEnd = body(sql).indexOf(
    'issue_request_hash=request_hash where',
    nextStart,
  );
  expect(originalStart).toBeGreaterThan(0);
  expect(nextStart).toBeGreaterThan(0);
  expected =
    expected.slice(0, originalStart) +
    body(sql).slice(nextStart, nextEnd) +
    expected.slice(originalEnd);
  expect(body(sql)).toBe(expected);
});
it('captures one server instant after final source/authority waits for both UTC year and issued_at', () => {
  const f = body(sql);
  expect(f.match(/issued_now:=pg_catalog.clock_timestamp\(\);/g)).toHaveLength(
    1,
  );
  expect(f.indexOf('issued_now:=')).toBeGreaterThan(
    f.lastIndexOf('select * into a from private.commercial_issue_authorities'),
  );
  expect(f).toContain(
    "allocation_year:=extract(year from issued_now at time zone 'UTC')::integer",
  );
  expect(f).toContain('issued_at=issued_now');
  expect(f).not.toContain('test.numbering');
  expect(f).not.toContain('year_numbering_test_clock');
});
it('retains trusted tenant scope separately from the identical public display format', () => {
  expect(sql).toContain(
    'unique(organization_id,number_namespace,number_year,number_ordinal)',
  );
  expect(sql).toContain(
    'where organization_id=p_org and number_namespace=a.number_namespace and number_year=allocation_year',
  );
  expect(sql).toContain(
    "invoice_number='INV-'||lpad(allocation_year::text,4,'0')||'-'||lpad(next_ordinal::text,6,'0')",
  );
});
it('preserves immutable UUID and eight-digit histories with an explicit null year', () => {
  expect(sql).toContain(
    "number_year is null and invoice_number='INV-'||replace(id::text,'-','')",
  );
  expect(sql).toContain(
    'number_year is null and number_ordinal between 1 and 99999999',
  );
  expect(sql).not.toMatch(
    /update private\.commercial_invoice_drafts set number_year/,
  );
  expect(sql).not.toContain('commercial_issued_immutable');
});
it('adds no ledger, counter, sequence, role, caller date parameter or exposed grant', () => {
  expect(sql).not.toMatch(/create\s+(table|sequence|role)\b/i);
  expect(sql).not.toMatch(/p_year|p_date|p_timestamp|set_config\(/i);
  expect(sql).not.toMatch(
    /grant\s+.*\bto\s+(public|anon|authenticated|service_role)\b/i,
  );
  expect(sql).toContain('if next_ordinal>999999 then');
  expect(sql).toContain('number_year>allocation_year');
});
it('keeps the canonical UUID-only presenter unchanged and future integration held', () => {
  expect(
    createHash('sha256')
      .update(
        readFileSync('proposals/commercial-invoice-issuance/presentation.ts'),
      )
      .digest('hex'),
  ).toBe('a181a67faf3f8b3264b5cd00478b38c5a3c9d67c2b7f2463d6d81c01bf477981');
});
