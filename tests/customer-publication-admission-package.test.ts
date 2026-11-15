import { mkdtempSync, readFileSync, lstatSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
const patchPath =
  'proposals/customer-publication-admission/source-author.patch';
const expected =
  'f9d63696a6c6731bea3c6384dfc66780650e89ca066e61f222f5139df44cc9ae';
const adds = [
  [
    'server/invoices/commercial-payment-receipt.proposed.sql',
    'proposals/invoice-payment-receipt/receipt.proposed.sql',
    '1c1ec82ca52560de86ec19ff9a865babfc3967ff466b425692e733fd240fdef5',
  ],
  [
    'server/invoices/customer-payment-publication.proposed.sql',
    'proposals/customer-payment-publication/publication.proposed.sql',
    'bff7f5f16fa620b4f7e684228d1ff41af696492027a782ea4698fe49d1fbb71d',
  ],
] as const;
// Exact finite source-author artifact only. Never an installer or permission grant.
function reviewedPatch(bytes = readFileSync(patchPath)) {
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    throw Error('Exact two-file source-author patch required');
  return bytes;
}
it('the unapplied A2 author diff adds only exact reviewed SQL bytes/modes and no migrated/runtime behavior', () => {
  const patch = reviewedPatch();
  const dir = mkdtempSync('/private/tmp/pub-source-author-');
  try {
    const env = {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
    };
    const options = { cwd: dir, env, input: patch };
    const num = execFileSync(
      'git',
      ['-c', 'core.fsmonitor=false', 'apply', '--numstat', '-'],
      options,
    ).toString();
    expect(
      num
        .trim()
        .split('\n')
        .map((x) => x.split('\t').slice(1)),
    ).toEqual(adds.map(([path]) => ['0', path]));
    execFileSync(
      'git',
      ['-c', 'core.fsmonitor=false', 'apply', '--check', '-'],
      options,
    );
    execFileSync('git', ['-c', 'core.fsmonitor=false', 'apply', '-'], options);
    for (const [path, source, hash] of adds) {
      const bytes = readFileSync(dir + '/' + path);
      expect(bytes).toEqual(readFileSync(source));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
      expect(lstatSync(dir + '/' + path).mode & 0o777).toBe(0o644);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it.each(['path', 'mode', 'payload', 'extra'] as const)(
  'unknown %s substitution cannot be applied by the reviewed artifact',
  (kind) => {
    const patch = readFileSync(patchPath, 'utf8');
    const changed =
      kind === 'path'
        ? patch.replace(
            'commercial-payment-receipt.proposed.sql',
            'unexpected.sql',
          )
        : kind === 'mode'
          ? patch.replace('100644', '100755')
          : kind === 'payload'
            ? patch.replace('UNAPPLIED', 'UNREVIEWED')
            : patch + '\nUNAPPROVED';
    expect(() => reviewedPatch(Buffer.from(changed))).toThrow();
  },
);
it('runtime permission template supplies only direct private usage and exact receipt EXECUTE; never identities, table grants or role assumptions', () => {
  const sql = readFileSync(
    'proposals/customer-publication-admission/reader-grants.sql.in',
    'utf8',
  )
    .split('\n')
    .filter((l) => !l.startsWith('--') && l.trim())
    .join('\n');
  expect(sql).toBe(
    'grant usage on schema private to __REVIEWED_READER_LOGIN__;\ngrant execute on function private.customer_payment_receipt(uuid,uuid,uuid,uuid,uuid) to __REVIEWED_READER_LOGIN__;',
  );
  expect(sql).not.toMatch(
    /create role|alter role|set role|grant.*table|capability|service_role|authenticated/i,
  );
});
it('the SQL author endpoints are still absent in this candidate, not silently promoted or installed', () => {
  for (const [path] of adds) expect(() => readFileSync(path)).toThrow();
  expect(readFileSync(adds[1][1], 'utf8')).toContain('as $$select false$$');
});
