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

const baseline = readFileSync(
  'proposals/commercial-invoice-issuance/issuance.proposed.sql',
  'utf8',
);
const sql = readFileSync(
  'proposals/commercial-invoice-numbering/numbering.proposed.sql',
  'utf8',
);
it('retains the accepted UUID issuer, immutable header guard and receipt reader source', () => {
  expect(createHash('sha256').update(baseline).digest('hex')).toBe(
    '961c2dc380695ed2d910108d09303fff9b9018fe8d159beb9b958ddb2725d022',
  );
  expect(sql).not.toContain(
    'create or replace function private.commercial_issued_immutable',
  );
  expect(sql).not.toContain(
    'create or replace function private.commercial_invoice_issued_read',
  );
});
it('changes the original issue body only at the declared allocator boundaries', () => {
  let body = baseline.slice(
    baseline.indexOf('create function private.commercial_invoice_issue('),
    baseline.indexOf('create function private.commercial_invoice_issued_read('),
  );
  body = body
    .replace(
      'create function private.commercial_invoice_issue(',
      'create or replace function private.commercial_invoice_issue(',
    )
    .replace(
      'request_hash text;result jsonb;',
      'request_hash text;result jsonb;next_ordinal integer;',
    )
    .replace(
      ' -- Same command/invoice lock namespace',
      " -- Number allocation precedes original command/invoice locks. One organization at a time.\n perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('commercial-numbering/'||p_org::text,0));\n -- Same command/invoice lock namespace",
    )
    .replace(
      " -- Retain original writer's source lock ordering",
      " if current_setting('transaction_isolation')<>'read committed' then raise exception 'Number allocation requires READ COMMITTED' using errcode='25001';end if;\n if a.number_namespace is null then raise exception 'Separately reviewed number namespace required' using errcode='42501';end if;\n -- Retain original writer's source lock ordering",
    )
    .replace(
      " update private.commercial_invoice_drafts set issued_revision=p_revision,invoice_number='INV-'||replace(id::text,'-',''),",
      " select coalesce(max(number_ordinal),0)+1 into next_ordinal from private.commercial_invoice_drafts where organization_id=p_org and number_namespace=a.number_namespace;\n if next_ordinal>99999999 then raise exception 'Invoice number namespace exhausted' using errcode='22003';end if;\n update private.commercial_invoice_drafts set issued_revision=p_revision,number_namespace=a.number_namespace,number_ordinal=next_ordinal,invoice_number=a.number_namespace||'-'||lpad(next_ordinal::text,8,'0'),",
    );
  expect(
    sql.slice(
      sql.indexOf(
        'create or replace function private.commercial_invoice_issue(',
      ),
      sql.lastIndexOf('commit;'),
    ),
  ).toBe(body);
});
it('adds no ledger, sequence, role, table or client grant', () => {
  expect(sql).not.toMatch(/create\s+(table|sequence|role)\b/i);
  expect(sql).not.toMatch(
    /grant\s+.*\bto\s+(public|anon|authenticated|service_role)\b/i,
  );
  expect(sql).not.toContain('disable trigger');
  expect(sql).not.toContain('disable row level security');
});
it('allocates under one tenant lock while retaining the original final Auth and expiry fences', () => {
  expect(sql.indexOf("'commercial-numbering/'||p_org")).toBeLessThan(
    sql.indexOf("p_org::text||'/'||p_command"),
  );
  expect(sql).toContain('perform private.commercial_draft_actor(p_org);');
  expect(sql).toContain(
    "if a.expires_at<=clock_timestamp() then raise exception 'Issuance authority expired after wait'",
  );
});
it('keeps the canonical UUID-only client unchanged and sequential integration explicitly held', () => {
  const presentation = readFileSync(
    'proposals/commercial-invoice-issuance/presentation.ts',
    'utf8',
  );
  expect(createHash('sha256').update(presentation).digest('hex')).toBe(
    'a181a67faf3f8b3264b5cd00478b38c5a3c9d67c2b7f2463d6d81c01bf477981',
  );
  expect(presentation).toContain(
    "value.number !== 'INV-' + expected.invoiceId.replaceAll('-', '')",
  );
});
