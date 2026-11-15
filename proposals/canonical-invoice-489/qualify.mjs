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
  '03.payload.txt':
    'e476ba2e126b8a56dfed5eeca839d081d3193df7feced08cf1540d5916b05fa8',
  '13.payload.txt':
    '93f1d88a9f614504e5647a8d12b0f49f6a5f0e86218b267f8659ecbbabf469dc',
  'source.json':
    '7546a396bbc7c3bd9d7ad66b3f34d296aef970a4d846fa2d9d58fb3f503a8046',
  '06.payload.txt':
    'fa38a34b7ac3d70a8ec0a3fce9af703fea6d3cb0bf68c589e88dcdb532b2ac57',
  '05.payload.txt':
    '3057cd8b268f24a29dd3a1ec83006254774e26393da1c551845d02ecf4c099b5',
  '10.payload.txt':
    '620713f79f664b3af0ed0dcb93473e3d939e034e202fcfcb50bb31221b1424b7',
  '09.payload.txt':
    '1dd283a94bd4a374d058db2cf0225d691be6e5b3180e033b5ef6c47feb3e57a2',
  'admission.patch':
    '1b6a1336c9be9ad1d60bbe8f5a2173f01add907d72da565fc711b51da53da68b',
  '07.payload.txt':
    '56bc23def7acf53501b3af4cdc599f98de601a5d6e95dda47d583bd0e8400c73',
  '12.payload.txt':
    'c6e62953cbb1e58c8ea1c636ef8f1929cdb46cbf2655fbc2e6015c29f09b5f94',
  '02.payload.txt':
    'f12618162eb8bb0e7d74e4f41e1b9b1c7375788834cb98991d7fbca77741ece9',
  'git-source-proof.json':
    '2a942eaeddbab772ce7c8be9b79da8de40daeaa2daa9d99ef8867ff58a9c9b5d',
  '01.payload.txt':
    'cf28a441f146c5e4d398eb0ea0b78a999dd0f744e19424c46f3e95de74229438',
  '14.payload.txt':
    '5962272679a66e54b6bb30c8cc52502e0703434956f3dfdd68995e3cc233aa13',
  '08.payload.txt':
    '5d8521ae472a2983fb2b450c3ca138811b2f04d7e4c61e4e32772d68c069457d',
  '11.payload.txt':
    '98af655cb91e0bf68a926730bdc192ef9d6cef0c5379498bbd83ef0c06d10aa4',
  '04.payload.txt':
    'fd1f640afb20c5b933d0a5ec6b5607a1732b830211b1b1b7de4eb0719ef03b9c',
};
const sha = (v) => createHash('sha256').update(v).digest('hex');
const fail = () => {
  throw Error('Exact unapplied canonical source admission required');
};
const folder = 'proposals/canonical-invoice-489/';
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
    classification: 'UNAPPLIED_CANONICAL_ADMISSION_QUALIFICATION_ONLY',
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
