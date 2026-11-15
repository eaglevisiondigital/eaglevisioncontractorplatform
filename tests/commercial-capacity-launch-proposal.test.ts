import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  renameSync,
  chmodSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { qualifyCapacityComposition } from '../proposals/commercial-capacity-launch/qualify.mjs';
const root = process.cwd(),
  folder = 'proposals/commercial-capacity-launch/';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
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
      ...args,
    ],
    {
      cwd,
      env: args[0] === 'clone' ? { ...env, GIT_ALLOW_PROTOCOL: 'file' } : env,
      timeout: 5000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
let fixture = '',
  report: {
    success: boolean;
    numPassedTests: number;
    numFailedTests: number;
    numPendingTests: number;
  };
beforeAll(() => {
  const q = qualifyCapacityComposition(root);
  expect(q.additions).toBe(3);
  const patch = readFileSync(folder + 'integration.patch');
  expect(sha(patch)).toBe(
    'fd2e9fa7ec268d3e3c622fb878f9e2e8d2757e8f169ee5ed2cdc0d1ace76f6e3',
  );
  fixture = mkdtempSync(resolve(tempRoot, 'ev-capacity-composition-'));
  git(root, 'clone', '--no-hardlinks', '--no-checkout', root, fixture);
  git(
    fixture,
    'checkout',
    '--detach',
    '7e25b50537fe66c19f5041e64bd2e59effc544c4',
  );
  const patchPath = resolve(fixture, 'exact-integration.patch');
  writeFileSync(patchPath, patch, { mode: 0o600 });
  git(fixture, 'apply', '--check', patchPath);
  git(fixture, 'apply', patchPath);
  rmSync(patchPath);
  const expected = new Set<string>();
  for (const row of git(
    root,
    'ls-tree',
    '-rz',
    '565819daffa58d8df25d67be05430b009007d958',
  )
    .toString()
    .split('\0')
    .filter(Boolean)) {
    const [meta, path] = row.split('\t');
    const [mode, , blob] = meta!.split(' ');
    expected.add(path!);
    const f = resolve(fixture, path!),
      b = readFileSync(f);
    expect(
      createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'),
    ).toBe(blob);
    expect((lstatSync(f).mode & 0o777).toString(8)).toBe(mode!.slice(-3));
  }
  const future = 'tests/commercial-capacity-launch.test.ts';
  expected.add(future);
  expect(sha(readFileSync(resolve(fixture, future)))).toBe(
    '1313056843759220f9d728844e6d14d4514c524f46dd47fb500763849baec157',
  );
  expect(lstatSync(resolve(fixture, future)).mode & 0o777).toBe(0o644);
  const inventory = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.name !== '.git')
      .flatMap((e) => {
        expect(e.isSymbolicLink()).toBe(false);
        return e.isDirectory()
          ? inventory(resolve(dir, e.name))
          : [resolve(dir, e.name).slice(fixture.length + 1)];
      });
  expect(inventory(fixture).sort()).toEqual([...expected].sort());
  expect(expected.size).toBe(2441);
  symlinkSync(
    resolve(root, 'node_modules'),
    resolve(fixture, 'node_modules'),
    'dir',
  );
  const output = resolve(fixture, 'qualification.json');
  execFileSync(
    process.execPath,
    [
      resolve(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      future,
      '--reporter=json',
      '--outputFile=' + output,
    ],
    {
      cwd: fixture,
      env,
      timeout: 25000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  report = JSON.parse(readFileSync(output, 'utf8'));
});
afterAll(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});
it('runs the actual three-addition CI image without changing any historical test/helper/source', () => {
  expect(report.success).toBe(true);
  expect(report.numPassedTests).toBe(12);
  expect(report.numFailedTests).toBe(0);
  expect(report.numPendingTests).toBe(0);
  const r = qualifyCapacityComposition(root);
  expect(r.proposedEntries).toBe(2441);
  expect(
    r.installationAuthorized ||
      r.launchPromotionAuthorized ||
      r.financialExecutionAuthorized,
  ).toBe(false);
});
it('captures only canonical approved473 SQL and existing467 dependencies, never a copied customer source', () => {
  const m = qualifyCapacityComposition(root).material;
  expect(m.migrations).toHaveLength(14);
  expect(sha(Buffer.from(m.capacitySql))).toBe(
    'a9fc788d6ea486a21207868088c56ca1d45a1b9b15ef29feb4f6d62b018a8aa4',
  );
  expect(sha(Buffer.from(m.draftSql))).toBe(
    'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c',
  );
  expect(
    Object.isFrozen(m) &&
      Object.isFrozen(m.migrations) &&
      m.migrations.every(Object.isFrozen),
  ).toBe(true);
});
it.each(['source.json', 'integration.patch', 'launch-source.proposed.ts'])(
  'rejects altered proposed %s before staged code execution',
  (name) => {
    const read = ((p: Parameters<typeof readFileSync>[0]) => {
      const b = readFileSync(p);
      return String(p) === resolve(root, folder + name)
        ? Buffer.concat([b, Buffer.from('\nUNKNOWN')])
        : b;
    }) as typeof readFileSync;
    expect(() => qualifyCapacityComposition(root, { read })).toThrow();
  },
);
it('rejects coordinated proposed test/manifest rebinding', () => {
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    if (String(p) === resolve(root, folder + 'source.json')) {
      const m = JSON.parse(b.toString());
      m.files[2].sha256 = sha(Buffer.from('UNKNOWN'));
      return Buffer.from(JSON.stringify(m));
    }
    return b;
  }) as typeof readFileSync;
  expect(() => qualifyCapacityComposition(root, { read })).toThrow();
});
it.each([
  'server/payments/commercial-capacity.proposed.sql',
  'scripts/check-commercial-capacity.mjs',
  'server/invoices/commercial-drafts.proposed.sql',
  'scripts/invoice-caller-source-admission.mjs',
  'tests/launch-invoice-payment-source.test.ts',
  'server/payments/sandbox.ts',
  'tests/database/bootstrap.sql',
])('rejects unknown %s despite partial matching evidence', (target) => {
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    return String(p) === resolve(root, target)
      ? Buffer.concat([b, Buffer.from('\nUNKNOWN')])
      : b;
  }) as typeof readFileSync;
  expect(() => qualifyCapacityComposition(root, { read })).toThrow();
});
it.each(['symlink', 'mode', 'directory'] as const)(
  'rejects %s admission entries',
  (kind) => {
    const stat = ((p: Parameters<typeof lstatSync>[0]) => {
      const s = lstatSync(p);
      if (String(p) !== resolve(root, folder + 'launch-source.proposed.ts'))
        return s;
      return new Proxy(s, {
        get(o, k) {
          if (k === 'isSymbolicLink' && kind === 'symlink') return () => true;
          if (k === 'isFile' && kind === 'directory') return () => false;
          if (k === 'mode' && kind === 'mode') return 0o666;
          return Reflect.get(o, k);
        },
      });
    }) as typeof lstatSync;
    expect(() => qualifyCapacityComposition(root, { stat })).toThrow();
  },
);
it('denies earlier canonical source withdrawn by the final proposed test seal', () => {
  let count = 0,
    withdrawn = false;
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    if (
      String(p) === resolve(root, folder + 'launch-source.proposed.ts') &&
      ++count === 2
    )
      withdrawn = true;
    return withdrawn &&
      String(p) === resolve(root, 'server/payments/sandbox.ts')
      ? Buffer.concat([b, Buffer.from('WITHDRAWN')])
      : b;
  }) as typeof readFileSync;
  expect(() => qualifyCapacityComposition(root, { read })).toThrow();
  expect(withdrawn).toBe(true);
});

