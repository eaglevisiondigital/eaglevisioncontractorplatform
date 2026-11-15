// Offline source identity only; no SQL, network, Auth or guard installation.
import {
  readFileSync,
  lstatSync,
  realpathSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
const folder = 'proposals/customer-publication-498-binding/';
const oldFolder = 'proposals/customer-publication-reader-guard/';
const IDENTITY =
  '8d8d438e3a2efce1e336acf3f7d5a95ef7b25a5178cc74f87fed4051bb03f1f9';
const HELPER =
  '475ad14b73ea23bdcc59a6c7ed967b1e24a00c9e5a4250a0fe0e74572b736cf7';
const BASE = 'ada783cbb256f871d2a508b05f3411c587038aba';
const PACKET = '360fd4f0caf923a9a3f0569e8f29938b3d3a9849';
const PARENT = 'da1e42d5d9c00cc51c60e7e35016bfc1067ce1b7';
const AUTHOR = '4bcd77aab2c16d57e126f9a10b9135437c231ca8';
const trees = {
  [BASE]: '9b61ba99f636a06faa9325b3e28227d438582125',
  [PACKET]: 'ec2fc480a2f5e7b4558378830ae1f01198c30f92',
  [PARENT]: '394b063f5637285b4a9e95e72d8475ff86342508',
  [AUTHOR]: '867431a4d25317ea48b4d3d98a92031729395ed6',
};
const deny = () => {
  throw Error('Exact actual498 / held495 source identity required');
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
const object = (type, b) =>
  createHash('sha1')
    .update(Buffer.concat([Buffer.from(type + ' ' + b.length + '\0'), b]))
    .digest('hex');
function safePath(p) {
  if (
    typeof p !== 'string' ||
    !p ||
    p.includes('\\') ||
    p
      .split('/')
      .some(
        (s) =>
          !s ||
          s === '.' ||
          s === '..' ||
          [...s].some((c) => c.charCodeAt(0) < 32),
      )
  )
    deny();
}
function physical(root, p, mode = '100644') {
  safePath(p);
  let path = root;
  const parts = p.split('/');
  for (let i = 0; i < parts.length; i++) {
    path = join(path, parts[i]);
    const s = lstatSync(path);
    if (s.isSymbolicLink() || (i < parts.length - 1 && !s.isDirectory()))
      deny();
  }
  const s = lstatSync(path);
  if (!s.isFile() || (s.mode & 0o777) !== parseInt(mode.slice(-3), 8)) deny();
  return readFileSync(path);
}
function rootAt(root, expected) {
  let p = root;
  if (realpathSync(root) !== root) deny();
  const now = lstatSync(root);
  if (expected && (now.dev !== expected.dev || now.ino !== expected.ino))
    deny();
  while (true) {
    const s = lstatSync(p);
    if (!s.isDirectory() || s.isSymbolicLink()) deny();
    const parent = dirname(p);
    if (parent === p) break;
    p = parent;
  }
  return now;
}
function rows(input, count) {
  if (!Array.isArray(input) || input.length !== count) deny();
  const map = new Map();
  for (const row of input) {
    if (!row || Object.keys(row).sort().join(',') !== 'mode,oid,path') deny();
    safePath(row.path);
    if (
      !['100644', '100755'].includes(row.mode) ||
      !/^[0-9a-f]{40}$/.test(row.oid) ||
      map.has(row.path)
    )
      deny();
    map.set(row.path, { ...row });
  }
  return map;
}
function tree(frame) {
  const root = new Map();
  for (const row of frame.values()) {
    const parts = row.path.split('/');
    let current = root;
    for (const part of parts.slice(0, -1)) {
      if (!current.has(part)) current.set(part, new Map());
      current = current.get(part);
      if (!(current instanceof Map)) deny();
    }
    const name = parts.at(-1);
    if (current.has(name)) deny();
    current.set(name, row);
  }
  const digest = (node) => {
    const entries = [...node].map(([name, value]) => ({
      name,
      dir: value instanceof Map,
      value,
    }));
    entries.sort((a, b) =>
      Buffer.compare(
        Buffer.from(a.name + (a.dir ? '/' : '')),
        Buffer.from(b.name + (b.dir ? '/' : '')),
      ),
    );
    return object(
      'tree',
      Buffer.concat(
        entries.map((e) =>
          Buffer.concat([
            Buffer.from((e.dir ? '40000' : e.value.mode) + ' ' + e.name + '\0'),
            Buffer.from(e.dir ? digest(e.value) : e.value.oid, 'hex'),
          ]),
        ),
      ),
    );
  };
  return digest(root);
}
function addition(base, add) {
  const out = new Map(base);
  for (const [p, row] of add) {
    if (out.has(p)) deny();
    out.set(p, row);
  }
  return out;
}
function commit(data, id, parent) {
  const encoded = data.commits?.[id];
  if (typeof encoded !== 'string' || encoded.length > 10000) deny();
  const b = Buffer.from(encoded, 'base64');
  if (b.toString('base64') !== encoded || object('commit', b) !== id) deny();
  const lines = b.toString().split('\n');
  if (
    lines[0] !== 'tree ' + trees[id] ||
    lines.filter((l) => l.startsWith('parent ')).join('\n') !==
      'parent ' + parent
  )
    deny();
}
// Exposed for denial controls on decoded public proof. This function grants no authority.
export function validateIdentity(data, base, sql) {
  if (
    !data ||
    data.classification !==
      'ACTUAL_498_SQL_AUTHOR_BOUND_TO_UNAPPLIED_495_GUARD' ||
    data.actualSqlAuthor !== AUTHOR ||
    data.actualSqlParent !== PARENT ||
    data.actualSqlTree !== trees[AUTHOR] ||
    data.current495 !== PACKET ||
    data.guardPreparedBase !== BASE ||
    data.guardAuthor !== null ||
    data.guardAuthorParent !== null ||
    data.laterCompositionParent !== null ||
    data.compositionAuthorized !== false ||
    data.installationAuthorized !== false ||
    data.operationalReady !== false ||
    data.preparedGuardPatch !==
      '997565f12abfe9f57b829eb8fc5e3d0b2dfc9fab2527d47c6f363d3bf34178e0' ||
    data.guardTarget !== 'proposals/customer-publication-admission/source.ts' ||
    data.guardBefore !==
      '7c034c17b0c8f381a4fa23e8d0e9a867f8401f0032132fb13126498e05f92c1b' ||
    data.guardAfter !==
      '77f8fc84bcbb1d877a54d69ecd356a5381eb54b6f7c34e0f8f561145c44f9508'
  )
    deny();
  if (
    Object.keys(data.commits ?? {})
      .sort()
      .join(',') !== [PARENT, PACKET, AUTHOR].sort().join(',')
  )
    deny();
  commit(data, PARENT, '28f98e6f58f3ac02518efed33a8946eb9537f005');
  commit(data, PACKET, BASE);
  commit(data, AUTHOR, PARENT);
  const baseline = rows(base, 2477),
    reader = rows(data.readerAdditions, 9),
    packet = rows(data.packetAdditions, 9),
    sources = rows(data.sqlAdditions, 2);
  if (tree(baseline) !== trees[BASE]) deny();
  const original = new Map(baseline);
  for (const [p, r] of reader) {
    const actual = original.get(p);
    if (
      r.mode !== '100644' ||
      !actual ||
      actual.mode !== r.mode ||
      actual.oid !== r.oid
    )
      deny();
    original.delete(p);
  }
  if (original.size !== 2468 || tree(original) !== trees[PARENT]) deny();
  if (
    Object.keys(sql).sort().join(',') !== [...sources.keys()].sort().join(',')
  )
    deny();
  for (const [p, r] of sources)
    if (
      r.mode !== '100644' ||
      !Buffer.isBuffer(sql[p]) ||
      object('blob', sql[p]) !== r.oid
    )
      deny();
  const authored = addition(original, sources),
    current = addition(baseline, packet);
  if (
    authored.size !== 2470 ||
    tree(authored) !== trees[AUTHOR] ||
    current.size !== 2486 ||
    tree(current) !== trees[PACKET]
  )
    deny();
  return { current: [...current.values()], authored: [...authored.values()] };
}
function metadata(root) {
  const bytes = physical(root, folder + 'identity.json');
  if (sha(bytes) !== IDENTITY) deny();
  const helper = physical(root, oldFolder + 'qualify.mjs');
  if (sha(helper) !== HELPER) deny();
  return { data: JSON.parse(bytes), helper };
}
function inspect(root, identity, helper, data) {
  rootAt(root, identity);
  const sealed = metadata(root);
  if (
    !sealed.helper.equals(helper) ||
    JSON.stringify(sealed.data) !== JSON.stringify(data)
  )
    deny();
}
function current(root, identity, helper, data, old) {
  inspect(root, identity, helper, data);
  const q = old.capture(root);
  const frame = validateIdentity(data, q.base, q.sql);
  for (const r of frame.current)
    if (object('blob', physical(root, r.path, r.mode)) !== r.oid) deny();
  inspect(root, identity, helper, data);
  // Re-read the complete current frame after seals, including original reader/TCB.
  for (const r of frame.current)
    if (object('blob', physical(root, r.path, r.mode)) !== r.oid) deny();
  rootAt(root, identity);
  return { q, frame };
}
async function context(root) {
  root = resolve(root);
  const identity = rootAt(root),
    { data, helper } = metadata(root);
  // Evaluate only literal-sealed captured bytes; no mutable-path import or Git fallback.
  const old = await import(
    'data:text/javascript;base64,' + helper.toString('base64')
  );
  const result = current(root, identity, helper, data, old);
  return { root, identity, data, helper, old, ...result };
}
export async function qualify(root = process.cwd()) {
  const c = await context(root);
  current(c.root, c.identity, c.helper, c.data, c.old);
  return {
    classification: 'ACTUAL_SQL_SOURCE_IDENTITY_ONLY',
    actualSqlAuthor: AUTHOR,
    actualSqlParent: PARENT,
    guardPreparedBase: BASE,
    guardAuthor: null,
    guardAuthorParent: null,
    laterCompositionParent: null,
    operationalReady: false,
    installationAuthorized: false,
    compositionAuthorized: false,
  };
}
export async function materialize(root = process.cwd()) {
  const c = await context(root);
  const image = c.old.materialize(c.root),
    directory = image.directory;
  const identity = rootAt(directory);
  try {
    const q = c.q,
      outputs = new Map(
        q.base.map((r, i) => [r.path, { mode: r.mode, bytes: q.bodies[i] }]),
      );
    outputs.set(c.data.guardTarget, {
      mode: '100644',
      bytes: q.files['guard.proposed.txt'],
    });
    for (const [p, b] of Object.entries(q.sql))
      outputs.set(p, { mode: '100644', bytes: b });
    outputs.set(q.manifest.modelPath, {
      mode: '100644',
      bytes: q.files['model.proposed.txt'],
    });
    const verify = () => {
      rootAt(directory, identity);
      const seen = new Set();
      const walk = (relative = '') => {
        for (const name of readdirSync(join(directory, relative))) {
          const p = relative ? relative + '/' + name : name,
            s = lstatSync(join(directory, p));
          if (s.isSymbolicLink()) deny();
          if (s.isDirectory()) walk(p);
          else {
            const row = outputs.get(p);
            if (!row || !physical(directory, p, row.mode).equals(row.bytes))
              deny();
            seen.add(p);
          }
        }
      };
      walk();
      if (seen.size !== 2480 || seen.size !== outputs.size) deny();
      rootAt(directory, identity);
    };
    verify();
    current(c.root, c.identity, c.helper, c.data, c.old);
    verify();
    return {
      ...image,
      actualSqlAuthor: AUTHOR,
      guardPreparedBase: BASE,
      guardAuthor: null,
      laterCompositionParent: null,
      installationAuthorized: false,
      compositionAuthorized: false,
    };
  } catch (error) {
    rootAt(directory, identity);
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
