import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  capture,
  materialize,
} from '../proposals/customer-publication-reader-guard/qualify.mjs';
const packet = 'proposals/customer-publication-reader-guard/';
const target = 'proposals/customer-publication-admission/source.ts';
const sql = [
  'server/invoices/commercial-payment-receipt.proposed.sql',
  'server/invoices/customer-payment-publication.proposed.sql',
] as const;
const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const env = {
  PATH: '/opt/homebrew/opt/node@24/bin:/usr/bin:/bin',
  TMPDIR: '/private/tmp',
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_ALLOW_PROTOCOL: '',
  GIT_NO_LAZY_FETCH: '1',
  GIT_TERMINAL_PROMPT: '0',
};
let before: string, image: string;
function check() {
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {assertPublicationSources} from './${target}';assertPublicationSources();`,
    ],
    { cwd: image, env, timeout: 5000, stdio: 'pipe' },
  );
}
beforeAll(() => {
  const q = capture();
  before = fs.mkdtempSync('/private/tmp/publication-before-source-');
  for (let i = 0; i < q.base.length; i++) {
    const row = q.base[i],
      path = join(before, row.path);
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, q.bodies[i], {
      mode: parseInt(row.mode.slice(-3), 8),
    });
  }
  for (const [name, bytes] of Object.entries(q.files)) {
    const path = join(before, packet + name);
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, bytes);
  }
  image = materialize(before).directory;
});
afterAll(() => {
  for (const path of [before, image])
    if (path) fs.rmSync(path, { recursive: true, force: true });
});
it('offline qualification binds exact484 and keeps A2 authorship, admission and installation unapproved', () => {
  const q = capture(before);
  expect(q.base).toHaveLength(2477);
  expect(q.manifest.base).toBe('ada783cbb256f871d2a508b05f3411c587038aba');
  expect(q.manifest.a2SourceAuthor).toBeNull();
  expect(q.manifest.guardAuthor).toBeNull();
  expect(q.manifest.installationAuthorized).toBe(false);
  expect(fs.existsSync(join(before, '.git'))).toBe(false);
});
it.each([
  'guard.proposed.txt',
  'source.json',
  'guard-author.patch',
  'git-source-proof.json',
  'model.proposed.txt',
])(
  'substituted sealed %s is denied before materialization or evaluation',
  (name) => {
    const path = join(before, packet + name),
      bytes = fs.readFileSync(path);
    try {
      fs.appendFileSync(path, '\nUNREVIEWED');
      expect(() => capture(before)).toThrow();
    } finally {
      fs.writeFileSync(path, bytes);
    }
  },
);
it('unknown current Auth companion cannot be projected as the immutable baseline', () => {
  const path = join(before, 'server/customer/broker-auth.ts'),
    bytes = fs.readFileSync(path);
  try {
    fs.appendFileSync(path, '\n// UNKNOWN');
    expect(() => capture(before)).toThrow();
  } finally {
    fs.writeFileSync(path, bytes);
  }
});
it('unreviewed canonical SQL presence in the proposal source denies rather than fabricating an author identity', () => {
  const path = join(before, sql[0]);
  try {
    fs.writeFileSync(path, '-- not an approved source author');
    expect(() => capture(before)).toThrow();
  } finally {
    fs.unlinkSync(path);
  }
});
it('complete after-source guard passes on the exact two unchanged A2 bodies without installing SQL', () => {
  check();
  const q = capture(before);
  for (const path of sql) {
    expect(fs.readFileSync(join(image, path))).toEqual(q.sql[path]);
    expect(fs.lstatSync(join(image, path)).mode & 0o777).toBe(0o644);
  }
});
it.each(sql)('after-source guard denies missing or partial %s', (path) => {
  const full = join(image, path),
    bytes = fs.readFileSync(full);
  try {
    fs.unlinkSync(full);
    expect(check).toThrow();
  } finally {
    fs.writeFileSync(full, bytes);
  }
});
it.each(sql)('after-source guard denies altered %s', (path) => {
  const full = join(image, path),
    bytes = fs.readFileSync(full);
  try {
    fs.appendFileSync(full, '\n-- UNKNOWN');
    expect(check).toThrow();
  } finally {
    fs.writeFileSync(full, bytes);
  }
});
it('after-source mode or symlink substitution denies even identical SQL bytes', () => {
  const full = join(image, sql[0]),
    bytes = fs.readFileSync(full),
    side = join(image, 'same-sql.txt');
  try {
    fs.chmodSync(full, 0o755);
    expect(check).toThrow();
  } finally {
    fs.chmodSync(full, 0o644);
  }
  fs.writeFileSync(side, bytes);
  fs.unlinkSync(full);
  fs.symlinkSync(side, full);
  try {
    expect(check).toThrow();
  } finally {
    fs.unlinkSync(full);
    fs.writeFileSync(full, bytes);
    fs.unlinkSync(side);
  }
});
it('the executing after-source guard detects its own later file replacement', () => {
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import{readFileSync,writeFileSync}from'node:fs';import{assertPublicationSources}from'./${target}';const p='${target}',b=readFileSync(p);try{writeFileSync(p,Buffer.concat([b,Buffer.from('\\n// replaced')]));let denied=false;try{assertPublicationSources()}catch{denied=true}if(!denied)throw Error('replacement accepted')}finally{writeFileSync(p,b)}`,
    ],
    { cwd: image, env, timeout: 5000, stdio: 'pipe' },
  );
});
it('literal one-file guard patch applies exactly to the immutable before guard', () => {
  const q = capture(before),
    root = fs.mkdtempSync('/private/tmp/publication-guard-patch-');
  try {
    const path = join(root, target);
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, fs.readFileSync(join(before, target)));
    const patch = join(root, 'captured.patch');
    fs.writeFileSync(patch, q.files['guard-author.patch'], {
      mode: 0o600,
      flag: 'wx',
    });
    for (const args of [['--check'], []])
      execFileSync(
        '/usr/bin/git',
        [
          '--no-replace-objects',
          '-c',
          'core.hooksPath=/dev/null',
          '-c',
          'core.fsmonitor=false',
          '-c',
          'core.attributesFile=/dev/null',
          '-c',
          'protocol.allow=never',
          'apply',
          '--whitespace=nowarn',
          ...args,
          patch,
        ],
        { cwd: root, env, timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    expect(fs.readFileSync(path)).toEqual(q.files['guard.proposed.txt']);
    expect(sha(fs.readFileSync(path))).toBe(q.manifest.guardAfterSHA256);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
it('baseline withdrawal during final packet sealing is caught by the final source-frame audit', () => {
  const path = join(before, 'README.md'),
    bytes = fs.readFileSync(path),
    watch = join(before, packet + 'model.proposed.txt');
  const original = fs.readFileSync;
  let observed = 0;
  fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
    const value = Reflect.apply(original, fs, args);
    if (String(args[0]) === watch && ++observed === 2)
      fs.writeFileSync(path, 'WITHDRAWN');
    return value;
  }) as typeof fs.readFileSync;
  syncBuiltinESMExports();
  try {
    expect(() => capture(before)).toThrow();
    expect(observed).toBe(2);
  } finally {
    fs.readFileSync = original;
    syncBuiltinESMExports();
    fs.writeFileSync(path, bytes);
  }
});

it('source-root symlink aliases cannot qualify', () => {
  const alias = before + '-alias';
  fs.symlinkSync(before, alias);
  try {
    expect(() => capture(alias)).toThrow();
  } finally {
    fs.unlinkSync(alias);
  }
});
it('after-source inactive reader-grant template cannot be substituted for broader authority', () => {
  const path = join(
      image,
      'proposals/customer-publication-admission/reader-grants.sql.in',
    ),
    bytes = fs.readFileSync(path);
  try {
    fs.appendFileSync(
      path,
      '\ngrant all on all tables in schema private to public;',
    );
    expect(check).toThrow();
  } finally {
    fs.writeFileSync(path, bytes);
  }
});
it('materialization rejects an unknown executable companion before return and cleans its own image', () => {
  const original = fs.writeFileSync;
  let injected = false,
    output = '';
  fs.writeFileSync = ((...args: Parameters<typeof fs.writeFileSync>) => {
    const result = Reflect.apply(original, fs, args),
      path = String(args[0]);
    const model = 'tests/customer-publication-after-source.test.ts';
    if (!injected && path.endsWith(model)) {
      output = path.slice(0, -model.length);
      injected = true;
      Reflect.apply(original, fs, [
        join(output, 'unexpected-loader.mjs'),
        'export const unreviewed=true;',
      ]);
    }
    return result;
  }) as typeof fs.writeFileSync;
  syncBuiltinESMExports();
  try {
    expect(() => materialize(before)).toThrow();
    expect(injected).toBe(true);
    expect(fs.existsSync(output)).toBe(false);
  } finally {
    fs.writeFileSync = original;
    syncBuiltinESMExports();
  }
});
