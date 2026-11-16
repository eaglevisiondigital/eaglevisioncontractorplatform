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
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { UIFile } from '../proposals/ui-development-integration/qualify.mjs';
const root = process.cwd(),
  folder = join(root, 'proposals/ui-development-integration/'),
  owned: string[] = [];
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
let q: typeof import('../proposals/ui-development-integration/qualify.mjs'),
  before: Map<string, UIFile>,
  after: Map<string, UIFile>;
const metadata = JSON.parse(readFileSync(folder + 'identity.json', 'utf8'));
const beforeRoot = () => image(before),
  afterRoot = () => image(after);
function image(files: Map<string, UIFile>) {
  const dir = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-ui-development-'),
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
    '772dd383b4ab28798950f14cadbb6585fb6bf8eafb5b074f22475a92d081e2f4',
  );
  q = await import(pathToFileURL(folder + 'qualify.mjs').href);
  const r = await q.qualifyUIDevelopmentIntegration(root);
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
  await q.qualifyUIDevelopmentIntegration(beforeRoot());
  await q.verifyUIDevelopmentAfterimage(afterRoot());
});
afterAll(() => {
  for (const p of owned) rmSync(p, { recursive: true, force: true });
});
it('qualifies only exact520 plus the eleven residual authored endpoints', async () => {
  const r = await q.qualifyUIDevelopmentIntegration(root);
  expect(r.changedPaths).toBe(11);
  expect(r.afterTree).toBe('736b21fe40fbfd246e0682e99b42c40f27948820');
  expect(r.afterFixture.size).toBe(2510);
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
  'tests/database/property.test.ts',
  'tests/helpers/property-p1-fixture.ts',
  'tests/invoice-guard-admission-proposal.test.ts',
])('rejects current source substitution before composition: %s', async (p) => {
  const r = beforeRoot();
  edit(r, p);
  await expect(q.qualifyUIDevelopmentIntegration(r)).rejects.toThrow();
});
it('rejects an unknown source companion without evaluating it', async () => {
  const r = beforeRoot();
  writeFileSync(
    join(r, 'src/unreviewed-ui.ts'),
    'throw Error("must never execute")',
  );
  await expect(q.qualifyUIDevelopmentIntegration(r)).rejects.toThrow();
});
it('rejects group-writable current source even when its Git executable mode is unchanged', async () => {
  const r = beforeRoot();
  chmodSync(join(r, 'src/App.tsx'), 0o664);
  await expect(q.qualifyUIDevelopmentIntegration(r)).rejects.toThrow();
});
it('rejects mode and symlink substitutions', async () => {
  const r = beforeRoot(),
    p = join(r, 'src/App.tsx');
  chmodSync(p, 0o755);
  await expect(q.qualifyUIDevelopmentIntegration(r)).rejects.toThrow();
  chmodSync(p, 0o644);
  renameSync(p, p + '.saved');
  symlinkSync(p + '.saved', p);
  await expect(q.qualifyUIDevelopmentIntegration(r)).rejects.toThrow();
});
it.each(['after-capture', 'after-compose'] as const)(
  'rejects late source withdrawal at %s',
  async (phase) => {
    const r = beforeRoot();
    await expect(
      q.qualifyUIDevelopmentIntegration(r, (p) => {
        if (p === phase) edit(r, 'src/App.tsx');
      }),
    ).rejects.toThrow();
  },
);
it('rejects complete or partial promoted source masquerading as the original parent', async () => {
  await expect(
    q.qualifyUIDevelopmentIntegration(afterRoot()),
  ).rejects.toThrow();
  const r = beforeRoot();
  writeFileSync(
    join(r, 'src/components/forms.tsx'),
    after.get('src/components/forms.tsx')!.data,
  );
  await expect(q.qualifyUIDevelopmentIntegration(r)).rejects.toThrow();
});
it('verifies the exact complete afterimage', async () => {
  expect(await q.verifyUIDevelopmentAfterimage(afterRoot())).toEqual({
    tree: '736b21fe40fbfd246e0682e99b42c40f27948820',
    files: 2510,
  });
});
it('rejects mixed authored versions and late image withdrawal', async () => {
  const r = afterRoot();
  writeFileSync(
    join(r, 'src/components/forms.tsx'),
    before.get('src/components/forms.tsx')!.data,
  );
  await expect(q.verifyUIDevelopmentAfterimage(r)).rejects.toThrow();
  const x = afterRoot();
  await expect(
    q.verifyUIDevelopmentAfterimage(x, () => edit(x, 'src/App.tsx')),
  ).rejects.toThrow();
});
it('does not expose mutable internal snapshots', async () => {
  const a = await q.qualifyUIDevelopmentIntegration(root);
  a.afterFixture.get('src/App.tsx')!.data.fill(0);
  const b = await q.qualifyUIDevelopmentIntegration(root);
  expect(
    b.afterFixture
      .get('src/App.tsx')!
      .data.equals(after.get('src/App.tsx')!.data),
  ).toBe(true);
  a.check();
});
async function isolatedProducer() {
  const image = beforeRoot();
  const packet = join(image, 'proposals/ui-development-integration');
  mkdirSync(packet, { recursive: true });
  for (const name of [
    'identity.json',
    'development-integration.patch',
    'qualify.mjs',
    'qualify.d.mts',
    'README.md',
  ])
    copyFileSync(join(folder, name), join(packet, name));
  const module = await import(pathToFileURL(join(packet, 'qualify.mjs')).href);
  return { image, packet, module };
}
it('rejects coordinated manifest and patch rebinding without changing the shared packet', async () => {
  const { image, packet, module } = await isolatedProducer();
  const patch = readFileSync(join(packet, 'development-integration.patch'));
  writeFileSync(
    join(packet, 'development-integration.patch'),
    Buffer.concat([patch, Buffer.from('\n')]),
  );
  writeFileSync(
    join(packet, 'identity.json'),
    JSON.stringify({
      ...metadata,
      patchSHA256: sha(
        readFileSync(join(packet, 'development-integration.patch')),
      ),
    }),
  );
  await expect(module.qualifyUIDevelopmentIntegration(image)).rejects.toThrow();
});
it('rejects a replaced already-loaded qualifier without changing the shared packet', async () => {
  const { image, packet, module } = await isolatedProducer();
  const path = join(packet, 'qualify.mjs');
  writeFileSync(
    path,
    Buffer.concat([
      readFileSync(path),
      Buffer.from('\n// substituted helper\n'),
    ]),
  );
  await expect(module.qualifyUIDevelopmentIntegration(image)).rejects.toThrow();
});
it('retains four existing511 endpoints, both approved518 native inputs and exact520 header', () => {
  expect(Object.keys(metadata.alreadyPresent511Endpoints)).toHaveLength(4);
  for (const [path, pin] of Object.entries(
    metadata.alreadyPresent511Endpoints,
  ) as [string, { sha256: string }][])
    expect(sha(after.get(path)!.data)).toBe(pin.sha256);
  for (const path of [
    'tests/database/property.test.ts',
    'tests/helpers/property-p1-fixture.ts',
    'tests/invoice-guard-admission-proposal.test.ts',
    'src/components/Team.tsx',
  ])
    expect(after.get(path)!.data.equals(before.get(path)!.data)).toBe(true);
  expect(sha(after.get('tests/database/property.test.ts')!.data)).toBe(
    'c429cee25729539b83281f7e337e1bbec3f44daf8ed0101af48a9f8fcc307da7',
  );
  expect(sha(after.get('tests/helpers/property-p1-fixture.ts')!.data)).toBe(
    'df95bf0fc63496e3b5ddb695d9c9c4b8d55fe8fecc36c8af61c7de5b9e5857dc',
  );
  expect(
    sha(after.get('tests/invoice-guard-admission-proposal.test.ts')!.data),
  ).toBe('d93d3b015ad1a92e367881a816cc4b14c7f0776630569c067547aec4ba808408');
});
