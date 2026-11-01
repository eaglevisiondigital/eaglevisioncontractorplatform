import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect, afterEach } from 'vitest';
import { acceptanceJournal } from '../server/property/acceptance-journal';
const roots: string[] = [];
afterEach(() => {
  for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true });
});
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'propel-journal-'));
  roots.push(dir);
  return {
    dir,
    j: acceptanceJournal(dir, 'a'.repeat(64)),
    org: crypto.randomUUID(),
  };
};
it('reserves before a request and never treats an uncertain attempt as retryable', () => {
  const { j, org } = setup();
  expect(j.read(org, 'weekly-plan').state).toBe('NOT_ATTEMPTED');
  j.begin(org, 'weekly-plan', 'b'.repeat(64));
  expect(j.read(org, 'weekly-plan').state).toBe('UNKNOWN');
  expect(() => j.begin(org, 'weekly-plan', 'b'.repeat(64))).toThrow();
});
it('persists only scoped UUID receipts and blocks duplicate completion', () => {
  const { j, dir, org } = setup(),
    id = crypto.randomUUID();
  j.begin(org, 'fixture-expense', 'b'.repeat(64));
  j.complete(org, 'fixture-expense', 'b'.repeat(64), id);
  expect(j.read(org, 'fixture-expense')).toMatchObject({
    state: 'RECORDED',
    resultId: id,
  });
  expect(() =>
    j.complete(org, 'fixture-expense', 'b'.repeat(64), id),
  ).toThrow();
  for (const f of readdirSync(dir)) {
    const text = readFileSync(join(dir, f), 'utf8');
    expect(text).not.toMatch(
      /password|access_token|refresh_token|totp|authorization/i,
    );
  }
});
it('rejects altered-operation, wrong-payload and secret-like results', () => {
  const { j, dir, org } = setup();
  j.begin(org, 'weekly-plan', 'b'.repeat(64));
  expect(() =>
    acceptanceJournal(dir, 'c'.repeat(64)).read(org, 'weekly-plan'),
  ).toThrow('scope');
  expect(() =>
    j.complete(org, 'weekly-plan', 'c'.repeat(64), crypto.randomUUID()),
  ).toThrow();
  expect(() =>
    j.complete(org, 'weekly-plan', 'b'.repeat(64), 'session-token'),
  ).toThrow();
});
it('tenant paths and unattempted results cannot escape the journal', () => {
  const { j, org } = setup();
  expect(() => j.begin(org, '../../outside', 'b'.repeat(64))).toThrow();
  expect(() => j.begin('not-uuid', 'weekly-plan', 'b'.repeat(64))).toThrow();
  expect(() =>
    j.complete(org, 'weekly-plan', 'b'.repeat(64), crypto.randomUUID()),
  ).toThrow();
});
