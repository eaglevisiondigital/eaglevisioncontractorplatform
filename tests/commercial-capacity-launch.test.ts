import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, expect, it } from 'vitest';
// Build/test admission only. No SQL installation, route or financial authority.
const base = '7e25b50537fe66c19f5041e64bd2e59effc544c4';
const author = '565819daffa58d8df25d67be05430b009007d958';
const sql = 'server/payments/commercial-capacity.proposed.sql';
const guard = 'scripts/check-commercial-capacity.mjs';
const pins: Record<string, string> = {
  [sql]: 'a9fc788d6ea486a21207868088c56ca1d45a1b9b15ef29feb4f6d62b018a8aa4',
  [guard]: 'bf4afa37cbe1fcf35c54a735c2ffb270934bc1c4ddee9f1228a58ea7393324bc',
};
const tempRoot = realpathSync(tmpdir());
const env = {
  PATH: '/usr/bin:/bin',
  TMPDIR: tempRoot,
  LANG: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_COUNT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_NO_LAZY_FETCH: '1',
  GIT_ALLOW_PROTOCOL: '',
  GIT_TERMINAL_PROMPT: '0',
};
const git = (...args: string[]) =>
  execFileSync(
    '/usr/bin/git',
    [
      '--no-replace-objects',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.attributesFile=/dev/null',
      '-c',
      'credential.helper=',
      ...args,
    ],
    { env, timeout: 5000, maxBuffer: 64 * 1024 * 1024 },
  );
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
function capture(path: string, mode = '100644') {
  let prefix = '/';
  const parts = resolve(path).split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    prefix = resolve(prefix, parts[i]!);
    const s = lstatSync(prefix);
    if (
      s.isSymbolicLink() ||
      (i < parts.length - 1
        ? !s.isDirectory()
        : !s.isFile() || (s.mode & 0o777) !== parseInt(mode.slice(-3), 8))
    )
      throw Error('Exact capacity composition source required');
  }
  return readFileSync(path);
}
const entries = git('ls-tree', '-rz', base)
  .toString()
  .split('\0')
  .filter(Boolean)
  .map((line) => {
    const [meta, path] = line.split('\t');
    const [mode, type, blob] = meta!.split(' ');
    if (
      type !== 'blob' ||
      !['100644', '100755'].includes(mode!) ||
      !path ||
      path.split('/').some((x) => !x || x === '.' || x === '..')
    )
      throw Error('Exact base tree required');
    return { path, mode: mode!, blob };
  });
function legacyFrame() {
  if (entries.length !== 2438) throw Error('Exact base tree required');
  const files = new Map<string, { bytes: Buffer; mode: string }>();
  for (const { path, mode, blob } of entries) {
    const bytes = capture(path, mode);
    if (
      createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex') !== blob
    )
      throw Error('Exact capacity composition source required');
    files.set(path, { bytes, mode });
  }
  for (const [path, hash] of Object.entries(pins)) {
    const bytes = capture(path);
    if (sha(bytes) !== hash) throw Error('Exact capacity author required');
    files.set(path, { bytes, mode: '100644' });
  }
  return files;
}

// Retain the original 12 cases as historical tests, after separately proving the
// current reviewed union. Never project an unknown source into a valid history.
let immutableCapacityFrame:
  Map<string, { bytes: Buffer; mode: string }> | undefined;
