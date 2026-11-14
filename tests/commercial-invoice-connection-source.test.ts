import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  chmodSync,
  renameSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
const manifest = JSON.parse(
  readFileSync('proposals/commercial-invoice-connection/source.json', 'utf8'),
) as { source: Record<string, string> };
const script = `import {assertConnectionSources} from ${JSON.stringify(pathToFileURL(resolve('proposals/commercial-invoice-connection/source.ts')).href)};assertConnectionSources();`;
function withCopy(action: (root: string, check: () => void) => void) {
  const root = mkdtempSync(join(tmpdir(), 'propel-connection-source-'));
  try {
    for (const path of Object.keys(manifest.source)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      copyFileSync(path, join(root, path));
      chmodSync(join(root, path), 0o644);
    }
    action(root, () => {
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: root,
        env: { PATH: process.env.PATH },
        stdio: 'pipe',
        timeout: 5000,
      });
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
it('source guard accepts only the exact seven reviewed dependency endpoints', () =>
  withCopy((_root, check) => expect(check).not.toThrow()));
it('unknown SQL bytes deny without changing the protected original', () =>
  withCopy((root, check) => {
    writeFileSync(
      join(root, 'server/invoices/commercial-drafts.proposed.sql'),
      'UNKNOWN',
    );
    expect(check).toThrow();
  }));
it('source mode substitution denies even with identical bytes', () =>
  withCopy((root, check) => {
    chmodSync(join(root, 'server/customer/broker-auth.ts'), 0o755);
    expect(check).toThrow();
  }));
it('a symlink source ancestor denies without following it as authority', () =>
  withCopy((root, check) => {
    renameSync(join(root, 'server'), join(root, 'server-original'));
    symlinkSync(join(root, 'server-original'), join(root, 'server'), 'dir');
    expect(check).toThrow();
  }));
