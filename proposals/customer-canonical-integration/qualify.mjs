// Finite offline proposal qualification only. No source admission or credentials.
import {
  readFileSync,
  readdirSync,
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
  '01.payload.txt':
    '98e502cb1e4beaa8cd6a950539a1ba1973677da9ee4e46c097b0193d6c138ea2',
  '02.payload.txt':
    'e343734dd7889fdf485e08cb74d89cbf0900c9a34cd90c50698b734549b4c0b2',
  '03.payload.txt':
    'e546c945bf3f4993a5a5e4a62703e8e8f6b0b7473cc31a237be2050c863ee8ef',
  '04.payload.txt':
    '008b1f9d9100dff6902862de9df70b1c3fe400f3c8dee582fd1178133470acb0',
  '05.payload.txt':
    '476a6d6ebb8299afb2c20c95000c6488e9bdc55b36c825d4bd6baddb4fe94cb4',
  '06.payload.txt':
    '0090a5687e11d937db5cbf30d088dde96f4b5111ba4882f110d731e9f75a0648',
  '07.payload.txt':
    'a7cbf770b2bbb5bfbc64b900e5a6b5fc0d79703dcf7b8b1f4dd1f087f91f07c6',
  '08.payload.txt':
    'ec220aa8cbf1742e351b5013714a74d1cf2aa37ac327f6baf428ab9ee8ef750a',
  '09.payload.txt':
    '956522cffb9ab88ea4b47e0c4904a8cafc56d4d0ac5e00188e0e988ad57ad665',
  '10.payload.txt':
    'a66859bbd2145a0ff3da21720195490d0e94a65df51d2461199e372a59b54a09',
  'git-source-proof.json':
    '515e09063f8b9eef13ddedb4d0fbdfff8932e9731cade74a60a93b38d2dc19cb',
  'integration.patch':
    'dd5f29e714bbadb4d8eca2e0e9bcc1999adc16d1dcffcda232201d2835967cfd',
  'reuse-boundaries.json':
    '9638710529767aa5ff9f89201ef39995784522c6d7cb41ec6c039f03aa9a5e5e',
  'source.json':
    'f819a4e5dac6d375cb9c34863e6e4f6d046192bf3dae0a5ab34ceb463c701743',
};
const sha = (v) => createHash('sha256').update(v).digest('hex');
const fail = () => {
  throw Error('Exact customer-only composition required');
};
const folder = 'proposals/customer-canonical-integration/';
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
function closedInventory(root, paths) {
  const expected = new Set(paths),
    dirs = new Set();
  for (const p of expected) {
    const a = p.split('/');
    for (let i = 1; i < a.length; i++) dirs.add(a.slice(0, i).join('/'));
  }
  const visit = (prefix = '') => {
    for (const name of readdirSync(join(root, prefix))) {
      if (!prefix && ['.git', 'node_modules'].includes(name)) continue;
      const p = prefix ? prefix + '/' + name : name,
        info = lstatSync(join(root, p));
      if (info.isSymbolicLink()) fail();
      if (info.isDirectory()) {
        if (!dirs.has(p)) fail();
        visit(p);
      } else if (!info.isFile() || !expected.has(p)) fail();
    }
  };
  visit();
}
function absent(root, paths) {
  for (const path of paths) {
    let current = root;
    for (const part of path.split('/')) {
      current = join(current, part);
      let info;
      try {
        info = lstatSync(current);
      } catch (error) {
        if (error?.code === 'ENOENT') break;
        throw error;
      }
      if (
        info.isSymbolicLink() ||
        current === join(root, path) ||
        !info.isDirectory()
      )
        fail();
    }
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
    absent(root, Object.keys(m.overlays));
    closedInventory(root, [
      ...base.map((r) => r.path),
      ...Object.keys(seals).map((p) => folder + p),
      folder + 'qualify.mjs',
      folder + 'qualify.d.mts',
      folder + 'README.md',
      'tests/customer-canonical-integration-source.test.ts',
    ]);
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
  for (const author of m.authors) {
    const authored = proof.tree(author.commit, author.tree, author.parent);
    const parentObject = proof.object(author.parent, 'commit').toString();
    const parentLine = parentObject
      .split('\n')
      .filter((line) => line.startsWith('parent '));
    if (parentLine.length !== 1) fail();
    const previous = proof.tree(
      author.parent,
      author.parentTree,
      parentLine[0].slice(7),
    );
    if (
      authored.length !== author.entries ||
      authored.length !== previous.length
    )
      fail();
    const changes = authored.filter(
      (row, i) =>
        row.path !== previous[i].path ||
        row.mode !== previous[i].mode ||
        row.oid !== previous[i].oid,
    );
    if (
      changes.length !== 1 ||
      changes[0].path !== author.path ||
      changes[0].mode !== author.mode
    )
      fail();
    const prior = previous.find((row) => row.path === author.path);
    if (
      !prior ||
      prior.mode !== author.mode ||
      sha(proof.object(prior.oid, 'blob')) !== author.before ||
      sha(proof.object(changes[0].oid, 'blob')) !== author.after
    )
      fail();
  }
  const imported = {};
  for (const [p, h] of Object.entries(m.externalFiles)) {
    const row = external.find((r) => r.path === p);
    if (!row) fail();
    const b = proof.object(row.oid, 'blob');
    if (sha(b) !== h) fail();
    imported[p] = b;
  }
  for (const [p, file] of Object.entries(m.overlays)) {
    if (
      sha(files[file]) !== m.after[p] ||
      !files[file].equals(imported[p]) ||
      base.some((row) => row.path === p)
    )
      fail();
  }
  for (const path of m.sourceClosure) {
    const index = base.findIndex((row) => row.path === path);
    if (index >= 0 && !baseBodies[index].equals(imported[path])) fail();
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
    classification: 'UNAPPLIED_CUSTOMER_CANONICAL_UNION_ONLY',
    operationalReady: false,
  };
}
export function materialize(root = process.cwd(), frame = 'proposed') {
  if (!['proposed', 'original'].includes(frame)) fail();
  const q = capture(root),
    out = mkdtempSync(
      join(realpathSync(tmpdir()), 'propel-customer-canonical-integration-'),
    );
  for (let i = 0; i < q.base.length; i++) {
    const row = q.base[i],
      path = join(out, row.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, q.baseBodies[i], {
      mode: Number.parseInt(row.mode.slice(-3), 8),
    });
  }
  for (const [source, path] of Object.entries(q.m.fixtureImports)) {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), q.imported[source], { mode: 0o644 });
  }
  if (frame === 'proposed')
    for (const [path, file] of Object.entries(q.m.overlays)) {
      mkdirSync(dirname(join(out, path)), { recursive: true });
      writeFileSync(join(out, path), q.files[file], { mode: 0o644 });
    }
  for (const [file, path] of Object.entries(q.m.testPayloads)) {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), q.files[file], { mode: 0o644 });
  }
  capture(root);
  return {
    directory: out,
    classification: q.classification,
    operationalReady: false,
  };
}

