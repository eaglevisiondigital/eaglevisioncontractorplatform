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
  'browser-config.proposed.txt':
    'c75a7a42b50a87cabe2cf994732e8f7fc01ab785c00c4adb66a967c18d8f6464',
  'browser-tests.proposed.txt':
    '4c4ffaf268358cefdc7145ed9be71df654021e6d72362eb7a4d75fc32deadbfa',
  'composition.patch':
    '45d9682bacd7b3d07edb8e881072460393dd2efd708c5ca238b2c98a45b967ab',
  'customer-tests.proposed.txt':
    'dca1d490daecbfe60b92373ed923b39006f847449162513f217b080d530a9bd0',
  'git-source-proof.json':
    'c78028406811331c51a5e378ddbc704a45872164015dfe8db59fedc3a891c7dc',
  'native-tests.proposed.txt':
    '3194f274920e8c138036d1dfbadc77bacb22a2146817a03da0e60f1b0c2386f4',
  'presenter.proposed.txt':
    'a63a605af3b1e03a0169828340f4938a50031a6f131404054da60e2db610ea6b',
  'source.json':
    '271ea9e704ac6ced724fdcc0cc016b4f204450878c9aff4b7bc1080a7dc429ef',
};
const sha = (v) => createHash('sha256').update(v).digest('hex');
const fail = () => {
  throw Error('Exact customer-only composition required');
};
const folder = 'proposals/customer-year-composition/';
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
export function materialize(root = process.cwd(), frame = 'proposed') {
  if (!['proposed', 'original'].includes(frame)) fail();
  const q = capture(root),
    out = mkdtempSync(
      join(realpathSync(tmpdir()), 'propel-customer-year-composition-'),
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
