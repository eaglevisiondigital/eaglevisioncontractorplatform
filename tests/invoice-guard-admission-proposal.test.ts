import { beforeAll, expect, it } from 'vitest';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

type Read = (path: string | URL, encoding?: BufferEncoding) => Buffer | string;
const realRead: Read = (path, encoding) =>
  encoding ? readFileSync(path, encoding) : readFileSync(path);
interface Ports {
  readCurrent?: Read;
  stat?: typeof lstatSync;
  metadata?: (command: string, ...args: string[]) => Buffer;
  readOriginal?: (commit: string, path: string) => Buffer;
}
interface Qualification {
  classification: string;
  parent: string;
  canonicalPhase: string;
  admissionAuthorized: boolean;
  sqlInstallation: string;
  readCurrent: Read;
  check(): { sourceAuthor: string };
  helper: {
    verifyInvoiceGuardFrame(ports?: Ports): { sourceAuthor: string };
    admitInvoiceCallerSource(
      path: string,
      current: Buffer,
      expected: string,
      ports?: Ports,
    ): boolean;
    createGuardHistoricalRead(
      read?: Read,
      options?: { includeSql?: boolean },
    ): Read;
  };
}
const { qualifyInvoiceGuardProposal } = (await import(
  pathToFileURL(resolve('proposals/invoice-guard-admission/qualify.mjs')).href
)) as {
  qualifyInvoiceGuardProposal(options?: {
    read?: Read;
    stat?: typeof lstatSync;
  }): Promise<Qualification>;
};
const dir = 'proposals/invoice-guard-admission/';
const sql = 'server/invoices/commercial-drafts.proposed.sql';
const helper = 'scripts/invoice-caller-source-admission.mjs';
const launch = 'tests/launch-invoice-payment-source.test.ts';
const before =
  'da35d098727eff68ae7905c3709d6982cf89560cae538923f5d7e570dab0306e';
const after =
  'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c';
const hash = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');
const key = (path: string | URL) =>
  relative(
    process.cwd(),
    path instanceof URL ? fileURLToPath(path) : resolve(path),
  );
const modified =
  (read: Read, target: string): Read =>
  (path, encoding) => {
    const value = read(path, encoding);
    return key(path) === target
      ? Buffer.concat([Buffer.from(value), Buffer.from('\nunknown edit\n')])
      : value;
  };
const changedStat = (
  target: string,
  change: (info: ReturnType<typeof lstatSync>) => object,
) =>
  ((path: string | URL) => {
    const info = lstatSync(path);
    if (key(path) !== target) return info;
    const overrides = change(info);
    return new Proxy(info, {
      get(object, property) {
        return Object.hasOwn(overrides, property)
          ? Reflect.get(overrides, property)
          : Reflect.get(object, property);
      },
    });
  }) as typeof lstatSync;
let q: Qualification;
beforeAll(async () => {
  q = await qualifyInvoiceGuardProposal();
});

