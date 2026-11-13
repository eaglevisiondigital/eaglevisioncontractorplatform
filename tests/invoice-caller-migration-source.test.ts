import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { expect, it } from 'vitest';
const helper = await import(
  new URL(
    '../proposals/invoice-caller-fixture-migration/source-author-baseline.mjs',
    import.meta.url,
  ).href
);
const client = 'server/invoices/commercial-draft-client.ts';
const caller = 'server/invoices/commercial-caller-connection.ts';
const git = (...args: string[]) =>
  execFileSync('git', ['--no-replace-objects', ...args]);
const guardPath = 'tests/launch-invoice-payment-source.test.ts';
const admissionHelperPath = 'scripts/invoice-caller-source-admission.mjs';
const migrationPath = 'tests/invoice-caller-migration-source.test.ts';
const checkerAuthor = '82c3ffd11499f9addbb92d6d5d7d1deb7e34d64c';
const oldMigrationHash =
  'b1131c5c7d80dc2fb3d28a3e7d20540c60d420f3d8ba76a7b61eb091fee24678';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
// Historical assertion remains about its original source. Current checker and
// helper are verified independently below; this read port never grants admission.
const retainedOriginal = (path: string) =>
  path === guardPath
    ? git('show', `8f498f2c657608c64d40a3527be13b47a189b7b7:${path}`)
    : readFileSync(path);
