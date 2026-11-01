import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import {
  executeReplacement,
  type Reply,
} from '../server/netlify/replacement-executor';
import {
  prepareFrozenPackage,
  prepareOfflinePackage,
} from '../server/netlify/replacement-package';
import { openDraftJournal } from '../server/netlify/replacement-journal';
import {
  replacementFixture,
  fixtureInput,
} from './helpers/netlify-replacement-fixture';

const roots: string[] = [];
function setup() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'propel-draft-')));
  roots.push(root);
  return { root, f: replacementFixture(join(root, 'journal')) };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true });
});

it('requires a minute of remaining approval authority before sending any mutation', async () => {
  const { f } = setup();
  const a = f.approval();
  a.expiresAt = a.approvedAt + 30000;
  expect((await executeReplacement(f.pkg, a, f.ports)).state).toBe('STOPPED');
  expect(f.calls).toHaveLength(0);
  expect(f.ports.journal.inspect().state).toBe('STOPPED');
});
it('rejects a broadened approval record or an owner-labelled synthetic permit', async () => {
  const { f } = setup();
  const extra = { ...f.approval(), retry: true };
  expect((await executeReplacement(f.pkg, extra, f.ports)).code).toBe(
    'EXACT_OWNER_APPROVAL_REQUIRED',
  );
  const wrongMode = f.approval();
  wrongMode.kind = 'OWNER_EXECUTION_APPROVAL';
  expect((await executeReplacement(f.pkg, wrongMode, f.ports)).code).toBe(
    'EXACT_OWNER_APPROVAL_REQUIRED',
  );
  expect(f.calls).toHaveLength(0);
});
it('a failed journal reservation prevents creation even if the attempt file was already committed', async () => {
  const { root, f } = setup();
  const start = f.ports.journal.start;
  f.ports.journal.start = (hash) => {
    start(hash);
    throw Error('RESERVATION_ACK_LOST');
  };
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
    'UNKNOWN',
  );
  expect(f.calls).toHaveLength(0);
  const restarted = replacementFixture(join(root, 'journal'));
  await executeReplacement(
    restarted.pkg,
    restarted.approval(),
    restarted.ports,
  );
  expect(restarted.calls).toHaveLength(0);
});
it('checks the original deployment again after perimeter verification', async () => {
  const { f } = setup();
  const perimeter = f.ports.perimeter;
  f.ports.perimeter = async (...args) => {
    const r = await perimeter(...args);
    f.old.published_at = 'unexpected';
    return r;
  };
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).code).toBe(
    'ORIGINAL_DEPLOY_DRIFT',
  );
  expect(f.creations()).toBe(1);
});
it('the timeout wins against an uncooperative provider without late phase continuation', async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockImplementation((ms) => nativeTimeout(ms === 60000 ? 5 : ms));
  const { f } = setup();
  let release!: (r: Reply) => void;
  f.controls.create = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = executeReplacement(f.pkg, f.approval(), f.ports);
  await vi.waitFor(() => expect(f.creations()).toBe(1));
  expect((await pending).state).toBe('UNKNOWN');
  expect(timeout).toHaveBeenCalledWith(60000);
  release({ status: 200, body: f.created });
  await Promise.resolve();
  expect(f.calls).toHaveLength(1);
});
it('clones caller inputs and keeps stored initial queues independent of later provider mutation', async () => {
  const { f } = setup();
  const reply = { status: 200, body: structuredClone(f.created) };
  const put = f.controls.put;
  f.controls.create = async () => reply;
  f.controls.put = async (q) => {
    reply.body.required = [];
    f.input.contents[f.input.artifacts[0].path].fill(0);
    return put(q);
  };
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
    'VERIFIED_DRAFT',
  );
  expect(f.calls.filter((x) => x.method === 'PUT')).toHaveLength(13);
  expect(f.ports.journal.inspect().events[1]).toMatchObject({
    data: { required: f.created.required },
  });
});

