import { fork } from 'node:child_process';
import { approvedP1Hash } from './package.ts';
import type { P1Control } from './executor.ts';
import type { CleanupResult } from './safety.ts';
/** Explicitly constructed only during a future supervised handoff. Nothing starts on import. */
export async function startP1Cleanup(options: {
  directory: string;
  target: string;
  operationHash: string;
  managementToken: string;
  publishableKey: string;
}) {
  if (options.operationHash !== approvedP1Hash)
    throw Error('Exact owner-approved hash required');
  const child = fork(new URL('./cleanup-worker.mts', import.meta.url), [], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { PATH: process.env.PATH },
    execArgv: ['--experimental-transform-types'],
  });
  const interrupted = new AbortController();
  let n = 0,
    closed: CleanupResult | null = null,
    failed = false;
  const pending = new Map<
    number,
    {
      resolve: (data: unknown) => void;
      reject: () => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  child.on('message', (value: unknown) => {
    const m = value as { id: number; data: unknown; event?: string };
    if (m.event === 'closed') {
      closed = m.data as CleanupResult;
      interrupted.abort();
      return;
    }
    const r = pending.get(m.id);
    if (r) {
      clearTimeout(r.timer);
      pending.delete(m.id);
      if ((m.data as { error?: unknown })?.error) {
        failed = true;
        r.reject();
      } else r.resolve(m.data);
    }
  });
  child.on('exit', () => {
    failed = true;
    interrupted.abort();
    for (const r of pending.values()) {
      clearTimeout(r.timer);
      r.reject();
    }
    pending.clear();
  });
  const request = (type: string, data: unknown = {}): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = ++n;
      const fail = () =>
        reject(Error('Independent cleanup channel unavailable'));
      const timer = setTimeout(
        () => {
          pending.delete(id);
          failed = true;
          fail();
        },
        type === 'close' ? 45000 : type === 'ready' ? 40000 : 20000,
      );
      pending.set(id, { resolve, reject: fail, timer });
      child.send({ id, type, data }, (err) => {
        if (err) {
          clearTimeout(timer);
          pending.delete(id);
          failed = true;
          fail();
        }
      });
    });
  try {
    await request('init', options);
  } catch (e) {
    child.disconnect();
    throw e;
  }
  // Process liveness is automatic; operator supervision must be explicitly renewed separately.
  const heartbeat = setInterval(() => {
    if (!closed && !failed)
      void request('heartbeat').catch(() => {
        failed = true;
      });
  }, 1000);
  const control: P1Control & {
    trackOwner(alias: string, token: string): Promise<void>;
    register(alias: string, token: string, factorId?: string): Promise<void>;
    supervise(): Promise<void>;
    dispose(): void;
  } = {
    signal: interrupted.signal,
    trackOwner: async (alias, token) => {
      await request('track-owner', { alias, token });
    },
    register: async (alias, token, factorId) => {
      await request('register', { alias, token, factorId });
    },
    ready: async () => {
      await request('ready');
    },
    activate: async () => {
      await request('activate');
    },
    check: async () => {
      if (failed || closed) throw Error('Cleanup channel stopped');
      await request('check');
    },
    supervise: async () => {
      await request('supervise');
    },
    close: async () => {
      clearInterval(heartbeat);
      try {
        if (closed) return closed;
        return (await request('close')) as CleanupResult;
      } finally {
        if (child.connected) child.disconnect();
      }
    },
    dispose: () => {
      clearInterval(heartbeat);
      if (child.connected) child.disconnect();
    },
  };
  return control;
}
