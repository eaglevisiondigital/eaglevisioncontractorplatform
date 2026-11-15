import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { capture } from '../proposals/customer-publication-reader-guard/qualify.mjs';
import {
  qualify,
  materialize,
  validateIdentity,
} from '../proposals/customer-publication-498-binding/qualify.mjs';
const packet = 'proposals/customer-publication-reader-guard/';
const folder = 'proposals/customer-publication-498-binding/';
const target = 'proposals/customer-publication-admission/source.ts';
const reader = 'proposals/customer-publication-admission/read-only.ts';
const node = process.execPath;
const env = {
  PATH: '/opt/homebrew/opt/node@24/bin:/usr/bin:/bin',
  TMPDIR: realpathSync(tmpdir()),
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_ALLOW_PROTOCOL: '',
  GIT_NO_LAZY_FETCH: '1',
  GIT_TERMINAL_PROMPT: '0',
};
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const data = JSON.parse(fs.readFileSync(folder + 'identity.json', 'utf8'));
let source: string, image: string;
const baseline = capture();
function write(path: string, b: Uint8Array, mode = 0o644) {
  fs.mkdirSync(dirname(path), { recursive: true });
  fs.writeFileSync(path, b, { mode });
}
function proof(d: unknown) {
  return validateIdentity(d, baseline.base, baseline.sql);
}
function guard() {
  execFileSync(
    node,
    [
      '--input-type=module',
      '-e',
      `import{assertPublicationSources}from'./${target}';assertPublicationSources();`,
    ],
    { cwd: image, env, timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] },
  );
}
beforeAll(async () => {
  source = fs.mkdtempSync(
    join(realpathSync(tmpdir()), 'publication498-source-'),
  );
  for (let i = 0; i < baseline.base.length; i++)
    write(
      join(source, baseline.base[i].path),
      baseline.bodies[i],
      parseInt(baseline.base[i].mode.slice(-3), 8),
    );
  for (const r of data.packetAdditions)
    write(join(source, r.path), fs.readFileSync(r.path));
  write(
    join(source, folder + 'identity.json'),
    fs.readFileSync(folder + 'identity.json'),
  );
  image = (await materialize(source)).directory;
});
afterAll(() => {
  for (const p of [source, image])
    if (p) fs.rmSync(p, { recursive: true, force: true });
});
it('actual498 two-source author binds exact480 while guard author stays on real484 and remains unapproved', async () => {
  const q = await qualify(source);
  expect(q.actualSqlAuthor).toBe('4bcd77aab2c16d57e126f9a10b9135437c231ca8');
  expect(q.actualSqlParent).toBe('da1e42d5d9c00cc51c60e7e35016bfc1067ce1b7');
  expect(q.guardPreparedBase).toBe('ada783cbb256f871d2a508b05f3411c587038aba');
  expect(q.guardAuthor).toBeNull();
  expect(q.guardAuthorParent).toBeNull();
  expect(q.laterCompositionParent).toBeNull();
  expect(q.installationAuthorized).toBe(false);
  expect(q.compositionAuthorized).toBe(false);
  expect(q.operationalReady).toBe(false);
  expect(fs.existsSync(join(source, '.git'))).toBe(false);
  expect(proof(data).current).toHaveLength(2486);
  expect(proof(data).authored).toHaveLength(2470);
});
it('qualified complete after-image uses exact actual498 SQL bodies and the unchanged held guard', () => {
  guard();
  for (const p of Object.keys(baseline.sql)) {
    expect(fs.readFileSync(join(image, p))).toEqual(baseline.sql[p]);
    expect(fs.lstatSync(join(image, p)).mode & 0o777).toBe(0o644);
  }
  expect(hash(fs.readFileSync(join(image, target)))).toBe(data.guardAfter);
});
it('guard-only actual484 image denies missing canonical SQL rather than treating498 as its parent', () => {
  const saved = [
    ...Object.keys(baseline.sql),
    String(baseline.manifest.modelPath),
  ].map((p) => [p, fs.readFileSync(join(image, p))] as const);
  try {
    for (const [p] of saved) fs.unlinkSync(join(image, p));
    expect(guard).toThrow();
  } finally {
    for (const [p, b] of saved) write(join(image, p), b);
  }
});
it.each([
  'actualSqlParent',
  'actualSqlAuthor',
  'guardPreparedBase',
  'current495',
])(
  'foreign or wrong-parent %s is denied independently of the outer seal',
  (field) => {
    const changed = structuredClone(data);
    changed[field] = '0000000000000000000000000000000000000000';
    expect(() => proof(changed)).toThrow();
  },
);
it('raw author commit with a substituted parent is denied even when metadata names remain correct', () => {
  const changed = structuredClone(data),
    id = changed.actualSqlAuthor;
  changed.commits[id] = Buffer.from(
    Buffer.from(changed.commits[id], 'base64')
      .toString()
      .replace(changed.actualSqlParent, changed.guardPreparedBase),
  ).toString('base64');
  expect(() => proof(changed)).toThrow();
});
it('valid foreign commit body cannot be relabelled as the real SQL author', () => {
  const changed = structuredClone(data);
  changed.commits[changed.actualSqlAuthor] =
    changed.commits[changed.current495];
  expect(() => proof(changed)).toThrow();
});
it.each(['path', 'mode', 'oid'])(
  'SQL author %s substitution fails the complete reconstructed author tree',
  (field) => {
    const changed = structuredClone(data);
    changed.sqlAdditions[0][field] =
      field === 'path'
        ? 'server/invoices/foreign.sql'
        : field === 'mode'
          ? '100755'
          : '0'.repeat(40);
    expect(() => proof(changed)).toThrow();
  },
);
it('coordinated495 and498 rebind remains denied with internally replaced commit records', () => {
  const changed = structuredClone(data);
  [changed.current495, changed.actualSqlAuthor] = [
    changed.actualSqlAuthor,
    changed.current495,
  ];
  [changed.packetAdditions, changed.sqlAdditions] = [
    changed.sqlAdditions,
    changed.packetAdditions,
  ];
  expect(() => proof(changed)).toThrow();
});
it('reader addition withdrawal cannot preserve480 ancestry by relabelling its byte identity', () => {
  const changed = structuredClone(data);
  changed.readerAdditions.find((r: { path: string }) => r.path === reader).oid =
    '0'.repeat(40);
  expect(() => proof(changed)).toThrow();
});
it('no manifest flag can self-authorize guard, composition or installation', () => {
  for (const field of [
    'guardAuthor',
    'guardAuthorParent',
    'laterCompositionParent',
    'compositionAuthorized',
    'installationAuthorized',
    'operationalReady',
  ]) {
    const changed = structuredClone(data);
    changed[field] =
      typeof changed[field] === 'boolean' ? true : data.actualSqlAuthor;
    expect(() => proof(changed)).toThrow();
  }
});
it('changed prototype buffers cannot stand in for actual498 blob contents', () => {
  const sql = { ...baseline.sql };
  sql[Object.keys(sql)[0]] = Buffer.from('-- substituted');
  expect(() => validateIdentity(data, baseline.base, sql)).toThrow();
});
it('sealed identity metadata cannot be rebound with coordinated endpoint changes', async () => {
  const p = join(source, folder + 'identity.json'),
    bytes = fs.readFileSync(p);
  try {
    const changed = structuredClone(data);
    changed.actualSqlAuthor = changed.current495;
    fs.writeFileSync(p, JSON.stringify(changed));
    await expect(qualify(source)).rejects.toThrow();
  } finally {
    fs.writeFileSync(p, bytes);
  }
});
it('altered old qualifier is denied before its marker can execute', async () => {
  const p = join(source, packet + 'qualify.mjs'),
    bytes = fs.readFileSync(p),
    marker = join(source, 'MUST_NOT_EXECUTE');
  try {
    fs.writeFileSync(
      p,
      `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'executed');`,
    );
    await expect(qualify(source)).rejects.toThrow();
    expect(fs.existsSync(marker)).toBe(false);
  } finally {
    fs.writeFileSync(p, bytes);
  }
});
it('actual restricted reader withdrawal and mode or symlink replacement deny current qualification', async () => {
  const p = join(source, reader),
    bytes = fs.readFileSync(p),
    side = join(source, 'same-reader');
  try {
    fs.appendFileSync(p, '\n//withdrawn');
    await expect(qualify(source)).rejects.toThrow();
  } finally {
    fs.writeFileSync(p, bytes);
  }
  try {
    fs.chmodSync(p, 0o755);
    await expect(qualify(source)).rejects.toThrow();
  } finally {
    fs.chmodSync(p, 0o644);
  }
  try {
    fs.writeFileSync(side, bytes);
    fs.unlinkSync(p);
    fs.symlinkSync(side, p);
    await expect(qualify(source)).rejects.toThrow();
  } finally {
    fs.rmSync(p, { force: true });
    fs.writeFileSync(p, bytes);
    fs.rmSync(side, { force: true });
  }
});
it('a whole source withdrawal across the import await is denied', async () => {
  const p = join(source, reader),
    bytes = fs.readFileSync(p);
  const pending = qualify(source);
  fs.appendFileSync(p, '\n// await withdrawal');
  try {
    await expect(pending).rejects.toThrow();
  } finally {
    fs.writeFileSync(p, bytes);
  }
});
it('late reader withdrawal during the final identity seal is caught before return', async () => {
  const p = join(source, reader),
    bytes = fs.readFileSync(p),
    watch = join(source, folder + 'identity.json'),
    original = fs.readFileSync;
  let hits = 0;
  fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
    const value = Reflect.apply(original, fs, args);
    if (String(args[0]) === watch && ++hits === 5)
      fs.appendFileSync(p, '\n// late withdrawal');
    return value;
  }) as typeof fs.readFileSync;
  syncBuiltinESMExports();
  try {
    await expect(qualify(source)).rejects.toThrow();
    expect(hits).toBe(5);
  } finally {
    fs.readFileSync = original;
    syncBuiltinESMExports();
    fs.writeFileSync(p, bytes);
  }
});