it('concurrent invocation cannot create twice or append a terminal event to the active writer', async () => {
  const { f } = setup();
  f.controls.create = () => new Promise(() => {});
  const running = executeReplacement(f.pkg, f.approval(), f.ports);
  await vi.waitFor(() => expect(f.creations()).toBe(1));
  expect(await executeReplacement(f.pkg, f.approval(), f.ports)).toMatchObject({
    state: 'UNKNOWN',
    code: 'CONCURRENT_EXECUTOR_NO_REPLAY',
  });
  expect(
    f.ports.journal.inspect().events.some((e) => e.kind === 'TERMINAL'),
  ).toBe(false);
  f.abort.abort();
  expect((await running).state).toBe('UNKNOWN');
  expect(f.creations()).toBe(1);
});

it('receipt identity and metadata must still match when every initial upload was cached', async () => {
  const { f } = setup();
  f.created.required = [];
  f.created.required_functions = [];
  const read = f.ports.registration;
  f.ports.registration = async (...args) => {
    const r = await read(...args);
    r.functions[0].config = { priority: 999 };
    return r;
  };
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).code).toBe(
    'FUNCTION_METADATA_UNVERIFIED',
  );
  expect(f.calls.some((c) => c.method === 'PUT')).toBe(false);
});

it('an unreadable prior journal remains UNKNOWN rather than a fresh failed attempt', async () => {
  const { root, f } = setup();
  f.ports.journal.start('a'.repeat(64));
  writeFileSync(join(root, 'journal', 'attempt.json'), '{truncated');
  expect(await executeReplacement(f.pkg, f.approval(), f.ports)).toMatchObject({
    state: 'UNKNOWN',
    code: 'JOURNAL_UNREADABLE_NO_REPLAY',
  });
  expect(f.calls).toHaveLength(0);
});
it('a draft regressing from ready is not accepted from an earlier state poll', async () => {
  const { f } = setup();
  f.controls.snapshot = async () => {
    const s = f.snapshotValue();
    if (s.inventory.length === 2) s.inventory[1].state = 'uploading';
    return s;
  };
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).code).toBe(
    'DRAFT_NO_LONGER_READY',
  );
});
it('preserves the initial provider creation timestamp on subsequent reads', async () => {
  const { f } = setup();
  f.controls.read = async () => ({
    status: 200,
    body: { ...f.created, state: 'ready', created_at: '2026-10-30T12:00:01Z' },
  });
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).code).toBe(
    'CREATION_TIME_DRIFT',
  );
});

it('copies shared byte views before verification so later writer changes cannot replace approved bytes', async () => {
  const { f } = setup();
  const i = fixtureInput();
  const path = i.artifacts[0].path;
  const shared = new Uint8Array(new SharedArrayBuffer(i.contents[path].length));
  shared.set(i.contents[path]);
  i.contents[path] = shared;
  const pkg = prepareOfflinePackage(i);
  shared.fill(0);
  expect((await executeReplacement(pkg, f.approval(), f.ports)).state).toBe(
    'VERIFIED_DRAFT',
  );
});

it('executes one draft and exactly the 9+4 requested bytes, retaining queues before every receipt; never a final manifest', async () => {
  const { f } = setup();
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(Error('NO_NETWORK'));
  const before = structuredClone(f.old);
  expect(await executeReplacement(f.pkg, f.approval(), f.ports)).toMatchObject({
    state: 'VERIFIED_DRAFT',
    deployId: f.newId,
  });
  expect(f.calls.filter((x) => x.method === 'POST')).toHaveLength(1);
  expect(f.calls[0]).toEqual({
    method: 'POST',
    url: `${f.data.api}/sites/${f.data.siteId}/deploys`,
    digest: f.pkg.bodySha256,
  });
  expect(f.calls.filter((x) => x.method === 'PUT')).toHaveLength(13);
  expect(
    f.calls
      .filter((x) => x.method === 'PUT')
      .every((x) => x.url.includes('/deploys/' + f.newId + '/')),
  ).toBe(true);
  expect(
    f.calls.some(
      (x) => x.method === 'PUT' && !/\/(files|functions)\//.test(x.url),
    ),
  ).toBe(false);
  expect(f.old).toEqual(before);
  expect(fetch).not.toHaveBeenCalled();
  const events = f.ports.journal.inspect().events;
  expect(events[0].kind).toBe('CREATE_SEND');
  expect(events[1]).toMatchObject({
    kind: 'INITIAL_RESPONSE',
    data: {
      required: f.created.required,
      required_functions: f.created.required_functions,
    },
  });
  expect(events.filter((x) => x.kind.endsWith('_SEND'))).toHaveLength(14);
  expect(events.filter((x) => x.kind.endsWith('_RECEIPT'))).toHaveLength(13);
});