it.each([
  ['tests/database/bootstrap.sql', 2],
  ['server/invoices/commercial-drafts.proposed.sql', 2],
  ['proposals/commercial-invoice-issuance/issuance.proposed.sql', 2],
  ['server/payments/commercial-capacity.proposed.sql', 3],
  ['supabase/migrations/20261015183039_phase_1_foundation.sql', 2],
] as const)(
  'rejects transient unreviewed material on its capture read: %s',
  (target, nth) => {
    let reads = 0;
    const read = ((p: Parameters<typeof readFileSync>[0]) => {
      const bytes = readFileSync(p);
      return String(p) === resolve(root, target) && ++reads === nth
        ? Buffer.concat([bytes, Buffer.from('UNREVIEWED MATERIAL')])
        : bytes;
    }) as typeof readFileSync;
    expect(() => qualifyCapacityComposition(root, { read })).toThrow();
    expect(reads).toBe(nth);
  },
);
it('missing promised objects deny offline without executing configured external transport', () => {
  const temp = mkdtempSync(resolve(tempRoot, 'ev-custody-missing-object-'));
  try {
    git(root, 'clone', '--no-hardlinks', root, temp);
    mkdirSync(resolve(temp, folder), { recursive: true });
    for (const name of [
      'source.json',
      'integration.patch',
      'launch-source.proposed.ts',
    ])
      writeFileSync(
        resolve(temp, folder + name),
        readFileSync(resolve(root, folder + name)),
      );
    const object = resolve(
      temp,
      '.git/objects/74/9e1e1d02fc2480e5dc39c5c55a39ed52ac5ca8',
    );
    expect(lstatSync(object).isFile()).toBe(true);
    renameSync(object, resolve(temp, 'retained-tree-object'));
    const marker = resolve(temp, 'EXTERNAL_TRANSPORT_RAN'),
      helper = resolve(temp, 'offline-helper');
    writeFileSync(helper, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`);
    chmodSync(helper, 0o700);
    const config = resolve(temp, '.git/config');
    writeFileSync(
      config,
      readFileSync(config, 'utf8') +
        `\n[extensions]\n partialClone = origin\n[remote "origin"]\n promisor = true\n partialclonefilter = blob:none\n url = ext::${helper}\n[protocol "ext"]\n allow = always\n`,
    );
    expect(() => qualifyCapacityComposition(temp)).toThrow();
    expect(() => lstatSync(marker)).toThrow();
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