it('qualifies only the sealed offline proposal without authorizing admission or installation', () => {
  expect(q.classification).toBe('UNAPPLIED_OFFLINE_QUALIFICATION_ONLY');
  expect(q.parent).toBe('5f0f17dc9766411b260d5b53fd2db5a925adc80f');
  expect(q.admissionAuthorized).toBe(false);
  expect(q.sqlInstallation).toBe('NOT_RUN');
  expect(q.check().sourceAuthor).toBe(q.parent);
});
it('admits the exact approved guard against the unchanged historical SQL expectation', () => {
  expect(
    q.helper.admitInvoiceCallerSource(
      sql,
      Buffer.from(q.readCurrent(sql)),
      before,
      { readCurrent: q.readCurrent },
    ),
  ).toBe(true);
});
it('rejects replacing the historical SQL expectation with the authored hash', () => {
  expect(() =>
    q.helper.admitInvoiceCallerSource(
      sql,
      Buffer.from(q.readCurrent(sql)),
      after,
      { readCurrent: q.readCurrent },
    ),
  ).toThrow('Exact approved invoice guard frame');
});
it('does not admit an unknown path', () => {
  expect(
    q.helper.admitInvoiceCallerSource(
      'server/invoices/unknown.ts',
      Buffer.alloc(0),
      before,
    ),
  ).toBe(false);
});
it.each([
  [
    'server/invoices/commercial-draft-client.ts',
    '12c1eb303f10f8cb9e6c5f765839419f55e4b6cfd16c6c6ef9f8812ccbb76194',
  ],
  [
    'tests/database/commercial-invoice-drafts.test.ts',
    '94d06410bdd267726f57aa1b1a90c3357af3ed51cadf69f2a39e610a09416b47',
  ],
  [
    'tests/commercial-invoice-client.test.ts',
    'ec0829098cd7fc967fad82d33b5db003dcab67ca9b2f135ae55a2dd74349e34a',
  ],
  [
    'tests/commercial-invoice-client-adversarial.test.ts',
    '25f1e6169365e76558348df63792c131e4f26414d4c8d50b407657ce0f282c12',
  ],
  [
    'tests/commercial-invoice-client-reconciliation.test.ts',
    '8be24bc86172b7997ef4268a4df7375acc8cfcb131a8b7f3442c0f6d11aa7e40',
  ],
])('retains historical admission for %s', (path, expected) => {
  expect(
    q.helper.admitInvoiceCallerSource(path, readFileSync(path), expected, {
      readCurrent: q.readCurrent,
    }),
  ).toBe(true);
});
it('projects only the exact historical SQL fixture while preserving the current source', () => {
  const read = q.helper.createGuardHistoricalRead(q.readCurrent);
  expect(hash(read(sql))).toBe(before);
  expect(hash(q.readCurrent(sql))).toBe(after);
  expect(hash(readFileSync(sql))).toBe(after);
});
it('can preserve actual SQL visibility for the source-author checkpoint controls', () => {
  const read = q.helper.createGuardHistoricalRead(q.readCurrent, {
    includeSql: false,
  });
  expect(hash(read(sql))).toBe(after);
});
it('returns copied historical buffers', () => {
  const read = q.helper.createGuardHistoricalRead(q.readCurrent);
  Buffer.from(read(sql)).fill(0);
  const captured = read(sql) as Buffer;
  captured.fill(0);
  expect(hash(read(sql))).toBe(before);
});
it('rejects current SQL withdrawal after capturing a historical reader', () => {
  let withdrawn = false;
  const read: Read = (path, encoding) =>
    withdrawn && key(path) === sql
      ? Buffer.from('withdrawn')
      : q.readCurrent(path, encoding);
  const historical = q.helper.createGuardHistoricalRead(read);
  expect(hash(historical(sql))).toBe(before);
  withdrawn = true;
  expect(() => historical(sql)).toThrow('Exact approved invoice guard frame');
});
it('rejects coordinated unknown helper bytes and a matching rewritten launch pin', () => {
  const original = Buffer.from(q.readCurrent(helper));
  const altered = Buffer.concat([
    original,
    Buffer.from('\n// unknown helper\n'),
  ]);
  const rewritten = Buffer.from(
    q.readCurrent(launch).toString().replace(hash(original), hash(altered)),
  );
  const read: Read = (path, encoding) =>
    key(path) === helper
      ? altered
      : key(path) === launch
        ? rewritten
        : q.readCurrent(path, encoding);
  expect(() => q.helper.verifyInvoiceGuardFrame({ readCurrent: read })).toThrow(
    'Exact approved invoice guard frame',
  );
});
it.each([
  sql,
  'server/payments/response-json.ts',
  'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json',
  'scripts/check-cycle17-integrity.mjs',
  'scripts/check-cycle22.mjs',
  'scripts/check-cycle24.mjs',
])('rejects current source tampering at %s', (path) => {
  expect(() =>
    q.helper.verifyInvoiceGuardFrame({
      readCurrent: modified(q.readCurrent, path),
    }),
  ).toThrow('Exact approved invoice guard frame');
});
it('rejects a mixed original launch source beside the proposed helper', () => {
  const read: Read = (path, encoding) =>
    key(path) === launch
      ? q.helper.createGuardHistoricalRead(q.readCurrent)(path, encoding)
      : q.readCurrent(path, encoding);
  expect(() => q.helper.verifyInvoiceGuardFrame({ readCurrent: read })).toThrow(
    'Exact approved invoice guard frame',
  );
});
it('rejects a changed source mode', () => {
  expect(() =>
    q.helper.verifyInvoiceGuardFrame({
      readCurrent: q.readCurrent,
      stat: changedStat(sql, () => ({ mode: 0o100755 })),
    }),
  ).toThrow('Exact approved invoice guard frame');
});
it('rejects a symlink ancestor', () => {
  expect(() =>
    q.helper.verifyInvoiceGuardFrame({
      readCurrent: q.readCurrent,
      stat: changedStat('server', () => ({ isSymbolicLink: () => true })),
    }),
  ).toThrow('Exact approved invoice guard frame');
});
it('rejects a substituted historical guard parent', () => {
  expect(() =>
    q.helper.verifyInvoiceGuardFrame({
      readCurrent: q.readCurrent,
      metadata: () => Buffer.from('unknown parent'),
    }),
  ).toThrow('Exact approved invoice guard frame');
});
it('rejects wrong historical SQL bytes', () => {
  expect(() =>
    q.helper.verifyInvoiceGuardFrame({
      readCurrent: q.readCurrent,
      readOriginal: () => Buffer.from('unknown historical SQL'),
    }),
  ).toThrow('Exact approved invoice guard frame');
});
it('rechecks current source after the metadata boundary', () => {
  let withdrawn = false;
  const read: Read = (path, encoding) =>
    withdrawn && key(path) === sql
      ? Buffer.from('withdrawn')
      : q.readCurrent(path, encoding);
  const metadata = (command: string) => {
    withdrawn = true;
    if (command === 'show')
      return Buffer.from('f9335e5834fb06789585c4e59edd640447441bb7');
    if (command === 'diff-tree') return Buffer.from('M\t' + sql);
    return Buffer.from('100644 blob ' + 'a'.repeat(40) + '\t' + sql);
  };
  expect(() =>
    q.helper.verifyInvoiceGuardFrame({ readCurrent: read, metadata }),
  ).toThrow('Exact approved invoice guard frame');
});
it.each([
  dir + 'evidence.json',
  dir + 'admission.patch',
  dir + 'fixture-adapter.mjs',
  dir + 'payload/' + helper,
])('rejects packet rebinding before helper import at %s', async (path) => {
  await expect(
    qualifyInvoiceGuardProposal({ read: modified(realRead, path) }),
  ).rejects.toThrow();
});
it('rejects an unknown tracked executable companion before helper import', async () => {
  await expect(
    qualifyInvoiceGuardProposal({
      read: modified(realRead, 'src/main.tsx'),
    }),
  ).rejects.toThrow('Exact sealed invoice guard proposal');
});
it('rejects a mixed physical before/after protected frame', async () => {
  const evidence = JSON.parse(readFileSync(dir + 'evidence.json', 'utf8'));
  const row = evidence.files.find(
    (row: { path: string }) => row.path === helper,
  );
  const current = readFileSync(helper);
  const alternate =
    hash(current) === row.before
      ? readFileSync(dir + 'payload/' + helper)
      : Buffer.from(q.helper.createGuardHistoricalRead(q.readCurrent)(helper));
  const target = helper;
  const read: Read = (path, encoding) =>
    key(path) === target ? alternate : realRead(path, encoding);
  await expect(qualifyInvoiceGuardProposal({ read })).rejects.toThrow(
    'Exact sealed invoice guard proposal',
  );
});
it('rechecks the current frame after its import await', async () => {
  let reads = 0;
  const read: Read = (path, encoding) =>
    key(path) === sql && ++reads > 1
      ? Buffer.from('withdrawn during import')
      : realRead(path, encoding);
  await expect(qualifyInvoiceGuardProposal({ read })).rejects.toThrow(
    'Exact sealed invoice guard proposal',
  );
});
it('keeps all current tracked reads fresh after qualification', async () => {
  let withdrawn = false;
  const read: Read = (path, encoding) =>
    withdrawn && key(path) === 'README.md'
      ? Buffer.from('unknown replacement')
      : realRead(path, encoding);
  const captured = await qualifyInvoiceGuardProposal({ read });
  withdrawn = true;
  expect(() => captured.check()).toThrow('Exact sealed invoice guard proposal');
});