it('reuses unrequested Function digests while still verifying all four registrations', async () => {
  const { f } = setup();
  f.created.required_functions = f.created.required_functions.slice(0, 1);
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
    'VERIFIED_DRAFT',
  );
  expect(
    f.calls.filter((x) => x.method === 'PUT' && x.url.includes('/functions/')),
  ).toHaveLength(1);
});

it('sends one requested static digest and reuses every other cached static and Function', async () => {
  const { f } = setup();
  f.created.required = f.created.required.slice(0, 1);
  f.created.required_functions = [];
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
    'VERIFIED_DRAFT',
  );
  const puts = f.calls.filter((c) => c.method === 'PUT');
  expect(puts).toHaveLength(1);
  expect(puts[0].url).toContain('/files/');
  expect(puts[0].digest).toBe(
    f.data.files[Object.keys(f.data.files)[0]].sha256,
  );
});
it('accepts explicitly empty initial arrays only with complete later registration evidence', async () => {
  const { f } = setup();
  f.created.required = [];
  f.created.required_functions = [];
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
    'VERIFIED_DRAFT',
  );
  expect(f.calls.filter((x) => x.method === 'PUT')).toHaveLength(0);
});
it.each(['required', 'required_functions'])(
  'rejects absent/null/string/object initial %s, never rebuilding a queue from GET',
  async (field) => {
    for (const value of [undefined, null, 'not-an-array', {}, [null], [1]]) {
      const { f } = setup();
      f.controls.create = async () => ({
        status: 200,
        body: { ...f.created, [field]: value },
      });
      const result = await executeReplacement(f.pkg, f.approval(), f.ports);
      expect(result).toMatchObject({
        state: 'STOPPED',
        code: 'INITIAL_REQUIRED_LIST',
      });
      expect(f.calls).toHaveLength(1);
      expect(f.ports.journal.inspect().events[1].kind).toBe('INITIAL_RESPONSE');
    }
  },
);
it.each(['required', 'required_functions'])(
  'rejects unknown and duplicate initial %s digests',
  async (field) => {
    for (const unknown of [true, false]) {
      const { f } = setup();
      const values = f.created[field as 'required'];
      f.controls.create = async () => ({
        status: 200,
        body: {
          ...f.created,
          [field]: unknown
            ? ['f'.repeat(field === 'required' ? 40 : 64)]
            : [values[0], values[0]],
        },
      });
      expect(
        (await executeReplacement(f.pkg, f.approval(), f.ports)).code,
      ).toBe('INITIAL_REQUIRED_LIST');
      expect(f.calls).toHaveLength(1);
    }
  },
);
it.each([
  { site_id: 'wrong-site' },
  { id: '1'.repeat(24) },
  { id: 'not-an-id' },
  { draft: false },
  { draft: 'true' },
  { state: 'error' },
  { state: 'building' },
  { context: 'production' },
  { published_at: '2026-10-30T12:00:00Z' },
  { manual_deploy: false },
  { build_id: 'build' },
  { deploy_ssl_url: 'https://evil.invalid' },
  { required_server: ['server'] },
  { required_edge_functions: ['edge'] },
  { function_schedules: [{}] },
])('stops on inconsistent creation identity/state %j', async (override) => {
  const { f } = setup();
  f.controls.create = async () => ({
    status: 200,
    body: { ...f.created, ...override },
  });
  expect(
    (await executeReplacement(f.pkg, f.approval(), f.ports)).state,
  ).not.toBe('VERIFIED_DRAFT');
  expect(f.calls).toHaveLength(1);
});
it('handles omitted optional draft with exact read-only corroboration without losing initial queues', async () => {
  const { f } = setup();
  delete f.created.draft;
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
    'VERIFIED_DRAFT',
  );
  expect(f.calls[1].method).toBe('GET');
  expect(f.calls.filter((x) => x.method === 'PUT')).toHaveLength(13);
  expect(f.ports.journal.inspect().events[1]).toMatchObject({
    data: { draft: { omitted: true }, required: f.created.required },
  });
});
it('never overrides contradictory GET evidence when draft is omitted', async () => {
  const { f } = setup();
  delete f.created.draft;
  f.controls.read = async () => ({
    status: 200,
    body: { ...f.created, draft: false },
  });
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
    'STOPPED',
  );
  expect(f.calls.map((x) => x.method)).toEqual(['POST', 'GET']);
});

