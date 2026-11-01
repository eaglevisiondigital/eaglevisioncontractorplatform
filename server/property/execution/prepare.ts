import { createHash } from 'node:crypto';
import { loadP1Package } from './package.ts';
import { startP1Cleanup } from './cleanup-process.ts';
import { SupabaseP1Callers, type P1Identity } from './callers.ts';
import { p1ReadOnlyVerification, type P1Reference } from './verification.ts';
import { acceptanceJournal } from '../acceptance-journal.ts';
import { executeP1 } from './executor.ts';
import { P1BackupCustody } from './backup-custody.ts';
/** Matches the existing reviewed read-snapshot fingerprint algorithm (ASCII key order). */
export function settingsFingerprint(value: unknown): string {
  const canonical = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(canonical)
      : x && typeof x === 'object'
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, canonical((x as Record<string, unknown>)[k])]),
          )
        : x;
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
/** Future supervised local harness only. No password/MFA reader, HTTP server, auto-start or provider connection. */
export async function prepareP1Execution(options: {
  directory: string;
  journalDirectory: string;
  target: string;
  expectedProjectName: string;
  managementToken: string;
  publishableKey: string;
  reference: P1Reference;
  backup: P1BackupCustody;
}) {
  const frozen = loadP1Package(options.directory, options.target);
  if (
    !(options.backup instanceof P1BackupCustody) ||
    !options.backup.matches(frozen)
  )
    throw Error('Exact independent backup custody required');
  if (
    frozen.plan.originalRowCount !== 713 ||
    options.reference.history.length !== 13 ||
    options.reference.catalog.length !== 514 ||
    options.reference.columnAcl.length !== 69 ||
    options.reference.defaults.length !== 24 ||
    options.reference.schema.length !== 4 ||
    options.reference.tableCounts.length !== 79
  )
    throw Error('Exact reviewed preflight reference inventory required');
  const cleanup = await startP1Cleanup({
    directory: options.directory,
    target: options.target,
    managementToken: options.managementToken,
    publishableKey: options.publishableKey,
    operationHash: frozen.operationHash,
  });
  const actors = new SupabaseP1Callers(frozen, options.publishableKey, {
    register: async (alias, token, factorId) => {
      await options.backup.accept(alias, token);
      options.backup.assertAcknowledged(alias, token);
      await cleanup.register(alias, token, factorId);
    },
    assertAcknowledged: (alias, token) =>
      options.backup.assertAcknowledged(alias, token),
  });
  const management = async (path: string, query?: string) => {
    const r = await fetch(
      `https://api.supabase.com/v1/projects/${frozen.target}${path}`,
      {
        method: query ? 'POST' : 'GET',
        headers: {
          Authorization: 'Bearer ' + options.managementToken,
          ...(query ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(query ? { body: JSON.stringify({ query }) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok) throw Error('Read-only P1 verification unconfirmed');
    return r.json();
  };
  const identity = async () => {
    const p = await management('');
    if (
      p.id !== frozen.target ||
      p.name !== options.expectedProjectName ||
      p.status !== 'ACTIVE_HEALTHY'
    )
      throw Error('Development project identity mismatch');
  };
  const verifier = p1ReadOnlyVerification(
    frozen,
    options.reference,
    (sql) => management('/database/query', sql),
    async () => ({
      authSettingsHash: settingsFingerprint(await management('/config/auth')),
      apiSettingsHash: settingsFingerprint(await management('/postgrest')),
    }),
  );
  let preflightAt = 0,
    preflightMono = 0,
    started = false;
  const fresh = () =>
    preflightAt > 0 &&
    Date.now() - preflightAt >= 0 &&
    Date.now() - preflightAt <= 600000 &&
    performance.now() - preflightMono <= 600000;
  const preflight = async () => {
    await identity();
    await verifier.before();
    const r = await management(
      '/database/query',
      'select count(*)::int n from auth.sessions',
    );
    if (r.length !== 1 || r[0].n !== 0)
      throw Error('Zero-session starting baseline required');
    preflightAt = Date.now();
    preflightMono = performance.now();
  };
  return {
    /** Read-only operational preflight BEFORE any later owner-assisted login. */
    preflight,
    /** Backup intent ACK before external owner-assisted sign-in. No login is performed here. */
    reserveSessionCreation: async (alias: string) => {
      if (started || !fresh())
        throw Error('Fresh preflight before creation intent required');
      try {
        await options.backup.reserveCreation(alias);
      } catch {
        await cleanup.close();
        throw Error('Creation custody UNKNOWN; independently contain');
      }
    },
    /** Cleanup custody immediately after owner password sign-in, before waiting for genuine TOTP. */
    trackOwnerSession: async (alias: string, token: string) => {
      if (started || !fresh()) {
        await cleanup.close();
        throw Error('Fresh pending-owner preflight required');
      }
      try {
        await cleanup.trackOwner(alias, token);
        await options.backup.accept(alias, token);
        options.backup.assertAcknowledged(alias, token);
      } catch {
        await cleanup.close();
        throw Error('Pending owner custody unconfirmed');
      }
    },
    addSession: async (
      person: P1Identity,
      token: string,
      originalAal1?: string,
    ) => {
      if (started || !fresh()) {
        await cleanup.close();
        throw Error('Fresh preflight before session handoff required');
      }
      try {
        await actors.add(person, token, originalAal1);
      } catch {
        await cleanup.close();
        throw Error('Session handoff stopped; independently verify cleanup');
      }
    },
    /** Human presence confirmation. Never call from an automatic timer. Expires after60seconds. */
    supervise: () => cleanup.supervise(),
    run: async (signal: AbortSignal) => {
      if (started || !fresh()) {
        await cleanup.close();
        throw Error('Supervised one-shot preflight required');
      }
      try {
        options.backup.assertReady();
      } catch {
        await cleanup.close();
        throw Error('Incomplete independent custody; P1 stopped');
      }
      started = true;
      const stop = new AbortController();
      const interrupt = () => stop.abort();
      for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
        process.once(s, interrupt);
      try {
        return await executeP1({
          frozen,
          actors,
          journal: acceptanceJournal(
            options.journalDirectory,
            frozen.operationHash,
          ),
          control: cleanup,
          verification: {
            before: async () => {
              await identity();
              await verifier.before();
            },
            after: (r) => verifier.after(r),
          },
          signal: AbortSignal.any([signal, stop.signal]),
        });
      } finally {
        for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
          process.removeListener(s, interrupt);
        cleanup.dispose();
        options.backup.stop();
      }
    },
    close: async () => {
      options.backup.stop();
      return cleanup.close();
    },
  };
}
