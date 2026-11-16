// Source-only finite residual integration. No target-code evaluation, Git, installer or network.
import { readFileSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const folder = 'proposals/ui-development-integration/';
const ignored = new Set([
  folder + 'identity.json',
  folder + 'development-integration.patch',
  folder + 'qualify.mjs',
  folder + 'qualify.d.mts',
  folder + 'README.md',
  'tests/ui-development-integration.test.ts',
]);
const artifacts = new Set([
  '.git',
  'node_modules',
  'dist',
  'test-results',
  'playwright-report',
]);
const BEFORE = '2bd9ee546edab4e1d314539e669e7bf650fa89f2',
  AFTER = '7a86790dfb4164503348eefe0fdc5dd6f4f683a6';
const IDENTITY =
    '2849df79eef3d5c72728841faeb776e0c8611853dedb8b037ba4908019911199',
  PATCH = '0d2189262d296c653ac3bae71ce8f884d62ad0a2c180ca6f5383a1f53c39b42b';
const self = fileURLToPath(import.meta.url),
  producer = resolve(dirname(self), '../..'),
  initial = readFileSync(self);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (kind, b) =>
  createHash('sha1')
    .update(Buffer.from(kind + ' ' + b.length + '\0'))
    .update(b)
    .digest('hex');
const deny = () => {
  throw Error('Exact unapplied UI development integration required');
};
function rootAt(root, old) {
  if (
    typeof root !== 'string' ||
    resolve(root) !== root ||
    realpathSync(root) !== root
  )
    deny();
  let p = root;
  for (;;) {
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
function tree(files) {
  const top = new Map();
  for (const [path, x] of files) {
    let node = top;
    const bits = path.split('/');
    for (let i = 0; i < bits.length; i++) {
      const part = bits[i];
      if (!part || part === '.' || part === '..') deny();
      if (i === bits.length - 1) {
        if (node.has(part)) deny();
        node.set(part, x);
      } else {
        if (!node.has(part)) node.set(part, new Map());
        node = node.get(part);
        if (!(node instanceof Map)) deny();
      }
    }
  }
  function hash(node) {
    const rows = [...node]
      .map(([name, value]) => ({ name, dir: value instanceof Map, value }))
      .sort((a, b) =>
        Buffer.compare(
          Buffer.from(a.name + (a.dir ? '/' : '')),
          Buffer.from(b.name + (b.dir ? '/' : '')),
        ),
      );
    return git(
      'tree',
      Buffer.concat(
        rows.map((x) =>
          Buffer.concat([
            Buffer.from((x.dir ? '40000' : x.value.mode) + ' ' + x.name + '\0'),
            Buffer.from(
              x.dir ? hash(x.value) : git('blob', x.value.data),
              'hex',
            ),
          ]),
        ),
      ),
    );
  }
  return hash(top);
}
function capture(root, expected, count, packet) {
  const identity = rootAt(root),
    files = new Map();
  function walk(path, relative) {
    const first = lstatSync(path);
    if (!first.isDirectory() || first.isSymbolicLink()) deny();
    for (const name of readdirSync(path).sort()) {
      const key = relative ? relative + '/' + name : name;
      if (!relative && artifacts.has(name)) continue;
      if (packet && ignored.has(key)) continue;
      const p = join(path, name),
        s = lstatSync(p);
      if (s.isSymbolicLink()) deny();
      if (s.isDirectory()) walk(p, key);
      else {
        if (!s.isFile() || ![0o644, 0o755].includes(s.mode & 0o7777)) deny();
        const data = readFileSync(p),
          last = lstatSync(p);
        if (
          last.ino !== s.ino ||
          last.dev !== s.dev ||
          last.size !== s.size ||
          last.mtimeMs !== s.mtimeMs ||
          last.mode !== s.mode
        )
          deny();
        files.set(key, { mode: s.mode & 0o111 ? '100755' : '100644', data });
      }
    }
    const last = lstatSync(path);
    if (last.dev !== first.dev || last.ino !== first.ino) deny();
  }
  walk(root, '');
  rootAt(root, identity);
  if (files.size !== count || tree(files) !== expected) deny();
  return { root, identity, files };
}
function sealedFile(path) {
  rootAt(dirname(path));
  const first = lstatSync(path);
  if (
    !first.isFile() ||
    first.isSymbolicLink() ||
    (first.mode & 0o777) !== 0o644
  )
    deny();
  const body = readFileSync(path),
    last = lstatSync(path);
  if (
    last.ino !== first.ino ||
    last.dev !== first.dev ||
    last.mode !== first.mode ||
    last.size !== first.size ||
    last.mtimeMs !== first.mtimeMs
  )
    deny();
  return body;
}
function packet() {
  if (!sealedFile(self).equals(initial)) deny();
  rootAt(producer);
  const ib = sealedFile(join(producer, folder + 'identity.json')),
    pb = sealedFile(join(producer, folder + 'development-integration.patch'));
  if (sha(ib) !== IDENTITY || sha(pb) !== PATCH) deny();
  const m = JSON.parse(ib);
  if (
    m.beforeTree !== BEFORE ||
    m.afterTree !== AFTER ||
    m.beforeCount !== 2522 ||
    m.afterCount !== 2531 ||
    m.patchSHA256 !== PATCH ||
    m.protectedSourceMutationAuthorized !== false ||
    m.developmentIntegrationApproved !== false ||
    m.fullFoundationAccepted !== false
  )
    deny();
  if (
    git('commit', Buffer.from(m.baseRawCommit)) !== m.base ||
    !m.baseRawCommit.startsWith('tree ' + BEFORE + '\n')
  )
    deny();
  if (
    m.base !== '999d3017a7f3b37d5f8adc361296a289d2ed366a' ||
    Object.keys(m.paths).length !== 11 ||
    Object.keys(m.alreadyPresent511Endpoints).length !== 4 ||
    m.source514.commit !== '92f44e31b3006fbf77258cdae788aceaf922e2fd' ||
    m.source514.patchSHA256 !==
      '856cd97d2537d82c59fdfcba758745a479dc44c0ea8d5d13a7b5d13d49f1c485' ||
    m.source514.originalPathCount !== 15
  )
    deny();
  for (const entry of Object.values(m.paths))
    if (
      ![
        'd178e4c07b426dd2de4dff6f81a1172b512f4358',
        'c1684b80fc68e44e8f63398f0d32f1cde219ce27',
      ].includes(entry.originCommit)
    )
      deny();
  for (const [path, entry] of Object.entries(m.alreadyPresent511Endpoints))
    if (
      m.paths[path] ||
      entry.originCommit !== '223e235be26c37271cb67e3c1f1803feb54599a6'
    )
      deny();
  return { m, text: new TextDecoder('utf-8', { fatal: true }).decode(pb) };
}
function apply(files, text, m) {
  const out = new Map(
    [...files].map(([p, x]) => [
      p,
      { mode: x.mode, data: Buffer.from(x.data) },
    ]),
  );
  const blocks = text.split(/(?=^--- (?:a\/|\/dev\/null))/m).filter(Boolean);
  if (blocks.length !== 11) deny();
  const seen = new Set();
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.pop() !== '') deny();
    const h = /^\+\+\+ b\/(\S+)$/.exec(lines[1] ?? '');
    if (!h) deny();
    const path = h[1],
      e = m.paths[path];
    if (!e || seen.has(path) || e.after.mode !== '100644') deny();
    seen.add(path);
    if (!e.before && out.has(path)) deny();
    if (
      lines.shift() !== (e.before ? '--- a/' + path : '--- /dev/null') ||
      lines.shift() !== '+++ b/' + path
    )
      deny();
    const previous = out.get(path);
    if (
      e.before &&
      (!previous ||
        previous.mode !== e.before.mode ||
        sha(previous.data) !== e.before.sha256 ||
        git('blob', previous.data) !== e.before.blob)
    )
      deny();
    const old = e.before
      ? new TextDecoder('utf-8', { fatal: true })
          .decode(previous.data)
          .split('\n')
      : [];
    if (e.before && old.pop() !== '') deny();
    let pos = 0;
    const result = [];
    let hunks = 0;
    while (lines.length) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(
        lines.shift() ?? '',
      );
      if (!hunk) deny();
      hunks++;
      const os = Number(hunk[1]),
        oc = Number(hunk[2] ?? 1),
        ns = Number(hunk[3]),
        nc = Number(hunk[4] ?? 1),
        start = oc === 0 ? os : os - 1;
      if (start < pos || start > old.length) deny();
      result.push(...old.slice(pos, start));
      pos = start;
      if (result.length !== (nc === 0 ? ns : ns - 1)) deny();
      let a = 0,
        b = 0;
      while (lines.length && !lines[0].startsWith('@@ ')) {
        const line = lines.shift(),
          kind = line[0],
          body = line.slice(1);
        if (kind === ' ' || kind === '-') {
          if (old[pos++] !== body) deny();
          a++;
        }
        if (kind === ' ' || kind === '+') {
          result.push(body);
          b++;
        } else if (kind !== '-') deny();
      }
      if (a !== oc || b !== nc) deny();
    }
    if (!hunks) deny();
    result.push(...old.slice(pos));
    const data = Buffer.from(result.join('\n') + '\n');
    if (sha(data) !== e.after.sha256 || git('blob', data) !== e.after.blob)
      deny();
    out.set(path, { mode: '100644', data });
  }
  if (seen.size !== 11 || out.size !== 2531 || tree(out) !== AFTER) deny();
  return out;
}
export async function qualifyUIDevelopmentIntegration(root, hook) {
  const p = packet(),
    before = capture(root, BEFORE, 2522, true);
  const check = () => {
    packet();
    rootAt(root, before.identity);
    capture(root, BEFORE, 2522, true);
  };
  check();
  await hook?.('after-capture');
  check();
  const after = apply(before.files, p.text, p.m);
  await hook?.('after-compose');
  check();
  return {
    beforeTree: BEFORE,
    afterTree: AFTER,
    changedPaths: 11,
    afterFixture: new Map(
      [...after].map(([p, x]) => [
        p,
        { mode: x.mode, data: Buffer.from(x.data) },
      ]),
    ),
    check,
  };
}
export async function verifyUIDevelopmentAfterimage(root, hook) {
  packet();
  const first = capture(root, AFTER, 2531, false);
  await hook?.();
  packet();
  rootAt(root, first.identity);
  capture(root, AFTER, 2531, false);
  return { tree: AFTER, files: 2531 };
}
