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
import { createHash } from 'node:crypto';
import {
  capture,
  materialize,
  verifyMaterialized,
} from '../proposals/launch-479-492/qualify.mjs';
const folder = 'proposals/launch-479-492/',
  guard = 'scripts/check-commercial-capacity.mjs',
  hp = 'scripts/invoice-caller-source-admission.mjs',
  sql = 'server/payments/commercial-capacity.proposed.sql';
const frozen = capture();
const targets = Object.keys(frozen.m.overlays as Record<string, string>);
let after: string, before: string, negative: string;
const originals: Record<string, Buffer | undefined> = {},
  payloads: Record<string, Buffer> = {};
function metadata(root: string) {
  execFileSync('git', ['init', '-q', root]);
  writeFileSync(
    join(root, '.git/objects/info/alternates'),
    join(process.cwd(), '.git/objects') + '\n',
  );
}
function current(root: string, extra = '', all = true) {
  const bytes = readFileSync(join(root, guard));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    frozen.m.after && (frozen.m.after as Record<string, string>)[guard],
  );
  const code = `${extra}\nconst cap=await import(${JSON.stringify('data:text/javascript;base64,' + bytes.toString('base64'))});const c=cap.checkCommercialCapacity(${JSON.stringify(root)});if(c.sourcePhase!=='492'||c.installationAuthorized!==false)throw Error('Exact current union required');${all ? `const h=await import(${JSON.stringify(pathToFileURL(join(root, hp)).href)});h.verifyInvoiceGuardFrame();const g=await import(${JSON.stringify(pathToFileURL(join(root, 'proposals/commercial-invoice-connection/source.ts')).href)});g.assertConnectionSources();` : ''}`;
  execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    timeout: 5000,
    stdio: 'pipe',
    env: { PATH: process.env.PATH },
  });
}
beforeAll(() => {
  after = materialize().directory;
  before = materialize(process.cwd(), 'before').directory;
  metadata(after);
  metadata(before);
  for (const [path, name] of Object.entries(
    frozen.m.overlays as Record<string, string>,
  )) {
    originals[path] = existsSync(path) ? readFileSync(path) : undefined;
    payloads[path] = frozen.files[name];
  }
  negative = mkdtempSync(
    join(realpathSync(tmpdir()), 'launch479492-negative-'),
  );
  for (const row of frozen.base) {
    const p = join(negative, row.path);
    mkdirSync(dirname(p), { recursive: true });
    copyFileSync(row.path, p);
    chmodSync(p, Number.parseInt(row.mode.slice(-3), 8));
  }
  for (const [name, bytes] of Object.entries(frozen.files)) {
    const p = join(negative, folder + name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, bytes);
  }
});
afterAll(() => {
  for (const p of [after, before, negative])
    if (p) rmSync(p, { recursive: true, force: true });
});
it('keeps exact #479 before frame valid without promoting #492', () => {
  expect(() =>
    execFileSync(process.execPath, [join(before, guard)], {
      cwd: before,
      timeout: 5000,
      stdio: 'pipe',
    }),
  ).not.toThrow();
  expect(() => verifyMaterialized(before)).toThrow();
});
it('qualifies the complete union and all actual capacity/F/H/G/connection guards', () => {
  expect(verifyMaterialized(after).files).toBe(2458);
  expect(() => current(after)).not.toThrow();
});
it('binds actual reviewed authors and separate customer/operational gates', () => {
  expect(frozen.m.base).toBe('89d925d621192e0fbf2b7019bcd2f70cc65585c4');
  expect(frozen.m.external).toBe('ce4d00ac411509c319654f91255bf5ed55a093b8');
  expect(targets).toHaveLength(32);
  expect(frozen.m.customerComposition).toContain('EXCLUDED');
  expect(frozen.m.launchIntegrationAuthorized).toBe(false);
  expect(frozen.m.installationAuthorized).toBe(false);
  expect(frozen.operationalReady).toBe(false);
});
it('preserves every byte of the current capacity SQL, invoice SQL and original12 testcase bodies', () => {
  for (const path of [
    sql,
    'server/invoices/commercial-drafts.proposed.sql',
    'proposals/commercial-invoice-issuance/issuance.proposed.sql',
  ])
    expect(
      readFileSync(join(after, path)).equals(readFileSync(join(before, path))),
    ).toBe(true);
  const path = 'tests/commercial-capacity-launch.test.ts',
    a = readFileSync(join(after, path), 'utf8'),
    b = readFileSync(join(before, path), 'utf8'),
    marker = "it('admits only the exact original473";
  expect(a.slice(a.indexOf(marker))).toBe(b.slice(b.indexOf(marker)));
});
it.each(targets)(
  'missing/old integration target %s denies complete after-source admission',
  (path) => {
    try {
      if (originals[path]) writeFileSync(join(after, path), originals[path]!);
      else unlinkSync(join(after, path));
      expect(() => verifyMaterialized(after)).toThrow();
    } finally {
      writeFileSync(join(after, path), payloads[path]);
    }
  },
);
it.each([
  sql,
  hp,
  'proposals/commercial-invoice-connection/source.ts',
  'proposals/commercial-invoice-connection/source.json',
  'server/payments/sandbox.ts',
  'scripts/check-cycle17-integrity.mjs',
  'scripts/check-cycle22.mjs',
  'scripts/check-cycle24.mjs',
  'server/customer/broker-auth.ts',
])(
  'actual current guard rejects unknown %s before source execution',
  (path) => {
    const p = join(after, path),
      b = readFileSync(p);
    try {
      writeFileSync(p, Buffer.concat([b, Buffer.from('\n// UNKNOWN')]));
      expect(() => current(after, '', false)).toThrow();
    } finally {
      writeFileSync(p, b);
    }
  },
);
it('legacy H cannot be mixed with the current source additions', () => {
  const p = join(after, hp),
    b = readFileSync(p);
  try {
    writeFileSync(p, readFileSync(join(before, hp)));
    expect(() => current(after, '', false)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('unknown helper plus coordinated source manifest rebinding denies', () => {
  const p = join(after, hp),
    b = readFileSync(p),
    m = join(after, 'proposals/commercial-invoice-connection/source.json'),
    old = readFileSync(m);
  try {
    writeFileSync(p, '// attacker');
    writeFileSync(
      m,
      JSON.stringify({ source: { [hp]: 'attacker' }, operationalReady: true }),
    );
    expect(() => current(after, '', false)).toThrow();
    expect(() => verifyMaterialized(after)).toThrow();
  } finally {
    writeFileSync(p, b);
    writeFileSync(m, old);
  }
});
it('late capacity SQL withdrawal after a full first read denies', () => {
  const p = join(after, sql),
    b = readFileSync(p),
    watch = 'tests/database/commercial-invoice-year-numbering-proposal.test.ts';
  const hook = `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';const raw=fs.readFileSync;let hit=false;fs.readFileSync=(...a)=>{const b=raw(...a);if(String(a[0]).endsWith(${JSON.stringify(watch)})&&!hit){hit=true;fs.writeFileSync(${JSON.stringify(p)},'// withdrawn');}return b;};syncBuiltinESMExports();`;
  try {
    expect(() => current(after, hook, false)).toThrow();
    expect(readFileSync(p, 'utf8')).toBe('// withdrawn');
  } finally {
    writeFileSync(p, b);
  }
});
it('changed physical modes deny even when bytes match', () => {
  const p = join(after, hp);
  try {
    chmodSync(p, 0o755);
    expect(() => current(after, '', false)).toThrow();
    expect(() => verifyMaterialized(after)).toThrow();
  } finally {
    chmodSync(p, 0o644);
  }
});
it('symlink H is denied before reading its target', () => {
  const p = join(after, hp),
    b = readFileSync(p),
    side = join(after, 'same-H.txt');
  writeFileSync(side, b);
  unlinkSync(p);
  symlinkSync(side, p);
  const bytes = readFileSync(join(after, guard));
  const script = `import fs from'node:fs';import{syncBuiltinESMExports}from'node:module';const raw=fs.readFileSync;let seen=false;fs.readFileSync=(...a)=>{if(String(a[0])===${JSON.stringify(p)})seen=true;return raw(...a);};syncBuiltinESMExports();const m=await import(${JSON.stringify('data:text/javascript;base64,' + bytes.toString('base64'))});let denied=false;try{m.checkCommercialCapacity(${JSON.stringify(after)});}catch{denied=true;}console.log(JSON.stringify({seen,denied}));`;
  try {
    const result = JSON.parse(
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: after,
        stdio: 'pipe',
        timeout: 5000,
      }).toString(),
    );
    expect(result).toEqual({ seen: false, denied: true });
  } finally {
    unlinkSync(p);
    writeFileSync(p, b);
    unlinkSync(side);
  }
});
it('unknown after-source testcase weakening is rejected by the external complete-frame proof', () => {
  const p = join(after, 'tests/commercial-capacity-launch.test.ts'),
    b = readFileSync(p);
  try {
    writeFileSync(
      p,
      Buffer.concat([b, Buffer.from('\n// weakened assertion')]),
    );
    expect(() => verifyMaterialized(after)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it.each(['source.json', 'admission.patch', 'git-source-proof.json'])(
  'sealed %s cannot be rebound',
  (name) => {
    const p = join(negative, folder + name),
      b = readFileSync(p);
    try {
      writeFileSync(p, Buffer.concat([b, Buffer.from('\nUNKNOWN')]));
      expect(() => capture(negative)).toThrow();
    } finally {
      writeFileSync(p, b);
    }
  },
);
it('wrong parent physical source cannot masquerade as original #479', () => {
  const p = join(negative, 'README.md'),
    b = readFileSync(p);
  try {
    writeFileSync(p, 'wrong source');
    expect(() => capture(negative)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('unknown guard payload cannot be evaluated even if metadata is coordinated', () => {
  const path = guard,
    name = (frozen.m.overlays as Record<string, string>)[path],
    p = join(negative, folder + name),
    b = readFileSync(p),
    m = join(negative, folder + 'source.json'),
    old = readFileSync(m);
  try {
    writeFileSync(p, 'throw Error("UNTRUSTED_CODE");');
    const data = JSON.parse(old.toString());
    data.after[path] = 'attacker';
    writeFileSync(m, JSON.stringify(data));
    expect(() => capture(negative)).toThrow();
  } finally {
    writeFileSync(p, b);
    writeFileSync(m, old);
  }
});

function proposedLegacy() {
  const code = payloads[guard];
  const script = `const m=await import(${JSON.stringify('data:text/javascript;base64,' + code.toString('base64'))});const result=m.checkCommercialCapacity(${JSON.stringify(before)});if(result.sourcePhase!=='479'||result.installationAuthorized!==false||result.financialExecutionAuthorized!==false)throw Error('Exact proposed legacy phase required');`;
  execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: before,
    timeout: 5000,
    stdio: 'pipe',
  });
}
it('proposed guard independently admits the complete exact #479 legacy phase', () =>
  expect(proposedLegacy).not.toThrow());
it('proposed legacy phase rejects a substituted current presenter', () => {
  const path = 'proposals/commercial-invoice-issuance/presentation.ts',
    p = join(before, path),
    b = readFileSync(p);
  try {
    writeFileSync(p, readFileSync(join(after, path)));
    expect(proposedLegacy).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('proposed legacy phase rejects a newly present reviewed-after addition', () => {
  const dir = join(before, 'proposals/commercial-invoice-connection');
  expect(existsSync(dir)).toBe(false);
  try {
    mkdirSync(dir);
    writeFileSync(
      join(dir, 'connection.ts'),
      readFileSync(
        join(after, 'proposals/commercial-invoice-connection/connection.ts'),
      ),
    );
    expect(proposedLegacy).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('proposed legacy phase rejects a dangling added-path ancestor', () => {
  const dir = join(before, 'proposals/commercial-invoice-connection');
  expect(existsSync(dir)).toBe(false);
  symlinkSync(join(before, 'absent-connection-target'), dir, 'dir');
  try {
    expect(proposedLegacy).toThrow();
  } finally {
    unlinkSync(dir);
  }
});

it.each([
  'src/unreviewed-runtime.ts',
  'supabase/migrations/99999999999999_unreviewed.sql',
])('rejects an extra untracked source leaf %s in the owned image', (path) => {
  const p = join(after, path);
  expect(existsSync(p)).toBe(false);
  try {
    writeFileSync(p, '// unreviewed source');
    expect(() => verifyMaterialized(after)).toThrow();
  } finally {
    unlinkSync(p);
  }
});
