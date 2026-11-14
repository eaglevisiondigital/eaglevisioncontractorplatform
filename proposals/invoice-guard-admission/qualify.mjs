// Offline qualification only. Canonical files remain untouched.
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devNull } from 'node:os';

const directory = 'proposals/invoice-guard-admission';
const parent = '5f0f17dc9766411b260d5b53fd2db5a925adc80f';
const tree = '868059f16ec4431ee8c8381ddf63fb5ffb1ed9bd';
const evidenceHash =
  'e23de825623031192e5aff45a66c01860211e48f26e5c703cd0cc96375f5d8e5';
const patchHash =
  '2fc927fa37cb8da1ba4eccc8a4ea225ed847e07eadea496130ad61e6c09596cf';
const helperPath = 'scripts/invoice-caller-source-admission.mjs';
const helperHash =
  '1d3438c34656e732c0352dab02477ea449ed4e4abd92714156c3ec62ff75e70a';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = () => {
  throw Error('Exact sealed invoice guard proposal required');
};
const gitEnvironment = Object.freeze({
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_COUNT: '0',
  GIT_ATTR_NOSYSTEM: '1',
  GIT_ALLOW_PROTOCOL: '',
  GIT_NO_LAZY_FETCH: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
});
function git(...args) {
  return execFileSync(
    'git',
    [
      '--no-replace-objects',
      '--no-pager',
      '-c',
      'core.hooksPath=' + devNull,
      '-c',
      'core.fsmonitor=false',
      '-c',
      'credential.helper=',
      ...args,
    ],
    { env: gitEnvironment, stdio: ['ignore', 'pipe', 'pipe'] },
  );
}
let immutableFrame;
function baseline() {
  if (!immutableFrame) {
    if (
      git('rev-parse', parent + '^{tree}')
        .toString()
        .trim() !== tree
    )
      fail();
    immutableFrame = git('ls-tree', '-rz', parent)
      .toString()
      .split('\0')
      .filter(Boolean)
      .map((row) => {
        const [meta, path] = row.split('\t');
        const [mode, type, oid] = meta.split(' ');
        if (!['100644', '100755'].includes(mode) || type !== 'blob') fail();
        return Object.freeze({ mode, oid, path });
      });
    if (immutableFrame.length !== 2421) fail();
    Object.freeze(immutableFrame);
  }
  return immutableFrame;
}
function regular(path, mode, stat) {
  let prefix = '';
  for (const part of path.split('/')) {
    prefix = prefix ? prefix + '/' + part : part;
    const info = stat(prefix);
    if (info.isSymbolicLink()) fail();
    if (prefix !== path && !info.isDirectory()) fail();
  }
  const info = stat(path);
  if (!info.isFile() || (info.mode & 0o777) !== mode) fail();
}
function checked(path, hash, read, stat) {
  regular(path, 0o644, stat);
  const bytes = Buffer.from(read(path));
  if (digest(bytes) !== hash) fail();
  regular(path, 0o644, stat);
  return bytes;
}
function inspect({ read, stat }) {
  const evidence = JSON.parse(
    checked(directory + '/evidence.json', evidenceHash, read, stat),
  );
  checked(directory + '/admission.patch', patchHash, read, stat);
  if (
    evidence.parent !== parent ||
    evidence.patchSha256 !== patchHash ||
    evidence.files.length !== 10 ||
    evidence.admissionAuthorized !== false
  )
    fail();
  const payloads = new Map();
  for (const row of evidence.files) {
    if (row.mode !== '100644' || payloads.has(row.path)) fail();
    payloads.set(
      row.path,
      checked(directory + '/payload/' + row.path, row.after, read, stat),
    );
  }
  if (digest(payloads.get(helperPath)) !== helperHash) fail();
  for (const row of evidence.fixtureFiles)
    checked(row.path, row.sha256, read, stat);
  const targets = new Map(evidence.files.map((row) => [row.path, row]));
  const phases = new Set();
  for (const row of baseline()) {
    regular(row.path, row.mode === '100644' ? 0o644 : 0o755, stat);
    const bytes = Buffer.from(read(row.path));
    const target = targets.get(row.path);
    if (target) {
      const hash = digest(bytes);
      if (hash === target.before) phases.add('before');
      else if (hash === target.after) phases.add('after');
      else fail();
    } else {
      const oid = createHash('sha1')
        .update(Buffer.from('blob ' + bytes.length + '\0'))
        .update(bytes)
        .digest('hex');
      if (oid !== row.oid) fail();
    }
    regular(row.path, row.mode === '100644' ? 0o644 : 0o755, stat);
  }
  if (phases.size !== 1) fail();
  return { payloads, phase: [...phases][0] };
}
const key = (path) =>
  relative(
    process.cwd(),
    path instanceof URL ? fileURLToPath(path) : resolve(String(path)),
  );

export async function qualifyInvoiceGuardProposal({
  read = readFileSync,
  stat = lstatSync,
} = {}) {
  const captured = inspect({ read, stat });
  const bytes = Buffer.from(captured.payloads.get(helperPath));
  const helper = await import(
    'data:text/javascript;base64,' + bytes.toString('base64')
  );
  const inspectCaptured = () => {
    const current = inspect({ read, stat });
    if (current.phase !== captured.phase) fail();
    return current;
  };
  // Import is an await boundary. Source and packet reads stay fresh.
  inspectCaptured();
  const readCurrent = (path, encoding) => {
    const bytes = captured.payloads.get(key(path));
    if (!bytes) return read(path, encoding);
    return encoding
      ? bytes.toString(
          typeof encoding === 'string' ? encoding : encoding.encoding,
        )
      : Buffer.from(bytes);
  };
  const check = () => {
    inspectCaptured();
    const result = helper.verifyInvoiceGuardFrame({ readCurrent, stat });
    // The helper performs further current/history reads. Recheck the full frame.
    inspectCaptured();
    return result;
  };
  check();
  return Object.freeze({
    classification: 'UNAPPLIED_OFFLINE_QUALIFICATION_ONLY',
    parent,
    canonicalPhase: captured.phase,
    helper,
    readCurrent,
    stat,
    check,
    admissionAuthorized: false,
    sqlInstallation: 'NOT_RUN',
  });
}
