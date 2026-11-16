import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  realpathSync,
  chmodSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  capture,
  materialize,
  verifyMaterialized,
} from '../proposals/customer-payment-ack-composition/qualify.mjs';
const root = process.cwd(),
  folder = 'proposals/customer-payment-ack-composition/',
  q = capture();
let image: string, negative: string;
beforeAll(() => {
  image = materialize().directory;
  negative = mkdtempSync(
    join(realpathSync(tmpdir()), 'ack-composition-negative-'),
  );
  cpSync(root, negative, {
    recursive: true,
    filter: (p) =>
      !['.git', 'node_modules'].some(
        (n) => p === join(root, n) || p.startsWith(join(root, n) + '/'),
      ),
  });
});
afterAll(() => {
  for (const p of [image, negative])
    if (p) rmSync(p, { recursive: true, force: true });
});
it('qualifies only declared actual502/498 source union, with all operating authorities held', () => {
  expect(q.m.base).toBe('14521c14ceb27056d96b265d55ce69266733f7c3');
  expect(q.m.external).toBe('4bcd77aab2c16d57e126f9a10b9135437c231ca8');
  expect(q.base).toHaveLength(2477);
  expect(verifyMaterialized(image).files).toBe(2482);
  expect(q.m.installationAuthorized).toBe(false);
  expect(q.operationalReady).toBe(false);
  expect(q.m.A2GuardAdmission).toContain('EXCLUDED');
});
it.each([
  'original-reader.proposed.txt',
  'receipt-sql.proposed.txt',
  'readback.proposed.txt',
  'unit-tests.proposed.txt',
  'native-tests.proposed.txt',
])('withdrawn or substituted %s cannot qualify', (file) => {
  const p = join(negative, folder + file),
    b = readFileSync(p);
  try {
    writeFileSync(p, '// withdrawn');
    expect(() => capture(negative)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('coordinated wrapper and mutable metadata rebinding remains denied', () => {
  const p = join(negative, folder + 'readback.proposed.txt'),
    m = join(negative, folder + 'source.json'),
    a = readFileSync(p),
    b = readFileSync(m);
  try {
    writeFileSync(p, '// new unknown authority');
    const data = JSON.parse(b.toString());
    data.after['proposals/customer-payment-ack-composition/reader.ts'] =
      createHash('sha256').update(readFileSync(p)).digest('hex');
    writeFileSync(m, JSON.stringify(data));
    expect(() => capture(negative)).toThrow();
  } finally {
    writeFileSync(p, a);
    writeFileSync(m, b);
  }
});
it('changed parent capture observer cannot be projected into trusted history', () => {
  const p = join(negative, 'proposals/customer-payment-link-lifecycle/read.ts'),
    b = readFileSync(p);
  try {
    writeFileSync(p, '// foreign');
    expect(() => capture(negative)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('unreviewed extra image source is not hidden by exact known payloads', () => {
  const p = join(image, 'src/unreviewed-ack.ts');
  try {
    writeFileSync(p, '// unknown');
    expect(() => verifyMaterialized(image)).toThrow();
  } finally {
    unlinkSync(p);
  }
});
it('source mode substitution cannot qualify', () => {
  const p = join(image, 'proposals/invoice-payment-receipt/reader.ts');
  try {
    chmodSync(p, 0o755);
    expect(() => verifyMaterialized(image)).toThrow();
  } finally {
    chmodSync(p, 0o644);
  }
});
it('late wrapper withdrawal cannot return a qualified source image', () => {
  const p = join(negative, folder + 'readback.proposed.txt'),
    b = readFileSync(p);
  try {
    const code = `import fs from'node:fs';import{syncBuiltinESMExports}from'node:module';const raw=fs.readFileSync;let done=false;fs.readFileSync=(...a)=>{const b=raw(...a);if(String(a[0])===${JSON.stringify(p)}&&!done){done=true;fs.writeFileSync(${JSON.stringify(p)},'// WITHDRAWN');}return b;};syncBuiltinESMExports();const{materialize}=await import(${JSON.stringify(new URL('../proposals/customer-payment-ack-composition/qualify.mjs', import.meta.url).href)});materialize(${JSON.stringify(negative)});`;
    expect(() =>
      execFileSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: root,
        timeout: 10000,
        stdio: 'pipe',
      }),
    ).toThrow();
    expect(readFileSync(p, 'utf8')).toBe('// WITHDRAWN');
  } finally {
    writeFileSync(p, b);
  }
});
it('image withdrawal during final source capture is rejected by a final complete after audit', () => {
  const p = join(root, folder + 'readback.proposed.txt'),
    target = join(
      image,
      'proposals/customer-payment-ack-composition/reader.ts',
    ),
    b = readFileSync(target);
  try {
    const code = `import fs from'node:fs';import{syncBuiltinESMExports}from'node:module';const raw=fs.readFileSync;let hits=0;fs.readFileSync=(...a)=>{const b=raw(...a);if(String(a[0])===${JSON.stringify(p)}&&++hits===3)fs.writeFileSync(${JSON.stringify(target)},'// WITHDRAWN AFTER AUDITS');return b;};syncBuiltinESMExports();const{verifyMaterialized}=await import(${JSON.stringify(new URL('../proposals/customer-payment-ack-composition/qualify.mjs', import.meta.url).href)});verifyMaterialized(${JSON.stringify(image)},${JSON.stringify(root)});`;
    expect(() =>
      execFileSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: root,
        timeout: 10000,
        stdio: 'pipe',
      }),
    ).toThrow();
    expect(readFileSync(target, 'utf8')).toBe('// WITHDRAWN AFTER AUDITS');
  } finally {
    writeFileSync(target, b);
  }
});
