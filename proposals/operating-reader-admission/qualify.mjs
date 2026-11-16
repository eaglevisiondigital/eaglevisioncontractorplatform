// Offline finite source qualification; no import/evaluation of target code,
// Git process, installer, database, Auth, provider or application activation.
import { readFileSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const folder = 'proposals/operating-reader-admission/';
const target = 'proposals/commercial-customer-operating-reader/source.ts';
const packetPaths = new Set([
  folder + 'qualify.mjs',
  folder + 'qualify.d.mts',
  folder + 'identity.json',
  folder + 'guard.proposed.txt',
  folder + 'guard.patch',
  folder + 'README.md',
  'tests/operating-reader-admission.test.ts',
]);
const AUTHOR = '5030bb834423fc572eb770d077739300477fd1e3';
const PARENT = 'fbab4220a5e8fb043c10baa1328bbe6f7001e588';
const BEFORE =
  '984fefa405e00933e62e3c865ceb721302ba29b05f3aabb2f4be37c1b7455b9d';
const AFTER =
  'dd44ddb140d1f38cafdf033e3dca4f290191dcb52468525e3f599f88b3d7f071';
const PATCH =
  '7955b6f528069465755614ce7d7644593fc2df3b9aa56ee4fdf66081285d147e';
const IDENTITY =
  '4dff8b7eb9356ba1069b33c9385a790d1924f59c900c6fda7a50a913a481919b';
const ORIGINAL_TREE = '4ffa570bcbe5e0c38794f8dc7802990580a3a4fd';
const PROPOSED_TREE = 'd784d50cb0042fbeb6fe23d8b89051d7a026851d';
const modulePath = fileURLToPath(import.meta.url),
  packetRoot = resolve(dirname(modulePath), '../..');
const initial = readFileSync(modulePath);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const object = (kind, b) =>
  createHash('sha1')
    .update(Buffer.from(kind + ' ' + b.length + '\0'))
    .update(b)
    .digest('hex');
const deny = () => {
  throw Error('Exact held #503 source admission required');
};
function rootInfo(root, old) {
  if (
    typeof root !== 'string' ||
    resolve(root) !== root ||
    realpathSync(root) !== root
  )
    deny();
  let p = root;
  while (true) {
    const s = lstatSync(p);
    if (s.isSymbolicLink() || !s.isDirectory()) deny();
    const q = dirname(p);
    if (p === q) break;
    p = q;
  }
  const s = lstatSync(root);
  if (old && (old.dev !== s.dev || old.ino !== s.ino)) deny();
  return s;
}
function file(root, path) {
  let p = root;
  const bits = path.split('/');
  for (let i = 0; i < bits.length; i++) {
    p = join(p, bits[i]);
    const s = lstatSync(p);
    if (s.isSymbolicLink() || (i < bits.length - 1 && !s.isDirectory())) deny();
  }
  const s = lstatSync(p);
  if (!s.isFile() || ![0o644, 0o755].includes(s.mode & 0o777)) deny();
  const bytes = readFileSync(p);
  const again = lstatSync(p);
  if (
    again.isSymbolicLink() ||
    again.dev !== s.dev ||
    again.ino !== s.ino ||
    again.mode !== s.mode ||
    again.size !== s.size
  )
    deny();
  return { mode: (s.mode & 0o777) === 0o644 ? '100644' : '100755', bytes };
}
function packet() {
  rootInfo(packetRoot);
  if (modulePath !== join(packetRoot, folder + 'qualify.mjs')) deny();
  const self = file(packetRoot, folder + 'qualify.mjs');
  if (self.mode !== '100644' || !self.bytes.equals(initial)) deny();
  const values = {};
  for (const [p, h] of [
    ['identity.json', IDENTITY],
    ['guard.proposed.txt', AFTER],
    ['guard.patch', PATCH],
  ]) {
    const f = file(packetRoot, folder + p);
    if (f.mode !== '100644' || sha(f.bytes) !== h) deny();
    values[p] = f.bytes;
  }
  const id = JSON.parse(values['identity.json'].toString());
  if (
    id.author !== AUTHOR ||
    id.parent !== PARENT ||
    id.target !== target ||
    id.mode !== '100644' ||
    id.before !== BEFORE ||
    id.after !== AFTER ||
    id.patch !== PATCH ||
    id.canonicalFHGChanged !== false ||
    id.operationalReady !== false
  )
    deny();
  for (const commit of [AUTHOR, PARENT]) {
    const raw = Buffer.from(id.commits[commit]);
    if (object('commit', raw) !== commit) deny();
    if (
      commit === AUTHOR &&
      (!raw
        .toString()
        .startsWith('tree ' + ORIGINAL_TREE + '\nparent ' + PARENT + '\n') ||
        raw
          .toString()
          .split('\n\n')[0]
          .split('\n')
          .filter((l) => l.startsWith('parent ')).length !== 1)
    )
      deny();
  }
  return values;
}
function tree(entries) {
  const top = new Map();
  for (const [path, row] of entries) {
    let node = top;
    const parts = path.split('/');
    for (const p of parts.slice(0, -1)) {
      if (!node.has(p)) node.set(p, new Map());
      node = node.get(p);
      if (!(node instanceof Map)) deny();
    }
    node.set(parts.at(-1), row);
  }
  const build = (node) => {
    const parts = [...node]
      .map(([name, v]) => ({ name, dir: v instanceof Map, value: v }))
      .sort((a, b) =>
        Buffer.compare(
          Buffer.from(a.name + (a.dir ? '/' : '')),
          Buffer.from(b.name + (b.dir ? '/' : '')),
        ),
      );
    const b = Buffer.concat(
      parts.map(({ name, dir, value }) =>
        Buffer.concat([
          Buffer.from((dir ? '40000' : value.mode) + ' ' + name + '\0'),
          Buffer.from(dir ? build(value) : object('blob', value.bytes), 'hex'),
        ]),
      ),
    );
    return object('tree', b);
  };
  return build(top);
}
function snapshot(root, phase, info) {
  rootInfo(root, info);
  const rows = new Map();
  const walk = (dir, prefix = '') => {
    for (const name of readdirSync(dir)) {
      const path = prefix + name;
      // Only checkout metadata/dependencies and these seven ordinary packet files
      // are outside the exact authored source frame. No .staging/artifact fallback.
      if (!prefix && ['.git', 'node_modules'].includes(name)) continue;
      if (packetPaths.has(path)) continue;
      const stat = lstatSync(join(root, path));
      if (stat.isSymbolicLink()) deny();
      if (stat.isDirectory()) walk(join(root, path), path + '/');
      else rows.set(path, file(root, path));
    }
  };
  walk(root);
  if (
    rows.size !== 2479 ||
    rows.get(target)?.mode !== '100644' ||
    sha(rows.get(target).bytes) !== (phase === 'original' ? BEFORE : AFTER) ||
    tree(rows) !== (phase === 'original' ? ORIGINAL_TREE : PROPOSED_TREE)
  )
    deny();
  rootInfo(root, info);
  return rows;
}
/** Returns source evidence only. The optional boundary callback is a trusted test
 * harness seam; target bytes are never imported or run. No permission is granted. */
export async function qualifyOperatingAdmission(
  root,
  phase = 'original',
  boundary,
) {
  if (
    !['original', 'proposed'].includes(phase) ||
    (boundary !== undefined && typeof boundary !== 'function')
  )
    deny();
  const info = rootInfo(root),
    p = packet(),
    first = snapshot(root, phase, info);
  await boundary?.('after-capture');
  packet();
  snapshot(root, phase, info);
  await boundary?.('before-return');
  packet();
  snapshot(root, phase, info);
  // Captured buffers are private fixture data, not an executable loader grant.
  const fixture = Object.fromEntries(
    [...first].map(([path, row]) => [
      path,
      { mode: row.mode, bytes: Buffer.from(row.bytes) },
    ]),
  );
  return Object.freeze({
    classification: 'QUALIFIED_SOURCE_ONLY_OPERATIONAL_HELD',
    author: AUTHOR,
    parent: PARENT,
    phase,
    files: 2479,
    sourceTree: phase === 'original' ? ORIGINAL_TREE : PROPOSED_TREE,
    guardPatchSHA256: PATCH,
    canonicalFHGChanged: false,
    installationAuthorized: false,
    operationalReady: false,
    fixture,
    proposedGuard: Buffer.from(p['guard.proposed.txt']),
  });
}