it.each([500, 422, 201])(
  'holds unconfirmed creation status %s as UNKNOWN with no next mutation',
  async (status) => {
    const { f } = setup();
    f.controls.create = async () => ({ status, body: {} });
    expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
      'UNKNOWN',
    );
    expect(f.creations()).toBe(1);
    expect(f.calls).toHaveLength(1);
  },
);
it('retains lost create acknowledgment as UNKNOWN and denies a new run with a different approval', async () => {
  const { root, f } = setup();
  f.controls.create = async () => {
    throw Error('LOST_CREATE_ACK');
  };
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
    'UNKNOWN',
  );
  expect(
    openDraftJournal(join(root, 'journal'), f.pkg.bindingSha256).inspect()
      .state,
  ).toBe('UNKNOWN');
  const restart = replacementFixture(join(root, 'journal'));
  expect(
    await executeReplacement(restart.pkg, restart.approval(), restart.ports),
  ).toMatchObject({ state: 'UNKNOWN', code: 'EXISTING_ATTEMPT_NO_REPLAY' });
  expect(restart.calls).toHaveLength(0);
});
it('retains a lost upload acknowledgment and never sends that digest or any later digest again', async () => {
  const { f } = setup();
  f.controls.put = async () => {
    throw Error('LOST_UPLOAD_ACK');
  };
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
    'UNKNOWN',
  );
  expect(f.calls.map((x) => x.method)).toEqual(['POST', 'PUT']);
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).code).toBe(
    'EXISTING_ATTEMPT_NO_REPLAY',
  );
  expect(f.calls).toHaveLength(2);
});
it.each([
  { status: 200, body: {} },
  { status: 500, body: {} },
  { status: 200, body: { sha: 'wrong', path: 'wrong', size: 0 } },
])('rejects unconfirmed upload receipt %j', async (response) => {
  const { f } = setup();
  f.controls.put = async () => response;
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
    'UNKNOWN',
  );
  expect(f.calls).toHaveLength(2);
});
it.each([
  'CREATE_SEND',
  'INITIAL_RESPONSE',
  'FILE_SEND',
  'FILE_RECEIPT',
  'TERMINAL',
])('stops on a private journal failure at %s', async (kind) => {
  const { f } = setup();
  const append = f.ports.journal.append;
  f.ports.journal.append = (k, d) => {
    if (k === kind) throw Error('JOURNAL_FAILURE');
    append(k, d);
  };
  const result = await executeReplacement(f.pkg, f.approval(), f.ports);
  expect(result.state).not.toBe('VERIFIED_DRAFT');
  expect(f.calls.filter((x) => x.method === 'POST').length).toBeLessThanOrEqual(
    1,
  );
  const sent = f.calls.length;
  await executeReplacement(f.pkg, f.approval(), f.ports);
  expect(f.calls.length).toBe(sent);
});

it.each([
  'siteId',
  'bodySha256',
  'bindingSha256',
  'packageSha256',
  'executorSha256',
  'preflightSha256',
  'originalId',
  'kind',
  'scope',
  'expiresAt',
])(
  'requires exact separately approved %s before any transmission',
  async (key) => {
    const { f } = setup();
    const approval = f.approval();
    Object.assign(approval, { [key]: key === 'expiresAt' ? 0 : 'wrong' });
    expect((await executeReplacement(f.pkg, approval, f.ports)).state).toBe(
      'NO_GO',
    );
    expect(f.calls).toHaveLength(0);
    expect(f.ports.journal.inspect().state).toBe('UNSTARTED');
  },
);
it('defaults closed with no approval and rejects a fixture as a frozen live package', async () => {
  const { f } = setup();
  expect((await executeReplacement(f.pkg, null, f.ports)).state).toBe('NO_GO');
  expect(() => prepareFrozenPackage(f.input)).toThrow('PRIVATE_BINDING_DRIFT');
  expect(f.calls).toHaveLength(0);
});
it('offline fixture cannot select a real host or real environment values', () => {
  const i = fixtureInput();
  const b = JSON.parse(Buffer.from(i.binding).toString());
  b.site.name = 'real-site';
  i.binding = Buffer.from(JSON.stringify(b));
  expect(() => prepareOfflinePackage(i)).toThrow('OFFLINE_ONLY_VALUES');
});
it('rejects modified artifact bytes or missing archive/manifest identity before creating anything', () => {
  const i = fixtureInput();
  i.contents[i.artifacts[0].path][0] ^= 1;
  expect(() => prepareOfflinePackage(i)).toThrow('ARTIFACT_BYTES');
  const j = fixtureInput();
  j.archive = Buffer.from('different');
  expect(() => prepareOfflinePackage(j)).toThrow('INPUT_HASH_BINDING');
});

