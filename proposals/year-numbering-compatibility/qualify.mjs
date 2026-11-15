// Finite offline proposal qualification only. No source admission or credentials.
import {
  readFileSync,
  realpathSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const seals = {
  'reader.proposed.txt':
    '98e502cb1e4beaa8cd6a950539a1ba1973677da9ee4e46c097b0193d6c138ea2',
  'source.json':
    '4edd40ff682a864f90f053744a0d07562a11209630e3d0f0c38183eb4c1af2da',
  'connection.proposed.txt':
    '69a9b8a94104291e96b9e6d0681a3905ebe2c7a4e0ec71e5d1eae24ecfd8c433',
  'browser-config.proposed.txt':
    'd5a05464c272d7b91062a708853747d54068906dd12608c5cf1f34c52c5525d8',
  'connection-author.patch':
    'b93a1c555f460284575fb1a8bc0f78f8310f5c4cc54e8b1ebfa3846175e8766a',
  'bridge-tests.proposed.txt':
    '376ca32ebca912c6be4e66153eb186faefd751bcbdba10256851e7ddc1a69752',
  'browser-tests.proposed.txt':
    '5428cb5b3d5b7279685049c5e7f1c5e98137224af3a2e426fca06b1609f06a31',
  'reader-author.patch':
    '2215929e76d03c9155a769b60c80b76e59ff55f64192a9d3df74ec498cf0dd1a',
  'native-tests.proposed.txt':
    'ae511a26e3cacb709bc126370286d93b048ed7938a15af1e8ae47a5d2ada8cf8',
  'git-source-proof.json':
    'be48761c705a13e4f28880c548f33ab6ca32613bd513d09563a17afe78ba3808',
  'connection-tests.proposed.txt':
    '488387eaad2860a68bab4ce5b85db8ce2b4eb1ccfa7862a072e5b90a1df055ac',
  'source.proposed.txt':
    'c3091ce39aff93d4c7901802f1e7fd0afb0cfa5e4fc9044e0fa4b50cf6d1a3c7',
  'connection-guard-author.patch':
    '2185e4a02bffa102c4742f19b055df443fda4b5427ced8ed6cf25cd3741776ea',
};
const sha = (v) => createHash('sha256').update(v).digest('hex');
const fail = () => {
  throw Error('Exact unapplied numbering composition required');
};
const folder = 'proposals/year-numbering-compatibility/';
function physical(root, path) {
  let p = root;
  for (const part of path.split('/')) {
    if (!part || part === '.' || part === '..') fail();
    p = join(p, part);
    const s = lstatSync(p);
    if (s.isSymbolicLink() || (p !== join(root, path) && !s.isDirectory()))
      fail();
  }
  const s = lstatSync(p);
  if (!s.isFile() || (s.mode & 0o777) !== 0o644) fail();
  return readFileSync(p);
}
function sourceObjects(bytes) {
  const proof = JSON.parse(bytes.toString());
  if (
    proof.classification !== 'PUBLIC_IMMUTABLE_SOURCE_OBJECT_EVIDENCE_ONLY' ||
    !proof.objects
  )
    fail();
  const verified = new Map();
  const object = (oid, type) => {
    if (!/^[a-f0-9]{40}$/.test(oid)) fail();
    const entry = proof.objects[oid];
    if (
      !entry ||
      entry.type !== type ||
      typeof entry.data !== 'string' ||
      entry.data.length > 4 * 1024 * 1024
    )
      fail();
    if (verified.has(oid)) return verified.get(oid);
    const body = Buffer.from(entry.data, 'base64');
    if (
      body.toString('base64') !== entry.data ||
      createHash('sha1')
        .update(
          Buffer.concat([Buffer.from(type + ' ' + body.length + '\0'), body]),
        )
        .digest('hex') !== oid
    )
      fail();
    verified.set(oid, body);
    return body;
  };
  const tree = (commit, expectedTree, expectedParent) => {
    const lines = object(commit, 'commit').toString().split('\n');
    if (
      lines[0] !== 'tree ' + expectedTree ||
      lines.filter((l) => l.startsWith('parent ')).join('\n') !==
        'parent ' + expectedParent
    )
      fail();
    const rows = [];
    const visit = (oid, prefix = '', active = new Set()) => {
      if (active.has(oid) || active.size > 30) fail();
      const path = new Set(active);
      path.add(oid);
      const body = object(oid, 'tree');
      let at = 0;
      const names = new Set();
      while (at < body.length) {
        const space = body.indexOf(32, at),
          end = body.indexOf(0, space + 1);
        if (space < at || end < space || end + 21 > body.length) fail();
        const mode = body.subarray(at, space).toString(),
          nameBytes = body.subarray(space + 1, end),
          name = nameBytes.toString(),
          child = body.subarray(end + 1, end + 21).toString('hex');
        if (
          !name ||
          name === '.' ||
          name === '..' ||
          name.includes('/') ||
          name.includes('\\') ||
          Array.from(name).some((c) => c.charCodeAt(0) < 32) ||
          !Buffer.from(name).equals(nameBytes) ||
          names.has(name)
        )
          fail();
        names.add(name);
        const target = prefix + name;
        if (mode === '40000') visit(child, target + '/', path);
        else {
          if (!['100644', '100755'].includes(mode)) fail();
          rows.push({ mode, path: target, oid: child });
        }
        at = end + 21;
        if (rows.length > 10000) fail();
      }
    };
    visit(expectedTree);
    return rows.sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
  };
  return { object, tree };
}
function exactRoot(root) {
  if (realpathSync(root) !== root) fail();
  let p = root;
  while (true) {
    const info = lstatSync(p);
    if (info.isSymbolicLink() || !info.isDirectory()) fail();
    const parent = dirname(p);
    if (parent === p) break;
    p = parent;
  }
}
export function capture(root = process.cwd()) {
  root = resolve(root);
  exactRoot(root);
  const files = {};
  for (const [p, h] of Object.entries(seals)) {
    const b = physical(root, folder + p);
    if (sha(b) !== h) fail();
    files[p] = b;
  }
  const m = JSON.parse(files['source.json']);
  const proof = sourceObjects(files['git-source-proof.json']);
  const base = proof.tree(m.base, m.baseTree, m.baseParent),
    external = proof.tree(m.external, m.externalTree, m.externalParent);
  if (base.length !== m.baseEntries || external.length !== m.externalEntries)
    fail();
  let baseBodies = [];
  const current = () => {
    exactRoot(root);
    const bodies = [];
    for (const r of base) {
      const p = join(root, r.path);
      let ancestor = root;
      for (const part of r.path.split('/')) {
        ancestor = join(ancestor, part);
        if (lstatSync(ancestor).isSymbolicLink()) fail();
      }
      const s = lstatSync(p);
      if (
        !s.isFile() ||
        (s.mode & 0o777) !== Number.parseInt(r.mode.slice(-3), 8)
      )
        fail();
      const b = readFileSync(p);
      bodies.push(b);
      if (
        createHash('sha1')
          .update(Buffer.concat([Buffer.from('blob ' + b.length + '\0'), b]))
          .digest('hex') !== r.oid
      )
        fail();
    }
    baseBodies = bodies;
  };
  current();
  const imported = {};
  for (const [p, h] of Object.entries(m.externalFiles)) {
    const row = external.find((r) => r.path === p);
    if (!row) fail();
    const b = proof.object(row.oid, 'blob');
    if (sha(b) !== h) fail();
    imported[p] = b;
  }
  for (const [p, file] of Object.entries(m.overlays)) {
    if (sha(files[file]) !== m.after[p]) fail();
  }
  for (const [name, spec] of Object.entries(m.patches)) {
    if (sha(files[name]) !== spec.sha256) fail();
  }
  current();
  exactRoot(root);
  for (const [name, h] of Object.entries(seals)) {
    if (sha(physical(root, folder + name)) !== h) fail();
  }
  current();
  exactRoot(root);
  return {
    root,
    m,
    base,
    baseBodies,
    files,
    imported,
    classification: 'DISPOSABLE_COMPOSITION_ONLY',
    operationalReady: false,
  };
}
export function materialize(root = process.cwd()) {
  const q = capture(root),
    out = mkdtempSync(
      join(realpathSync(tmpdir()), 'propel-number-composition-'),
    );
  const bodies = q.baseBodies;
  for (let i = 0; i < q.base.length; i++) {
    const row = q.base[i],
      p = join(out, row.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, bodies[i], {
      mode: Number.parseInt(row.mode.slice(-3), 8),
    });
  }
  for (const [p, b] of Object.entries(q.imported)) {
    mkdirSync(dirname(join(out, p)), { recursive: true });
    writeFileSync(join(out, p), b, { mode: 0o644 });
  }
  for (const [p, f] of Object.entries(q.m.overlays)) {
    mkdirSync(dirname(join(out, p)), { recursive: true });
    writeFileSync(join(out, p), q.files[f], { mode: 0o644 });
  }
  for (const [name, p] of Object.entries(q.m.testPayloads ?? {})) {
    mkdirSync(dirname(join(out, p)), { recursive: true });
    writeFileSync(join(out, p), q.files[name], { mode: 0o644 });
  }
  capture(root);
  return {
    directory: out,
    classification: q.classification,
    operationalReady: false,
  };
}
