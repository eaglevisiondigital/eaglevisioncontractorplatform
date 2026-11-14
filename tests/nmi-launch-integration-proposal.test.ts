import { afterAll, beforeAll, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  readFileSync,
  rmSync,
  writeFileSync,
  unlinkSync,
  symlinkSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
const q: {
  packet: (
    evidence?: Buffer,
    patch?: Buffer,
  ) => { record: { files: { path: string }[] } };
  lineage: (root?: string) => unknown;
  checkFrame: (root?: string, proposed?: boolean) => unknown;
  prepareArchive: () => string;
  proposedPorts: (root: string) => Promise<{
    verifyNmiOrderReferenceFrame: (ports: Record<string, unknown>) => boolean;
    ports: {
      readCurrent: (p: string) => Buffer;
      readOriginal: (c: string, p: string) => Buffer;
      metadata: (...args: string[]) => Buffer;
      stat: (p: string) => unknown;
    };
  }>;
} = await import(
  new URL('../proposals/nmi-launch-integration/qualify.mjs', import.meta.url)
    .href
);
let archive: string;
beforeAll(() => {
  archive = q.prepareArchive();
});
afterAll(() => {
  if (archive) {
    try {
      q.checkFrame(archive, true);
      q.checkFrame();
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  }
});
const gateway = 'server/payments/sandbox.ts';
const fixture = 'tests/nmi-two-merchant-token-boundary.test.ts';
it('binds all three real NMI author stages and the current exact launch parent', () => {
  expect(() => q.lineage()).not.toThrow();
});
it('qualifies the complete twelve-path union while preserving every other launch path', () => {
  expect(q.checkFrame(archive, true)).toBe(true);
  expect(q.checkFrame()).toBe(true);
  expect(readFileSync(join(archive, 'scripts/check-cycle22.mjs'))).toEqual(
    readFileSync('scripts/check-cycle22.mjs'),
  );
});
it('uses the existing paired-source verifier inside the complete proposed frame', async () => {
  const p = await q.proposedPorts(archive);
  expect(p.verifyNmiOrderReferenceFrame(p.ports)).toBe(true);
});
it.each(['gateway', 'fixture', 'both'])(
  'rejects mixed or prior NMI source even beside the new admission helper: %s',
  async (mode) => {
    const p = await q.proposedPorts(archive);
    expect(() =>
      p.verifyNmiOrderReferenceFrame({
        ...p.ports,
        readCurrent: (path: string) =>
          ((mode === 'gateway' || mode === 'both') && path === gateway) ||
          ((mode === 'fixture' || mode === 'both') && path === fixture)
            ? p.ports.readOriginal(
                'af318f9e939ca83a315784eb252bf192f246cfd5',
                path,
              )
            : p.ports.readCurrent(path),
      }),
    ).toThrow();
  },
);
it.each(q.packet().record.files.map((f) => f.path))(
  'rejects unknown actual source before any proposed helper import: %s',
  async (path) => {
    const file = join(archive, path),
      original = readFileSync(file);
    try {
      writeFileSync(
        file,
        Buffer.concat([original, Buffer.from('\n// UNKNOWN SOURCE\n')]),
      );
      await expect(q.proposedPorts(archive)).rejects.toThrow(
        /Exact proposed source/,
      );
    } finally {
      writeFileSync(file, original);
    }
  },
);
it.each([
  'scripts/check-cycle17-integrity.mjs',
  'scripts/check-cycle22.mjs',
  'scripts/check-cycle24.mjs',
  'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json',
])('preserves and denies edits to retained source protection: %s', (path) => {
  const file = join(archive, path),
    original = readFileSync(file);
  try {
    writeFileSync(file, Buffer.concat([original, Buffer.from('\nUNKNOWN')]));
    expect(() => q.checkFrame(archive, true)).toThrow();
  } finally {
    writeFileSync(file, original);
  }
});
it.each([gateway, fixture])(
  'denies withdrawal after historical metadata reads: %s',
  async (path) => {
    const p = await q.proposedPorts(archive),
      file = join(archive, path),
      original = readFileSync(file);
    let withdrawn = false;
    try {
      expect(() =>
        p.verifyNmiOrderReferenceFrame({
          ...p.ports,
          metadata: (...args: string[]) => {
            const result = p.ports.metadata(...args);
            if (!withdrawn) {
              withdrawn = true;
              unlinkSync(file);
            }
            return result;
          },
        }),
      ).toThrow();
      expect(withdrawn).toBe(true);
    } finally {
      writeFileSync(file, original, { mode: 0o644 });
    }
  },
);
it('rejects coordinated helper/guard rebinding before unreviewed code can execute', async () => {
  const helper = join(archive, 'scripts/payment-response-source-admission.mjs');
  const guard = join(archive, 'scripts/check-payment-ack-admission.mjs');
  const beforeHelper = readFileSync(helper),
    beforeGuard = readFileSync(guard);
  try {
    const unknown = Buffer.from("throw Error('UNREVIEWED_HELPER_EXECUTED');");
    writeFileSync(helper, unknown);
    writeFileSync(
      guard,
      beforeGuard
        .toString()
        .replace(
          '74c672d6725876285c8bd2ee844aec88c183b56b12181a0373c874e02cf26510',
          createHash('sha256').update(unknown).digest('hex'),
        ),
    );
    await expect(q.proposedPorts(archive)).rejects.toThrow(
      /Exact proposed source/,
    );
  } finally {
    writeFileSync(helper, beforeHelper);
    writeFileSync(guard, beforeGuard);
  }
});
it('rejects coordinated authority/parent/manifest rebinding and altered patch bytes', () => {
  const evidence = readFileSync(
    'proposals/nmi-launch-integration/evidence.json',
  );
  const patch = readFileSync(
    'proposals/nmi-launch-integration/integration.patch',
  );
  const rebound = {
    ...JSON.parse(evidence.toString()),
    launchParent: '0'.repeat(40),
    sourceAuthor: '1'.repeat(40),
    integrationAuthorized: true,
    integrationPatchSha256: '2'.repeat(64),
  };
  expect(() => q.packet(Buffer.from(JSON.stringify(rebound)), patch)).toThrow();
  expect(() =>
    q.packet(evidence, Buffer.concat([patch, Buffer.from('\nUNKNOWN')])),
  ).toThrow();
});
it('rejects executable modes, symlinked endpoints and symlinked source ancestors', () => {
  const file = join(archive, gateway),
    original = readFileSync(file);
  try {
    chmodSync(file, 0o755);
    expect(() => q.checkFrame(archive, true)).toThrow();
    chmodSync(file, 0o644);
    unlinkSync(file);
    symlinkSync(join(process.cwd(), gateway), file);
    expect(() => q.checkFrame(archive, true)).toThrow(/Symlink/);
  } finally {
    rmSync(file, { force: true });
    writeFileSync(file, original, { mode: 0o644 });
  }
  const directory = join(archive, 'scripts'),
    moved = join(archive, 'scripts-test-only');
  renameSync(directory, moved);
  try {
    symlinkSync(moved, directory, 'dir');
    expect(() => q.checkFrame(archive, true)).toThrow(/Symlink/);
  } finally {
    rmSync(directory, { force: true });
    renameSync(moved, directory);
  }
});
