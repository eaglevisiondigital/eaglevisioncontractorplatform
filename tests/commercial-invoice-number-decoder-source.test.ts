import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { captureNumberDecoder } from '../proposals/commercial-invoice-number-decoder/qualify.mjs';
const root = process.cwd(),
  folder = 'proposals/commercial-invoice-number-decoder/';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const env = {
  PATH: '/usr/bin:/bin',
  TMPDIR: realpathSync(tmpdir()),
  LANG: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_COUNT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_NO_LAZY_FETCH: '1',
  GIT_ALLOW_PROTOCOL: '',
  GIT_TERMINAL_PROMPT: '0',
};
const git = (cwd: string, ...args: string[]) =>
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
    {
      cwd,
      env,
      timeout: 5000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
function stage(
  parent: string,
  patch: string,
  target: string,
  expected: string,
) {
  const temp = mkdtempSync(
    resolve(realpathSync(tmpdir()), 'ev-number-decoder-frame-'),
  );
  const archive = git(root, 'archive', parent);
  execFileSync('/usr/bin/tar', ['-xf', '-', '-C', temp], {
    input: archive,
    env,
    timeout: 5000,
  });
  const artifact = resolve(temp, 'qualified.patch');
  writeFileSync(artifact, patch);
  git(temp, 'apply', '--check', artifact);
  git(temp, 'apply', artifact);
  rmSync(artifact);
  for (const row of git(root, 'ls-tree', '-rz', parent)
    .toString()
    .split('\0')
    .filter(Boolean)) {
    const [meta, path] = row.split('\t'),
      [mode, , blob] = meta!.split(' ');
    const f = resolve(temp, path!),
      b = readFileSync(f);
    for (let p = f; p !== '/'; p = dirname(p))
      expect(lstatSync(p).isSymbolicLink()).toBe(false);
    expect((lstatSync(f).mode & 0o777).toString(8)).toBe(mode!.slice(-3));
    if (path === target) expect(sha(b)).toBe(expected);
    else
      expect(
        createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'),
      ).toBe(blob);
  }
  return temp;
}
it('qualifies two separate exact-parent one-file source-author patches; neither author/admission/integration is invented', () => {
  const q = captureNumberDecoder(root);
  expect(q.parentEntries).toBe(2455);
  expect(q.sourceAuthor).toBeNull();
  expect(q.connectionAdmission).toBe('HELD');
  expect(q.installationAuthorized || q.operationalReady).toBe(false);
  const server = stage(q.parent, q.patch, q.target, sha(Buffer.from(q.source)));
  const client = stage(
    q.customerParent,
    q.customerPatch,
    'src/components/invoices/commercial-customer-read.ts',
    sha(Buffer.from(q.customerSource)),
  );
  try {
    expect(readFileSync(resolve(server, q.target), 'utf8')).toBe(q.source);
    expect(
      readFileSync(
        resolve(client, 'src/components/invoices/commercial-customer-read.ts'),
        'utf8',
      ),
    ).toBe(q.customerSource);
  } finally {
    rmSync(server, { recursive: true, force: true });
    rmSync(client, { recursive: true, force: true });
  }
});
it('the unchanged historical connection guard still rejects even the exact proposed presenter until separate source admission', () => {
  const q = captureNumberDecoder(root),
    temp = mkdtempSync(
      resolve(realpathSync(tmpdir()), 'ev-number-decoder-guard-'),
    );
  try {
    for (const x of q.material.connectionSources) {
      const f = resolve(temp, x.path);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, x.source, { mode: 0o644 });
    }
    const code = ts.transpileModule(q.material.connectionGuard, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    writeFileSync(
      resolve(temp, 'guard.mjs'),
      code + '\nassertConnectionSources();\n',
    );
    const run = () =>
      execFileSync(process.execPath, [resolve(temp, 'guard.mjs')], {
        cwd: temp,
        env,
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    expect(() => run()).not.toThrow();
    writeFileSync(resolve(temp, q.target), q.source);
    expect(run).toThrow(/Exact reviewed invoice source required/);
    writeFileSync(resolve(temp, q.target), q.material.originalPresenter);
    expect(() => run()).not.toThrow();
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
it.each([
  'source.json',
  'source-author.patch',
  'presentation.proposed.ts',
  'customer-author.patch',
  'customer-read.proposed.txt',
])('rejects unknown %s before proposed code compilation', (name) => {
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    return String(p) === resolve(root, folder + name)
      ? Buffer.concat([b, Buffer.from('\nUNKNOWN')])
      : b;
  }) as typeof readFileSync;
  expect(() => captureNumberDecoder(root, { read })).toThrow();
});
it('rejects coordinated manifest/source rebinding and invented author identities', () => {
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    if (String(p) === resolve(root, folder + 'source.json')) {
      const m = JSON.parse(b.toString());
      m.afterSha256 = sha(Buffer.from('UNKNOWN'));
      m.sourceAuthorCommit = 'f'.repeat(40);
      return Buffer.from(JSON.stringify(m));
    }
    return b;
  }) as typeof readFileSync;
  expect(() => captureNumberDecoder(root, { read })).toThrow();
});
it.each([
  'proposals/commercial-invoice-issuance/presentation.ts',
  'proposals/commercial-invoice-year-numbering/numbering.proposed.sql',
  'proposals/commercial-invoice-connection/source.ts',
  'server/customer/broker-auth.ts',
  'server/invoices/commercial-draft-client.ts',
])('denies unknown or mixed original frame %s', (target) => {
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    return String(p) === resolve(root, target)
      ? Buffer.concat([b, Buffer.from('\nUNREVIEWED')])
      : b;
  }) as typeof readFileSync;
  expect(() => captureNumberDecoder(root, { read })).toThrow();
});
it.each(['symlink', 'directory', 'mode'] as const)(
  'denies %s proposed code before evaluation',
  (kind) => {
    const stat = ((p: Parameters<typeof lstatSync>[0]) => {
      const info = lstatSync(p);
      if (String(p) !== resolve(root, folder + 'presentation.proposed.ts'))
        return info;
      return new Proxy(info, {
        get(o, k) {
          if (k === 'isSymbolicLink' && kind === 'symlink') return () => true;
          if (k === 'isFile' && kind === 'directory') return () => false;
          if (k === 'mode' && kind === 'mode') return 0o666;
          return Reflect.get(o, k);
        },
      });
    }) as typeof lstatSync;
    expect(() => captureNumberDecoder(root, { stat })).toThrow();
  },
);
it('denies a prior source withdrawn by the last proposal seal', () => {
  let n = 0,
    withdrawn = false;
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    if (
      String(p) === resolve(root, folder + 'customer-read.proposed.txt') &&
      ++n === 2
    )
      withdrawn = true;
    return withdrawn &&
      String(p) === resolve(root, 'server/customer/broker-auth.ts')
      ? Buffer.concat([b, Buffer.from('WITHDRAWN')])
      : b;
  }) as typeof readFileSync;
  expect(() => captureNumberDecoder(root, { read })).toThrow();
  expect(withdrawn).toBe(true);
});
it.each([
  ['proposals/commercial-invoice-issuance/presentation.ts', 3],
  ['proposals/commercial-invoice-year-numbering/numbering.proposed.sql', 2],
] as const)(
  'rejects transient unreviewed returned source %s',
  (target, nth) => {
    let n = 0;
    const read = ((p: Parameters<typeof readFileSync>[0]) => {
      const b = readFileSync(p);
      return String(p) === resolve(root, target) && ++n === nth
        ? Buffer.concat([b, Buffer.from('TRANSIENT')])
        : b;
    }) as typeof readFileSync;
    expect(() => captureNumberDecoder(root, { read })).toThrow();
    expect(n).toBe(nth);
  },
);
