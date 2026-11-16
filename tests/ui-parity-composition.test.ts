import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  chmodSync,
  symlinkSync,
  renameSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { UIFile } from '../proposals/ui-parity-composition/qualify.mjs';
const root = process.cwd(),
  folder = join(root, 'proposals/ui-parity-composition/'),
  owned: string[] = [];
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
let q: typeof import('../proposals/ui-parity-composition/qualify.mjs'),
  before: Map<string, UIFile>,
  after: Map<string, UIFile>;
const metadata = JSON.parse(readFileSync(folder + 'identity.json', 'utf8'));
const beforeRoot = () => image(before),
  afterRoot = () => image(after);
function image(files: Map<string, UIFile>) {
  const dir = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-ui-composition-'),
  );
  owned.push(dir);
  for (const [p, x] of files) {
    const f = join(dir, p);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, x.data, { mode: x.mode === '100755' ? 0o755 : 0o644 });
  }
  return realpathSync(resolve(dir));
}
function edit(dir: string, p: string) {
  writeFileSync(
    join(dir, p),
    readFileSync(join(dir, p), 'utf8') +
      '\n// controlled source substitution\n',
  );
}
beforeAll(async () => {
  const bytes = readFileSync(folder + 'qualify.mjs');
  expect(sha(bytes)).toBe(
    'c71a4fee2b6d24792ac74f6cb488c25b824e1209320766c0d3bfc446fd07af45',
  );
  q = await import(pathToFileURL(folder + 'qualify.mjs').href);
  const r = await q.qualifyUIComposition(root);
  after = r.afterFixture;
  before = new Map(
    [...after].map(([p, x]) => [
      p,
      { mode: x.mode, data: Buffer.from(x.data) },
    ]),
  );
  for (const [p, e] of Object.entries(metadata.paths) as [
    string,
    { before: null | { mode: string; sha256: string } },
  ][]) {
    if (!e.before) before.delete(p);
    else {
      const data = readFileSync(join(root, p));
      expect(sha(data)).toBe(e.before.sha256);
      before.set(p, { mode: e.before.mode, data });
    }
  }
  r.check();
  await q.qualifyUIComposition(beforeRoot());
  await q.verifyUIAfterimage(afterRoot());
});
afterAll(() => {
  for (const p of owned) rmSync(p, { recursive: true, force: true });
});
it('qualifies only exact510 plus the fifteen disjoint authored endpoints', async () => {
  const r = await q.qualifyUIComposition(root);
  expect(r.changedPaths).toBe(15);
  expect(r.afterTree).toBe('54362e358d135a3a6772119e7e22593db4f0f586');
  expect(r.afterFixture.size).toBe(2480);
  for (const [p, e] of Object.entries(metadata.paths) as [
    string,
    { after: { sha256: string } },
  ][])
    expect(sha(r.afterFixture.get(p)!.data)).toBe(e.after.sha256);
});
it('retains all128 original protected pins and five locked files', () => {
  const m = JSON.parse(
    after.get('docs/program/CYCLE4_PROTECTED_SOURCE.json')!.data.toString(),
  );
  expect(m.count).toBe(128);
  for (const x of m.files) expect(sha(after.get(x.path)!.data)).toBe(x.sha256);
  const d = JSON.parse(
    after.get('docs/program/DESIGN_SYSTEM_CONTRACT.json')!.data.toString(),
  );
  expect(d.locks).toHaveLength(5);
  expect(d.bindings).toHaveLength(13);
  for (const x of d.locks) expect(sha(after.get(x.path)!.data)).toBe(x.sha256);
});
it('combines only exact512 FieldsForm and exact513 dashboard while preserving shared methods', () => {
  for (const p of [
    'src/components/forms.tsx',
    'src/components/CompanyOperations.tsx',
  ])
    expect(sha(after.get(p)!.data)).toBe(metadata.paths[p].after.sha256);
  const a = after.get('src/components/forms.tsx')!.data.toString(),
    b = before.get('src/components/forms.tsx')!.data.toString();
  expect(a.slice(a.indexOf('export function ResourceStatus'))).toBe(
    b.slice(b.indexOf('export function ResourceStatus')),
  );
  const route = (s: string) =>
    s.slice(
      s.indexOf('export function CompanyOperations'),
      s.indexOf('export function NewLeadDashboard'),
    );
  expect(
    route(after.get('src/components/CompanyOperations.tsx')!.data.toString()),
  ).toBe(
    route(before.get('src/components/CompanyOperations.tsx')!.data.toString()),
  );
});
it.each([
  'server/invoices/commercial-drafts.proposed.sql',
  'src/App.tsx',
  'src/components/Customers.tsx',
  'src/components/forms.tsx',
  'src/components/CompanyOperations.tsx',
])('rejects current source substitution before composition: %s', async (p) => {
  const r = beforeRoot();
  edit(r, p);
  await expect(q.qualifyUIComposition(r)).rejects.toThrow();
});
it('rejects an unknown source companion without evaluating it', async () => {
  const r = beforeRoot();
  writeFileSync(
    join(r, 'src/unreviewed-ui.ts'),
    'throw Error("must never execute")',
  );
  await expect(q.qualifyUIComposition(r)).rejects.toThrow();
});
it('rejects group-writable current source even when its Git executable mode is unchanged', async () => {
  const r = beforeRoot();
  chmodSync(join(r, 'src/App.tsx'), 0o664);
  await expect(q.qualifyUIComposition(r)).rejects.toThrow();
});
it('rejects mode and symlink substitutions', async () => {
  const r = beforeRoot(),
    p = join(r, 'src/App.tsx');
  chmodSync(p, 0o755);
  await expect(q.qualifyUIComposition(r)).rejects.toThrow();
  chmodSync(p, 0o644);
  renameSync(p, p + '.saved');
  symlinkSync(p + '.saved', p);
  await expect(q.qualifyUIComposition(r)).rejects.toThrow();
});
it.each(['after-capture', 'after-compose'] as const)(
  'rejects late source withdrawal at %s',
  async (phase) => {
    const r = beforeRoot();
    await expect(
      q.qualifyUIComposition(r, (p) => {
        if (p === phase) edit(r, 'src/App.tsx');
      }),
    ).rejects.toThrow();
  },
);
it('rejects complete or partial promoted source masquerading as the original parent', async () => {
  await expect(q.qualifyUIComposition(afterRoot())).rejects.toThrow();
  const r = beforeRoot();
  writeFileSync(
    join(r, 'src/components/forms.tsx'),
    after.get('src/components/forms.tsx')!.data,
  );
  await expect(q.qualifyUIComposition(r)).rejects.toThrow();
});
it('verifies the exact complete afterimage', async () => {
  expect(await q.verifyUIAfterimage(afterRoot())).toEqual({
    tree: '54362e358d135a3a6772119e7e22593db4f0f586',
    files: 2480,
  });
});
it('rejects mixed authored versions and late image withdrawal', async () => {
  const r = afterRoot();
  writeFileSync(
    join(r, 'src/components/forms.tsx'),
    before.get('src/components/forms.tsx')!.data,
  );
  await expect(q.verifyUIAfterimage(r)).rejects.toThrow();
  const x = afterRoot();
  await expect(
    q.verifyUIAfterimage(x, () => edit(x, 'src/App.tsx')),
  ).rejects.toThrow();
});
it('does not expose mutable internal snapshots', async () => {
  const a = await q.qualifyUIComposition(root);
  a.afterFixture.get('src/App.tsx')!.data.fill(0);
  const b = await q.qualifyUIComposition(root);
  expect(
    b.afterFixture
      .get('src/App.tsx')!
      .data.equals(after.get('src/App.tsx')!.data),
  ).toBe(true);
  a.check();
});
it('rejects coordinated manifest and patch rebinding rather than silently accepting a new endpoint', async () => {
  const id = readFileSync(folder + 'identity.json'),
    patch = readFileSync(folder + 'composition.patch');
  try {
    writeFileSync(
      folder + 'composition.patch',
      Buffer.concat([patch, Buffer.from('\n')]),
    );
    const changed = {
      ...metadata,
      patchSHA256: sha(readFileSync(folder + 'composition.patch')),
    };
    writeFileSync(folder + 'identity.json', JSON.stringify(changed));
    await expect(q.qualifyUIComposition(root)).rejects.toThrow();
  } finally {
    writeFileSync(folder + 'identity.json', id);
    writeFileSync(folder + 'composition.patch', patch);
  }
});
it('rejects a replaced already-loaded qualifier before returning composed source', async () => {
  const bytes = readFileSync(folder + 'qualify.mjs');
  try {
    writeFileSync(
      folder + 'qualify.mjs',
      Buffer.concat([bytes, Buffer.from('\n// substituted helper\n')]),
    );
    await expect(q.qualifyUIComposition(root)).rejects.toThrow();
  } finally {
    writeFileSync(folder + 'qualify.mjs', bytes);
  }
});