function verifyCheckerTransition() {
  const originalGuard = git('show', `${checkerAuthor}:${guardPath}`);
  const originalHelper = git('show', `${checkerAuthor}:${admissionHelperPath}`);
  expect(sha(originalGuard)).toBe(
    '52f0e7e62b74c0fff9b295cd855eac4419340097eee37237330a9fcf17ddb3b8',
  );
  expect(sha(originalHelper)).toBe(
    'e83139e1af82743bf9993fac2fb55c4d50e359e9681fd16d1a12001a41432dbf',
  );
  const digest = (text: string) => {
    const matches = [
      ...text.matchAll(
        /createHash\('sha256'\)\.update\(callerHelperBytes\)\.digest\('hex'\) !==\s*'([a-f0-9]{64})'/g,
      ),
    ];
    expect(matches).toHaveLength(1);
    expect(text.split(matches[0][1])).toHaveLength(2);
    return matches[0][1];
  };
  const normalize = (text: string) =>
    text.replace(digest(text), '<EXACT_HELPER_DIGEST>');
  const currentGuard = readFileSync(guardPath, 'utf8');
  expect(normalize(currentGuard)).toBe(normalize(originalGuard.toString()));
  const currentMigrationHash = sha(readFileSync(migrationPath));
  const expectedHelper = originalHelper
    .toString()
    .replace(
      `    sha256: '${oldMigrationHash}',`,
      `    sha256: '${currentMigrationHash}',\n    publishedSha256:\n      '${oldMigrationHash}',`,
    )
    .replace(
      '    if (\n      hash(published)',
      "    const exactPublishedHash =\n      companion.path === 'tests/invoice-caller-migration-source.test.ts'\n        ? companion.publishedSha256\n        : companion.sha256;\n    if (\n      hash(published)",
    )
    .replace(
      'hash(published) !== companion.sha256',
      'hash(published) !== exactPublishedHash',
    );
  const currentHelper = readFileSync(admissionHelperPath);
  expect(currentHelper).toEqual(Buffer.from(expectedHelper));
  expect(sha(currentHelper)).toBe(digest(currentGuard));
}
it('loads historical proposal bytes only beside the exact approved source author, without granting launch admission', () => {
  const r = helper.proposalBaseline();
  expect(r.activeSourceAuthor).toBe('8f498f2c657608c64d40a3527be13b47a189b7b7');
  expect(r.current).toEqual(readFileSync(client));
  expect(r.original).toEqual(
    git('show', `0e49670e6cc05473d3fd4e033b2c0f42b5fc10e0:${client}`),
  );
  for (const path of [
    'proposals/invoice-caller-reconciliation/evidence.json',
    'proposals/invoice-caller-reconciliation/correction.patch',
    'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json',
    'docs/COMMERCIAL_INVOICE_DRAFT_CANDIDATE.json',
    'tests/launch-invoice-payment-source.test.ts',
    'server/invoices/commercial-drafts.proposed.sql',
    'server/customer/broker-auth.ts',
  ])
    expect(retainedOriginal(path)).toEqual(
      git('show', `8f498f2c657608c64d40a3527be13b47a189b7b7:${path}`),
    );
  verifyCheckerTransition();
});
it.each([
  'client',
  'caller',
  'parent',
  'extra-author-path',
  'mode',
  'authored-bytes',
  'symlink',
])('rejects unknown %s test-baseline evidence', (mode) => {
  const read = (path: string) =>
    mode === path.split('/').at(-1)?.split('.')[0]
      ? Buffer.from('unknown')
      : (mode === 'client' && path === client) ||
          (mode === 'caller' && path === caller)
        ? Buffer.from('unknown')
        : readFileSync(path);
  const proof = (...args: string[]) => {
    if (mode === 'parent' && args.includes('--format=%P'))
      return Buffer.from('0'.repeat(40));
    if (mode === 'extra-author-path' && args[0] === 'diff-tree')
      return Buffer.from(`A\t${caller}\nM\t${client}\nM\tother.ts`);
    if (mode === 'mode' && args[0] === 'ls-tree')
      return Buffer.from(`120000 blob ${'0'.repeat(40)}\t${client}`);
    if (
      mode === 'authored-bytes' &&
      args[0] === 'show' &&
      args.some((a) => a.startsWith('8f498f2') && a.includes(':'))
    )
      return Buffer.from('unknown');
    return git(...args);
  };
  const stat = (path: string) =>
    mode === 'symlink' && path === caller
      ? { isFile: () => true, isSymbolicLink: () => true }
      : lstatSync(path);
  expect(() => helper.proposalBaseline({ read, git: proof, stat })).toThrow();
});
it('retains original unmodified proposal mode and rejects mixed original/new-port state', () => {
  const old = git('show', `0e49670e6cc05473d3fd4e033b2c0f42b5fc10e0:${client}`);
  const read = (path: string) => (path === client ? old : readFileSync(path));
  expect(
    helper.proposalBaseline({
      read,
      stat: () => {
        throw Object.assign(Error('absent'), { code: 'ENOENT' });
      },
    }).activeSourceAuthor,
  ).toBeNull();
  expect(() => helper.proposalBaseline({ read })).toThrow(
    'Old proposal requires absent caller',
  );
});
function tokens(text: string) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    text,
  );
  const out: string[] = [];
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken)
    out.push(scanner.getTokenText());
  return out.join('|');
}
function contract(text: string) {
  const file = ts.createSourceFile(
      'fixture.ts',
      text,
      ts.ScriptTarget.Latest,
      true,
    ),
    assertions: string[] = [],
    names: string[] = [],
    skip: string[] = [];
  const rootExpect = (node: ts.Node): boolean =>
    ts.isIdentifier(node)
      ? node.text === 'expect'
      : ts.isPropertyAccessExpression(node)
        ? rootExpect(node.expression)
        : ts.isCallExpression(node)
          ? rootExpect(node.expression)
          : false;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      if (
        rootExpect(node.expression) &&
        !(
          ts.isPropertyAccessExpression(node.parent) &&
          node.parent.expression === node
        ) &&
        !(ts.isCallExpression(node.parent) && node.parent.expression === node)
      )
        assertions.push(tokens(node.getText(file)));
      const expr = node.expression.getText(file);
      if (
        (expr === 'it' ||
          expr === 'test' ||
          expr.includes('it.each') ||
          expr.includes('it.skipIf')) &&
        node.arguments.length &&
        ts.isStringLiteralLike(node.arguments[0])
      )
        names.push(tokens(node.arguments[0].getText(file)));
      if (/^(it|test)\.(skip|only|skipIf|runIf)/.test(expr))
        skip.push(tokens(expr));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { assertions, names, skip };
}
it.each([
  'tests/commercial-invoice-client.test.ts',
  'tests/commercial-invoice-client-adversarial.test.ts',
  'tests/commercial-invoice-client-reconciliation.test.ts',
  'tests/database/commercial-invoice-drafts.test.ts',
])(
  'preserves every original assertion, case identity and skip boundary in %s',
  (path) => {
    const old = contract(
      git(
        'show',
        `8f498f2c657608c64d40a3527be13b47a189b7b7:${path}`,
      ).toString(),
    );
    const current = contract(readFileSync(path, 'utf8'));
    expect(current.names).toEqual(old.names);
    expect(current.skip).toEqual(old.skip);
    const additions = current.assertions.filter(
      (v) => !old.assertions.includes(v),
    );
    expect(additions).toEqual(
      path.endsWith('/commercial-invoice-client.test.ts')
        ? [
            tokens("expect(complete).toBeTypeOf('function')"),
            tokens("expect(complete).toBeTypeOf('function')"),
          ]
        : [],
    );
    expect(current.assertions.filter((v) => !additions.includes(v))).toEqual(
      old.assertions,
    );
  },
);