it.each([
  { inventoryComplete: false },
  { environmentComplete: false },
  { primary: { id: 'published', publishedAt: 'now' } },
  { aliases: ['alias.invalid'] },
  { gitRepository: 'git-repository' },
  { siteEnvironmentKeys: ['EXTRA'] },
  { customDomain: 'custom.invalid' },
])('preflight denies incomplete or changed baseline %j', async (override) => {
  const { f } = setup();
  f.controls.snapshot = async () => ({ ...f.snapshotValue(), ...override });
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
    'NO_GO',
  );
  expect(f.calls).toHaveLength(0);
});
it.each(['source', 'production', 'previews', 'teamLoginAll', 'witnessSha256'])(
  'requires independent protection %s, never connector flags alone',
  async (key) => {
    const { f } = setup();
    f.controls.snapshot = async () => {
      const s = f.snapshotValue();
      Object.assign(s.protection, {
        [key]: key === 'teamLoginAll' ? false : 'unproven',
      });
      return s;
    };
    expect((await executeReplacement(f.pkg, f.approval(), f.ports)).code).toBe(
      'INDEPENDENT_PROTECTION_REQUIRED',
    );
    expect(f.calls).toHaveLength(0);
  },
);
it.each(['expiry', 'wall', 'presence', 'timestamp'])(
  'stops on %s loss without a compensating mutation',
  async (type) => {
    const { f } = setup();
    const approval = f.approval();
    f.controls.create = async () => {
      if (type === 'expiry') f.advance(45 * 60000);
      if (type === 'wall') f.driftWall(121000);
      if (type === 'presence') f.advance(61000, false);
      return {
        status: 200,
        body: {
          ...f.created,
          ...(type === 'timestamp'
            ? { created_at: '2026-10-29T12:00:00Z' }
            : {}),
        },
      };
    };
    expect((await executeReplacement(f.pkg, approval, f.ports)).state).toBe(
      'STOPPED',
    );
    expect(f.calls).toHaveLength(1);
  },
);
it('bounds polling without inventing a manifest finalization or second create', async () => {
  const { f } = setup();
  f.controls.read = async () => ({ status: 200, body: f.created });
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).code).toBe(
    'READY_NOT_OBSERVED',
  );
  expect(f.calls.filter((x) => x.method === 'GET')).toHaveLength(60);
  expect(f.creations()).toBe(1);
});
it('loses no UNKNOWN hold when a hung provider returns after cancellation', async () => {
  const { f } = setup();
  let release!: (r: Reply) => void;
  f.controls.create = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = executeReplacement(f.pkg, f.approval(), f.ports);
  await vi.waitFor(() => expect(f.creations()).toBe(1));
  f.abort.abort();
  expect((await pending).state).toBe('UNKNOWN');
  release({ status: 200, body: f.created });
  await Promise.resolve();
  expect(f.calls).toHaveLength(1);
  expect(f.ports.journal.inspect().state).toBe('UNKNOWN');
});

