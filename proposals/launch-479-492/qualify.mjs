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
  '31.payload.txt':
    'b5f986d6ad3a1e5c528abd72cc3e398c05bcb05cc7d805c44604447ee22606db',
  '03.payload.txt':
    '93f1d88a9f614504e5647a8d12b0f49f6a5f0e86218b267f8659ecbbabf469dc',
  '16.payload.txt':
    'f12618162eb8bb0e7d74e4f41e1b9b1c7375788834cb98991d7fbca77741ece9',
  '24.payload.txt':
    '4d9d9481dd9db4e3c97b9cafee52b75c4a8d2c2b2fd381551fa7f7358d1ab987',
  '13.payload.txt':
    'fd1f640afb20c5b933d0a5ec6b5607a1732b830211b1b1b7de4eb0719ef03b9c',
  '21.payload.txt':
    'f13179fab5264e9ce4c22261c1a02abd083f56abdba4e5a66b4dfff147ddc0e0',
  'source.json':
    'fc001fd530ffa81b62ce8e481adc2cb31d76fb478acc9a6fd6f1b76917f61570',
  '06.payload.txt':
    '4d8a78a6d41babb6eb36ca54b2de14d40a82439e375e66d5c9e53112efa0b6d3',
  '28.payload.txt':
    'e476ba2e126b8a56dfed5eeca839d081d3193df7feced08cf1540d5916b05fa8',
  '05.payload.txt':
    'a63a605af3b1e03a0169828340f4938a50031a6f131404054da60e2db610ea6b',
  '19.payload.txt':
    '56bc23def7acf53501b3af4cdc599f98de601a5d6e95dda47d583bd0e8400c73',
  '22.payload.txt':
    'e5f0ca4125c015784ae40c8c1eae03391945f21c4d5aab247044c123dd1b0056',
  '10.payload.txt':
    '89cf71e709d94cb9d0c14bd7822f2dec613315dcbac24b05299b3b0ae15ae9f7',
  '09.payload.txt':
    '37cda894f693975377b69350a3c086abdb7afe322b67edaa0f1838ba218250e2',
  '27.payload.txt':
    '1dd283a94bd4a374d058db2cf0225d691be6e5b3180e033b5ef6c47feb3e57a2',
  'admission.patch':
    '0c192248330c2287cf077c4f9333cba247f33472cafef5c61a4164890ced8f23',
  '15.payload.txt':
    '3057cd8b268f24a29dd3a1ec83006254774e26393da1c551845d02ecf4c099b5',
  '32.payload.txt':
    'a2f4dcb279e9eaa6739c9cd5da170204e5a8300ce04a364a1c4f0b63e6e33886',
  '07.payload.txt':
    '49fbbde015b9cf7a92f2bbdb74f7f5c347a63246d63cc7c9a47724858b11922e',
  '29.payload.txt':
    '620713f79f664b3af0ed0dcb93473e3d939e034e202fcfcb50bb31221b1424b7',
  '20.payload.txt':
    'ddf9b5cb015f74732b1a19b50ccf6464ea53aa23c4e81a644a164f8e933b67d1',
  '12.payload.txt':
    '5d8521ae472a2983fb2b450c3ca138811b2f04d7e4c61e4e32772d68c069457d',
  '25.payload.txt':
    '2047ec94b436a722fb1601a169dcfcb1b6dede54e672a939b6e2b5196ecac669',
  '17.payload.txt':
    'c6e62953cbb1e58c8ea1c636ef8f1929cdb46cbf2655fbc2e6015c29f09b5f94',
  '02.payload.txt':
    '50db32661490a3e1d7807bfffcca66dcacda1333e9578c3ab63e3e9984747d23',
  '30.payload.txt':
    '98af655cb91e0bf68a926730bdc192ef9d6cef0c5379498bbd83ef0c06d10aa4',
  'git-source-proof.json':
    '1edea1bc307baca19e9043a3b9e19fa69a00504e3ad56adbfa84260898d9d4c9',
  '01.payload.txt':
    '57262b034ccb9b0080b4466b06f6d6c7392f31ca6c602acc6ea5c0bd67fe81e6',
  '14.payload.txt':
    'fa38a34b7ac3d70a8ec0a3fce9af703fea6d3cb0bf68c589e88dcdb532b2ac57',
  '08.payload.txt':
    'b0fa9bb10ff26b7269606bd82b0c6559028611723eb4a90485173dd0fc113932',
  '26.payload.txt':
    '31f982f491d22c18356fac2c3c6131fbbd572efd13dba49dcef2297efc3d2c1e',
  '11.payload.txt':
    '105f2da765b51f03a5d28c3b565fa31bf9c54602d684e9944599ef4f5487073d',
  '23.payload.txt':
    'a20489d248c508fdacd5fafd1c72da9e4cf4430061c63077cd466d55e7470eff',
  '18.payload.txt':
    'cf28a441f146c5e4d398eb0ea0b78a999dd0f744e19424c46f3e95de74229438',
  '04.payload.txt':
    '5962272679a66e54b6bb30c8cc52502e0703434956f3dfdd68995e3cc233aa13',
};
const sha = (v) => createHash('sha256').update(v).digest('hex');
const fail = () => {
  throw Error('Exact unapplied canonical source admission required');
};
const folder = 'proposals/launch-479-492/';
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
    classification: 'UNAPPLIED_LAUNCH_INTEGRATION_QUALIFICATION_ONLY',
    operationalReady: false,
  };
}
export function materialize(root = process.cwd(), frame = 'proposed') {
  if (!['proposed', 'before'].includes(frame)) fail();
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
  for (const [p, f] of Object.entries(q.m.overlays)) {
    if (frame === 'before') continue;
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
