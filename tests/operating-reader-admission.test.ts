import { beforeAll, expect, it } from 'vitest';
import {
  readFileSync,
  realpathSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  chmodSync,
  renameSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  qualifyOperatingAdmission,
  type SourceQualification,
} from '../proposals/operating-reader-admission/qualify.mjs';
const sourceRoot = process.cwd(),
  folder = 'proposals/operating-reader-admission/',
  target = 'proposals/commercial-customer-operating-reader/source.ts';
let original: SourceQualification;
beforeAll(async () => {
  original = await qualifyOperatingAdmission(sourceRoot);
});
async function image(
  action: (root: string) => void | Promise<void>,
  proposed = false,
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'propel503admission-')));
  try {
    for (const [path, row] of Object.entries(original.fixture)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(
        join(root, path),
        path === target && proposed ? original.proposedGuard : row.bytes,
        { mode: parseInt(row.mode.slice(-3), 8) },
      );
    }
    await action(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function withPacket(path: string, action: () => void | Promise<void>) {
  const before = readFileSync(path);
  return Promise.resolve()
    .then(action)
    .finally(() => writeFileSync(path, before));
}
const runGuard = (root: string) =>
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import{resolve}from'node:path';import{pathToFileURL}from'node:url';const {assertOperatingSources}=await import(pathToFileURL(resolve('" +
        target +
        "')).href);assertOperatingSources();",
    ],
    { cwd: root, stdio: 'pipe', timeout: 5000 },
  );
it('qualifies exact actual503 source without importing runtime or granting authority', async () => {
  const q = await qualifyOperatingAdmission(sourceRoot);
  expect(q.author).toBe('5030bb834423fc572eb770d077739300477fd1e3');
  expect(q.sourceTree).toBe('4ffa570bcbe5e0c38794f8dc7802990580a3a4fd');
  expect(q.files).toBe(2479);
  expect(q.operationalReady).toBe(false);
  expect(q.installationAuthorized).toBe(false);
  expect(q.canonicalFHGChanged).toBe(false);
});
it('qualifies only the complete one-file proposed guard frame', () =>
  image(async (root) => {
    const q = await qualifyOperatingAdmission(root, 'proposed');
    expect(q.sourceTree).toBe('d784d50cb0042fbeb6fe23d8b89051d7a026851d');
    expect(() => runGuard(root)).not.toThrow();
  }, true));
it('original bytes cannot claim proposed admission', () =>
  image((root) =>
    expect(qualifyOperatingAdmission(root, 'proposed')).rejects.toThrow(),
  ));
it('proposed bytes cannot claim original admission', () =>
  image(
    (root) => expect(qualifyOperatingAdmission(root)).rejects.toThrow(),
    true,
  ));
it.each([
  'proposals/commercial-customer-operating-reader/reader.ts',
  'proposals/commercial-customer-operating-reader/catalog.ts',
  'proposals/commercial-customer-operating-reader/binding.ts',
  'proposals/commercial-customer-operating-reader/read.proposed.sql.in',
  'proposals/commercial-customer-operating-reader/runtime-grants.sql.in',
  'server/customer/broker-auth.ts',
  'server/invoices/commercial-caller-connection.ts',
  'server/invoices/commercial-drafts.proposed.sql',
  'proposals/commercial-invoice-issuance/issuance.proposed.sql',
  'scripts/invoice-caller-source-admission.mjs',
  'package-lock.json',
  'tests/database/commercial-customer-operating-reader.test.ts',
])('unknown %s fails exact whole-source admission', (path) =>
  image((root) => {
    writeFileSync(join(root, path), 'UNKNOWN');
    return expect(qualifyOperatingAdmission(root)).rejects.toThrow();
  }),
);
it('coordinated runtime/manifest rebinding cannot authorize substituted SQL', () =>
  image((root) => {
    const p =
      'proposals/commercial-customer-operating-reader/read.proposed.sql.in';
    writeFileSync(join(root, p), 'FORGED');
    const m = JSON.parse(
      readFileSync(
        join(
          root,
          'proposals/commercial-customer-operating-reader/source.json',
        ),
        'utf8',
      ),
    );
    m.pins[p] = createHash('sha256').update('FORGED').digest('hex');
    writeFileSync(
      join(root, 'proposals/commercial-customer-operating-reader/source.json'),
      JSON.stringify(m),
    );
    return expect(qualifyOperatingAdmission(root)).rejects.toThrow();
  }));
it('proposed guard independently rejects altered source manifest', () =>
  image((root) => {
    writeFileSync(
      join(root, 'proposals/commercial-customer-operating-reader/source.json'),
      '{}',
    );
    expect(() => runGuard(root)).toThrow();
  }, true));
it('new executable bytes/modes never enter the declared source frame', () =>
  image((root) => {
    chmodSync(join(root, 'server/customer/broker-auth.ts'), 0o755);
    return expect(qualifyOperatingAdmission(root)).rejects.toThrow();
  }));
it('unknown file additions deny instead of importing or discovering them', () =>
  image((root) => {
    writeFileSync(
      join(root, 'server', 'UNKNOWN.mjs'),
      "throw Error('MUST NOT RUN')",
    );
    return expect(qualifyOperatingAdmission(root)).rejects.toThrow();
  }));
it('source removal is not an allowed missing-evidence fallback', () =>
  image((root) => {
    rmSync(join(root, 'server/customer/broker-auth.ts'));
    return expect(qualifyOperatingAdmission(root)).rejects.toThrow();
  }));
it('symlink ancestors deny even when the bytes match', () =>
  image((root) => {
    renameSync(join(root, 'server'), join(root, 'server-saved'));
    symlinkSync(join(root, 'server-saved'), join(root, 'server'), 'dir');
    return expect(qualifyOperatingAdmission(root)).rejects.toThrow();
  }));
it.each(['after-capture', 'before-return'] as const)(
  'withdrawal at %s suppresses qualification',
  (stage) =>
    image((root) =>
      expect(
        qualifyOperatingAdmission(root, 'original', (where) => {
          if (where === stage)
            writeFileSync(
              join(root, 'server/customer/broker-auth.ts'),
              'WITHDRAWN',
            );
        }),
      ).rejects.toThrow(),
    ),
);
it('complete phase replacement across await is denied', () =>
  image((root) =>
    expect(
      qualifyOperatingAdmission(root, 'original', (where) => {
        if (where === 'after-capture')
          writeFileSync(join(root, target), original.proposedGuard);
      }),
    ).rejects.toThrow(),
  ));
it('source root inode replacement is denied', () =>
  image(async (root) => {
    const moved = root + '-old';
    try {
      await expect(
        qualifyOperatingAdmission(root, 'original', (where) => {
          if (where === 'after-capture') {
            renameSync(root, moved);
            mkdirSync(root);
          }
        }),
      ).rejects.toThrow();
    } finally {
      rmSync(moved, { recursive: true, force: true });
    }
  }));
it.each(['identity.json', 'guard.patch', 'guard.proposed.txt'])(
  'unreviewed packet %s denies without executing it',
  (path) =>
    withPacket(folder + path, async () => {
      writeFileSync(folder + path, "throw Error('MUST NOT RUN')");
      await expect(qualifyOperatingAdmission(sourceRoot)).rejects.toThrow();
    }),
);
it('withdrawn executing qualifier bytes after import deny', () =>
  withPacket(folder + 'qualify.mjs', async () => {
    writeFileSync(folder + 'qualify.mjs', 'UNKNOWN');
    await expect(qualifyOperatingAdmission(sourceRoot)).rejects.toThrow();
  }));
it('fixture-buffer edits cannot rebind a later qualification', async () => {
  const q = await qualifyOperatingAdmission(sourceRoot);
  q.fixture[target].bytes.fill(0);
  q.proposedGuard.fill(0);
  const fresh = await qualifyOperatingAdmission(sourceRoot);
  expect(
    fresh.fixture[target].bytes.equals(original.fixture[target].bytes),
  ).toBe(true);
  expect(fresh.proposedGuard.equals(original.proposedGuard)).toBe(true);
});
