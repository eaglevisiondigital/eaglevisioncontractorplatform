import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  realpathSync,
  existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  capture,
  materialize,
} from '../proposals/connection-guard-487/qualify.mjs';
let root: string, original: string, negative: string;
const folder = 'proposals/connection-guard-487/';
function check(directory: string, extra = '') {
  const url = pathToFileURL(
    join(directory, 'proposals/commercial-invoice-connection/source.ts'),
  ).href;
  const script = `${extra}\nconst g=await import(${JSON.stringify(url)});g.assertConnectionSources();`;
  execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: directory,
    timeout: 5000,
    stdio: 'pipe',
    env: { PATH: process.env.PATH },
  });
}
beforeAll(() => {
  root = materialize().directory;
  original = materialize(process.cwd(), 'original').directory;
  const q = capture();
  negative = mkdtempSync(join(realpathSync(tmpdir()), 'guard487-negative-'));
  for (const row of q.base) {
    const p = join(negative, row.path);
    mkdirSync(dirname(p), { recursive: true });
    copyFileSync(row.path, p);
    chmodSync(p, Number.parseInt(row.mode.slice(-3), 8));
  }
  for (const [name, b] of Object.entries(q.files)) {
    const p = join(negative, folder + name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, b);
  }
});
afterAll(() => {
  for (const p of [root, original, negative])
    if (p) rmSync(p, { recursive: true, force: true });
});
it('accepts complete original50 source closure without changing any original hash', () => {
  expect(() => check(original)).not.toThrow();
});
it('accepts complete #48752 source closure bound to final50db and formatted code', () => {
  expect(() => check(root)).not.toThrow();
  const m = JSON.parse(
    readFileSync(
      join(root, 'proposals/commercial-invoice-connection/source.json'),
      'utf8',
    ),
  );
  expect(m.baseline).toBe('b7387ade02d842eeb4eb8d7d1b3ab2f615963f02');
  expect(Object.keys(m.source)).toHaveLength(52);
  expect(
    m.source['proposals/commercial-invoice-connection/connection.ts'],
  ).toBe('50db32661490a3e1d7807bfffcca66dcacda1333e9578c3ab63e3e9984747d23');
  expect(
    Object.keys(m.source).some(
      (p) =>
        p.includes('commercial-customer') || p.includes('components/invoices'),
    ),
  ).toBe(false);
});
it('keeps operational and canonical F/H/G authority held', () => {
  const q = capture();
  expect(q.operationalReady).toBe(false);
  expect(q.m.canonicalFHGAdmission).toContain('HELD');
  expect(q.m.bridgeAuthorRequired).toBe(false);
});
it.each([
  'proposals/commercial-invoice-connection/connection.ts',
  'proposals/commercial-invoice-issuance/presentation.ts',
  'server/customer/broker-auth.ts',
  'scripts/invoice-caller-source-admission.mjs',
  'proposals/invoice-guard-admission/fixture-adapter.mjs',
  'server/invoices/commercial-drafts.proposed.sql',
])('unknown %s denies', (path) => {
  const p = join(root, path),
    b = readFileSync(p);
  try {
    writeFileSync(p, Buffer.concat([b, Buffer.from('\n// unknown')]));
    expect(() => check(root)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it.each([
  'proposals/commercial-invoice-connection/connection.ts',
  'proposals/commercial-invoice-issuance/presentation.ts',
])('mixed legacy/current %s denies', (path) => {
  const p = join(root, path),
    b = readFileSync(p);
  try {
    writeFileSync(p, readFileSync(join(original, path)));
    expect(() => check(root)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('coordinated helper+manifest rebinding cannot replace literal trusted hashes', () => {
  const p = join(root, 'scripts/invoice-caller-source-admission.mjs'),
    b = readFileSync(p),
    m = join(root, 'proposals/commercial-invoice-connection/source.json'),
    old = readFileSync(m);
  try {
    writeFileSync(p, 'export const accepted=true;');
    writeFileSync(
      m,
      JSON.stringify({
        source: { 'scripts/invoice-caller-source-admission.mjs': 'attacker' },
        operationalReady: true,
      }),
    );
    expect(() => check(root)).toThrow();
  } finally {
    writeFileSync(p, b);
    writeFileSync(m, old);
  }
});
it('executable mode substitution denies even with identical bytes', () => {
  const p = join(root, 'server/customer/broker-auth.ts');
  try {
    chmodSync(p, 0o755);
    expect(() => check(root)).toThrow();
  } finally {
    chmodSync(p, 0o644);
  }
});
it('symlink dependency replacement denies', () => {
  const p = join(root, 'server/customer/broker-auth.ts'),
    b = readFileSync(p),
    side = join(root, 'same-auth.txt');
  writeFileSync(side, b);
  unlinkSync(p);
  symlinkSync(side, p);
  try {
    expect(() => check(root)).toThrow();
  } finally {
    unlinkSync(p);
    writeFileSync(p, b);
    unlinkSync(side);
  }
});
it('late source withdrawal after the first full pass denies', () => {
  const helper = 'scripts/invoice-caller-source-admission.mjs',
    watch = Object.keys(
      JSON.parse(
        readFileSync(
          join(root, 'proposals/commercial-invoice-connection/source.json'),
          'utf8',
        ),
      ).source,
    ).at(-1)!,
    p = join(root, helper),
    b = readFileSync(p);
  const script = `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';const raw=fs.readFileSync;let hits=0;fs.readFileSync=(...a)=>{const b=raw(...a);if(String(a[0])===${JSON.stringify(join(root, watch))}&&++hits===1)fs.writeFileSync(${JSON.stringify(p)},'// withdrawn');return b;};syncBuiltinESMExports();`;
  try {
    expect(() => check(root, script)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it.each(['replaced', 'missing'])(
  'valid external checker cannot validate a %s canonical checker',
  (mode) => {
    const side = mkdtempSync(join(realpathSync(tmpdir()), 'guard487-side-'));
    const canonical = join(
        root,
        'proposals/commercial-invoice-connection/source.ts',
      ),
      bytes = readFileSync(canonical);
    try {
      copyFileSync(canonical, join(side, 'source.ts'));
      copyFileSync(
        join(root, 'proposals/commercial-invoice-connection/source.json'),
        join(side, 'source.json'),
      );
      if (mode === 'missing') unlinkSync(canonical);
      else writeFileSync(canonical, '// unknown');
      const script = `const g=await import(${JSON.stringify(pathToFileURL(join(side, 'source.ts')).href)});g.assertConnectionSources();`;
      expect(() =>
        execFileSync(process.execPath, ['--input-type=module', '-e', script], {
          cwd: root,
          timeout: 5000,
          stdio: 'pipe',
        }),
      ).toThrow();
    } finally {
      writeFileSync(canonical, bytes);
      rmSync(side, { recursive: true, force: true });
    }
  },
);
it('checker substitution after module evaluation denies', () => {
  const p = join(root, 'proposals/commercial-invoice-connection/source.ts'),
    b = readFileSync(p),
    url = pathToFileURL(p).href;
  const script = `import fs from'node:fs';const g=await import(${JSON.stringify(url)});fs.appendFileSync(${JSON.stringify(p)},'\n// withdrawn');g.assertConnectionSources();`;
  try {
    expect(() =>
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: root,
        timeout: 5000,
        stdio: 'pipe',
      }),
    ).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it.each([
  'guard.proposed.txt',
  'manifest.proposed.json',
  'guard-author.patch',
  'source.json',
  'git-source-proof.json',
])('sealed proposal %s cannot be substituted', (name) => {
  const p = join(negative, folder + name),
    b = readFileSync(p);
  try {
    writeFileSync(p, Buffer.concat([b, Buffer.from('\nUNKNOWN')]));
    expect(() => capture(negative)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('unknown unrelated parent bytes deny before proposing source admission', () => {
  const p = join(negative, 'README.md'),
    b = readFileSync(p);
  try {
    writeFileSync(p, 'UNKNOWN');
    expect(() => capture(negative)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('sealed proof works with no Git checkout and no network fallback', () => {
  expect(existsSync(join(negative, '.git'))).toBe(false);
  expect(capture(negative).base).toHaveLength(2455);
});
it('source-root symlink aliases deny', () => {
  const p = negative + '-alias';
  symlinkSync(negative, p);
  try {
    expect(() => capture(p)).toThrow();
  } finally {
    unlinkSync(p);
  }
});
