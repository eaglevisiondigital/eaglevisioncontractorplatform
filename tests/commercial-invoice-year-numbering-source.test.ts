import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
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
