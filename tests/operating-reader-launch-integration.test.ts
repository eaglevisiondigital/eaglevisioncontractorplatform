import { beforeAll, afterAll, it, expect } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  realpathSync,
  lstatSync,
  chmodSync,
  symlinkSync,
  renameSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { devNull, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  qualifyReaderIntegration,
  verifyReaderIntegrationImage,
  type SourceFixture,
} from '../proposals/operating-reader-launch-integration/qualify.mjs';
const checkout = process.cwd(),
  folder = 'proposals/operating-reader-launch-integration/';
let fixture: string,
  frame: Awaited<ReturnType<typeof qualifyReaderIntegration>>;
function seed(rows: Record<string, SourceFixture>, root: string) {
  for (const [p, r] of Object.entries(rows)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), r.bytes, {
      mode: parseInt(r.mode.slice(-3), 8),
    });
  }
}
beforeAll(async () => {
  const listing = execFileSync(
    'git',
    [
      '--no-replace-objects',
      '-c',
      'core.fsmonitor=false',
      'ls-tree',
      '-rz',
      '--full-tree',
      'fbab4220a5e8fb043c10baa1328bbe6f7001e588',
    ],
    {
      cwd: checkout,
      stdio: 'pipe',
      timeout: 5000,
      env: {
        PATH: process.env.PATH,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_SYSTEM: devNull,
        GIT_CONFIG_GLOBAL: devNull,
        GIT_CONFIG_COUNT: '0',
        GIT_NO_LAZY_FETCH: '1',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_ALLOW_PROTOCOL: '',
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
      },
    },
  )
    .toString()
    .split('\0')
    .filter(Boolean);
  fixture = realpathSync(
    mkdtempSync(join(tmpdir(), 'reader-integration-parent-')),
  );
  for (const row of listing) {
    const m = /^(100644|100755) blob [a-f0-9]{40}\t(.+)$/.exec(row);
    if (!m) throw Error('Exact source path discovery required');
    const path = m[2];
    if (
      path.includes('\\') ||
      path.split('/').some((p) => !p || p === '.' || p === '..')
    )
      throw Error('Exact source paths');
    let p = checkout;
    for (const bit of path.split('/')) {
      p = join(p, bit);
      if (lstatSync(p).isSymbolicLink()) throw Error('No fixture symlink');
    }
    const s = lstatSync(p);
    if (!s.isFile() || ![0o644, 0o755].includes(s.mode & 0o777))
      throw Error('Exact current source mode');
    mkdirSync(dirname(join(fixture, path)), { recursive: true });
    writeFileSync(join(fixture, path), readFileSync(p), {
      mode: s.mode & 0o777,
    });
  }
  frame = await qualifyReaderIntegration(fixture);
});
afterAll(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});
async function image(
  kind: 'before' | 'after',
  action: (root: string) => void | Promise<void>,
) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'reader-integration-test-')),
  );
  try {
    seed(kind === 'before' ? frame.beforeFixture : frame.afterFixture, root);
    await action(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
async function packetChange(path: string, body: () => void | Promise<void>) {
  const p = folder + path,
    b = readFileSync(p);
  try {
    await body();
  } finally {
    writeFileSync(p, b);
  }
}
it('qualifies exact500 plus eleven exact506 endpoints with all operational gates held', async () => {
  const q = await qualifyReaderIntegration(fixture);
  expect(q.additions).toBe(11);
  expect(Object.keys(q.beforeFixture)).toHaveLength(2468);
  expect(Object.keys(q.afterFixture)).toHaveLength(2479);
  expect(q.afterTree).toBe('d784d50cb0042fbeb6fe23d8b89051d7a026851d');
  expect(q.operationalReady).toBe(false);
  expect(q.installationAuthorized).toBe(false);
  expect(q.launchIntegrationAuthorized).toBe(false);
});
it('complete materialized afterimage is exactly the reviewed author source tree', () =>
  image('after', async (root) => {
    expect(await verifyReaderIntegrationImage(root)).toMatchObject({
      tree: 'd784d50cb0042fbeb6fe23d8b89051d7a026851d',
      files: 2479,
      operationalReady: false,
    });
  }));
it.each([
  'server/customer/broker-auth.ts',
  'server/invoices/commercial-caller-connection.ts',
  'server/invoices/commercial-drafts.proposed.sql',
  'src/components/invoices/commercial-customer-read.ts',
  'scripts/invoice-caller-source-admission.mjs',
])('changed canonical parent %s denies', (path) =>
  image('before', (root) => {
    writeFileSync(join(root, path), 'UNKNOWN');
    return expect(qualifyReaderIntegration(root)).rejects.toThrow();
  }),
);
it('partial addition cannot masquerade as unapplied parent', () =>
  image('before', (root) => {
    const path = 'proposals/commercial-customer-operating-reader/source.ts';
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), frame.afterFixture[path].bytes);
    return expect(qualifyReaderIntegration(root)).rejects.toThrow();
  }));
