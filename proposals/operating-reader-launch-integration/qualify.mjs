// Finite offline source integration only. No Git process, target-code evaluation,
// installer, database, Auth, provider, credential or route capability.
import { readFileSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const folder = 'proposals/operating-reader-launch-integration/';
const ignored = new Set([
  folder + 'qualify.mjs',
  folder + 'qualify.d.mts',
  folder + 'identity.json',
  folder + 'integration.patch',
  folder + 'README.md',
  folder + 'native-connection-characterization.proposed.txt',
  'tests/operating-reader-launch-integration.test.ts',
]);
const BASE = 'fbab4220a5e8fb043c10baa1328bbe6f7001e588',
  MID = '5030bb834423fc572eb770d077739300477fd1e3',
  AUTHOR = 'ff41ed204ddc3d19d356c3af6dfc1e56db77a457';
const BEFORE = '1adab30c7261d7e03a051ef5827114a86c7bd0f7',
  AFTER = 'd784d50cb0042fbeb6fe23d8b89051d7a026851d';
const IDENTITY =
    '8bd1eea1051bd8dd8a68f6dfcf23d874e3d4aeb53ae649f02e2f102ef79f3991',
  PATCH = '91e5c286ab610814655497e86cd68b70a3fac7902e90ee028eb1d47c1025f013';
const modulePath = fileURLToPath(import.meta.url),
  producer = resolve(dirname(modulePath), '../..'),
  initial = readFileSync(modulePath);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (type, b) =>
  createHash('sha1')
    .update(Buffer.from(type + ' ' + b.length + '\0'))
    .update(b)
    .digest('hex');
const deny = () => {
  throw Error('Exact unapplied 506-to-500 integration required');
};
function rootAt(root, old) {
  if (
    typeof root !== 'string' ||
    resolve(root) !== root ||
    realpathSync(root) !== root
  )
    deny();
  let p = root;
  while (true) {
    const s = lstatSync(p);
    if (!s.isDirectory() || s.isSymbolicLink()) deny();
    const q = dirname(p);
    if (q === p) break;
    p = q;
  }
  const s = lstatSync(root);
  if (old && (s.dev !== old.dev || s.ino !== old.ino)) deny();
  return s;
}
function leaf(root, path) {
  if (
    !path ||
    path.includes('\\') ||
    path
      .split('/')
      .some(
        (p) =>
          !p ||
          p === '.' ||
          p === '..' ||
          [...p].some((c) => c.charCodeAt(0) < 32),
      )
  )
    deny();
  let p = root;
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    p = join(p, parts[i]);
    const s = lstatSync(p);
    if (s.isSymbolicLink() || (i < parts.length - 1 && !s.isDirectory()))
      deny();
  }
  const s = lstatSync(p);
  if (!s.isFile() || ![0o644, 0o755].includes(s.mode & 0o777)) deny();
  const b = readFileSync(p),
    t = lstatSync(p);
  if (
    t.isSymbolicLink() ||
    t.ino !== s.ino ||
    t.dev !== s.dev ||
    t.mode !== s.mode ||
    t.size !== s.size
  )
    deny();
  return { mode: (s.mode & 0o777) === 0o644 ? '100644' : '100755', bytes: b };
}
function trees(rows) {
  const top = new Map();
  for (const [path, value] of rows) {
    let n = top;
    const parts = path.split('/');
    for (const p of parts.slice(0, -1)) {
      if (!n.has(p)) n.set(p, new Map());
      n = n.get(p);
      if (!(n instanceof Map)) deny();
    }
    if (n.has(parts.at(-1))) deny();
    n.set(parts.at(-1), value);
  }
  const build = (n) =>
    git(
      'tree',
      Buffer.concat(
        [...n]
          .map(([name, v]) => ({ name, v, d: v instanceof Map }))
          .sort((a, b) =>
            Buffer.compare(
              Buffer.from(a.name + (a.d ? '/' : '')),
              Buffer.from(b.name + (b.d ? '/' : '')),
            ),
          )
          .map(({ name, v, d }) =>
            Buffer.concat([
              Buffer.from((d ? '40000' : v.mode) + ' ' + name + '\0'),
              Buffer.from(d ? build(v) : git('blob', v.bytes), 'hex'),
            ]),
          ),
      ),
    );
  return build(top);
}
function snapshot(root, kind, info) {
  rootAt(root, info);
  const rows = new Map();
  function walk(prefix = '') {
    for (const name of readdirSync(join(root, prefix))) {
      const p = prefix + name;
      if (!prefix && ['.git', 'node_modules'].includes(name)) continue;
      if (kind === 'before' && ignored.has(p)) continue;
      const s = lstatSync(join(root, p));
      if (s.isSymbolicLink()) deny();
      if (s.isDirectory()) walk(p + '/');
      else rows.set(p, leaf(root, p));
    }
  }
  walk();
  if (
    rows.size !== (kind === 'before' ? 2468 : 2479) ||
    trees(rows) !== (kind === 'before' ? BEFORE : AFTER)
  )
    deny();
  rootAt(root, info);
  return rows;
}
function packet() {
  rootAt(producer);
  if (modulePath !== join(producer, folder + 'qualify.mjs')) deny();
  const self = leaf(producer, folder + 'qualify.mjs');
  if (self.mode !== '100644' || !self.bytes.equals(initial)) deny();
  const a = leaf(producer, folder + 'identity.json'),
    b = leaf(producer, folder + 'integration.patch');
  if (
    a.mode !== '100644' ||
    b.mode !== '100644' ||
    sha(a.bytes) !== IDENTITY ||
    sha(b.bytes) !== PATCH
  )
    deny();
  const m = JSON.parse(a.bytes);
  if (
    m.base !== BASE ||
    m.author !== AUTHOR ||
    m.authorParent !== MID ||
    m.baseTree !== BEFORE ||
    m.authorTree !== AFTER ||
    m.patchSHA256 !== PATCH ||
    m.launchIntegrationAuthorized !== false ||
    m.installationAuthorized !== false ||
    m.operationalReady !== false ||
    m.preservedRuntimePins !== 44
  )
    deny();
  for (const [id, parent, tree] of [
    [BASE, 'd162372c321039f49c1d168bbde8c041b872c182', BEFORE],
    [MID, BASE, '4ffa570bcbe5e0c38794f8dc7802990580a3a4fd'],
    [AUTHOR, MID, AFTER],
  ]) {
    const raw = Buffer.from(m.commits[id]);
    if (git('commit', raw) !== id) deny();
    const h = raw.toString().split('\n\n')[0].split('\n');
    if (
      h[0] !== 'tree ' + tree ||
      h.filter((x) => x.startsWith('parent ')).join('\n') !== 'parent ' + parent
    )
      deny();
  }
  const tail = leaf(
    producer,
    folder + 'native-connection-characterization.proposed.txt',
  );
  if (
    tail.mode !== '100644' ||
    sha(tail.bytes) !== m.qualificationOnlyConnectionCharacterization.tailSHA256
  )
    deny();
  return { m, patch: b.bytes };
}
function additions(m, patch) {
  const s = patch.toString('utf8');
  if (!Buffer.from(s).equals(patch)) deny();
  const blocks = s.split(/(?=^diff --git )/m).filter(Boolean),
    out = new Map();
  if (blocks.length !== 11 || Object.keys(m.additions).length !== 11) deny();
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.pop() !== '') deny();
    const match = /^diff --git a\/(.+) b\/\1$/.exec(lines[0]);
    if (!match) deny();
    const path = match[1],
      e = m.additions[path];
    if (
      !e ||
      out.has(path) ||
      path.includes('\\') ||
      path.split('/').some((p) => !p || p === '.' || p === '..')
    )
      deny();
    const index = /^index (0{40})\.\.([a-f0-9]{40})$/.exec(lines[2]),
      hunk = /^@@ -0,0 \+1(?:,([0-9]+))? @@$/.exec(lines[5]);
    if (
      lines[1] !== 'new file mode 100644' ||
      !index ||
      index[2] !== e.blob ||
      lines[3] !== '--- /dev/null' ||
      lines[4] !== '+++ b/' + path ||
      !hunk ||
      lines.slice(6).some((l) => !l.startsWith('+')) ||
      lines.length - 6 !== Number(hunk[1] || 1) ||
      e.mode !== '100644'
    )
      deny();
    const bytes = Buffer.from(
      lines
        .slice(6)
        .map((l) => l.slice(1))
        .join('\n') + '\n',
    );
    if (sha(bytes) !== e.sha256 || git('blob', bytes) !== e.blob) deny();
    out.set(path, { mode: '100644', bytes });
  }
  return out;
}
function copy(rows) {
  return Object.fromEntries(
    [...rows].map(([p, r]) => [
      p,
      { mode: r.mode, bytes: Buffer.from(r.bytes) },
    ]),
  );
}
/** Trusted optional test checkpoints exercise withdrawal. Captured fixtures are
 * data only and never a runtime loader, admission grant or executable capability. */
