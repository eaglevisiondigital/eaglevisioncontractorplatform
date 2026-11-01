import {
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { backupMailbox } from '../server/property/execution/backup-mailbox';
import { executionPackage } from './helpers/p1-execution';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
it('spools encrypted messages and returns only an independently delivered private receipt', async () => {
  const p = executionPackage();
  roots.push(p.root);
  const out = join(p.root, 'out'),
    input = join(p.root, 'in');
  const mailbox = backupMailbox(out, input);
  const result = mailbox.exchange('ENCRYPTED_FIXTURE_ONLY');
  const name = readdirSync(out)[0];
  expect(name).toMatch(/^[a-f0-9-]{36}\.json$/);
  writeFileSync(
    join(input, name),
    JSON.stringify({ receipt: 'fixture', mac: 'fixture' }),
    { mode: 0o600 },
  );
  await expect(result).resolves.toEqual({ receipt: 'fixture', mac: 'fixture' });
  // P1BackupCustody, not the spool, must authenticate this receipt before use.
  mailbox.heartbeat('ENCRYPTED_HEARTBEAT_FIXTURE');
  expect(readdirSync(out)).toHaveLength(2);
});
it('rejects a symlinked mailbox directory', () => {
  const p = executionPackage();
  roots.push(p.root);
  const real = join(p.root, 'real');
  mkdirSync(real, { mode: 0o700 });
  const link = join(p.root, 'link');
  symlinkSync(real, link);
  expect(() => backupMailbox(link, join(p.root, 'in'))).toThrow('Private');
});
it('rejects a readable-by-others or symlinked receipt without following it', async () => {
  for (const mode of ['public', 'symlink']) {
    const p = executionPackage();
    roots.push(p.root);
    const out = join(p.root, 'out'),
      input = join(p.root, 'in');
    const mailbox = backupMailbox(out, input);
    const result = expect(
      mailbox.exchange('ENCRYPTED_FIXTURE_ONLY'),
    ).rejects.toThrow();
    const name = readdirSync(out)[0];
    if (mode === 'public')
      writeFileSync(join(input, name), '{}', { mode: 0o644 });
    else {
      writeFileSync(join(p.root, 'elsewhere'), '{}', { mode: 0o600 });
      symlinkSync(join(p.root, 'elsewhere'), join(input, name));
    }
    await result;
  }
});
