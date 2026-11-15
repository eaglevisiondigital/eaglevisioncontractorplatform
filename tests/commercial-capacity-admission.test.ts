import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  readdirSync,
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { qualifyCapacityAdmission } from '../proposals/commercial-capacity-admission/qualify.mjs';
const root = process.cwd();
const prefix = 'proposals/commercial-capacity-admission/';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const result = () => qualifyCapacityAdmission(root);
let fixture: string;
let check: (root: string) => {
  installationAuthorized: false;
  financialExecutionAuthorized: false;
};
const env = {
  PATH: '/usr/bin:/bin',
  TMPDIR: '/private/tmp',
  LANG: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_COUNT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_NO_REPLACE_OBJECTS: '1',
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
      ...args,
    ],
    {
      cwd: root,
      env,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 5000,
    },
  );
beforeAll(async () => {
  result();
  fixture = mkdtempSync('/private/tmp/ev-capacity-author-');
  const archive = git('archive', '7e25b50537fe66c19f5041e64bd2e59effc544c4');
  execFileSync('/usr/bin/tar', ['-xf', '-', '-C', fixture], {
    input: archive,
    env,
    timeout: 5000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const patch = readFileSync(resolve(root, prefix + 'source-author.patch'));
  expect(sha(patch)).toBe(
    '0322ff6a47e7ba0c6a3823f902a2d7dddcc51bb053c739098cd363c815c00dc6',
  );
  const patchFile = resolve(fixture, 'source-author.patch');
  writeFileSync(patchFile, patch);
  execFileSync(
    '/usr/bin/git',
    ['-c', 'core.fsmonitor=false', 'apply', '--check', patchFile],
    { cwd: fixture, env, timeout: 5000, maxBuffer: 64 * 1024 * 1024 },
  );
  execFileSync(
    '/usr/bin/git',
    ['-c', 'core.fsmonitor=false', 'apply', patchFile],
    { cwd: fixture, env, timeout: 5000, maxBuffer: 64 * 1024 * 1024 },
  );
  rmSync(patchFile);
  const staged = resolve(fixture, 'scripts/check-commercial-capacity.mjs');
  expect(sha(readFileSync(staged))).toBe(
    'bf4afa37cbe1fcf35c54a735c2ffb270934bc1c4ddee9f1228a58ea7393324bc',
  );
  expect(lstatSync(staged).mode & 0o777).toBe(0o644);
  const expectedPaths = new Set([
    'scripts/check-commercial-capacity.mjs',
    'server/payments/commercial-capacity.proposed.sql',
  ]);
  for (const entry of git(
    'ls-tree',
    '-rz',
    '7e25b50537fe66c19f5041e64bd2e59effc544c4',
  )
    .toString()
    .split('\0')
    .filter(Boolean)) {
    const [meta, path] = entry.split('\t');
    const [mode, , blob] = meta!.split(' ');
    expectedPaths.add(path!);
    const bytes = readFileSync(resolve(fixture, path!));
    expect(
      createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex'),
    ).toBe(blob);
    expect((lstatSync(resolve(fixture, path!)).mode & 0o777).toString(8)).toBe(
      mode!.slice(-3),
    );
  }
  const inventory = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((e) => {
      const absolute = resolve(directory, e.name);
      expect(e.isSymbolicLink()).toBe(false);
      return e.isDirectory()
        ? inventory(absolute)
        : [absolute.slice(fixture.length + 1)];
    });
  expect(inventory(fixture).sort()).toEqual([...expectedPaths].sort());
  expect(
    sha(
      readFileSync(
        resolve(fixture, 'server/payments/commercial-capacity.proposed.sql'),
      ),
    ),
  ).toBe('a9fc788d6ea486a21207868088c56ca1d45a1b9b15ef29feb4f6d62b018a8aa4');
  const module = (await import(
    pathToFileURL(resolve(fixture, 'scripts/check-commercial-capacity.mjs'))
      .href
  )) as { checkCommercialCapacity: typeof check };
  check = module.checkCommercialCapacity;
});
afterAll(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});
it('qualifies only two additions from exact launch and retains every historical entry', () => {
  expect(result()).toEqual({
    classification: 'UNAPPLIED_SOURCE_AUTHOR_ONLY',
    base: '7e25b50537fe66c19f5041e64bd2e59effc544c4',
    source: '1940dc3bf82142a50ba8d2ccd3b39890f36d0dd1',
    baseEntries: 2438,
    preservedEntries: 2438,
    additions: 2,
    patchSha256:
      '0322ff6a47e7ba0c6a3823f902a2d7dddcc51bb053c739098cd363c815c00dc6',
    installationAuthorized: false,
    launchPromotionAuthorized: false,
    financialExecutionAuthorized: false,
  });
});
it.each(['source.json', 'source-author.patch', 'guard.proposed.mjs'])(
  'denies unreviewed outer %s before payload evaluation',
  (target) => {
    const read = ((p: Parameters<typeof readFileSync>[0]) => {
      const b = readFileSync(p);
      return String(p) === resolve(root, prefix + target)
        ? Buffer.concat([b, Buffer.from('\nUNKNOWN')])
        : b;
    }) as typeof readFileSync;
    expect(() => qualifyCapacityAdmission(root, { read })).toThrow();
  },
);
it('denies coordinated manifest and patch rebinding rather than trusting proposed hashes', () => {
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    if (String(p) === resolve(root, prefix + 'source.json')) {
      const m = JSON.parse(b.toString());
      m.patchSha256 = sha(Buffer.from('UNKNOWN'));
      return Buffer.from(JSON.stringify(m));
    }
    return b;
  }) as typeof readFileSync;
  expect(() => qualifyCapacityAdmission(root, { read })).toThrow();
});
it.each([
  'server/payments/sandbox.ts',
  'scripts/invoice-caller-source-admission.mjs',
  'supabase/migrations/20261015183039_phase_1_foundation.sql',
  'proposals/commercial-payment-capacity/capacity.proposed.sql',
  'proposals/commercial-payment-capacity/reviewed-issuance.sql',
])('denies source substitution in %s', (target) => {
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    return String(p) === resolve(root, target)
      ? Buffer.concat([b, Buffer.from('\nUNKNOWN')])
      : b;
  }) as typeof readFileSync;
  expect(() => qualifyCapacityAdmission(root, { read })).toThrow();
});
it.each(['symlink', 'mode', 'directory'] as const)(
  'denies %s source endpoints',
  (kind) => {
    const stat = ((p: Parameters<typeof lstatSync>[0]) => {
      const s = lstatSync(p);
      if (String(p) !== resolve(root, prefix + 'source-author.patch')) return s;
      return new Proxy(s, {
        get(o, k) {
          if (k === 'isSymbolicLink' && kind === 'symlink') return () => true;
          if (k === 'isFile' && kind === 'directory') return () => false;
          if (k === 'mode' && kind === 'mode') return 0o666;
          return Reflect.get(o, k);
        },
      });
    }) as typeof lstatSync;
    expect(() => qualifyCapacityAdmission(root, { stat })).toThrow();
  },
);
it('denies source withdrawal on the final complete-frame verification', () => {
  let count = 0;
  const target = resolve(root, 'server/payments/sandbox.ts');
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    if (String(p) === target && ++count === 2)
      return Buffer.concat([b, Buffer.from('\nWITHDRAWN')]);
    return b;
  }) as typeof readFileSync;
  expect(() => qualifyCapacityAdmission(root, { read })).toThrow();
  expect(count).toBe(2);
});
it('executes the proposed guard only on the exact disposable two-addition image', () => {
  expect(check(fixture)).toEqual({
    classification: 'SOURCE_ONLY_NOT_INSTALLED',
    installationAuthorized: false,
    financialExecutionAuthorized: false,
  });
  expect(
    sha(
      readFileSync(
        resolve(fixture, 'server/payments/commercial-capacity.proposed.sql'),
      ),
    ),
  ).toBe('a9fc788d6ea486a21207868088c56ca1d45a1b9b15ef29feb4f6d62b018a8aa4');
  const original = git(
    'ls-tree',
    '-rz',
    '7e25b50537fe66c19f5041e64bd2e59effc544c4',
  )
    .toString()
    .split('\0')
    .filter(Boolean);
  for (const entry of original) {
    const [meta, path] = entry.split('\t');
    const [mode, , blob] = meta!.split(' ');
    const b = readFileSync(resolve(fixture, path!));
    expect(
      createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'),
    ).toBe(blob);
    expect((lstatSync(resolve(fixture, path!)).mode & 0o777).toString(8)).toBe(
      mode!.slice(-3),
    );
  }
});
it.each([
  'server/payments/commercial-capacity.proposed.sql',
  'server/invoices/commercial-drafts.proposed.sql',
  'scripts/payment-response-source-admission.mjs',
])(
  'standalone guard rejects unknown %s without modifying an existing guard',
  (path) => {
    const file = resolve(fixture, path);
    const before = readFileSync(file);
    try {
      writeFileSync(file, Buffer.concat([before, Buffer.from('\nUNKNOWN')]));
      expect(() => check(fixture)).toThrow();
    } finally {
      writeFileSync(file, before);
    }
  },
);
it('standalone guard denies executable SQL mode', () => {
  const file = resolve(
    fixture,
    'server/payments/commercial-capacity.proposed.sql',
  );
  try {
    chmodSync(file, 0o755);
    expect(() => check(fixture)).toThrow();
  } finally {
    chmodSync(file, 0o644);
  }
});
it('object qualification never executes a repository external diff or fsmonitor helper', () => {
  const config = resolve(root, '.git/config');
  const before = readFileSync(config);
  const marker = resolve(fixture, 'UNTRUSTED_HELPER_RAN');
  const helper = resolve(fixture, 'hostile-helper');
  mkdirSync(dirname(helper), { recursive: true });
  writeFileSync(helper, `#!/bin/sh\ntouch '${marker}'\nexit 0\n`, {
    mode: 0o700,
  });
  try {
    writeFileSync(
      config,
      Buffer.concat([
        before,
        Buffer.from(
          `\n[core]\n fsmonitor = ${helper}\n[diff]\n external = ${helper}\n`,
        ),
      ]),
    );
    expect(result().additions).toBe(2);
    expect(() => lstatSync(marker)).toThrow();
  } finally {
    writeFileSync(config, before);
  }
});

it('denies source withdrawal triggered by the final payload-seal read', () => {
  let guardReads = 0;
  let withdrawn = false;
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    if (
      String(p) === resolve(root, prefix + 'guard.proposed.mjs') &&
      ++guardReads === 2
    )
      withdrawn = true;
    return withdrawn &&
      String(p) === resolve(root, 'server/payments/sandbox.ts')
      ? Buffer.concat([b, Buffer.from('WITHDRAWN')])
      : b;
  }) as typeof readFileSync;
  expect(() => qualifyCapacityAdmission(root, { read })).toThrow();
  expect(withdrawn).toBe(true);
});
