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
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  capture,
  materialize,
} from '../proposals/canonical-invoice-489/qualify.mjs';
const folder = 'proposals/canonical-invoice-489/',
  hp = 'scripts/invoice-caller-source-admission.mjs',
  gp = 'proposals/commercial-invoice-connection/source.ts',
  mp = 'proposals/commercial-invoice-connection/source.json';
let root: string, original: string, negative: string;
let before: Record<string, Buffer>, after: Record<string, Buffer>;
function metadata(directory: string) {
  execFileSync('git', ['init', '-q', directory]);
  writeFileSync(
    join(directory, '.git/objects/info/alternates'),
    join(process.cwd(), '.git/objects') + '\n',
  );
}
function check(directory: string, prefix = '') {
  const h = pathToFileURL(join(directory, hp)).href,
    g = pathToFileURL(join(directory, gp)).href;
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `${prefix}\nconst h=await import(${JSON.stringify(h)});h.verifyInvoiceGuardFrame();const g=await import(${JSON.stringify(g)});g.assertConnectionSources();`,
    ],
    {
      cwd: directory,
      stdio: 'pipe',
      timeout: 5000,
      env: { PATH: process.env.PATH },
    },
  );
}
beforeAll(() => {
  const q = capture();
  root = materialize().directory;
  original = materialize(process.cwd(), 'original').directory;
  metadata(root);
  metadata(original);
  before = {};
  after = {};
  for (const [path, file] of Object.entries(
    q.m.overlays as Record<string, string>,
  )) {
    before[path] = readFileSync(path);
    after[path] = q.files[file];
  }
  negative = mkdtempSync(
    join(realpathSync(tmpdir()), 'canonical489-negative-'),
  );
  for (const row of q.base) {
    const p = join(negative, row.path);
    mkdirSync(dirname(p), { recursive: true });
    copyFileSync(row.path, p);
    chmodSync(p, Number.parseInt(row.mode.slice(-3), 8));
  }
  for (const [name, bytes] of Object.entries(q.files)) {
    const p = join(negative, folder + name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, bytes);
  }
});
afterAll(() => {
  for (const p of [root, original, negative])
    if (p) rmSync(p, { recursive: true, force: true });
});
it('preserves the original complete frame and its original canonical helper', () =>
  expect(() => check(original)).not.toThrow());
it('both real proposed F/H/G and connection guards accept the same complete frame', () =>
  expect(() => check(root)).not.toThrow());
it('holds all author, launch, installation and operational authority', () => {
  const q = capture();
  expect(q.m.sourceAdmissionAuthorized).toBe(false);
  expect(q.m.launchIntegrationAuthorized).toBe(false);
  expect(q.m.installationAuthorized).toBe(false);
  expect(q.m.bridgeAuthor).toBe(null);
  expect(q.operationalReady).toBe(false);
  expect(Object.keys(q.m.overlays as object)).toHaveLength(14);
});
it('the actual unadmitted #489 frame remains denied by the unchanged helper', () =>
  expect(() => check(process.cwd())).toThrow());
