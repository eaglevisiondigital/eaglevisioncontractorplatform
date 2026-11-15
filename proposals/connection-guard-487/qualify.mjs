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
  'source.json':
    '01fe5945ac1465cbf6e9217407a4fd7594594e00f39a230297d179b861e5a04d',
  'source-tests.proposed.txt':
    'ddf9b5cb015f74732b1a19b50ccf6464ea53aa23c4e81a644a164f8e933b67d1',
  'guard-author.patch':
    'b8105671ddfabed268659dce1e6f0d7fc708b45de2d9ed0c7e52e61d57c2c4d4',
  'manifest.proposed.json':
    '28bc080f9a034ec1dd13c81a0806a288af14c7dd809169c730db1565b9710a44',
  'year-native.proposed.txt':
    'ae511a26e3cacb709bc126370286d93b048ed7938a15af1e8ae47a5d2ada8cf8',
  'git-source-proof.json':
    'a7335fc2c70a0015dc4f01dabf75959060f91dc02d8f84937f9d7f06ed09c7ce',
  'guard.proposed.txt':
    '7ea759100c2b2fa406dfe7202d1da8367a92d48feb7166a04fa41bdb5f15d06f',
  'connection-tests.proposed.txt':
    '65a3f9d626ca39994da8d27dbe51dfb18e44df534b8381a9b163cd07586024fb',
};
const sha = (v) => createHash('sha256').update(v).digest('hex');
const fail = () => {
  throw Error('Exact unapplied numbering composition required');
};
const folder = 'proposals/connection-guard-487/';
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
    const sameBase = base.findIndex((item) => item.oid === row.oid);
    const b =
      sameBase < 0 ? proof.object(row.oid, 'blob') : baseBodies[sameBase];
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
    classification: 'UNAPPLIED_DISPOSABLE_GUARD_QUALIFICATION_ONLY',
    operationalReady: false,
  };
}
export function materialize(root = process.cwd(), frame = 'proposed') {
  if (!['proposed', 'original'].includes(frame)) fail();
  const q = capture(root),
    out = mkdtempSync(
      join(realpathSync(tmpdir()), 'propel-number-composition-'),
    );
  if (frame === 'proposed') {
    const bodies = q.baseBodies;
    for (let i = 0; i < q.base.length; i++) {
      const row = q.base[i],
        p = join(out, row.path);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, bodies[i], {
        mode: Number.parseInt(row.mode.slice(-3), 8),
      });
    }
  } else {
    for (const [p, b] of Object.entries(q.imported)) {
      mkdirSync(dirname(join(out, p)), { recursive: true });
      writeFileSync(join(out, p), b, { mode: 0o644 });
    }
  }
  for (const [p, f] of Object.entries(q.m.overlays)) {
    if (frame === 'original' && !p.endsWith('/source.ts')) continue;
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
