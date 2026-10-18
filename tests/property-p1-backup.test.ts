import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';
import { P1BackupCustody } from '../server/property/execution/backup-custody';
import { executionPackage } from './helpers/p1-execution';
const roots: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function setup(change?: (ack: unknown) => unknown) {
  const p = executionPackage();
  roots.push(p.root);
  const key = randomBytes(32),
    run = randomUUID();
  let packets = 0;
  const actors = Object.fromEntries(
    p.plan.companies
      .flatMap((c) => Object.values(c.actorBindings))
      .filter((a) => !a.alias.endsWith('-customer'))
      .map((a) => [a.alias, [a.user_id, a.organization_id]]),
  );
  const backup = new P1BackupCustody(p.frozen, key, run, async (packet) => {
    packets++;
    const ack = JSON.parse(
      execFileSync(
        process.env.PROPEL_RECOVERY_PYTHON ?? 'python3',
        ['-B', 'tests/helpers/p1-backup-peer.py'],
        {
          input: JSON.stringify({
            key: key.toString('base64'),
            run,
            packet,
            target: p.frozen.target,
            operation: p.hash,
            root: join(p.root, 'independent-backup'),
            actors,
            organizations: p.plan.companies.map((c) => c.organization_id),
            now: Math.floor(Date.now() / 1000),
          }),
          encoding: 'utf8',
          timeout: 5000,
        },
      ),
    );
    return change ? change(ack) : ack;
  });
  const tokens = (alias: string) => {
    const claims = {
      sub: actors[alias][0],
      session_id: randomUUID(),
      role: 'authenticated',
      aal: 'aal1',
      iss: 'https://' + 'a'.repeat(20) + '.supabase.co/auth/v1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = (aal: string) =>
      'eyJhbGciOiJmaXh0dXJlIn0.' +
      Buffer.from(JSON.stringify({ ...claims, aal })).toString('base64url') +
      '.FIXTURE_ONLY';
    return { low: token('aal1'), high: token('aal2') };
  };
  return { p, backup, key, run, tokens, packets: () => packets, actors };
}
it('interoperates with the actual Python AEAD/HKDF/HMAC and fsynced backup process before exercising all fifteen sessions', async () => {
  const s = setup();
  expect(() => s.backup.assertReady()).toThrow('incomplete');
  for (const alias of Object.keys(s.actors)) {
    await s.backup.reserveCreation(alias);
    const t = s.tokens(alias);
    expect(() => s.backup.assertAcknowledged(alias, t.low)).toThrow();
    await s.backup.accept(alias, t.low);
    s.backup.assertAcknowledged(alias, t.low);
    if (alias.endsWith('-owner')) {
      await s.backup.accept(alias, t.high);
      s.backup.assertAcknowledged(alias, t.high);
      s.backup.assertAcknowledged(alias, t.low); // Original AAL1 negative probe remains backed up.
      await s.backup.accept(alias, t.high); // Same acknowledged bytes; no replay.
    }
  }
  s.backup.assertReady();
  expect(s.packets()).toBe(33);
}, 30000);
it('never permits a session without positive authenticated backup acknowledgment', async () => {
  const s = setup((ack) => ({ ...(ack as object), mac: '0'.repeat(64) }));
  await expect(s.backup.reserveCreation('pilot-1-owner')).rejects.toThrow(
    'UNKNOWN',
  );
  expect(() => s.backup.assertReady()).toThrow();
  expect(() =>
    s.backup.assertAcknowledged('pilot-1-owner', s.tokens('pilot-1-owner').low),
  ).toThrow();
});
it('retains unresolved intent after lost Auth response and refuses a second creation attempt', async () => {
  const s = setup();
  await s.backup.reserveCreation('pilot-1-owner');
  await expect(s.backup.reserveCreation('pilot-1-owner')).rejects.toThrow(
    'Duplicate',
  );
  expect(() => s.backup.assertReady()).toThrow();
  expect(s.packets()).toBe(1);
});
it('blocks customer aliases, replaced sessions and handoffs after stopping', async () => {
  const s = setup();
  await expect(s.backup.reserveCreation('pilot-1-customer')).rejects.toThrow();
  const alias = 'pilot-1-owner';
  await s.backup.reserveCreation(alias);
  await s.backup.accept(alias, s.tokens(alias).low);
  await expect(s.backup.accept(alias, s.tokens(alias).high)).rejects.toThrow(
    'framing',
  );
  expect(() => s.backup.assertReady()).toThrow();
  s.backup.stop();
  await expect(s.backup.reserveCreation('pilot-2-owner')).rejects.toThrow();
});
it('bounds lost backup responses and refuses late receipts or retries', async () => {
  vi.useFakeTimers();
  const p = executionPackage();
  roots.push(p.root);
  const backup = new P1BackupCustody(
    p.frozen,
    randomBytes(32),
    randomUUID(),
    () => new Promise(() => {}),
  );
  const result = expect(
    backup.reserveCreation('pilot-1-owner'),
  ).rejects.toThrow('UNKNOWN');
  await vi.advanceTimersByTimeAsync(10001);
  await result;
  expect(() => backup.assertReady()).toThrow();
  await expect(backup.reserveCreation('pilot-2-owner')).rejects.toThrow();
});
it('redacts keys and identities from ordinary serialization and inspection', () => {
  const s = setup();
  const printed = JSON.stringify(s.backup) + inspect(s.backup);
  expect(printed).not.toContain(s.key.toString('hex'));
  expect(printed).not.toContain(s.p.frozen.target);
  expect(printed).toContain('redacted');
});