export async function qualifyReaderIntegration(root, boundary) {
  if (boundary !== undefined && typeof boundary !== 'function') deny();
  const info = rootAt(root),
    p = packet(),
    before = snapshot(root, 'before', info);
  await boundary?.('after-capture');
  packet();
  snapshot(root, 'before', info);
  const after = new Map(before);
  for (const [path, row] of additions(p.m, p.patch)) {
    if (after.has(path)) deny();
    after.set(path, row);
  }
  if (after.size !== 2479 || trees(after) !== AFTER) deny();
  await boundary?.('after-compose');
  packet();
  snapshot(root, 'before', info);
  return Object.freeze({
    classification: 'UNAPPLIED_DEVELOPMENT_SOURCE_ONLY',
    base: BASE,
    author: AUTHOR,
    beforeTree: BEFORE,
    afterTree: AFTER,
    additions: 11,
    patchSHA256: PATCH,
    operationalReady: false,
    installationAuthorized: false,
    launchIntegrationAuthorized: false,
    beforeFixture: copy(before),
    afterFixture: copy(after),
  });
}
export async function verifyReaderIntegrationImage(root, boundary) {
  if (boundary !== undefined && typeof boundary !== 'function') deny();
  const info = rootAt(root);
  packet();
  snapshot(root, 'after', info);
  await boundary?.('after-image-audit');
  packet();
  snapshot(root, 'after', info);
  return Object.freeze({ tree: AFTER, files: 2479, operationalReady: false });
}
