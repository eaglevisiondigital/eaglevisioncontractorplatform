import { loadP1Package, approvedP1Hash } from './package.ts';
import { managementCleanup } from './management.ts';
import { P1Safety } from './safety.ts';
import { verifyCleanupSession } from './cleanup-auth.ts';
// Dedicated process, no CLI credentials, filesystem tokens, logs, generic SQL or arbitrary URLs.
let safety: P1Safety | undefined,
  activated = false,
  activation: Promise<void> | undefined;
let frozen: ReturnType<typeof loadP1Package>,
  apiKey = '',
  managementToken = '';
const sessions = new Map<
  string,
  {
    uid: string;
    token: string;
    owner: boolean;
    sessionId: string;
    pending: boolean;
    factorId?: string;
  }
>();
const request: typeof fetch = async (url, init) =>
  fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  });
const send = (id: number, data: unknown) =>
  process.connected && process.send?.({ id, data });
const signout = async () => {
  const results = await Promise.allSettled(
    [...sessions.values()].map(async (s) => {
      const r = await request(
        `https://${frozen.target}.supabase.co/auth/v1/logout?scope=global`,
        {
          method: 'POST',
          headers: { apikey: apiKey, Authorization: 'Bearer ' + s.token },
        },
      );
      // Already signed-out field session may return401/403. Independent zero-session observation is mandatory.
      if (!r.ok && ![401, 403].includes(r.status))
        throw Error('Session closure unconfirmed');
    }),
  );
  if (results.some((r) => r.status === 'rejected'))
    throw Error('Session cleanup unconfirmed');
};
const verify = (
  alias: string,
  token: string,
  factorId?: string,
  pendingOwner = false,
) =>
  verifyCleanupSession(
    frozen,
    apiKey,
    alias,
    token,
    factorId ?? sessions.get(alias)?.factorId,
    pendingOwner,
    request,
  );

