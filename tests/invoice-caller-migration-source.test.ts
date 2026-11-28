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
// Preserve the original402 transition assertions against their exact source stage.
const transitionStage = (path: string) =>
  git('show', `461a9017b526dae9bc3a88577fd5ad5b1c71963e:${path}`);
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
  const currentGuard = transitionStage(guardPath).toString('utf8');
  expect(normalize(currentGuard)).toBe(normalize(originalGuard.toString()));
  const currentMigrationHash = sha(transitionStage(migrationPath));
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
  const currentHelper = transitionStage(admissionHelperPath);
  expect(currentHelper).toEqual(Buffer.from(expectedHelper));
  expect(sha(currentHelper)).toBe(digest(currentGuard));
}
function verifyPaymentResponseTransition() {
  expect(
    sha(readFileSync('scripts/payment-response-source-admission.mjs')),
  ).toBe('aa8871b0fa334bfd2ffdb36c314650e51e56ceea41a983e13c0b42a60084dfcd');
  expect(sha(readFileSync('scripts/check-payment-ack-admission.mjs'))).toBe(
    'b936bbd53def10eb7604b840ebe56262073001f30f0191247307eb54940a67ad',
  );
  const guard = readFileSync(guardPath, 'utf8');
  const digests = [
    ...guard.matchAll(
      /createHash\('sha256'\)\.update\(callerHelperBytes\)\.digest\('hex'\) !==\s*'([a-f0-9]{64})'/g,
    ),
  ];
  expect(digests).toHaveLength(1);
  expect(guard.split(digests[0][1])).toHaveLength(2);
  expect(guard.replace(digests[0][1], '<INVOICE_HELPER>')).toBe(
    transitionStage(guardPath)
      .toString()
      .replace(
        'const { admitInvoiceCallerSource }',
        'const { admitInvoiceCallerSource: admitInvoiceCallerOnly }',
      )
      .replace(
        'const composition =',
        "// Exact source helper is validated before its captured bytes are imported.\nconst responseHelperPath = new URL(\n  '../scripts/payment-response-source-admission.mjs',\n  import.meta.url,\n);\nif (\n  !lstatSync(responseHelperPath).isFile() ||\n  lstatSync(responseHelperPath).isSymbolicLink()\n)\n  throw Error('Reviewed payment response helper required');\nconst responseHelperBytes = readFileSync(responseHelperPath);\nif (\n  createHash('sha256').update(responseHelperBytes).digest('hex') !==\n  'aa8871b0fa334bfd2ffdb36c314650e51e56ceea41a983e13c0b42a60084dfcd'\n)\n  throw Error('Reviewed payment response helper required');\nconst { admitPaymentResponseSource } = await import(\n  'data:text/javascript;base64,' + responseHelperBytes.toString('base64')\n);\n\nconst admitInvoiceCallerSource = (\n  ...args: Parameters<typeof admitInvoiceCallerOnly>\n) => admitPaymentResponseSource(...args) || admitInvoiceCallerOnly(...args);\n\n" +
          'const composition =',
      )
      .replace(
        '2a6ffb692443a7830df021e9a8cce048ac4388947e03a27af4286b4e26ee9a25',
        '<INVOICE_HELPER>',
      ),
  );
  const before = transitionStage(admissionHelperPath).toString();
  const originalF = sha(transitionStage(migrationPath));
  expect(originalF).toBe(
    '4879c0b0f3da8bc2e5d981faae43fe443c317ffcd400b654fc550f0605149a08',
  );
  expect(before.split(`sha256: '${originalF}'`)).toHaveLength(2);
  const exact = before.replace(
    `sha256: '${originalF}'`,
    `sha256: '${sha(readFileSync(migrationPath))}'`,
  );
  expect(readFileSync(admissionHelperPath)).toEqual(Buffer.from(exact));
  expect(sha(Buffer.from(exact))).toBe(digests[0][1]);
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
  verifyPaymentResponseTransition();
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
