import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { qualify } from '../proposals/invoice-caller-reconciliation/qualify.mjs';
import type {
  CommercialDraft,
  CommercialDraftClient as OriginalClient,
  DraftWrite,
} from '../server/invoices/commercial-draft-client';
import type { GatewaySql } from '../server/payments/postgres-store';
import type { CustomerBrokerAuth as OriginalAuth } from '../server/customer/broker-auth';

type Client = Pick<OriginalClient, 'create' | 'save' | 'read'>;
type Scope = {
  database: string;
  pid: number;
  backend_start: string;
  login: string;
  current_role: string;
};
type Candidate = {
  CommercialDraftClient: new (
    sql: GatewaySql,
    org: string,
    caller?: unknown,
  ) => Client;
  CommercialCallerConnection: new (
    sql: GatewaySql,
    auth: OriginalAuth,
    bearer: string,
    scope: Scope,
  ) => unknown;
  CustomerBrokerAuth: typeof OriginalAuth;
};
let candidate: Candidate;
beforeAll(() => {
  candidate = qualify().candidate as unknown as Candidate;
});
const config = {
  url: 'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey: 'sb_publishable_synthetic_only',
};
function setup() {
  const org = crypto.randomUUID(),
    actor = crypto.randomUUID(),
    session = crypto.randomUUID();
  const claims = {
    sub: actor,
    session_id: session,
    aal: 'aal2',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: config.url + '/auth/v1',
    aud: 'authenticated',
    role: 'authenticated',
  };
  const bearer =
    Buffer.from('{"alg":"RS256"}').toString('base64url') +
    '.' +
    Buffer.from(JSON.stringify(claims)).toString('base64url') +
    '.synthetic_signature';
  const scope: Scope = {
    database: 'disposable',
    pid: 77,
    backend_start: 'synthetic_backend',
    login: 'fixture_login',
    current_role: 'fixture_runtime',
  };
  const state = {
    authorized: true,
    sessionActive: true,
    inspections: 0,
    mutations: 0,
    reads: 0,
    hashes: 0,
    postMutation: () => {},
    duringInspect: () => {},
    returnedActor: actor,
    requestHash: 'a'.repeat(64),
    editResult: (_r: CommercialDraft) => {
      void _r;
    },
  };
  const receipts = new Map<string, CommercialDraft>();
  const input: DraftWrite = {
    invoiceId: crypto.randomUUID(),
    customerId: crypto.randomUUID(),
    locationId: crypto.randomUUID(),
    sourceVersionId: crypto.randomUUID(),
    commandId: crypto.randomUUID(),
    expectedRevision: 0,
    title: 'Draft only',
    memo: 'No billing authority',
  };
  const result = (v: DraftWrite): CommercialDraft => ({
    invoiceId: v.invoiceId,
    customerId: v.customerId,
    locationId: v.locationId,
    sourceVersionId: v.sourceVersionId,
    title: v.title,
    memo: v.memo,
    organizationId: org,
    revision: v.expectedRevision + 1,
    currency: 'USD',
    amountMinor: 1234,
    sourceHash: 'b'.repeat(64),
    sourceCurrent: true,
    state: 'draft',
    receipt: {
      id: v.commandId,
      invoiceId: v.invoiceId,
      organizationId: org,
      customerId: v.customerId,
      sourceVersionId: v.sourceVersionId,
      commandId: v.commandId,
      revision: v.expectedRevision + 1,
      actorId: state.returnedActor,
      requestHash: state.requestHash,
    },
  });
  const sql: GatewaySql = {
    async query<T extends Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ) {
      let rows: unknown[];
      if (text.includes('pg_stat_activity')) {
        state.inspections++;
        state.duringInspect();
        rows = [{ ...scope, claims: JSON.stringify(claims) }];
      } else if (text.includes('jsonb_build_array')) {
        state.hashes++;
        rows = [{ request_hash: 'a'.repeat(64) }];
      } else if (text.includes('_create(') || text.includes('_save(')) {
        state.mutations++;
        const create = text.includes('_create('),
          offset = create ? 0 : 1;
        const v = {
          invoiceId: String(params[1]),
          commandId: String(params[2]),
          expectedRevision: create ? 0 : Number(params[3]),
          customerId: String(params[3 + offset]),
          locationId: params[4 + offset] as string | null,
          sourceVersionId: String(params[5 + offset]),
          title: String(params[6 + offset]),
          memo: String(params[7 + offset]),
        };
        const r = result(v);
        state.editResult(r);
        receipts.set(v.commandId, r);
        state.postMutation();
        rows = [{ result: r }];
      } else if (text.includes('_read(')) {
        state.reads++;
        rows = [
          {
            result:
              receipts.get(String(params[2])) ?? [...receipts.values()].at(-1),
          },
        ];
      } else throw Error('Unexpected SQL');
      return { rows: rows as T[] };
    },
  };
  const auth = new candidate.CustomerBrokerAuth(config, async (input) => {
    if (!state.authorized)
      return Response.json({ message: 'denied' }, { status: 401 });
    if (String(input).endsWith('/auth/v1/user'))
      return Response.json({ id: actor });
    if (String(input).endsWith('/rest/v1/rpc/customer_session_status'))
      return Response.json({
        user_id: actor,
        session_id: session,
        active: state.sessionActive,
      });
    throw Error('Unexpected provider path');
  });
  const caller = new candidate.CommercialCallerConnection(
    sql,
    auth,
    bearer,
    scope,
  );
  return {
    org,
    actor,
    session,
    claims,
    scope,
    state,
    receipts,
    input,
    sql,
    auth,
    bearer,
    caller,
    result,
    client: new candidate.CommercialDraftClient(sql, org, caller),
  };
}