async function liveSessions() {
  if (sessions.size !== 15 || [...sessions.values()].some((s) => s.pending))
    throw Error('Verified sessions absent');
  const tuples = [...sessions.values()]
    .map((s) => "('" + s.sessionId + "'::uuid,'" + s.uid + "'::uuid)")
    .join(',');
  const r = await request(
    `https://api.supabase.com/v1/projects/${frozen.target}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + managementToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `select count(*)::int n from auth.sessions where (id,user_id) in (${tuples}) and (not_after is null or not_after>clock_timestamp())`,
      }),
    },
  );
  if (!r.ok) throw Error('Current session authority unconfirmed');
  const rows = await r.json();
  if (rows.length !== 1 || rows[0].n !== 15)
    throw Error('Session revoked or expired');
  // Never start an activation request using a near-expired owner token after these waits.
  for (const s of sessions.values())
    if (s.owner) {
      const c = JSON.parse(
        Buffer.from(s.token.split('.')[1], 'base64url').toString(),
      );
      if (c.exp * 1000 <= Date.now() + 30000) throw Error('Owner JWT expiring');
    }
}
let closing: Promise<unknown> | undefined;
async function close() {
  closing ??= (async () => {
    try {
      await activation;
    } catch {
      /* Activation may have committed: cleanup still runs. */
    }
    const result = await safety?.close();

    if (process.connected) process.send?.({ event: 'closed', data: result });
    return result;
  })();
  return closing;
}
let busy = false;
let readyAt = 0;
const preparationWall = Date.now() + 600000,
  preparationMono = performance.now() + 600000;
let preparationPulse = performance.now() + 5000,
  preparationOperator = performance.now() + 60000;
const preparingExpired = () =>
  Date.now() >= preparationWall ||
  performance.now() >=
    Math.min(preparationMono, preparationPulse, preparationOperator);
process.on('message', async (message: unknown) => {
  const m = message as {
    id: number;
    type: string;
    data: Record<string, string>;
  };
  if (!m || !Number.isSafeInteger(m.id)) return;
  if (m.type === 'heartbeat' || m.type === 'supervise') {
    try {
      if (activated) {
        if (m.type === 'heartbeat') safety?.heartbeat();
        else safety?.supervise();
      } else {
        if (preparingExpired() && sessions.size)
          throw Error('Preparation supervision expired');
        if (m.type === 'heartbeat') preparationPulse = performance.now() + 5000;
        else preparationOperator = performance.now() + 60000;
      }
      send(m.id, true);
    } catch {
      send(m.id, { error: 'STOP_CONTAINMENT_REQUIRED' });
      void close();
    }
    return;
  }
  if (m.type === 'close') {
    send(m.id, await close());
    return;
  }
  try {
    if (busy || closing) throw Error('Controller unavailable');
    busy = true;
    if (m.type === 'init') {
      if (safety || m.data.operationHash !== approvedP1Hash)
        throw Error('Exact approved operation required');
      frozen = loadP1Package(
        m.data.directory,
        m.data.target,
        m.data.operationHash,
      );
      managementToken = m.data.managementToken;
      apiKey = m.data.publishableKey;
      if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(apiKey))
        throw Error('Publishable key required');
      const ports = managementCleanup(frozen, managementToken, signout);
      safety = new P1Safety({
        ...ports,
        deactivate: async () => {
          if (activated) await ports.deactivate();
        },
      });
      send(m.id, true);
    } else if (m.type === 'track-owner') {
      if (activated || preparingExpired() || sessions.has(m.data.alias))
        throw Error('Pending handoff closed');
      const v = await verify(m.data.alias, m.data.token, undefined, true);
      sessions.set(m.data.alias, { ...v, token: m.data.token });
      send(m.id, true);
    } else if (m.type === 'register') {
      const prior = sessions.get(m.data.alias);
      if (activated || preparingExpired() || (prior && !prior.pending))
        throw Error('Session handoff closed');
      const v = await verify(m.data.alias, m.data.token, m.data.factorId);
      if (
        prior &&
        (!v.owner || v.uid !== prior.uid || v.sessionId !== prior.sessionId)
      )
        throw Error('Pending owner session substitution');
      sessions.set(m.data.alias, {
        ...v,
        token: m.data.token,
        factorId: m.data.factorId,
      });
      send(m.id, true);
    } else if (m.type === 'ready') {
      if (
        !safety ||
        sessions.size !== 15 ||
        [...sessions.values()].some((s) => s.pending)
      )
        throw Error('All15 staff handoffs required');
      await Promise.all(
        [...sessions].map(([alias, s]) => verify(alias, s.token)),
      );
      const state = await managementCleanup(
        frozen,
        managementToken,
        signout,
      ).observe();
      if (
        state.sessions !== 15 ||
        Object.entries(state).some(([k, v]) => k !== 'sessions' && v !== 0)
      )
        throw Error('Dormant authority changed');
      await liveSessions();
      readyAt = Date.now();
      send(m.id, true);
    } else if (m.type === 'activate') {
      if (
        !safety ||
        activated ||
        sessions.size !== 15 ||
        !readyAt ||
        Date.now() - readyAt > 15000
      )
        throw Error('Activation unavailable');
      await liveSessions();
      activated = true; // Start containment BEFORE issuing an uncertain write.
      activation = safety.activate(async () => {
        const r = await request(
          `https://api.supabase.com/v1/projects/${frozen.target}/database/query`,
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + managementToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: frozen.activationSql }),
          },
        );
        if (!r.ok) throw Error('Activation unconfirmed');
      });
      await activation;
      safety.check();
      send(m.id, true);
    } else if (m.type === 'check') {
      safety?.check();
      if (!safety) throw Error('Not initialized');
      send(m.id, true);
    } else if (m.type === 'supervise') {
      safety?.supervise();
      send(m.id, true);
    } else throw Error('Unknown controller command');
  } catch {
    send(m.id, { error: 'STOP_CONTAINMENT_REQUIRED' });
    if (activated) void close();
  } finally {
    busy = false;
  }
});
const timer = setInterval(() => {
  if (!activated && sessions.size > 0 && !closing && preparingExpired())
    void close();
  if (activated && !closing) {
    try {
      safety?.check();
    } catch {
      void close();
    }
  }
}, 250);
process.on('disconnect', () => {
  void close().finally(() => {
    clearInterval(timer);
    process.exit(0);
  });
});
for (const sig of ['SIGTERM', 'SIGINT'] as const)
  process.on(sig, () => {
    void close().finally(() => {
      clearInterval(timer);
      process.exit(0);
    });
  });