// Disposable after-source verification only. No source admission or operation.
export function verifyMaterialized(directory, source = process.cwd()) {
  const q = capture(source),
    root = resolve(directory);
  exactRoot(root);
  const expected = new Map(
    q.base.map((row, index) => [
      row.path,
      {
        bytes: q.baseBodies[index],
        mode: row.mode,
      },
    ]),
  );
  for (const [path, file] of Object.entries(q.m.overlays))
    expected.set(path, { bytes: q.files[file], mode: '100644' });
  const dirs = new Set();
  for (const path of expected.keys()) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++)
      dirs.add(parts.slice(0, i).join('/'));
  }
  const inventory = (prefix = '') => {
    for (const name of readdirSync(join(root, prefix))) {
      if (!prefix && (name === '.git' || name === 'node_modules')) continue;
      const path = prefix ? prefix + '/' + name : name;
      const info = lstatSync(join(root, path));
      if (info.isSymbolicLink()) fail();
      if (info.isDirectory()) {
        if (!dirs.has(path)) fail();
        inventory(path);
      } else if (!info.isFile() || !expected.has(path)) fail();
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    exactRoot(root);
    inventory();
    for (const [path, row] of expected) {
      let ancestor = root;
      for (const part of path.split('/')) {
        ancestor = join(ancestor, part);
        const info = lstatSync(ancestor);
        if (
          info.isSymbolicLink() ||
          (ancestor !== join(root, path) && !info.isDirectory())
        )
          fail();
      }
      const file = join(root, path),
        info = lstatSync(file);
      if (
        !info.isFile() ||
        (info.mode & 0o777) !== Number.parseInt(row.mode.slice(-3), 8) ||
        !row.bytes.equals(readFileSync(file))
      )
        fail();
    }
  }
  capture(source);
  return {
    classification: 'DISPOSABLE_COMPLETE_AFTER_FRAME_ONLY',
    files: expected.size,
    operationalReady: false,
  };
}