it.each([
  'scripts/invoice-caller-source-admission.mjs',
  'proposals/invoice-guard-admission/fixture-adapter.mjs',
  'tests/invoice-caller-migration-source.test.ts',
  'proposals/invoice-caller-reconciliation/qualify.mjs',
  'proposals/invoice-checker-qualification/baseline.mjs',
  'proposals/invoice-caller-transition/qualify.mjs',
  'tests/commercial-invoice-author-checkpoint.test.ts',
  'proposals/invoice-caller-admission/qualify.mjs',
  'tests/invoice-caller-admission-proposal.test.ts',
  'tests/invoice-checker-qualification-baseline.test.ts',
  'tests/launch-invoice-payment-source.test.ts',
  'proposals/commercial-invoice-connection/source.json',
  'proposals/commercial-invoice-connection/source.ts',
  'proposals/invoice-guard-admission/qualify.mjs',
])('one withdrawn original %s cannot form a mixed frame', (path) => {
  try {
    writeFileSync(join(root, path), before[path]);
    expect(() => check(root)).toThrow();
  } finally {
    writeFileSync(join(root, path), after[path]);
  }
});
it.each([hp, gp, mp])(
  'only %s after-source never admits an otherwise original current frame',
  (path) => {
    try {
      for (const [p, b] of Object.entries(before))
        writeFileSync(join(root, p), b);
      writeFileSync(join(root, path), after[path]);
      expect(() => check(root)).toThrow();
    } finally {
      for (const [p, b] of Object.entries(after))
        writeFileSync(join(root, p), b);
    }
  },
);
it.each([
  'server/customer/broker-auth.ts',
  'scripts/check-cycle17-integrity.mjs',
  'scripts/check-cycle22.mjs',
  'scripts/check-cycle24.mjs',
  'scripts/payment-response-source-admission.mjs',
  'proposals/commercial-invoice-issuance/presentation.ts',
])('unknown protected companion %s denies', (path) => {
  const p = join(root, path),
    b = readFileSync(p);
  try {
    writeFileSync(p, Buffer.concat([b, Buffer.from('\n// unknown')]));
    expect(() => check(root)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('assertion body tampering is not a fixture-header amendment', () => {
  const p = join(root, 'tests/commercial-invoice-author-checkpoint.test.ts'),
    b = readFileSync(p);
  try {
    writeFileSync(
      p,
      Buffer.concat([b, Buffer.from('\n// assertion replacement')]),
    );
    expect(() => check(root)).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('coordinated current manifest rebinding never changes immutable recipes', () => {
  const p = join(root, 'server/customer/broker-auth.ts'),
    b = readFileSync(p),
    m = readFileSync(join(root, mp));
  try {
    writeFileSync(p, '// attacker');
    writeFileSync(
      join(root, mp),
      JSON.stringify({
        source: { 'server/customer/broker-auth.ts': 'attacker' },
        operationalReady: true,
      }),
    );
    expect(() => check(root)).toThrow();
  } finally {
    writeFileSync(p, b);
    writeFileSync(join(root, mp), m);
  }
});
it('late withdrawal after a complete first source pass denies', () => {
  const p = join(root, 'server/customer/broker-auth.ts'),
    b = readFileSync(p),
    watch = join(root, 'tests/commercial-invoice-connection-source.test.ts');
  const hook = `import fs from'node:fs';import{syncBuiltinESMExports}from'node:module';const raw=fs.readFileSync;let seen=false;fs.readFileSync=(...a)=>{const b=raw(...a);if((String(a[0])===${JSON.stringify(watch)}||String(a[0])==='tests/commercial-invoice-connection-source.test.ts')&&!seen){seen=true;fs.writeFileSync(${JSON.stringify(p)},'// withdrawn');}return b;};syncBuiltinESMExports();`;
  try {
    expect(() => check(root, hook)).toThrow();
    expect(readFileSync(p, 'utf8')).toBe('// withdrawn');
  } finally {
    writeFileSync(p, b);
  }
});
it('helper withdrawal after module evaluation denies', () => {
  const p = join(root, hp),
    b = readFileSync(p),
    url = pathToFileURL(p).href;
  try {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import fs from'node:fs';const h=await import(${JSON.stringify(url)});fs.appendFileSync(${JSON.stringify(p)},'\n// withdrawn');h.verifyInvoiceGuardFrame();`,
        ],
        { cwd: root, stdio: 'pipe', timeout: 5000 },
      ),
    ).toThrow();
  } finally {
    writeFileSync(p, b);
  }
});
it('non-regular mode denies despite matching bytes', () => {
  const p = join(root, hp);
  try {
    chmodSync(p, 0o755);
    expect(() => check(root)).toThrow();
  } finally {
    chmodSync(p, 0o644);
  }
});
it('symlink source substitution denies', () => {
  const p = join(root, hp),
    b = readFileSync(p),
    side = join(root, 'same-helper.txt');
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
it('an unknown helper plus coordinated payload metadata is denied by the external seal before evaluation', () => {
  const q = capture(),
    file = (q.m.overlays as Record<string, string>)[hp],
    p = join(negative, folder + file),
    b = readFileSync(p),
    m = join(negative, folder + 'source.json'),
    old = readFileSync(m);
  try {
    writeFileSync(
      p,
      Buffer.concat([b, Buffer.from('\nthrow Error("UNTRUSTED_CODE");')]),
    );
    const spec = JSON.parse(old.toString());
    spec.after[hp] = 'attacker';
    writeFileSync(m, JSON.stringify(spec));
    expect(() => capture(negative)).toThrow();
  } finally {
    writeFileSync(p, b);
    writeFileSync(m, old);
  }
});
it.each(['admission.patch', 'git-source-proof.json', 'source.json'])(
  'sealed %s cannot be replaced',
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

it.each([
  'scripts/invoice-caller-source-admission.mjs',
  'server/invoices/commercial-drafts.proposed.sql',
])(
  'returned historical reader rechecks actual withdrawn %s on every invocation',
  (path) => {
    const target = join(root, path),
      before = readFileSync(target),
      url = pathToFileURL(
        join(root, 'proposals/invoice-guard-admission/qualify.mjs'),
      ).href;
    const script = `import fs from 'node:fs';const {qualifyInvoiceGuardProposal}=await import(${JSON.stringify(url)});const q=await qualifyInvoiceGuardProposal();const historical=q.helper.createGuardHistoricalRead(q.readCurrent);fs.writeFileSync(${JSON.stringify(target)},'// withdrawn');historical('server/invoices/commercial-drafts.proposed.sql');`;
    try {
      expect(() =>
        execFileSync(process.execPath, ['--input-type=module', '-e', script], {
          cwd: root,
          timeout: 5000,
          stdio: 'pipe',
        }),
      ).toThrow();
    } finally {
      writeFileSync(target, before);
    }
  },
);