it.each([
  'files',
  'functions',
  'runtime',
  'perimeter',
  'original',
  'protection',
])('withholds acceptance for final %s discrepancy', async (type) => {
  const { f } = setup();
  const reg = f.ports.registration;
  f.ports.registration = async (id, signal) => {
    const r = await reg(id, signal);
    if (type === 'files') r.files.pop();
    if (type === 'functions') r.functions.pop();
    if (type === 'runtime') r.functions[0].runtime = 'js';
    return r;
  };
  const per = f.ports.perimeter;
  f.ports.perimeter = async (...args) => {
    const r = await per(...args);
    if (type === 'perimeter') r.probes[0].status = 404;
    return r;
  };
  f.controls.snapshot = async () => {
    const s = f.snapshotValue();
    if (f.creations() && type === 'original') s.inventory[0].state = 'ready';
    if (f.creations() && type === 'protection')
      s.protection.teamLoginAll = false;
    return s;
  };
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).state).toBe(
    'STOPPED',
  );
  expect(f.creations()).toBe(1);
});
it('requires complete exact perimeter evidence and rejects app exposure', async () => {
  const { f } = setup();
  const per = f.ports.perimeter;
  f.ports.perimeter = async (...args) => {
    const p = await per(...args);
    p.probes[0].verdict = 'EXPOSED';
    return p;
  };
  expect((await executeReplacement(f.pkg, f.approval(), f.ports)).code).toBe(
    'PERIMETER_NOT_PROVEN',
  );
});
it('immutable local journal rejects symlinks, broad permissions, truncation and tampering', () => {
  const { root, f } = setup();
  f.ports.journal.start('a'.repeat(64));
  f.ports.journal.append('CREATE_SEND', { hash: f.pkg.bodySha256 });
  const file = join(root, 'journal', '000.event.json');
  const old = readFileSync(file, 'utf8');
  writeFileSync(file, old.slice(0, -3));
  expect(() => f.ports.journal.inspect()).toThrow();
  writeFileSync(file, old);
  chmodSync(file, 0o644);
  expect(() => f.ports.journal.inspect()).toThrow('PRIVATE_JOURNAL_FILE');
  chmodSync(file, 0o600);
  rmSync(file);
  symlinkSync(join(root, 'target'), file);
  expect(() => f.ports.journal.inspect()).toThrow();
});
it('journal never records environment values, complete request bodies or arbitrary headers', async () => {
  const { root, f } = setup();
  const create = f.controls.create;
  f.controls.create = async () => ({
    ...(await create()),
    headers: {
      'set-cookie': 'do-not-retain',
      authorization: 'do-not-retain',
      date: 'Fri, 30 Oct 2026 12:00:00 GMT',
    },
  });
  await executeReplacement(f.pkg, f.approval(), f.ports);
  const text = readdirSync(join(root, 'journal'))
    .map((n) => readFileSync(join(root, 'journal', n), 'utf8'))
    .join('');
  expect(text).not.toMatch(
    /synthetic-not-a-credential|SUPABASE_|do-not-retain|set-cookie|authorization/i,
  );
  expect(text).toContain('Fri, 30 Oct');
});

it.each(['create', 'upload'])(
  'real child SIGKILL after %s send survives process restart without replay',
  async (phase) => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), 'propel-draft-process-')),
    );
    roots.push(root);
    const child = fork(
      new URL('./helpers/netlify-replacement-child.mts', import.meta.url),
      [root, phase],
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
    );
    let stderr = '';
    child.stderr?.on('data', (b) => {
      stderr += String(b);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error('Child not ready: ' + stderr)),
          15000,
        );
        child.once('message', () => {
          clearTimeout(timer);
          resolve();
        });
        child.once('exit', (c) => {
          if (c !== null) {
            clearTimeout(timer);
            reject(Error('Child exited: ' + stderr));
          }
        });
      });
      const ended = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGKILL');
      await ended;
      const f = replacementFixture(join(root, 'journal'));
      expect(f.ports.journal.inspect().state).toBe('UNKNOWN');
      expect(
        (await executeReplacement(f.pkg, f.approval(), f.ports)).code,
      ).toBe('EXISTING_ATTEMPT_NO_REPLAY');
      expect(f.calls).toHaveLength(0);
      const provider = JSON.parse(
        readFileSync(join(root, 'fake-provider.json'), 'utf8'),
      );
      expect(provider.creates).toBe(1);
      expect(provider.puts).toBe(phase === 'upload' ? 1 : 0);
    } finally {
      child.kill('SIGKILL');
    }
  },
);
