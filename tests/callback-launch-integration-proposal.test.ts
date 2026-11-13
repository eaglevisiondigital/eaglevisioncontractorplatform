import { expect, it } from 'vitest';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const q = await import(
  new URL(
    '../proposals/callback-launch-integration/qualify.mjs',
    import.meta.url,
  ).href
);
type Record = {
  files: { path: string; before: string | null; after: string }[];
};
it('recognizes only a complete known source frame without promoting it', () => {
  const r = q.preflight();
  expect(['before', 'integrated']).toContain(r.canonicalMode);
  expect(r.record.files).toHaveLength(3);
  expect(r.record.protectedPromotionAuthorized).toBe(false);
});
it('denies jointly rebound metadata and patch before following supplied paths', () => {
  const r = JSON.parse(
    readFileSync('proposals/callback-launch-integration/evidence.json', 'utf8'),
  );
  r.files[0].after = '0'.repeat(64);
  let reads = 0;
  expect(() =>
    q.preflight({
      evidence: Buffer.from(JSON.stringify(r)),
      patch: Buffer.from('UNKNOWN'),
      read: () => {
        reads++;
        return Buffer.from('UNKNOWN');
      },
    }),
  ).toThrow('Exact finite callback record');
  expect(reads).toBe(0);
  expect(() => q.preflight({ patch: Buffer.from('UNKNOWN') })).toThrow(
    'Exact three-file callback patch',
  );
});
it('boots the complete after frame and rejects a partial known promotion', () => {
  q.withCandidate((root: string, record: Record) => {
    const evidence = readFileSync(
        'proposals/callback-launch-integration/evidence.json',
      ),
      patch = readFileSync(
        'proposals/callback-launch-integration/integration.patch',
      );
    expect(q.preflight({ evidence, patch, root }).canonicalMode).toBe(
      'integrated',
    );
    const f = record.files[0],
      p = join(root, f.path),
      after = readFileSync(p);
    try {
      writeFileSync(
        p,
        execFileSync('git', [
          '--no-replace-objects',
          'show',
          '27300dbaff877d18ecb219a2c9000c96e7c3e8c8:' + f.path,
        ]),
      );
      expect(() => q.preflight({ evidence, patch, root })).toThrow(
        'Exact complete callback',
      );
    } finally {
      writeFileSync(p, after);
    }
  });
});
it('rejects unknown endpoints and unrelated Auth/source changes before source execution', () => {
  q.withCandidate((root: string, record: Record) => {
    for (const f of record.files) {
      const p = join(root, f.path),
        b = readFileSync(p);
      try {
        writeFileSync(p, 'UNKNOWN');
        expect(() => q.verifyCandidate(root, record)).toThrow();
      } finally {
        writeFileSync(p, b);
      }
    }
    const p = join(root, 'server/customer/broker-auth.ts'),
      b = readFileSync(p);
    try {
      writeFileSync(p, Buffer.concat([b, Buffer.from('\n// UNKNOWN\n')]));
      expect(() => q.verifyCandidate(root, record)).toThrow(
        'Only three callback endpoints',
      );
    } finally {
      writeFileSync(p, b);
    }
  });
});
it('denies executable source modes and rebound candidate records', () => {
  q.withCandidate((root: string, record: Record) => {
    const p = join(root, record.files[0].path);
    try {
      chmodSync(p, 0o755);
      expect(() => q.verifyCandidate(root, record)).toThrow('Regular0644');
    } finally {
      chmodSync(p, 0o644);
    }
    const rebound = structuredClone(record);
    rebound.files[0].after = '0'.repeat(64);
    expect(() => q.verifyCandidate(root, rebound)).toThrow(
      'Exact candidate record',
    );
  });
});
it('denies late earlier-source withdrawal after a later endpoint read', () => {
  q.withCandidate((root: string, record: Record) => {
    const first = join(root, record.files[0].path),
      last = join(root, record.files[2].path),
      b = readFileSync(first);
    let withdrawn = false;
    try {
      expect(() =>
        q.verifyCandidate(root, record, {
          read: (p: string) => {
            const value = readFileSync(p);
            if (p === last && !withdrawn) {
              withdrawn = true;
              writeFileSync(first, 'UNKNOWN');
            }
            return value;
          },
        }),
      ).toThrow('Fresh exact');
    } finally {
      writeFileSync(first, b);
    }
  });
});
it('qualifies actual ACK and C17 consumers plus all original eight live invoice guards', () => {
  expect(q.qualify({ mode: 'guards' })).toEqual({
    mode: 'guards',
    passed: 8,
    failed: 0,
    ack: 'PASS',
    c17: 'PASS',
    canonicalSourceChanged: false,
    protectedPromotionAuthorized: false,
  });
});
