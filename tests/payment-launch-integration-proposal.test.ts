import { expect, it } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  chmodSync,
  renameSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  preflight,
  verifyCandidate,
  withCandidate,
  qualify,
  // @ts-expect-error Isolated source qualification only; no operational adapter.
} from '../proposals/payment-launch-integration/qualify.mjs';
type Record = {
  companions: {
    path: string;
    before: string | null;
    after: string;
    mode: string;
  }[];
  files: { path: string; before: string | null; after: string; mode: string }[];
};
it('pins exact417/419 ancestry and all eleven endpoints without changing canonical source', () => {
  const { record } = preflight();
  expect(record.files).toHaveLength(11);
  expect(record.protectedPromotionAuthorized).toBe(false);
  expect(record.operationalReady).toBe(false);
});
it('rejects a replacement patch even if its supplied manifest is jointly rebound', () => {
  expect(() => preflight({ patch: Buffer.from('UNKNOWN') })).toThrow(
    'Exact thirteen-file',
  );
  const record = JSON.parse(
    readFileSync('proposals/payment-launch-integration/evidence.json', 'utf8'),
  );
  record.patchSha256 = '0'.repeat(64);
  expect(() =>
    preflight({
      evidence: Buffer.from(JSON.stringify(record)),
      patch: Buffer.from('UNKNOWN'),
    }),
  ).toThrow('Exact integration evidence');
});
it('rejects each changed canonical context source while leaving historical records immutable', () => {
  const { record } = preflight();
  for (const f of record.files.filter(
    (f: { before: string | null }) => f.before !== null,
  ))
    expect(() =>
      preflight({
        read: (p: string) =>
          p === f.path ? Buffer.from('UNKNOWN') : readFileSync(p),
      }),
    ).toThrow('Exact complete before or integrated payment bundle');
});
it('rejects all thirteen candidate substitutions before any candidate helper runs', () => {
  withCandidate((root: string, record: Record) => {
    for (const f of [...record.files, ...record.companions]) {
      const p = join(root, f.path),
        original = readFileSync(p);
      try {
        writeFileSync(p, "throw Error('UNREVIEWED_SOURCE_EXECUTED');");
        expect(() => verifyCandidate(root, record)).toThrow();
      } finally {
        writeFileSync(p, original);
      }
    }
  });
});
it('rejects executable and symbolic candidate source modes', () => {
  withCandidate((root: string, record: Record) => {
    const p = join(root, 'scripts/payment-response-source-admission.mjs');
    chmodSync(p, 0o755);
    try {
      expect(() => verifyCandidate(root, record)).toThrow();
    } finally {
      chmodSync(p, 0o644);
    }
    const saved = p + '.original';
    renameSync(p, saved);
    symlinkSync(saved, p);
    try {
      expect(() => verifyCandidate(root, record)).toThrow();
    } finally {
      unlinkSync(p);
      renameSync(saved, p);
    }
  });
});
it('rejects coordinated candidate-record rebinding and unrelated Auth/source changes', () => {
  withCandidate((root: string, record: Record) => {
    const changed = structuredClone(record);
    changed.files[0].after = '0'.repeat(64);
    expect(() => verifyCandidate(root, changed)).toThrow(
      'Exact candidate record',
    );
    const p = join(root, 'server/customer/broker-auth.ts'),
      original = readFileSync(p);
    try {
      writeFileSync(
        p,
        Buffer.concat([original, Buffer.from('\n// UNKNOWN\n')]),
      );
      expect(() => verifyCandidate(root, record)).toThrow('Only thirteen');
    } finally {
      writeFileSync(p, original);
    }
  });
});
it('denies late withdrawal of an earlier candidate after later source reads', () => {
  withCandidate((root: string, record: Record) => {
    const first = join(root, record.files[0].path),
      last = join(root, record.files.at(-1)!.path);
    const original = readFileSync(first);
    let withdrawn = false;
    try {
      expect(() =>
        verifyCandidate(root, record, {
          read: (p: string) => {
            const b = readFileSync(p);
            if (p === last && !withdrawn) {
              withdrawn = true;
              writeFileSync(first, 'UNKNOWN');
            }
            return b;
          },
        }),
      ).toThrow('Fresh complete');
    } finally {
      writeFileSync(first, original);
    }
  });
});
it('qualifies the actual ACK and C17 consumers on the exact disposable integration', () => {
  expect(qualify({ mode: 'guards' })).toMatchObject({
    status: 'PASS',
    ack: 'PASS',
    c17: 'PASS',
    canonicalSourceChanged: false,
    protectedPromotionAuthorized: false,
  });
});
it('retains25 original negative-first payment, mode and late-freshness controls', () => {
  expect(qualify({ mode: 'negatives' })).toMatchObject({
    status: 'PASS',
    cases: 25,
    protectedPromotionAuthorized: false,
  });
});

it('preserves every original launch assertion and verifier byte after the explicit fixture prefix', () => {
  withCandidate((root: string) => {
    const path = 'tests/launch-caller-payment-integration.test.ts';
    const before = execFileSync('git', [
      '--no-replace-objects',
      'show',
      '394d7fc1bbc6d6a27440e881bc3e9bf3d76befa6:' + path,
    ]);
    const after = readFileSync(join(root, path));
    const marker = Buffer.from(
      "const directory = 'proposals/launch-caller-payment-integration';",
    );
    expect(after.subarray(after.indexOf(marker))).toEqual(
      before.subarray(before.indexOf(marker)),
    );
  });
});

it('recognizes only the exact complete integrated frame and denies partial integration', () => {
  withCandidate((root: string, record: Record) => {
    const evidence = readFileSync(
      'proposals/payment-launch-integration/evidence.json',
    );
    const patch = readFileSync(
      'proposals/payment-launch-integration/integration.patch',
    );
    expect(preflight({ evidence, patch, root }).canonicalMode).toBe(
      'integrated',
    );
    const f = record.files.find((f) => f.before !== null)!;
    const path = join(root, f.path),
      current = readFileSync(path);
    const before = execFileSync('git', [
      '--no-replace-objects',
      'show',
      '394d7fc1bbc6d6a27440e881bc3e9bf3d76befa6:' + f.path,
    ]);
    try {
      writeFileSync(path, before);
      expect(() => preflight({ evidence, patch, root })).toThrow(
        'Exact complete before or integrated',
      );
    } finally {
      writeFileSync(path, current);
    }
  });
});