function historicalCapacityFrame() {
  if (immutableCapacityFrame) return immutableCapacityFrame;
  const extra = [guard, sql].map((path) => {
    const text = git('ls-tree', author, '--', path).toString().trim();
    const [meta, name] = text.split('\t');
    const [mode, kind, blob] = meta!.split(' ');
    if (
      name !== path ||
      mode !== '100644' ||
      kind !== 'blob' ||
      !blob ||
      !/^[a-f0-9]{40}$/.test(blob)
    )
      throw Error('Exact capacity history required');
    return { path, mode, blob };
  });
  const wanted = [...entries, ...extra];
  if (
    wanted.some(
      (row) => typeof row.blob !== 'string' || !/^[a-f0-9]{40}$/.test(row.blob),
    )
  )
    throw Error('Exact capacity history required');
  const output = execFileSync(
    '/usr/bin/git',
    [
      '--no-replace-objects',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.attributesFile=/dev/null',
      '-c',
      'credential.helper=',
      'cat-file',
      '--batch',
    ],
    {
      env,
      input: wanted.map((r) => r.blob).join('\n') + '\n',
      timeout: 5000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const result = new Map<string, { bytes: Buffer; mode: string }>();
  let at = 0;
  for (const row of wanted) {
    const nl = output.indexOf(10, at);
    if (nl < at) throw Error('Exact capacity history required');
    const header = output.subarray(at, nl).toString();
    const match = /^([a-f0-9]{40}) blob (0|[1-9][0-9]*)$/.exec(header);
    if (!match || match[1] !== row.blob)
      throw Error('Exact capacity history required');
    const size = Number(match[2]);
    if (!Number.isSafeInteger(size) || size > 64 * 1024 * 1024)
      throw Error('Exact capacity history required');
    const end = nl + 1 + size;
    if (end >= output.length || output[end] !== 10)
      throw Error('Exact capacity history required');
    const bytes = Buffer.from(output.subarray(nl + 1, end));
    if (
      createHash('sha1')
        .update('blob ' + size + '\0')
        .update(bytes)
        .digest('hex') !== row.blob
    )
      throw Error('Exact capacity history required');
    result.set(row.path!, { bytes, mode: row.mode });
    at = end + 1;
  }
  if (at !== output.length || result.size !== 2440)
    throw Error('Exact capacity history required');
  for (const [path, hash] of Object.entries(pins))
    if (sha(result.get(path)!.bytes) !== hash)
      throw Error('Exact capacity history required');
  immutableCapacityFrame = result;
  return result;
}
function frame() {
  const captured = capture(guard),
    digest = sha(captured);
  if (digest === pins[guard]) return legacyFrame();
  if (
    digest !==
    'b5f986d6ad3a1e5c528abd72cc3e398c05bcb05cc7d805c44604447ee22606db'
  )
    throw Error('Exact current capacity successor required');
  const verify = () => {
    if (!capture(guard).equals(captured))
      throw Error('Exact current capacity successor required');
    const script =
      'const m=await import(' +
      JSON.stringify(
        'data:text/javascript;base64,' + captured.toString('base64'),
      ) +
      ');console.log(JSON.stringify(m.checkCommercialCapacity(' +
      JSON.stringify(process.cwd()) +
      ')));';
    const result = JSON.parse(
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        env,
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).toString(),
    );
    if (
      result.sourcePhase !== '492' ||
      result.installationAuthorized !== false ||
      result.financialExecutionAuthorized !== false ||
      !capture(guard).equals(captured)
    )
      throw Error('Exact current capacity successor required');
  };
  verify();
  const historical = historicalCapacityFrame();
  verify();
  return new Map(
    [...historical].map(([path, row]) => [
      path,
      { bytes: Buffer.from(row.bytes), mode: row.mode },
    ]),
  );
}

let privateRoot = '';
let original: ReturnType<typeof frame>;
const run = () =>
  execFileSync(process.execPath, [resolve(privateRoot, guard)], {
    cwd: privateRoot,
    env,
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
beforeAll(() => {
  expect(git('rev-parse', `${base}^{tree}`).toString().trim()).toBe(
    'f255ae9f0665d55fee94387340d84032f1fa25b8',
  );
  expect(git('rev-parse', `${author}^`).toString().trim()).toBe(base);
  expect(git('rev-parse', `${author}^{tree}`).toString().trim()).toBe(
    '749e1e1d02fc2480e5dc39c5c55a39ed52ac5ca8',
  );
  expect(
    git(
      'diff-tree',
      '--no-commit-id',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      '--name-status',
      '-r',
      author,
    )
      .toString()
      .trim(),
  ).toBe(`A\t${guard}\nA\t${sql}`);
  expect(
    sha(
      git(
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        base,
        author,
      ),
    ),
  ).toBe('0322ff6a47e7ba0c6a3823f902a2d7dddcc51bb053c739098cd363c815c00dc6');
  original = frame();
  privateRoot = mkdtempSync(resolve(tempRoot, 'ev-capacity-composed-'));
  for (const [path, { bytes, mode }] of original) {
    const target = resolve(privateRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, { mode: parseInt(mode.slice(-3), 8) });
  }
  // Execute captured, reviewed bytes only after a second complete original read
  // and complete private-image physical validation. Never import a live helper.
  const final = frame();
  for (const [path, { bytes, mode }] of original) {
    expect(final.get(path)!.bytes.equals(bytes)).toBe(true);
    expect(capture(resolve(privateRoot, path), mode).equals(bytes)).toBe(true);
  }
});
afterAll(() => {
  if (privateRoot) rmSync(privateRoot, { recursive: true, force: true });
});
it('admits only the exact original473 source pair while preserving the full invoice/payment launch frame', () => {
  expect(original.size).toBe(2440);
  expect(run()).toContain(
    'Exact commercial capacity source: PASS; operational authority: NONE',
  );
});
it.each([
  sql,
  'server/invoices/commercial-drafts.proposed.sql',
  'proposals/commercial-invoice-issuance/issuance.proposed.sql',
  'server/payments/sandbox.ts',
  'server/payments/control-store.ts',
  'server/customer/broker-auth.ts',
  'scripts/invoice-caller-source-admission.mjs',
  'scripts/payment-response-source-admission.mjs',
  'supabase/migrations/20261015183039_phase_1_foundation.sql',
])(
  'rejects unknown/mixed protected source %s before source admission',
  (path) => {
    const target = resolve(privateRoot, path);
    const b = readFileSync(target);
    try {
      writeFileSync(target, Buffer.concat([b, Buffer.from('\nUNREVIEWED')]));
      expect(run).toThrow(/Exact commercial capacity source required/);
    } finally {
      writeFileSync(target, b);
    }
    expect(run()).toContain('PASS');
  },
);
it('rejects altered SQL permissions without weakening the retained ceiling', () => {
  const target = resolve(privateRoot, sql);
  try {
    chmodSync(target, 0o755);
    expect(run).toThrow(/Exact commercial capacity source required/);
  } finally {
    chmodSync(target, 0o644);
  }
});
it('rejects symlink replacement of a protected ancestor', () => {
  const originalDir = resolve(privateRoot, 'server/payments');
  const moved = originalDir + '-retained';
  try {
    renameSync(originalDir, moved);
    symlinkSync(moved, originalDir, 'dir');
    expect(run).toThrow(/Exact commercial capacity source required/);
  } finally {
    if (lstatSync(originalDir).isSymbolicLink()) rmSync(originalDir);
    renameSync(moved, originalDir);
  }
});
