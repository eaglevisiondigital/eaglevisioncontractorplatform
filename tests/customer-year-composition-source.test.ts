import { afterEach, expect, it } from 'vitest';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
  renameSync,
  symlinkSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  capture,
  materialize,
} from '../proposals/customer-year-composition/qualify.mjs';
const root = process.cwd(),
  folder = 'proposals/customer-year-composition/';
const owned: string[] = [];
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
afterEach(() => {
  for (const d of owned.splice(0)) rmSync(d, { recursive: true, force: true });
});
function copy() {
  const d = mkdtempSync('/private/tmp/customer-composition-control-');
  owned.push(d);
  cpSync(root, d, {
    recursive: true,
    filter: (path) =>
      ![
        '.git',
        'node_modules',
        'dist',
        '.staging',
        'test-results',
        'playwright-report',
      ].some(
        (p) => path === join(root, p) || path.startsWith(join(root, p) + '/'),
      ),
  });
  return d;
}
it('binds actual 482/483/491 one-file author histories and keeps all operating authorities false', () => {
  const q = capture();
  expect(q.m.base).toBe('f4edc81c8e3f8012e6a7349382dde83befc91c86');
  expect(q.m.authors).toHaveLength(3);
  expect(Object.keys(q.m.overlays as object)).toEqual([
    'proposals/commercial-invoice-issuance/presentation.ts',
  ]);
  expect(q.operationalReady).toBe(false);
  expect(q.m.sourceAdmissionAuthorized).toBe(false);
  expect(q.m.installationAuthorized).toBe(false);
});
it('owned proposed image composes only actual a63 presenter with actual98 bridge/e546 decoder; canonical files stay unchanged', () => {
  const before = hash(
    readFileSync('proposals/commercial-invoice-issuance/presentation.ts'),
  );
  const image = materialize();
  owned.push(image.directory);
  expect(
    hash(
      readFileSync(
        join(
          image.directory,
          'proposals/commercial-invoice-issuance/presentation.ts',
        ),
      ),
    ),
  ).toBe('a63a605af3b1e03a0169828340f4938a50031a6f131404054da60e2db610ea6b');
  expect(
    hash(
      readFileSync(
        join(image.directory, 'proposals/commercial-customer-bridge/reader.ts'),
      ),
    ),
  ).toBe('98e502cb1e4beaa8cd6a950539a1ba1973677da9ee4e46c097b0193d6c138ea2');
  expect(
    hash(
      readFileSync(
        join(
          image.directory,
          'src/components/invoices/commercial-customer-read.ts',
        ),
      ),
    ),
  ).toBe('e546c945bf3f4993a5a5e4a62703e8e8f6b0b7473cc31a237be2050c863ee8ef');
  expect(
    hash(readFileSync('proposals/commercial-invoice-issuance/presentation.ts')),
  ).toBe(before);
});
it.each([
  'source.json',
  'presenter.proposed.txt',
  'composition.patch',
  'git-source-proof.json',
  'customer-tests.proposed.txt',
  'native-tests.proposed.txt',
  'browser-tests.proposed.txt',
  'browser-config.proposed.txt',
])('unknown packet %s denies before materialization', (path) => {
  const d = copy(),
    p = join(d, folder, path);
  writeFileSync(p, Buffer.concat([readFileSync(p), Buffer.from('\nUNKNOWN')]));
  expect(() => capture(d)).toThrow();
});
it('coordinated payload and manifest rebinding cannot replace independently reviewed source', () => {
  const d = copy(),
    p = join(d, folder, 'presenter.proposed.txt'),
    m = join(d, folder, 'source.json');
  writeFileSync(p, readFileSync(p, 'utf8') + '\n// UNKNOWN');
  const metadata = JSON.parse(readFileSync(m, 'utf8'));
  metadata.after['proposals/commercial-invoice-issuance/presentation.ts'] =
    hash(readFileSync(p));
  writeFileSync(m, JSON.stringify(metadata));
  expect(() => capture(d)).toThrow();
});
it('a mixed old bridge beside the current author receipt is denied', () => {
  const d = copy();
  writeFileSync(
    join(d, 'proposals/commercial-customer-bridge/reader.ts'),
    '// withdrawn current bridge',
  );
  expect(() => capture(d)).toThrow();
});
it('unknown retained application bytes remain rejected', () => {
  const d = copy();
  writeFileSync(join(d, 'src/main.tsx'), '// UNKNOWN');
  expect(() => capture(d)).toThrow();
});
it('identical bytes with executable mode cannot qualify', () => {
  const d = copy();
  chmodSync(join(d, 'proposals/commercial-customer-bridge/reader.ts'), 0o755);
  expect(() => capture(d)).toThrow();
});
it('a source ancestor symlink cannot become trusted authority', () => {
  const d = copy();
  renameSync(join(d, 'src'), join(d, 'source-original'));
  symlinkSync(join(d, 'source-original'), join(d, 'src'), 'dir');
  expect(() => capture(d)).toThrow();
});
it('packet withdrawal after capture starts cannot return a successful materialized image', () => {
  const d = copy(),
    p = join(d, folder, 'presenter.proposed.txt');
  const script = `import fs from'node:fs';import{syncBuiltinESMExports}from'node:module';const raw=fs.readFileSync;let done=false;fs.readFileSync=(...args)=>{const b=raw(...args);if(String(args[0])===${JSON.stringify(p)}&&!done){done=true;fs.writeFileSync(${JSON.stringify(p)},'// WITHDRAWN');}return b;};syncBuiltinESMExports();const{capture}=await import(${JSON.stringify(new URL('../proposals/customer-year-composition/qualify.mjs', import.meta.url).href)});capture(${JSON.stringify(d)});`;
  expect(() =>
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root,
      env: { PATH: process.env.PATH },
      stdio: 'pipe',
      timeout: 10000,
    }),
  ).toThrow();
  expect(readFileSync(p, 'utf8')).toBe('// WITHDRAWN');
});
