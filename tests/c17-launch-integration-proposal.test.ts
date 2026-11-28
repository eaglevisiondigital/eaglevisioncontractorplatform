import { expect, it } from 'vitest';
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const q = await import(
  new URL('../proposals/c17-launch-integration/qualify.mjs', import.meta.url)
    .href
);
const canonicalMode = (await q.preflight()).canonicalMode;
it.each([
  'tests/cycle17-integration.test.ts',
  'scripts/v1-c17-inventory-source.mjs',
])('rejects a partial known promotion of %s', async (path) => {
  const target = execFileSync('git', [
    '--no-replace-objects',
    'show',
    (canonicalMode === 'legacy'
      ? '72a5228b029a0fc52c06d9635f4e89ca096a76eb'
      : '892bf5127af2268e6066a20d259a808b5b893cec') +
      ':' +
      path,
  ]);
  await expect(
    q.preflight({
      read: (p: string) => (p.endsWith(path) ? target : readFileSync(p)),
    }),
  ).rejects.toThrow('Exact complete legacy or integrated C17 bundle');
});
it('denies coordinated helper and metadata rebinding before any path read', async () => {
  const record = JSON.parse(
    readFileSync('proposals/c17-launch-integration/evidence.json', 'utf8'),
  );
  const replacement = Buffer.from('throw Error("UNVERIFIED_HELPER_EXECUTED")');
  record.companions[0].sha256 = createHash('sha256')
    .update(replacement)
    .digest('hex');
  let reads = 0;
  await expect(
    q.preflight({
      evidence: Buffer.from(JSON.stringify(record)),
      read: () => {
        reads++;
        return replacement;
      },
    }),
  ).rejects.toThrow('Exact finite integration evidence');
  expect(reads).toBe(0);
});
it('qualifies the real integrated checker and original31/new17 controls', async () => {
  expect(await q.qualify()).toEqual({
    mode: 'controls',
    passed: 48,
    failed: 0,
    canonicalMode,
    canonicalChanged: false,
    protectedPromotionAuthorized: false,
    operationalReady: false,
  });
});
it.each([
  ['retained-launch', 5],
  ['retained-checker', 2],
] as const)(
  'retains original %s assertions under their separate unchanged budgets',
  async (mode, passed) => {
    expect(await q.qualify({ mode })).toMatchObject({
      mode,
      passed,
      failed: 0,
      canonicalChanged: false,
      protectedPromotionAuthorized: false,
    });
  },
);
it('captures a helper once before import instead of executing a later unverified read', async () => {
  let reads = 0;
  const r = await q.preflight({
    read: (p: string) => {
      if (p.endsWith('retained-fixture.mjs')) {
        reads++;
        if (reads > 1)
          return Buffer.from('throw Error("UNVERIFIED_HELPER_EXECUTED")');
      }
      return readFileSync(p);
    },
  });
  expect(r.canonicalMode).toBe(canonicalMode);
  expect(reads).toBe(1);
});
it('rejects invented promotion authority before using evidence paths', async () => {
  const r = JSON.parse(
    readFileSync('proposals/c17-launch-integration/evidence.json', 'utf8'),
  );
  r.protectedPromotionAuthorized = true;
  await expect(
    q.preflight({ evidence: Buffer.from(JSON.stringify(r)) }),
  ).rejects.toThrow('Exact finite integration evidence');
});
it('rejects a replacement promotion patch', async () => {
  await expect(
    q.preflight({ patch: Buffer.from('UNREVIEWED') }),
  ).rejects.toThrow('Exact five-file promotion patch');
});
it('rejects helper substitution before importing it', async () => {
  await expect(
    q.preflight({
      read: (p: string) =>
        p.endsWith('retained-fixture.mjs')
          ? Buffer.from('throw Error("UNVERIFIED_HELPER_EXECUTED")')
          : readFileSync(p),
    }),
  ).rejects.toThrow('Exact finite companion bytes');
});
it.each([
  'scripts/v1-c17-inventory-source.mjs',
  'tests/cycle17-integration.test.ts',
  'tests/v1-c17-inventory-source.test.mjs',
])(
  'denies unknown current %s instead of a historical-read bypass',
  async (path) => {
    await expect(
      q.preflight({
        read: (p: string) =>
          p.endsWith(path)
            ? Buffer.concat([readFileSync(p), Buffer.from('\n// UNREVIEWED')])
            : readFileSync(p),
      }),
    ).rejects.toThrow('Exact complete legacy or integrated C17 bundle');
  },
);
it('rejects a symlinked current checker', async () => {
  await expect(
    q.preflight({
      stat: (p: string) =>
        p.endsWith('scripts/v1-c17-inventory-source.mjs')
          ? { isFile: () => true, isSymbolicLink: () => true, mode: 0o100644 }
          : lstatSync(p),
    }),
  ).rejects.toThrow('Exact regular C17 source');
});