describe('UNAPPLIED caller-bound invoice reconciliation proposal', () => {
  it('qualifies only exact patch/parent/source/auth/SQL and rejects evidence self-rebind', () => {
    expect(qualify({ checkTypes: true }).client).toContain('context.matches');
    const patch = readFileSync(
      'proposals/invoice-caller-reconciliation/correction.patch',
    );
    const changed = Buffer.from(
      patch.toString().replace('OriginalDraftAttempt', 'ChangedDraftAttempt'),
    );
    const evidence = JSON.parse(
      readFileSync(
        'proposals/invoice-caller-reconciliation/evidence.json',
        'utf8',
      ),
    );
    expect(() => qualify({ patch: changed })).toThrow('Exact reviewed patch');
    expect(() =>
      qualify({
        patch: changed,
        evidence: {
          ...evidence,
          patchSha256: createHash('sha256').update(changed).digest('hex'),
        },
      }),
    ).toThrow('Exact unapplied scope');
  });
  it('requires opaque authenticated connection context before any SQL mutation', async () => {
    const f = setup(),
      client = new candidate.CommercialDraftClient(f.sql, f.org);
    await expect(client.create(f.input)).rejects.toThrow('UNKNOWN');
    expect(f.state.mutations).toBe(0);
  });
  it('creates, saves and reopens exact revision using the existing writer', async () => {
    const f = setup();
    expect((await f.client.create(f.input)).revision).toBe(1);
    const next = {
      ...f.input,
      commandId: crypto.randomUUID(),
      expectedRevision: 1,
      title: 'Explicit later revision',
    };
    expect((await f.client.save(next)).revision).toBe(2);
    expect((await f.client.read(next, next.commandId)).title).toBe(next.title);
    expect(f.state.mutations).toBe(2);
  });
  it('binds before dispatch and reconciles only original caller/hash with no original replay', async () => {
    const f = setup();
    f.state.postMutation = () => {
      throw Error('ACK lost after commit');
    };
    await expect(f.client.create(f.input)).rejects.toThrow('UNKNOWN');
    f.state.postMutation = () => {};
    expect(
      (await f.client.read(f.input, f.input.commandId)).receipt.actorId,
    ).toBe(f.actor);
    await expect(f.client.create(f.input)).rejects.toThrow('UNKNOWN');
    await f.client.save({
      ...f.input,
      commandId: crypto.randomUUID(),
      expectedRevision: 1,
    });
    expect(f.state.mutations).toBe(2);
  });
  it.each([
    'actor',
    'hash',
    'tenant',
    'customer',
    'property',
    'invoice',
    'version',
    'command',
    'revision',
    'title',
    'source',
  ])(
    'withholds mismatched %s ACK and cannot reconcile it or dispatch replacement',
    async (kind) => {
      const f = setup();
      f.state.editResult = (r) => {
        if (kind === 'actor') r.receipt.actorId = crypto.randomUUID();
        if (kind === 'hash') r.receipt.requestHash = 'f'.repeat(64);
        if (kind === 'tenant') r.organizationId = crypto.randomUUID();
        if (kind === 'customer') r.customerId = crypto.randomUUID();
        if (kind === 'property') r.locationId = crypto.randomUUID();
        if (kind === 'invoice') r.invoiceId = crypto.randomUUID();
        if (kind === 'version') r.sourceVersionId = crypto.randomUUID();
        if (kind === 'command') r.receipt.commandId = crypto.randomUUID();
        if (kind === 'revision') r.revision++;
        if (kind === 'title') r.title += ' different';
        if (kind === 'source') r.sourceCurrent = false;
      };
      await expect(f.client.create(f.input)).rejects.toThrow('UNKNOWN');
      await expect(f.client.read(f.input, f.input.commandId)).rejects.toThrow(
        'UNKNOWN',
      );
      await expect(
        f.client.save({
          ...f.input,
          commandId: crypto.randomUUID(),
          expectedRevision: 1,
        }),
      ).rejects.toThrow('UNKNOWN');
      expect(f.state.mutations).toBe(1);
    },
  );
  it('cannot borrow another actor receipt on an ordinary participating-client read', async () => {
    const f = setup();
    f.receipts.set(f.input.commandId, {
      ...f.result(f.input),
      receipt: { ...f.result(f.input).receipt, actorId: crypto.randomUUID() },
    });
    await expect(f.client.read(f.input, f.input.commandId)).rejects.toThrow(
      'UNKNOWN',
    );
    expect(f.state.mutations).toBe(0);
  });
  it.each(['invoiceId', 'commandId', 'sourceVersionId'] as const)(
    'case-varied %s cannot bypass the existing hold or issue a second write',
    async (key) => {
      const f = setup();
      f.state.postMutation = () => {
        throw Error('ACK unknown');
      };
      await expect(f.client.create(f.input)).rejects.toThrow('UNKNOWN');
      await expect(
        f.client.create({
          ...f.input,
          commandId: crypto.randomUUID(),
          [key]: f.input[key].toUpperCase(),
        }),
      ).rejects.toThrow('UNKNOWN');
      expect(f.state.mutations).toBe(1);
    },
  );
  it('reserves before authentication awaits and denies simultaneous replacement/reconciliation', async () => {
    const f = setup();
    const pending = f.client.create(f.input);
    await expect(
      f.client.create({ ...f.input, commandId: crypto.randomUUID() }),
    ).rejects.toThrow('UNKNOWN');
    await expect(f.client.read(f.input, f.input.commandId)).rejects.toThrow(
      'UNKNOWN',
    );
    await pending;
    expect(f.state.mutations).toBe(1);
  });
  it('rechecks session revocation after the final awaited connection inspection', async () => {
    const f = setup();
    f.state.postMutation = () => {
      f.state.duringInspect = () => {
        f.state.sessionActive = false;
      };
    };
    await expect(f.client.create(f.input)).rejects.toThrow('UNKNOWN');
    await expect(f.client.read(f.input, f.input.commandId)).rejects.toThrow(
      'UNKNOWN',
    );
    await expect(
      f.client.save({
        ...f.input,
        commandId: crypto.randomUUID(),
        expectedRevision: 1,
      }),
    ).rejects.toThrow('UNKNOWN');
    expect(f.state.mutations).toBe(1);
  });
  it.each(['sub', 'session_id', 'aal', 'exp'] as const)(
    'connection claim %s drift cannot clear a committed-but-unknown hold',
    async (key) => {
      const f = setup();
      f.state.postMutation = () => {
        Object.assign(f.claims, { [key]: key === 'exp' ? 0 : 'changed' });
      };
      await expect(f.client.create(f.input)).rejects.toThrow('UNKNOWN');
      expect(f.state.mutations).toBe(1);
    },
  );
  it.each([
    'database',
    'pid',
    'backend_start',
    'login',
    'current_role',
  ] as const)('pinned %s drift fails closed after a mutation', async (key) => {
    const f = setup();
    f.state.postMutation = () => {
      Object.assign(f.scope, { [key]: key === 'pid' ? 88 : 'changed' });
    };
    await expect(f.client.create(f.input)).rejects.toThrow('UNKNOWN');
    expect(f.state.mutations).toBe(1);
  });
  it('cannot bind a copied actor assertion, another SQL object, or inherited scope fields', async () => {
    const f = setup();
    const forged = {
      verify: async () => ({ verified: true }),
    } as unknown as OriginalAuth;
    const bad = new candidate.CommercialCallerConnection(
      f.sql,
      forged,
      f.bearer,
      f.scope,
    );
    await expect(
      new candidate.CommercialDraftClient(f.sql, f.org, bad).create(f.input),
    ).rejects.toThrow('UNKNOWN');
    const other: GatewaySql = { query: f.sql.query.bind(f.sql) };
    await expect(
      new candidate.CommercialDraftClient(other, f.org, f.caller).create({
        ...f.input,
        commandId: crypto.randomUUID(),
      }),
    ).rejects.toThrow('UNKNOWN');
    expect(
      () =>
        new candidate.CommercialCallerConnection(
          f.sql,
          f.auth,
          f.bearer,
          Object.create(f.scope),
        ),
    ).toThrow();
    const accessor = { ...f.scope };
    Object.defineProperty(accessor, 'pid', { get: () => 77 });
    expect(
      () =>
        new candidate.CommercialCallerConnection(
          f.sql,
          f.auth,
          f.bearer,
          accessor,
        ),
    ).toThrow();
    expect(f.state.mutations).toBe(0);
  });
  it('expiry after an ambiguous commit cannot reconcile or issue another write', async () => {
    const f = setup();
    f.state.postMutation = () => {
      throw Error('ACK lost');
    };
    await expect(f.client.create(f.input)).rejects.toThrow('UNKNOWN');
    const clock = vi
      .spyOn(Date, 'now')
      .mockReturnValue((f.claims.exp + 1) * 1000);
    try {
      await expect(f.client.read(f.input, f.input.commandId)).rejects.toThrow(
        'UNKNOWN',
      );
      await expect(
        f.client.save({
          ...f.input,
          commandId: crypto.randomUUID(),
          expectedRevision: 1,
        }),
      ).rejects.toThrow('UNKNOWN');
      expect(f.state.mutations).toBe(1);
    } finally {
      clock.mockRestore();
    }
  });
  it('cannot replace a minted connection proof with object shapes or instance method overrides', async () => {
    const f = setup();
    const forged = { run: async () => f.result(f.input) };
    await expect(
      new candidate.CommercialDraftClient(f.sql, f.org, forged).create(f.input),
    ).rejects.toThrow('UNKNOWN');
    expect(f.state.mutations).toBe(0);
    Object.assign(f.caller as object, {
      current: async () => ({ user_id: crypto.randomUUID() }),
      run: async () => f.result(f.input),
      connection: { query: async () => ({ rows: [] }) },
      auth: { verify: async () => ({ verified: true }) },
      bearer: 'forged browser token',
    });
    expect((await f.client.create(f.input)).receipt.actorId).toBe(f.actor);
    expect(f.state.mutations).toBe(1);
  });
  it('keeps the original bearer and connection custody out of enumerable serialization', () => {
    const f = setup();
    expect(Object.keys(f.caller as object)).toEqual([]);
    expect(JSON.stringify(f.caller)).toBe('{}');
    expect(JSON.stringify(f.caller)).not.toContain(f.bearer);
  });
  it('a replaced verifier method cannot reuse a still-young proof after current session revocation', async () => {
    const f = setup();
    const prior = await f.auth.verify(f.bearer);
    f.auth.verify = async () => prior;
    f.state.sessionActive = false;
    await expect(f.client.create(f.input)).rejects.toThrow('UNKNOWN');
    expect(f.state.mutations).toBe(0);
  });
  it('expires or revokes Auth without exposing provider details or mutating', async () => {
    const f = setup();
    f.state.authorized = false;
    await expect(f.client.create(f.input)).rejects.toThrow('UNKNOWN');
    expect(f.state.mutations).toBe(0);
  });
});
