import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
  renameSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  prepareArchive,
  checkArchive,
  canonicalFrame,
  packet,
  proposedPorts,
  ackCli,
  originalAckDenial,
  sha,
  // @ts-expect-error Isolated JavaScript build-source qualifier has no declaration file.
} from '../proposals/nmi-order-reference-admission/qualify.mjs';
let archive: string;
beforeAll(() => {
  archive = prepareArchive();
});
afterAll(() => {
  if (archive) {
    try {
      checkArchive(archive);
      canonicalFrame();
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  }
});
const gateway = 'server/payments/sandbox.ts';
const fixture = 'tests/nmi-two-merchant-token-boundary.test.ts';
const expected =
  '89dc2b03f273ee00c73e8342fcf9e8db6d78d5f898bde96ccff94e69fc0276cc';
it('keeps the original canonical ACK checker denied before separate admission approval', () => {
  expect(originalAckDenial()).toBe(true);
});
it('qualifies both actual source authors and the finite proposed ACK CLI without business authority', async () => {
  const p = await proposedPorts(archive);
  expect(p.verifyNmiOrderReferenceFrame(p.ports)).toBe(true);
  expect(
    p.admitPaymentResponseSource(
      gateway,
      p.ports.readCurrent(gateway),
      expected,
      p.ports,
    ),
  ).toBe(true);
  expect(
    p.admitPaymentResponseSource(
      fixture,
      p.ports.readCurrent(fixture),
      'e61ccf5a059bdf5116387176d1afcbf1b0d596f47c7091e72ea42c800def4fff',
      p.ports,
    ),
  ).toBe(true);
  expect(ackCli(archive)).toMatchObject({
    classification: 'DEVELOPMENT_SOURCE_ONLY',
    operationalAcceptance: 'NOT_RUN',
    historicalSources: 8,
    unchangedHistoricalPins: 4,
  });
});
it.each(['prior-gateway', 'prior-fixture', 'both-prior'])(
  'rejects mixed or superseded source pair %s',
  async (mode) => {
    const p = await proposedPorts(archive);
    const sourceParent = '53a4705b72b584228b33988d1eae586ef10b44eb';
    expect(() =>
      p.verifyNmiOrderReferenceFrame({
        ...p.ports,
        readCurrent: (path: string) =>
          (mode !== 'prior-fixture' && path === gateway) ||
          (mode !== 'prior-gateway' && path === fixture)
            ? p.ports.readOriginal(sourceParent, path)
            : p.ports.readCurrent(path),
      }),
    ).toThrow('Exact authored NMI source and fixture pair required');
  },
);
it.each([gateway, fixture])(
  'rejects a supplied stale/unknown capture for %s even beside exact fresh disk bytes',
  async (path) => {
    const p = await proposedPorts(archive);
    expect(() =>
      p.admitPaymentResponseSource(
        path,
        Buffer.from('UNKNOWN CAPTURE'),
        path === gateway
          ? expected
          : 'e61ccf5a059bdf5116387176d1afcbf1b0d596f47c7091e72ea42c800def4fff',
        p.ports,
      ),
    ).toThrow();
  },
);
it.each(['parent', 'extra-delta', 'mode', 'authored-bytes', 'approved-patch'])(
  'rejects substituted actual-author %s proof',
  async (mode) => {
    const p = await proposedPorts(archive);
    const ports = {
      ...p.ports,
      metadata: (...args: string[]) => {
        if (mode === 'parent' && args.includes('--format=%P'))
          return Buffer.from('0'.repeat(40));
        if (mode === 'extra-delta' && args[0] === 'diff-tree')
          return Buffer.from('M\t' + gateway + '\nM\tother.ts');
        if (mode === 'mode' && args[0] === 'ls-tree')
          return Buffer.from('100755 blob ' + '0'.repeat(40) + '\t' + gateway);
        if (mode === 'approved-patch' && args[0] === 'diff')
          return Buffer.from('UNKNOWN PATCH');
        return p.ports.metadata(...args);
      },
      readOriginal: (commit: string, path: string) =>
        mode === 'authored-bytes'
          ? Buffer.from('UNKNOWN AUTHOR')
          : p.ports.readOriginal(commit, path),
    };
    expect(() => p.verifyNmiOrderReferenceFrame(ports)).toThrow();
  },
);
it('rechecks current source after metadata reads instead of accepting an earlier snapshot', async () => {
  const p = await proposedPorts(archive);
  let observed = false;
  expect(() =>
    p.verifyNmiOrderReferenceFrame({
      ...p.ports,
      metadata: (...args: string[]) => {
        observed = true;
        return p.ports.metadata(...args);
      },
      readCurrent: (path: string) =>
        observed && path === gateway
          ? Buffer.from('CHANGED AFTER CHECK')
          : p.ports.readCurrent(path),
    }),
  ).toThrow();
});
it.each([gateway, fixture])(
  'denies an on-disk source symlink or executable mode in %s',
  async (path) => {
    const p = await proposedPorts(archive);
    expect(() =>
      p.verifyNmiOrderReferenceFrame({
        ...p.ports,
        stat: (name: string) =>
          name === path
            ? { isSymbolicLink: () => true, isFile: () => true, mode: 0o100644 }
            : p.ports.stat(name),
      }),
    ).toThrow();
    const file = join(archive, path);
    try {
      chmodSync(file, 0o755);
      expect(() => checkArchive(archive)).toThrow();
    } finally {
      chmodSync(file, 0o644);
    }
  },
);
it.each([
  'scripts/payment-response-source-admission.mjs',
  'scripts/check-payment-ack-admission.mjs',
  'scripts/invoice-caller-source-admission.mjs',
  'tests/invoice-caller-migration-source.test.ts',
  'tests/launch-invoice-payment-source.test.ts',
  'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json',
])(
  'denies unknown actual frame bytes in %s before proposed imports',
  async (path) => {
    const file = join(archive, path),
      original = readFileSync(file);
    try {
      writeFileSync(
        file,
        Buffer.concat([original, Buffer.from('\n// UNKNOWN')]),
      );
      await expect(proposedPorts(archive)).rejects.toThrow();
    } finally {
      writeFileSync(file, original);
    }
  },
);
it('denies coordinated helper and guard hash rebinding before an unreviewed helper can execute', async () => {
  const helperPath = join(
      archive,
      'scripts/payment-response-source-admission.mjs',
    ),
    guardPath = join(archive, 'scripts/check-payment-ack-admission.mjs');
  const helper = readFileSync(helperPath),
    guard = readFileSync(guardPath);
  try {
    const unknown = Buffer.from("throw Error('UNREVIEWED_HELPER_EXECUTED');");
    writeFileSync(helperPath, unknown);
    writeFileSync(
      guardPath,
      guard.toString().replace(sha(helper), sha(unknown)),
    );
    await expect(proposedPorts(archive)).rejects.toThrow(
      'Unknown proposed frame',
    );
  } finally {
    writeFileSync(helperPath, helper);
    writeFileSync(guardPath, guard);
  }
});
it.each(['patch', 'record'])(
  'denies coordinated packet %s rebinding',
  (mode) => {
    expect(() =>
      packet((path: string) => {
        const bytes = readFileSync(path);
        if (mode === 'patch' && path.endsWith('.patch'))
          return Buffer.concat([bytes, Buffer.from('\nUNKNOWN')]);
        if (mode === 'record' && path.endsWith('.json'))
          return Buffer.from(
            JSON.stringify({
              ...JSON.parse(bytes.toString()),
              applicationAuthorized: true,
              sourceAuthor: '0'.repeat(40),
              patchSha256: '0'.repeat(64),
            }),
          );
        return bytes;
      }),
    ).toThrow();
  },
);

it.each([gateway, fixture])(
  'denies a real on-disk symlink redirect in %s',
  async (path) => {
    const file = join(archive, path),
      backup = file + '.retained-original';
    renameSync(file, backup);
    try {
      symlinkSync(backup, file);
      await expect(proposedPorts(archive)).rejects.toThrow(
        'Exact regular source required',
      );
    } finally {
      unlinkSync(file);
      renameSync(backup, file);
    }
  },
);
