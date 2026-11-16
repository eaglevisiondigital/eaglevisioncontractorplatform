/** Disposable qualification fixture only. No application factory or credentials. */
import { Client, Query } from 'pg';
import type { GatewaySql } from '../../server/payments/postgres-store';
import type { InvoiceConnectionScope } from '../../server/invoices/commercial-caller-connection';
import type { CustomerBrokerAuth } from '../../server/customer/broker-auth';
import { operatingCustomerInvoiceRead } from '../../proposals/commercial-customer-operating-reader/reader';
import type { ReaderScope } from '../../proposals/commercial-customer-operating-reader/binding';
import { assertOperatingSources } from '../../proposals/commercial-customer-operating-reader/source';
import {
  commercialCustomerTarget,
  commercialCustomerResponse,
  type CommercialCustomerTarget,
  type CommercialCustomerResponse,
} from '../../src/components/invoices/commercial-customer-read';

const claimedDrivers = new WeakSet<Client>();
const claimedBackends = new Set<string>();
const unknown = () => Error('Disposable physical reader custody · UNKNOWN');
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(unknown()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function disposableReaderOwner(
  raw: Client,
  observed: Readonly<InvoiceConnectionScope>,
  backendPresent: () => Promise<boolean>,
  options: {
    enabled: true;
    mode: 'owned-pg17-unix-socket-fixture';
    deadlineMs?: number;
    cancelTransport?: 'pinned-driver' | 'unavailable-fixture';
  },
) {
  const socket = process.env.EV_TEST_PG_SOCKET;
  if (
    options?.enabled !== true ||
    options.mode !== 'owned-pg17-unix-socket-fixture' ||
    !socket ||
    !/^\/(?:private\/)?tmp\/[a-zA-Z0-9_-]+$/.test(socket) ||
    raw.host !== socket ||
    raw.port !== 55477 ||
    raw.database !== observed.database ||
    raw.user !== observed.login ||
    raw.pipeline ||
    !/^ev_test_[a-f0-9]{32}$/.test(observed.database) ||
    !Number.isSafeInteger(observed.pid) ||
    observed.pid <= 0 ||
    typeof observed.backend_start !== 'string' ||
    !observed.backend_start
  )
    throw unknown();
  const deadlineMs = options.deadlineMs ?? 4000;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 50 || deadlineMs > 4000)
    throw unknown();
  // Trusted fixture observations, not caller identity or operational custody.
  const key = JSON.stringify([
    observed.database,
    observed.pid,
    observed.backend_start,
  ]);
  if (claimedDrivers.has(raw) || claimedBackends.has(key)) throw unknown();
  claimedDrivers.add(raw);
  claimedBackends.add(key);
  // Never clear either marker. New facades do not renew this driver's lease.
  let phase: 'available' | 'running' | 'quarantined' | 'closed' = 'available';
  let active:
    { query: Query; settled: Promise<void>; done: () => void } | undefined;
  let local: AbortController | undefined;
  let release: AbortController | undefined;
  let withheld = false;
  let releaseVerified = false;
  let disposal: Promise<void> | undefined;
  let queries = 0;
  let cancelRequested = false;
  let sqlCancellation = false;
  let socketEnded = false;
  let backendAbsent = false;
  let cleanupUncertain = false;
  let completedRead = false;
  const states: string[] = [];

  async function dispose(cancel: boolean) {
    if (cancel) {
      withheld = true;
      release?.abort();
    }
    if (disposal) return disposal;
    phase = 'quarantined';
    local?.abort();
    const pending = active;
    disposal = (async () => {
      if (cancel && pending) {
        cancelRequested = true;
        const sideband = new Client({
          host: socket,
          port: 55477,
          user: raw.user,
          password: '',
          database: observed.database,
          ssl: false,
        });
        sideband.on('error', () => {});
        const ended = new Promise<void>((resolve, reject) => {
          sideband.connection.once('end', resolve);
          sideband.connection.once('error', reject);
        });
        try {
          if (options.cancelTransport === 'unavailable-fixture')
            throw unknown();
          // Pinned pg8.23.1 protocol API. It sends the captured driver's own
          // backend cancellation key; neither key nor raw client is returned.
          const cancel = sideband as Client & {
            cancel(client: Client, query: Query): void;
          };
          cancel.cancel(raw, pending.query);
          await bounded(Promise.all([pending.settled, ended]), 1500);
          if (!sqlCancellation) cleanupUncertain = true;
        } catch {
          cleanupUncertain = true;
        } finally {
          // No connected session is reused, including the cancellation transport.
          sideband.connection.stream.destroy();
        }
      }
      try {
        await bounded(raw.end(), 1000);
        socketEnded = true;
      } catch {
        cleanupUncertain = true;
      }
      try {
        for (let i = 0; i < 100; i++) {
          if (!(await bounded(backendPresent(), 100))) {
            backendAbsent = true;
            break;
          }
          await pause(5);
        }
      } catch {
        cleanupUncertain = true;
      }
      if (!backendAbsent) cleanupUncertain = true;
      if (!cleanupUncertain && socketEnded && backendAbsent) phase = 'closed';
    })();
    return disposal;
  }
  function port(): GatewaySql {
    return {
      async query<T extends Record<string, unknown>>(
        text: string,
        params?: unknown[],
      ) {
        if (phase !== 'running' || active) {
          void dispose(true);
          throw unknown();
        }
        let done!: () => void;
        const settled = new Promise<void>((resolve) => {
          done = resolve;
        });
        return new Promise<{ rows: T[] }>((resolve, reject) => {
          const query = new Query<T>(text, params, (error, result) => {
            const code = error && 'code' in error ? String(error.code) : '';
            if (code) states.push(code);
            if (code === '57014') sqlCancellation = true;
            active = undefined;
            done();
            if (error || phase !== 'running') reject(unknown());
            else resolve({ rows: result.rows });
          });
          active = { query, settled, done };
          queries++;
          try {
            raw.query(query);
          } catch {
            active = undefined;
            done();
            reject(unknown());
          }
        });
      },
    };
  }
  return Object.freeze({
    reader(
      auth: CustomerBrokerAuth,
      bearer: string,
      scope: ReaderScope,
      releaseAuthority: (
        target: CommercialCustomerTarget,
        expected: CommercialCustomerResponse,
        signal: AbortSignal,
      ) => Promise<void>,
    ) {
      if (typeof releaseAuthority !== 'function') {
        void dispose(true);
        throw unknown();
      }
      // No generic raw-port callback: only the unchanged existing reader is built.
      const read = operatingCustomerInvoiceRead(
        auth,
        bearer,
        port(),
        observed,
        scope,
        { enabled: true, mode: 'disposable-proposal' },
      );
      return async (
        target: CommercialCustomerTarget,
        signal: AbortSignal,
      ): Promise<CommercialCustomerResponse> => {
        if (phase !== 'available' || signal.aborted) {
          await dispose(true);
          throw unknown();
        }
        let captured: CommercialCustomerTarget;
        try {
          captured = commercialCustomerTarget(target);
        } catch {
          await dispose(true);
          throw unknown();
        }
        const identity = JSON.stringify(captured);
        const started = Date.now(),
          deadline = started + deadlineMs;
        let last = started;
        phase = 'running';
        local = new AbortController();
        release = new AbortController();
        const stop = () => {
          void dispose(true);
        };
        const gate = () => {
          const currentTarget = JSON.stringify(
            commercialCustomerTarget(target),
          );
          assertOperatingSources();
          const now = Date.now();
          if (
            withheld ||
            signal.aborted ||
            release!.signal.aborted ||
            now < last ||
            now >= deadline ||
            currentTarget !== identity
          )
            throw unknown();
          last = now;
        };
        signal.addEventListener('abort', stop, { once: true });
        const timer = setTimeout(stop, deadlineMs);
        try {
          gate();
          const result = await read(target, local.signal);
          completedRead = true;
          gate();
          await dispose(false);
          gate();
          if (!socketEnded || !backendAbsent || cleanupUncertain)
            throw unknown();
          // This callback is mandatory fixture trust, not an operational authority
          // implementation. It must revalidate AFTER every awaited cleanup step.
          await bounded(
            releaseAuthority(captured, result, release.signal),
            Math.max(1, deadline - Date.now()),
          );
          gate();
          const value = commercialCustomerResponse(
            result,
            captured,
            Date.now(),
          );
          gate();
          releaseVerified = true;
          return value;
        } catch {
          await dispose(true);
          phase = 'quarantined';
          throw unknown();
        } finally {
          clearTimeout(timer);
          signal.removeEventListener('abort', stop);
          release.abort();
        }
      };
    },
    snapshot: () =>
      Object.freeze({
        phase,
        queries,
        cancelRequested,
        sqlCancellation,
        socketEnded,
        backendAbsent,
        cleanupUncertain,
        completedRead,
        releaseVerified,
        withheld,
        sqlStates: Object.freeze([...states]),
        operationalAcceptance: false,
      }),
  });
}
