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
  'composition.patch':
    '07f345abc31b248d5ff23ada8efb82349dc23d44f2cc61b49e63cd8a1cffccbe',
  'git-source-proof.json':
    '61e4f998a11779b4ea8d59bc6feb2e47bd630c8e204e392e377f5c0c4b61201f',
  'native-tests.proposed.txt':
    '07485ab06a23d7c0c79a55c5d710169125b890cb86b6cd3775144c91658dac02',
  'original-reader.proposed.txt':
    'eb8e9c1e057db7edee593941bd3112f6c4fe6206824db850963e5bbaf09a082a',
  'readback.proposed.txt':
    '2e3913749b28d15ee9976572ce0d328af1d246d039ba930a04db1a76e6a268de',
  'receipt-sql.proposed.txt':
    '1c1ec82ca52560de86ec19ff9a865babfc3967ff466b425692e733fd240fdef5',
  'source.json':
    '678ef73e5287116ebedde26f8d625e6c0dbaa4706a3debb174d17a9342fc9229',
  'unit-tests.proposed.txt':
    'a4751d961903e32ef6e8ac95f9cc2250893f7bdaee3f302846e1be64e9411303',
};
const sha = (v) => createHash('sha256').update(v).digest('hex');
const fail = () => {
  throw Error('Exact customer-only composition required');
};
const folder = 'proposals/customer-payment-ack-composition/';
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
      'tests/customer-payment-ack-composition-source.test.ts',
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
      base.some((row) => row.path === p) ||
      (imported[p]
        ? !files[file].equals(imported[p])
        : !m.newSourcePaths.includes(p))
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
    classification: 'UNAPPLIED_PRIVATE_ACK_QUALIFICATION_ONLY',
    operationalReady: false,
  };
}
export function materialize(root = process.cwd(), frame = 'proposed') {
  if (!['proposed', 'original'].includes(frame)) fail();
  const q = capture(root),
    out = mkdtempSync(
      join(realpathSync(tmpdir()), 'propel-customer-payment-ack-composition-'),
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
  for (const [file, path] of Object.entries(q.m.testPayloads))
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
  const rootIdentity = lstatSync(root);
  const sameRoot = () => {
    exactRoot(root);
    const now = lstatSync(root);
    if (now.dev !== rootIdentity.dev || now.ino !== rootIdentity.ino) fail();
  };
  const audit = () => {
    sameRoot();
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
  };
  for (let pass = 0; pass < 2; pass++) audit();
  capture(source);
  audit();
  sameRoot();
  return {
    classification: 'DISPOSABLE_COMPLETE_AFTER_FRAME_ONLY',
    files: expected.size,
    operationalReady: false,
  };
}
