import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  chmodSync,
  writeFileSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { capture } from '../proposals/year-numbering-compatibility/qualify.mjs';
let root: string;
const folder = 'proposals/year-numbering-compatibility/';
beforeAll(() => {
  const q = capture();
  root = mkdtempSync(join(realpathSync(tmpdir()), 'number-frame-negative-'));
  for (const row of q.base) {
    const target = join(root, row.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(row.path, target);
    chmodSync(target, Number.parseInt(row.mode.slice(-3), 8));
  }
  for (const name of Object.keys(q.files)) {
    const target = join(root, folder + name);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(folder + name, target);
  }
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
it('binds the exact separate authored frames and does not authorize source admission', () => {
  const q = capture(root);
  expect(q.base).toHaveLength(2455);
  expect(q.m.base).toBe('28d489a7cc41fff573efdf6ab4fd58de234340ad');
  expect(q.m.external).toBe('9889c2dae63338610973b1e000c4d0413d08cea3');
  expect(q.operationalReady).toBe(false);
  expect(q.m.sourceAdmissionAuthorized).toBe(false);
  expect(q.m.canonicalFHGAdmission).toContain('HELD');
});
it.each([
  'connection.proposed.txt',
  'source.proposed.txt',
  'reader.proposed.txt',
  'connection-author.patch',
  'connection-guard-author.patch',
  'browser-config.proposed.txt',
  'git-source-proof.json',
  'reader-author.patch',
  'source.json',
  'connection-tests.proposed.txt',
  'bridge-tests.proposed.txt',
  'native-tests.proposed.txt',
  'browser-tests.proposed.txt',
])('denies substituted sealed %s before evaluation', (name) => {
  const p = join(root, folder + name),
    b = readFileSync(p);
  try {
    writeFileSync(p, Buffer.concat([b, Buffer.from('\n// substituted')]));
    expect(() => capture(root)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('rejects coordinated manifest and payload rebinding', () => {
  const p = join(root, folder + 'source.json'),
    a = join(root, folder + 'reader.proposed.txt'),
    b = readFileSync(p),
    c = readFileSync(a);
  try {
    writeFileSync(a, 'export const operationalReady=true;');
    writeFileSync(
      p,
      JSON.stringify({ base: 'unknown', operationalReady: true, after: {} }),
    );
    expect(() => capture(root)).toThrow();
  } finally {
    writeFileSync(p, b);
    writeFileSync(a, c);
  }
});
it('denies mixed old presenter/new-decoder parent bytes', () => {
  const p = join(root, 'proposals/commercial-invoice-issuance/presentation.ts'),
    b = readFileSync(p);
  try {
    writeFileSync(p, '// old or mixed presenter');
    expect(() => capture(root)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('denies unknown changes outside the candidate targets', () => {
  const p = join(root, 'server/invoices/commercial-draft-client.ts'),
    b = readFileSync(p);
  try {
    writeFileSync(p, Buffer.concat([b, Buffer.from('\n// unknown')]));
    expect(() => capture(root)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('denies executable-mode substitution', () => {
  const p = join(root, folder + 'reader.proposed.txt');
  try {
    chmodSync(p, 0o755);
    expect(() => capture(root)).toThrow();
  } finally {
    chmodSync(p, 0o644);
  }
});
it('denies symlink payload even when the bytes match', () => {
  const p = join(root, folder + 'reader.proposed.txt'),
    b = readFileSync(p),
    side = join(root, 'same-reader.txt');
  writeFileSync(side, b);
  unlinkSync(p);
  symlinkSync(side, p);
  try {
    expect(() => capture(root)).toThrow();
  } finally {
    unlinkSync(p);
    writeFileSync(p, b);
    unlinkSync(side);
  }
});

it('denies a symlink alias for the complete source root', () => {
  const alias = root + '-alias';
  symlinkSync(root, alias);
  try {
    expect(() => capture(alias)).toThrow();
  } finally {
    unlinkSync(alias);
  }
});

it('rejects a packet withdrawn during the final source-frame pass', () => {
  const last = capture(root).base.at(-1)!.path;
  const packet = join(root, folder + 'reader.proposed.txt');
  const bytes = readFileSync(packet);
  const original = fs.readFileSync;
  let observed = 0;
  const replacement = ((...args: unknown[]) => {
    const value = Reflect.apply(original, fs, args);
    if (String(args[0]) === join(root, last) && ++observed === 2)
      writeFileSync(packet, '// withdrawn after capture');
    return value;
  }) as typeof fs.readFileSync;
  Object.defineProperty(fs, 'readFileSync', {
    value: replacement,
    writable: true,
    configurable: true,
  });
  syncBuiltinESMExports();
  try {
    expect(() => capture(root)).toThrow();
    expect(observed).toBe(2);
  } finally {
    Object.defineProperty(fs, 'readFileSync', {
      value: original,
      writable: true,
      configurable: true,
    });
    syncBuiltinESMExports();
    writeFileSync(packet, bytes);
  }
});

it('rejects baseline withdrawal during the final packet-seal pass', () => {
  const target = join(root, 'README.md'),
    bytes = readFileSync(target);
  const watch = join(root, folder + 'connection-guard-author.patch');
  const original = fs.readFileSync;
  let observed = 0;
  const replacement = ((...args: unknown[]) => {
    const value = Reflect.apply(original, fs, args);
    if (String(args[0]) === watch && ++observed === 2)
      writeFileSync(target, '// baseline withdrawn');
    return value;
  }) as typeof fs.readFileSync;
  Object.defineProperty(fs, 'readFileSync', {
    value: replacement,
    writable: true,
    configurable: true,
  });
  syncBuiltinESMExports();
  try {
    expect(() => capture(root)).toThrow();
    expect(observed).toBe(2);
  } finally {
    Object.defineProperty(fs, 'readFileSync', {
      value: original,
      writable: true,
      configurable: true,
    });
    syncBuiltinESMExports();
    writeFileSync(target, bytes);
  }
});

it('complete source proof qualifies without a Git checkout or network fallback', () => {
  expect(existsSync(join(root, '.git'))).toBe(false);
  expect(capture(root).base).toHaveLength(2455);
});
