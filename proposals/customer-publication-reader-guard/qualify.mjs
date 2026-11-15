// Offline source evidence only. No import/evaluation, Auth, SQL or permission operation.
import {
  readFileSync,
  lstatSync,
  realpathSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const folder = 'proposals/customer-publication-reader-guard/';
const seals = {
  'source.json':
    '5f095ae7db6f47cd6684fe914d48d513834f53e292bebb34131e874c1659b229',
  'guard-author.patch':
    '997565f12abfe9f57b829eb8fc5e3d0b2dfc9fab2527d47c6f363d3bf34178e0',
  'model.proposed.txt':
    'b13110a78d0c5a683c4903c48e571c50dcaa1cc73dfc2951f9cd1664222a3b6e',
  'git-source-proof.json':
    '6b8454db9064a30dcf1a949675185a1e497b65290bbd753ed4bf0fc52dac8162',
  'guard.proposed.txt':
    '77f8fc84bcbb1d877a54d69ecd356a5381eb54b6f7c34e0f8f561145c44f9508',
};
const fail = () => {
  throw Error('Exact unapplied publication reader after-source image required');
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
const BASE = 'ada783cbb256f871d2a508b05f3411c587038aba';
const PARENT = 'da1e42d5d9c00cc51c60e7e35016bfc1067ce1b7';
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
  const packet = () => {
    for (const [name, h] of Object.entries(seals)) {
      const b = physical(root, folder + name);
      if (sha(b) !== h) fail();
      if (!files[name]) files[name] = b;
    }
  };
  packet();
  const manifest = JSON.parse(files['source.json']);
  if (
    manifest.base !== BASE ||
    manifest.baseParent !== PARENT ||
    manifest.baseEntries !== 2477 ||
    manifest.a2SourceAuthor !== null ||
    manifest.guardAuthor !== null ||
    manifest.guardAuthorParent !== null ||
    manifest.installationAuthorized !== false ||
    manifest.sourceAdmissionAuthorized !== false ||
    manifest.operationalReady !== false
  )
    fail();
  const proof = sourceObjects(files['git-source-proof.json']);
  const base = proof.tree(
    manifest.base,
    manifest.baseTree,
    manifest.baseParent,
  );
  if (base.length !== manifest.baseEntries) fail();
  let bodies = [];
  const current = () => {
    exactRoot(root);
    const result = [];
    for (const r of base) {
      let path = root;
      for (const part of r.path.split('/')) {
        path = join(path, part);
        if (lstatSync(path).isSymbolicLink()) fail();
      }
      const s = lstatSync(path),
        b = readFileSync(path);
      if (
        !s.isFile() ||
        (s.mode & 0o777) !== parseInt(r.mode.slice(-3), 8) ||
        createHash('sha1')
          .update(Buffer.concat([Buffer.from('blob ' + b.length + '\0'), b]))
          .digest('hex') !== r.oid
      )
        fail();
      result.push(b);
    }
    bodies = result;
    for (const p of Object.keys(manifest.canonicalSql)) {
      try {
        lstatSync(join(root, p));
      } catch (e) {
        if (e?.code === 'ENOENT') continue;
        throw e;
      }
      fail();
    }
  };
  current();
  const sql = {};
  for (const [p, spec] of Object.entries(manifest.canonicalSql)) {
    const index = base.findIndex((r) => r.path === spec.source);
    if (
      index < 0 ||
      base[index].mode !== spec.mode ||
      sha(bodies[index]) !== spec.sha256
    )
      fail();
    sql[p] = bodies[index];
  }
  if (
    sha(files['guard.proposed.txt']) !== manifest.guardAfterSHA256 ||
    sha(files['guard-author.patch']) !== manifest.guardPatchSHA256
  )
    fail();
  current();
  packet();
  current();
  exactRoot(root);
  return {
    root,
    manifest,
    base,
    bodies,
    files,
    sql,
    classification: 'UNAPPLIED_AFTER_SOURCE_QUALIFICATION_ONLY',
    operationalReady: false,
  };
}
export function materialize(root = process.cwd()) {
  const q = capture(root);
  const directory = mkdtempSync(
    join(realpathSync(tmpdir()), 'publication-after-source-'),
  );
  const identity = lstatSync(directory);
  const rootCurrent = () => {
    const info = lstatSync(directory);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.dev !== identity.dev ||
      info.ino !== identity.ino ||
      realpathSync(directory) !== directory
    )
      fail();
  };
  try {
    const outputs = new Map(
      q.base.map((r, i) => [
        r.path,
        { bytes: q.bodies[i], mode: parseInt(r.mode.slice(-3), 8) },
      ]),
    );
    outputs.set(q.manifest.guardTarget, {
      bytes: q.files['guard.proposed.txt'],
      mode: 0o644,
    });
    for (const [p, bytes] of Object.entries(q.sql))
      outputs.set(p, { bytes, mode: 0o644 });
    outputs.set(q.manifest.modelPath, {
      bytes: q.files['model.proposed.txt'],
      mode: 0o644,
    });
    for (const [p, row] of outputs) {
      rootCurrent();
      const path = join(directory, p);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, row.bytes, { mode: row.mode });
    }
    const imageCurrent = () => {
      rootCurrent();
      const seen = new Set();
      const walk = (relative = '') => {
        for (const entry of readdirSync(join(directory, relative), {
          withFileTypes: true,
        })) {
          const name = relative ? relative + '/' + entry.name : entry.name;
          const path = join(directory, name),
            info = lstatSync(path);
          if (info.isSymbolicLink()) fail();
          if (info.isDirectory()) walk(name);
          else {
            const expected = outputs.get(name);
            if (
              !info.isFile() ||
              !expected ||
              (info.mode & 0o777) !== expected.mode ||
              !readFileSync(path).equals(expected.bytes)
            )
              fail();
            seen.add(name);
          }
        }
      };
      walk();
      if (seen.size !== outputs.size) fail();
      rootCurrent();
    };
    imageCurrent();
    capture(root);
    imageCurrent();
    return {
      directory,
      classification: q.classification,
      operationalReady: false,
    };
  } catch (error) {
    // Remove only the root this function created. An unknown replacement is never traversed.
    const info = lstatSync(directory);
    if (
      info.isDirectory() &&
      !info.isSymbolicLink() &&
      info.dev === identity.dev &&
      info.ino === identity.ino
    )
      rmSync(directory, { recursive: true, force: true });
    else
      throw Error('Publication source image cleanup remains unresolved', {
        cause: error,
      });
    throw error;
  }
}
