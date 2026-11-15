import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  lstatSync,
  chmodSync,
  mkdirSync,
  symlinkSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import {
  capture,
  materialize,
  verifyMaterialized,
} from '../proposals/customer-canonical-integration/qualify.mjs';
const root = process.cwd(),
  folder = 'proposals/customer-canonical-integration/',
  q = capture();
const additions = Object.keys(q.m.overlays as Record<string, string>),
  owned: string[] = [];
let image: string, negative: string;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
beforeAll(() => {
  image = materialize().directory;
  owned.push(image);
  execFileSync('git', ['init', '-q', image]);
  writeFileSync(
    join(image, '.git/objects/info/alternates'),
    join(root, '.git/objects') + '\n',
  );
  negative = mkdtempSync('/private/tmp/customer-canonical-negative-');
  owned.push(negative);
  cpSync(root, negative, {
    recursive: true,
    filter: (p) =>
      !['.git', 'node_modules'].some(
        (n) => p === join(root, n) || p.startsWith(join(root, n) + '/'),
      ),
  });
});
afterAll(() => {
  for (const p of owned) rmSync(p, { recursive: true, force: true });
});
it('binds actual canonical497 and customer496, exactly ten absent additions, and independently held operating authority', () => {
  expect(q.m.base).toBe('d162372c321039f49c1d168bbde8c041b872c182');
  expect(q.m.external).toBe('311cc54219ee6296dd55bd2c00df388c9f02cd47');
  expect(q.base).toHaveLength(2458);
  expect(additions).toHaveLength(10);
  expect(q.m.sourceClosure as string[]).toHaveLength(33);
  expect(q.operationalReady).toBe(false);
  expect(q.m.launchIntegrationAuthorized).toBe(false);
  expect(q.m.installationAuthorized).toBe(false);
  for (const p of additions) expect(existsSync(p)).toBe(false);
});
it('qualifies exact2468 after-source with original actual capacity/H/G guards, not a historical projection', () => {
  expect(verifyMaterialized(image).files).toBe(2468);
  const script =
    "const{checkCommercialCapacity}=await import('./scripts/check-commercial-capacity.mjs');const{verifyInvoiceGuardFrame}=await import('./scripts/invoice-caller-source-admission.mjs');const{assertConnectionSources}=await import('./proposals/commercial-invoice-connection/source.ts');if(checkCommercialCapacity(process.cwd()).sourcePhase!=='492')throw Error('Wrong phase');verifyInvoiceGuardFrame();assertConnectionSources();";
  expect(() =>
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: image,
      timeout: 10000,
      env: { PATH: process.env.PATH },
      stdio: 'pipe',
    }),
  ).not.toThrow();
});
it('retains the entire33 customer/fixture import closure byte-for-byte with original private anchors, current Auth and public privacy decoder', () => {
  const external = q.m.externalFiles as Record<string, string>;
  for (const p of q.m.sourceClosure as string[])
    expect(sha(readFileSync(join(image, p)))).toBe(external[p]);
  for (const p of [
    'server/customer/broker-auth.ts',
    'scripts/invoice-caller-source-admission.mjs',
    'proposals/commercial-invoice-connection/source.ts',
    'server/payments/commercial-capacity.proposed.sql',
  ])
    expect(readFileSync(join(image, p)).equals(readFileSync(p))).toBe(true);
});
it.each(additions)(
  'unknown copied endpoint %s is rejected before materialization',
  (path) => {
    const n = (q.m.overlays as Record<string, string>)[path]!,
      p = join(negative, folder + n),
      before = readFileSync(p);
    try {
      writeFileSync(p, Buffer.concat([before, Buffer.from('\n// UNKNOWN')]));
      expect(() => capture(negative)).toThrow();
    } finally {
      writeFileSync(p, before);
    }
  },
);
it('coordinated payload and mutable manifest substitution cannot select new source', () => {
  const n = (q.m.overlays as Record<string, string>)[additions[0]!]!,
    p = join(negative, folder + n),
    m = join(negative, folder + 'source.json'),
    a = readFileSync(p),
    b = readFileSync(m);
  try {
    writeFileSync(p, '// foreign');
    const meta = JSON.parse(b.toString());
    meta.after[additions[0]!] = sha(readFileSync(p));
    writeFileSync(m, JSON.stringify(meta));
    expect(() => capture(negative)).toThrow();
  } finally {
    writeFileSync(p, a);
    writeFileSync(m, b);
  }
});
it.each(['file', 'directory', 'dangling-ancestor'])(
  'incomplete/mixed before-frame %s is denied, never treated as admitted customer source',
  (kind) => {
    const p = join(negative, additions[0]!),
      dir = dirname(p);
    expect(existsSync(dir)).toBe(false);
    try {
      if (kind === 'dangling-ancestor')
        symlinkSync(join(negative, 'absent-target'), dir, 'dir');
      else {
        mkdirSync(dir);
        if (kind === 'file')
          writeFileSync(p, readFileSync(join(image, additions[0]!)));
        else mkdirSync(p);
      }
      expect(() => capture(negative)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
it.each([
  'src/unreviewed-customer.ts',
  'supabase/migrations/99999999999999_unreviewed.sql',
])('unrelated extra source %s is denied in exactafter inventory', (path) => {
  const p = join(image, path);
  try {
    writeFileSync(p, '// unreviewed');
    expect(() => verifyMaterialized(image)).toThrow();
  } finally {
    unlinkSync(p);
  }
});
it('a missing single reviewed addition cannot qualify the after-frame', () => {
  const p = join(image, additions[0]!),
    b = readFileSync(p);
  try {
    unlinkSync(p);
    expect(() => verifyMaterialized(image)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('identical bytes with a changed executable mode cannot qualify', () => {
  const p = join(image, additions[0]!);
  try {
    chmodSync(p, 0o755);
    expect(() => verifyMaterialized(image)).toThrow();
  } finally {
    chmodSync(p, 0o644);
  }
});
it('a canonical source substitution remains denied alongside exact customer additions', () => {
  const p = join(
      image,
      'proposals/commercial-invoice-issuance/presentation.ts',
    ),
    b = readFileSync(p);
  try {
    writeFileSync(p, '// foreign presenter');
    expect(() => verifyMaterialized(image)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('late withdrawal while a payload is captured cannot return a materialized success', () => {
  const target = join(
      negative,
      folder + (q.m.overlays as Record<string, string>)[additions[0]!]!,
    ),
    before = readFileSync(target);
  try {
    const code = `import fs from'node:fs';import{syncBuiltinESMExports}from'node:module';const raw=fs.readFileSync;let changed=false;fs.readFileSync=(...a)=>{const b=raw(...a);if(String(a[0])===${JSON.stringify(target)}&&!changed){changed=true;fs.writeFileSync(${JSON.stringify(target)},'// WITHDRAWN');}return b;};syncBuiltinESMExports();const{materialize}=await import(${JSON.stringify(new URL('../proposals/customer-canonical-integration/qualify.mjs', import.meta.url).href)});materialize(${JSON.stringify(negative)});`;
    expect(() =>
      execFileSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: root,
        timeout: 10000,
        stdio: 'pipe',
        env: { PATH: process.env.PATH },
      }),
    ).toThrow();
    expect(readFileSync(target, 'utf8')).toBe('// WITHDRAWN');
  } finally {
    writeFileSync(target, before);
  }
});
it('complete parent byte/mode/ancestor proof remains current after qualification', () => {
  expect(capture().m.baseTree).toBe('6a8af2192c328d1e220793b2b0321b6e881fac7b');
  expect(lstatSync('src').isSymbolicLink()).toBe(false);
});
it('reuses native and browser evidence only for the exact matched source, fixture and SQL inputs', () => {
  const reuse = JSON.parse(q.files['reuse-boundaries.json']!.toString()) as {
    nativeLocalImports: Record<string, string>;
    nativeSQLInputs: Record<string, string>;
    payloadHashes: Record<string, string>;
  };
  expect(Object.keys(reuse.nativeLocalImports)).toHaveLength(25);
  expect(reuse.payloadHashes.native10).toBe(
    '3194f274920e8c138036d1dfbadc77bacb22a2146817a03da0e60f1b0c2386f4',
  );
  expect(reuse.payloadHashes.browser6).toBe(
    '4c4ffaf268358cefdc7145ed9be71df654021e6d72362eb7a4d75fc32deadbfa',
  );
  for (const [path, digest] of Object.entries({
    ...reuse.nativeLocalImports,
    ...reuse.nativeSQLInputs,
  }))
    expect(sha(readFileSync(join(image, path)))).toBe(digest);
});
