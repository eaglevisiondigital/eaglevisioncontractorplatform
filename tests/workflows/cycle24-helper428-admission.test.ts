import { expect, it } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  lstatSync,
  chmodSync,
  existsSync,
} from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import {
  bindings,
  inputs,
  canonicalFrame,
  verifyCandidate,
  withCandidate,
  qualify,
  // @ts-expect-error Unapplied finite offline qualification, no operational adapter.
} from '../../proposals/cycle24-helper428-admission/qualify.mjs';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
it('reuses exact391 C24-only patch and already-authored428 helper without granting C9 or operational authority', () => {
  const r = inputs();
  expect(sha(r.patch)).toBe(
    '60f719216eb985839602bbb97e1a3d5420b80579771583677622e7c5715ab447',
  );
  expect(canonicalFrame().c24).toBe('ORIGINAL');
  const evidence = JSON.parse(
    readFileSync('proposals/cycle24-helper428-admission/evidence.json', 'utf8'),
  );
  expect(evidence.parent).toBe('a1b701a42ff838d3364c611794000b6dc533e27f');
  expect(evidence.cycle9ApprovalGranted).toBe(false);
  expect(evidence.protectedPromotionAuthorized).toBe(false);
});
it('rejects forged approvals and unknown patch before constructing candidates', () => {
  const record = JSON.parse(
    readFileSync('proposals/cycle24-helper428-admission/evidence.json', 'utf8'),
  );
  record.cycle9ApprovalGranted = true;
  expect(() =>
    inputs({ evidence: Buffer.from(JSON.stringify(record)) }),
  ).toThrow('Exact C24-only');
  expect(() => inputs({ patch: Buffer.from('UNKNOWN') })).toThrow(
    'Exact unchanged391',
  );
});
it('exercises original critical failure then proposed five-source positives/unknowns and verifies helper before execution', async () => {
  expect(await qualify()).toMatchObject({
    originalCritical: 'DENIED_EXACT_AUTHORED_RUNTIME',
    c24Critical: 5,
    unknownRuntime: 'DENIED',
    unrelatedSource: 'DENIED',
    helperBeforeExecution: 'DENIED',
    cycle9Compatibility: 'ORIGINAL_C9_UNCHANGED',
    cycle9ApprovalGranted: false,
    cycle24ApprovalGranted: false,
    canonicalChanges: false,
    operationalReady: false,
  });
});
it('proves exact C9 proposed sequence compatibility only in a disposable clone, without bundling C9 approval', async () => {
  expect(await qualify({ mode: 'sequence' })).toMatchObject({
    cycle9Compatibility: 'EXACT_DISPOSABLE_SEQUENCE_PASS',
    cycle9ApprovalGranted: false,
    cycle24ApprovalGranted: false,
    canonicalChanges: false,
  });
});
it('rejects unknown checker/helper/runtime/C9 bytes before source execution', async () => {
  await withCandidate((root: string) => {
    for (const p of [
      bindings.path,
      bindings.helper,
      bindings.runtime,
      bindings.c9,
    ]) {
      const path = join(root, p),
        original = readFileSync(path);
      try {
        writeFileSync(path, "throw Error('UNKNOWN_EXECUTED')");
        expect(() => verifyCandidate(root)).toThrow();
      } finally {
        writeFileSync(path, original);
      }
    }
  });
});
it('rejects modes, symlinks and unrelated source deltas rather than broadening the candidate', async () => {
  await withCandidate((root: string) => {
    const target = join(root, bindings.path);
    try {
      chmodSync(target, 0o755);
      expect(() => verifyCandidate(root)).toThrow(/0644/);
    } finally {
      chmodSync(target, 0o644);
    }
    for (const path of [
      'server/customer/broker-auth.ts',
      'docs/program/CYCLE24_SOURCE_MANIFEST.json',
      'docs/program/CYCLE24_RESTART_READINESS.json',
    ]) {
      const unrelated = join(root, path),
        before = readFileSync(unrelated);
      try {
        writeFileSync(
          unrelated,
          Buffer.concat([before, Buffer.from('\nUNKNOWN')]),
        );
        expect(() => verifyCandidate(root)).toThrow('scope');
      } finally {
        writeFileSync(unrelated, before);
      }
    }
  });
  expect(() =>
    canonicalFrame({ stat: () => ({ isSymbolicLink: () => true }) }),
  ).toThrow('non-symlink');
});
it('recognizes exact independent future C24/C9 source frames without turning byte identity into approval', async () => {
  await withCandidate((root: string) => {
    const read = (p: string) => readFileSync(join(root, p));
    const stat = (p: string) => lstatSync(isAbsolute(p) ? p : join(root, p));
    expect(canonicalFrame({ read, stat })).toMatchObject({
      c24: 'EXACT_PROPOSED',
      c9: 'ORIGINAL',
    });
  });
  await withCandidate(
    (root: string) => {
      const read = (p: string) => readFileSync(join(root, p));
      const stat = (p: string) => lstatSync(isAbsolute(p) ? p : join(root, p));
      expect(canonicalFrame({ read, stat })).toMatchObject({
        c24: 'EXACT_PROPOSED',
        c9: 'EXACT_PROPOSED',
      });
    },
    { sequence: true },
  );
});
it('detects earlier-source withdrawal after reading a later endpoint', async () => {
  await withCandidate((root: string) => {
    const first = join(root, bindings.path),
      last = join(root, bindings.c9),
      original = readFileSync(first);
    let changed = false;
    try {
      expect(() =>
        verifyCandidate(root, {
          read: (p: string) => {
            const b = readFileSync(p);
            if (p === last && !changed) {
              changed = true;
              writeFileSync(first, 'UNKNOWN');
            }
            return b;
          },
        }),
      ).toThrow('Fresh exact');
    } finally {
      writeFileSync(first, original);
    }
  });
});
it('cleans the temporary candidate even if terminal canonical validation fails', async () => {
  let candidate = '';
  let frames = 0;
  await expect(
    withCandidate(
      (root: string) => {
        candidate = root;
        return true;
      },
      {
        framePorts: {
          read: (p: string) =>
            p === bindings.path && ++frames > 1
              ? Buffer.from('UNKNOWN')
              : readFileSync(p),
        },
      },
    ),
  ).rejects.toThrow('Exact C24 frame');
  expect(candidate).not.toBe('');
  expect(existsSync(candidate)).toBe(false);
});
it('unknown modes cannot invoke a different operation', async () => {
  await expect(qualify({ mode: 'install' })).rejects.toThrow('Exact controls');
});