it('whole afterimage cannot masquerade as unapplied parent', () =>
  image('after', (root) =>
    expect(qualifyReaderIntegration(root)).rejects.toThrow(),
  ));
it.each([
  'proposals/commercial-customer-operating-reader/reader.ts',
  'proposals/commercial-customer-operating-reader/source.ts',
  'proposals/commercial-customer-operating-reader/source.json',
  'proposals/commercial-customer-operating-reader/read.proposed.sql.in',
  'proposals/commercial-customer-operating-reader/runtime-grants.sql.in',
])('substituted afterimage endpoint %s denies', (path) =>
  image('after', (root) => {
    writeFileSync(join(root, path), 'UNKNOWN');
    return expect(verifyReaderIntegrationImage(root)).rejects.toThrow();
  }),
);
it('coordinated runtime and source manifest rebinding still denies', () =>
  image('after', (root) => {
    writeFileSync(
      join(root, 'proposals/commercial-customer-operating-reader/reader.ts'),
      'FORGED',
    );
    writeFileSync(
      join(root, 'proposals/commercial-customer-operating-reader/source.json'),
      '{}',
    );
    return expect(verifyReaderIntegrationImage(root)).rejects.toThrow();
  }));
it('unknown extra source cannot enter the afterimage', () =>
  image('after', (root) => {
    writeFileSync(join(root, 'src/unknown.ts'), 'MUST NOT EXECUTE');
    return expect(verifyReaderIntegrationImage(root)).rejects.toThrow();
  }));
it('current source mode substitution denies', () =>
  image('before', (root) => {
    chmodSync(join(root, 'server/customer/broker-auth.ts'), 0o755);
    return expect(qualifyReaderIntegration(root)).rejects.toThrow();
  }));
it('symlink ancestors deny even for exact byte contents', () =>
  image('before', (root) => {
    renameSync(join(root, 'server'), join(root, 'server-saved'));
    symlinkSync(join(root, 'server-saved'), join(root, 'server'), 'dir');
    return expect(qualifyReaderIntegration(root)).rejects.toThrow();
  }));
it.each(['after-capture', 'after-compose'] as const)(
  'source withdrawal at %s suppresses qualification',
  (stage) =>
    image('before', (root) =>
      expect(
        qualifyReaderIntegration(root, (s) => {
          if (s === stage)
            writeFileSync(
              join(root, 'server/customer/broker-auth.ts'),
              'WITHDRAWN',
            );
        }),
      ).rejects.toThrow(),
    ),
);
it('late image withdrawal after audit suppresses afterimage identity', () =>
  image('after', (root) =>
    expect(
      verifyReaderIntegrationImage(root, () => {
        writeFileSync(
          join(
            root,
            'proposals/commercial-customer-operating-reader/catalog.ts',
          ),
          'WITHDRAWN',
        );
      }),
    ).rejects.toThrow(),
  ));
it.each([
  'identity.json',
  'integration.patch',
  'native-connection-characterization.proposed.txt',
])('unknown packet %s cannot execute or qualify', (path) =>
  packetChange(path, async () => {
    writeFileSync(folder + path, "throw Error('MUST NOT EXECUTE')");
    await expect(qualifyReaderIntegration(fixture)).rejects.toThrow();
  }),
);
it('withdrawn qualifier after import denies', () =>
  packetChange('qualify.mjs', async () => {
    writeFileSync(folder + 'qualify.mjs', 'UNKNOWN');
    await expect(qualifyReaderIntegration(fixture)).rejects.toThrow();
  }));
it('captured fixture mutation never rebinds a later qualification', async () => {
  const q = await qualifyReaderIntegration(fixture);
  q.afterFixture[
    'proposals/commercial-customer-operating-reader/source.ts'
  ].bytes.fill(0);
  const later = await qualifyReaderIntegration(fixture);
  expect(
    later.afterFixture[
      'proposals/commercial-customer-operating-reader/source.ts'
    ].bytes.equals(
      frame.afterFixture[
        'proposals/commercial-customer-operating-reader/source.ts'
      ].bytes,
    ),
  ).toBe(true);
});