it('rejects a complete exact protected-phase change across its import await', async () => {
  const evidence = JSON.parse(readFileSync(dir + 'evidence.json', 'utf8'));
  const historical = q.helper.createGuardHistoricalRead(q.readCurrent);
  const alternate = new Map<string, Buffer>(
    evidence.files.map((row: { path: string }) => [
      row.path,
      q.canonicalPhase === 'before'
        ? readFileSync(dir + 'payload/' + row.path)
        : Buffer.from(historical(row.path)),
    ]),
  );
  let evidenceReads = 0;
  const read: Read = (path, encoding) => {
    if (key(path) === dir + 'evidence.json') evidenceReads++;
    const changed = evidenceReads > 1 ? alternate.get(key(path)) : undefined;
    return changed
      ? encoding
        ? changed.toString(encoding)
        : Buffer.from(changed)
      : realRead(path, encoding);
  };
  await expect(qualifyInvoiceGuardProposal({ read })).rejects.toThrow(
    'Exact sealed invoice guard proposal',
  );
});
it('rejects final full-frame withdrawal triggered by a helper source read', async () => {
  let patchReads = 0;
  let withdrawn = false;
  const read: Read = (path, encoding) => {
    if (
      key(path) ===
        'proposals/commercial-invoice-issuance/draft-projection-guard.patch' &&
      ++patchReads === 4
    )
      withdrawn = true;
    const current = realRead(path, encoding);
    return withdrawn && key(path) === 'README.md'
      ? Buffer.concat([
          Buffer.from(current),
          Buffer.from('\nUNREVIEWED WITHDRAWAL PROBE\n'),
        ])
      : current;
  };
  await expect(qualifyInvoiceGuardProposal({ read })).rejects.toThrow(
    'Exact sealed invoice guard proposal',
  );
  expect(withdrawn).toBe(true);
});

