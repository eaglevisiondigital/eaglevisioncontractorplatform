import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const { admitPaymentResponseSource: admit } =
  await import('../../scripts/payment-response-source-admission.mjs');
const target = 'server/payments/sandbox.ts';
const expected =
  '89dc2b03f273ee00c73e8342fcf9e8db6d78d5f898bde96ccff94e69fc0276cc';
const git = (...a) =>
  execFileSync('git', ['--no-replace-objects', ...a], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const original = (c, p) => git('show', `${c}:${p}`);
test('admits only exact96b current source with independent original and fresh evidence', () =>
  assert.equal(admit(target, readFileSync(target), expected), true));
for (const mode of [
  'expected',
  'argument',
  'current',
  'decoder',
  'parent',
  'delta',
  'author-mode',
  'parent-mode',
  'prior-decoder',
  'authored',
  'parent-source',
  'symlink',
  'ancestor',
  'file-mode',
  'not-file',
  'stale-read',
]) {
  test(`denies ${mode} substitution`, () => {
    let reads = 0;
    const readCurrent = (p) => {
      if (
        (mode === 'current' && p === target) ||
        (mode === 'decoder' && p.endsWith('response-json.ts'))
      )
        return Buffer.from('UNKNOWN');
      if (mode === 'stale-read' && p === target && ++reads === 1)
        return Buffer.from('UNKNOWN');
      return readFileSync(p);
    };
    const metadata = (...a) => {
      if (mode === 'parent' && a.includes('--format=%P'))
        return Buffer.from('0'.repeat(40));
      if (mode === 'delta' && a[0] === 'diff-tree')
        return Buffer.from(git(...a).toString() + '\nM\tother');
      if (
        (mode === 'author-mode' || mode === 'parent-mode') &&
        a[0] === 'ls-tree' &&
        a[1].startsWith(mode === 'author-mode' ? '96b' : '892') &&
        a.at(-1) === target
      )
        return Buffer.from(`100755 blob ${'0'.repeat(40)}\t${target}`);
      if (
        mode === 'prior-decoder' &&
        a[0] === 'ls-tree' &&
        a[1].startsWith('892') &&
        a.at(-1).endsWith('response-json.ts')
      )
        return Buffer.from(`100644 blob ${'0'.repeat(40)}\t${a.at(-1)}`);
      return git(...a);
    };
    const readOriginal = (c, p) =>
      (mode === 'authored' && c.startsWith('96b')) ||
      (mode === 'parent-source' && c.startsWith('892'))
        ? Buffer.from('UNKNOWN')
        : original(c, p);
    const stat = (p) => {
      const s = lstatSync(p);
      return {
        isSymbolicLink: () =>
          (mode === 'symlink' && p === target) ||
          (mode === 'ancestor' && p === 'server/payments') ||
          s.isSymbolicLink(),
        isFile: () =>
          mode === 'not-file' && p === target ? false : s.isFile(),
        mode: mode === 'file-mode' && p === target ? 0o100755 : s.mode,
      };
    };
    assert.throws(() =>
      admit(
        target,
        mode === 'argument' ? Buffer.from('UNKNOWN') : readFileSync(target),
        mode === 'expected' ? '0'.repeat(64) : expected,
        { readCurrent, readOriginal, metadata, stat },
      ),
    );
  });
}
test('unrelated paths and decoder cannot acquire an old-source exemption', () => {
  assert.equal(
    admit('server/providers/control.ts', Buffer.from('UNKNOWN'), expected),
    false,
  );
  assert.equal(
    admit('server/payments/response-json.ts', Buffer.from('UNKNOWN'), expected),
    false,
  );
});
// Withdrawal during a later read must invalidate earlier bundle evidence.
for (const mode of ['late-refund', 'late-decoder', 'late-mode']) {
  test(`denies ${mode} withdrawn during the final initial sandbox read`, () => {
    let withdrawn = false;
    const victim =
      mode === 'late-decoder'
        ? 'server/payments/response-json.ts'
        : 'server/payments/refunds.ts';
    const readCurrent = (p) => {
      const bytes = readFileSync(p);
      if (p === target) withdrawn = true;
      return withdrawn && p === victim && mode !== 'late-mode'
        ? Buffer.from('LATE_UNKNOWN')
        : bytes;
    };
    const stat = (p) => {
      const s = lstatSync(p);
      return {
        isSymbolicLink: () => s.isSymbolicLink(),
        isFile: () => s.isFile(),
        mode:
          withdrawn && p === victim && mode === 'late-mode' ? 0o100755 : s.mode,
      };
    };
    assert.throws(() =>
      admit(target, readFileSync(target), expected, { readCurrent, stat }),
    );
  });
}
const { verifyPaymentFrame } = await import('./fixture-adapter.mjs');
for (const mode of ['late-frame', 'late-decoder', 'late-mode']) {
  test(`fixture denies ${mode} withdrawal after metadata checks`, () => {
    let withdrawn = false;
    const victim =
      mode === 'late-decoder'
        ? 'server/payments/response-json.ts'
        : 'tests/invoice-caller-migration-source.test.ts';
    const metadata = (...args) => {
      const bytes = git(...args);
      if (
        args[0] === 'show' &&
        args[1] ===
          '892bf5127af2268e6066a20d259a808b5b893cec:server/payments/sandbox.ts'
      )
        withdrawn = true;
      return bytes;
    };
    const read = (p) =>
      withdrawn && p === victim && mode !== 'late-mode'
        ? Buffer.from('LATE_UNKNOWN')
        : readFileSync(p);
    const stat = (p) => {
      const s = lstatSync(p);
      return {
        isSymbolicLink: () => s.isSymbolicLink(),
        isFile: () => s.isFile(),
        mode:
          withdrawn && p === victim && mode === 'late-mode' ? 0o100755 : s.mode,
      };
    };
    assert.throws(() => verifyPaymentFrame({ read, stat, git: metadata }));
  });
}
test('rechecks the exact supplied source argument after later bundle reads', () => {
  const path = 'server/payments/refunds.ts';
  const argument = Buffer.from(readFileSync(path));
  const readCurrent = (p) => {
    if (p === 'server/payments/response-json.ts') argument.fill(63);
    return readFileSync(p);
  };
  assert.throws(() =>
    admit(
      path,
      argument,
      '78f74ab633f3ba192d447ffb1b77f8d027c38df49ea0fd6f06b9fb65df2490a5',
      { readCurrent },
    ),
  );
});