it('authenticates adapter bytes in the actual proposed header before evaluating an altered adapter', async () => {
  const path = 'proposals/invoice-caller-reconciliation/qualify.mjs';
  const proposed = q.readCurrent(path).toString();
  const start = proposed.indexOf(
    '// Seal the ordinary historical-fixture adapter before evaluating any bytes.',
  );
  const end = proposed.indexOf(
    "const directory = 'proposals/invoice-caller-reconciliation';",
    start,
  );
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const marker = 'invoice-guard-unreviewed-adapter-marker';
  Reflect.deleteProperty(globalThis, marker);
  const altered = `globalThis[${JSON.stringify(marker)}]=true;export const createHistoricalRead=()=>()=>Buffer.alloc(0);`;
  // Execute the exact sealed header with only its filesystem read port substituted.
  const prelude = `const nodeReadFileSync=()=>Buffer.from(${JSON.stringify(altered)});\n`;
  const executable = Buffer.from(prelude + proposed.slice(start, end));
  try {
    await expect(
      import('data:text/javascript;base64,' + executable.toString('base64')),
    ).rejects.toThrow('Reviewed guard fixture required');
    expect(Reflect.get(globalThis, marker)).toBeUndefined();
  } finally {
    Reflect.deleteProperty(globalThis, marker);
  }
});
it('rejects altered adapter bytes in the current helper frame', () => {
  expect(() =>
    q.helper.verifyInvoiceGuardFrame({
      readCurrent: modified(q.readCurrent, dir + 'fixture-adapter.mjs'),
    }),
  ).toThrow('Exact approved invoice guard frame');
});
it('rejects coordinated unknown helper and rewritten adapter pins', () => {
  const current = Buffer.from(q.readCurrent(helper));
  const altered = Buffer.concat([
    current,
    Buffer.from('\n// unreviewed replacement\n'),
  ]);
  const adapter = Buffer.from(
    q
      .readCurrent(dir + 'fixture-adapter.mjs')
      .toString()
      .replace(hash(current), hash(altered)),
  );
  const read: Read = (path, encoding) =>
    key(path) === helper
      ? altered
      : key(path) === dir + 'fixture-adapter.mjs'
        ? adapter
        : q.readCurrent(path, encoding);
  expect(() => q.helper.verifyInvoiceGuardFrame({ readCurrent: read })).toThrow(
    'Exact approved invoice guard frame',
  );
});
