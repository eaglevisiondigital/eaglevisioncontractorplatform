import { afterEach, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readAtomicConsentLab,
  assertAtomicConsentCurrentNow,
  inspectAtomicConsentRequirements,
  assertAtomicConsentRequirementsNow,
  reconcileAtomicConsentRequirements,
  openAtomicConsentSource,
} from '../src/lib/workflows/atomic-consent-lab';
import {
  installSyntheticConsent,
  changeSyntheticConsent,
  evaluateAtomicBoundary,
  reconcileAtomicBoundary,
  type AtomicConsentCommand,
  type AtomicConsentAuthority,
  type SyntheticConsentFacts,
} from '../server/consent-lab/atomic-boundary';
const folders: string[] = [],
  children: ChildProcess[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  children.forEach((c) => {
    if (c.exitCode === null) c.kill('SIGKILL');
  });
  folders.splice(0).forEach((f) => rmSync(f, { recursive: true, force: true }));
});
const windowInput = () => ({
  window: {
    from: '2026-12-28',
    through: '2027-01-25',
    as_of: '2026-12-28T12:00:00.000Z',
    channel: 'email' as const,
  },
  lead_days: 14,
  overdue_days: 7,
  query: '',
  kind: 'all' as const,
  readiness: 'all' as const,
  job_id: '',
  customer_id: '',
  location_id: '',
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    input = windowInput(),
    desk = await readAtomicConsentLab(sources, input, gate),
    candidate = desk.candidates[0],
    proposal = {
      candidate_key: candidate.key,
      proposed_on: candidate.selection.due_on,
      purpose: 'service_follow_up' as const,
      plan_kind: 'follow_up' as const,
    },
    review = await inspectAtomicConsentRequirements(desk, proposal, gate);
  const e = review.envelope;
  const facts: SyntheticConsentFacts = {
    mode: 'TRUSTED_SYNTHETIC_FIXTURE',
    schema_revision: 1,
    organization_id: e.organization_id,
    actor_id: e.actor_id,
    customer_id: e.customer_id,
    property_id: e.property_id,
    job_id: e.job_id,
    source_sha256: e.source_sha256,
    source_revision: e.source_revision,
    purpose: e.purpose,
    channel: e.channel,
    recipient_reference: 'synthetic-recipient:' + e.customer_id,
    sender_reference: 'synthetic-sender:' + e.organization_id,
    purpose_allowed: true,
    recipient_verified: true,
    enrollment_active: true,
    suppressed: false,
    sender_authorized: true,
    principal_active: true,
    source_revoked: false,
    observed_at: input.window.as_of,
    valid_from: '2026-12-28T11:59:00.000Z',
    expires_at: '2026-12-28T12:01:00.000Z',
  };
  const command: AtomicConsentCommand = {
      command_id: 'lab-consent-first',
      expected_revision: 0,
      envelope: e,
      sha256: review.integrity.sha256,
      expected_at: input.window.as_of,
      max_age_ms: 60_000,
    },
    authority: AtomicConsentAuthority = {
      enabled: true,
      test_only: true,
      checkSource: () => {
        assertAtomicConsentRequirementsNow(review);
        return review.integrity.sha256;
      },
      clock: () => input.window.as_of,
    };
  const folder = mkdtempSync(join(tmpdir(), 'propel-consent-lab-'));
  folders.push(folder);
  const path = join(folder, 'authority.sqlite');
  return {
    sources,
    gate,
    input,
    desk,
    proposal,
    review,
    facts,
    command,
    authority,
    folder,
    path,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function install(f: Fixture) {
  installSyntheticConsent(f.path, f.review.envelope, f.facts, f.authority);
}
function worker(
  f: Fixture,
  mode: string,
  facts = f.facts,
  expectedRevision = 0,
) {
  const suffix = mode + children.length,
    cmd = join(f.folder, suffix + '.json'),
    witness = join(f.folder, suffix + '-source.json'),
    release = join(f.folder, suffix + '-release');
  writeFileSync(
    cmd,
    JSON.stringify({
      command: f.command,
      facts,
      expected_revision: expectedRevision,
    }),
  );
  writeFileSync(witness, JSON.stringify({ envelope: f.review.envelope }));
  const child = fork(
    new URL('./helpers/cycle11-consent-worker.ts', import.meta.url),
    [f.path, cmd, witness, mode, release],
    {
      execArgv: ['--experimental-strip-types'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  children.push(child);
  const inbox: unknown[] = [];
  let stderr = '';
  child.on('message', (m) => inbox.push(m));
  child.stderr?.on('data', (d) => (stderr += String(d)));
  const event = (name: string) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const find = () =>
        inbox.find((x) => (x as { event: string }).event === name) as
          Record<string, unknown> | undefined;
      const found = find();
      if (found) {
        resolve(found);
        return;
      }
      const timer = setTimeout(() => {
        cleanup();
        reject(Error('Worker timeout ' + name + ' ' + stderr));
      }, 10_000);
      const listener = () => {
        const x = find();
        if (x) {
          cleanup();
          resolve(x);
        }
      };
      const exit = () => {
        if (!find()) {
          cleanup();
          reject(Error('Worker exited ' + stderr));
        }
      };
      function cleanup() {
        clearTimeout(timer);
        child.off('message', listener);
        child.off('exit', exit);
      }
      child.on('message', listener);
      child.on('exit', exit);
    });
  return { child, event, release, witness };
}
it.each([0, 1, 2])(
  'brand %s keeps actual customer authority BLOCKED while isolated positive fixture is explicitly non-operational',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      network = vi.spyOn(globalThis, 'fetch'),
      writers = [
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.sources.property, 'saveMaintenance'),
        vi.spyOn(f.sources.property, 'addVisit'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
      ];
    expect(f.review.envelope.operational_authority).toBe('BLOCKED');
    expect(f.review.observed).toMatchObject({
      current_channel: 'UNKNOWN',
      purpose: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      enrollment: 'UNVERIFIED',
    });
    expect(f.review.authority.send).toBe(false);
    expect(f.review.missing_gates).toContain('ATOMIC_CONSENT_AT_SEND');
    install(f);
    const r = evaluateAtomicBoundary(f.path, f.command, f.authority);
    expect(r.receipt).toMatchObject({
      boundary: 'WOULD_MEET_SYNTHETIC_REQUIREMENTS',
      fixture_only: true,
      send: false,
      provider: false,
      outbox: false,
      global_source_auth_atomicity: 'UNVERIFIED',
    });
    expect(r.receipt?.denials).toEqual([]);
    expect(network).not.toHaveBeenCalled();
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(JSON.stringify(f.review)).not.toMatch(
      /@example.invalid|555010|unit_cost|supplier|private_notes|payroll|recorded_by/,
    );
    expect((await reconcileAtomicConsentRequirements(f.review)).status).toBe(
      'EXACT_BLOCKED_REQUIREMENTS',
    );
    const target = await openAtomicConsentSource(
      f.desk,
      f.proposal.candidate_key,
    );
    expect(target).toMatchObject({
      organization_id: f.review.envelope.organization_id,
      customer_id: f.review.envelope.customer_id,
      location_id: f.review.envelope.property_id,
      job_id: f.review.envelope.job_id,
      issued_version_id: f.review.envelope.issued_version_id,
    });
  },
);
it.each([
  ['purpose_allowed', 'PURPOSE'],
  ['recipient_verified', 'RECIPIENT'],
  ['enrollment_active', 'ENROLLMENT'],
  ['suppressed', 'SUPPRESSION'],
  ['sender_authorized', 'SENDER'],
  ['principal_active', 'PRINCIPAL'],
  ['source_revoked', 'SOURCE_REVOKED'],
] as const)('atomic boundary denies %s withdrawal', async (key, denial) => {
  const f = await fixture();
  f.facts[key] = key === 'suppressed' || key === 'source_revoked';
  install(f);
  const r = evaluateAtomicBoundary(f.path, f.command, f.authority);
  expect(r.receipt?.boundary).toBe('DENIED');
  expect(r.receipt?.denials).toContain(denial);
  expect(r.send).toBe(false);
});
it.each([
  'purpose_allowed',
  'recipient_verified',
  'enrollment_active',
  'suppressed',
  'sender_authorized',
  'principal_active',
  'source_revoked',
] as const)('unknown %s is never allowed', async (key) => {
  const f = await fixture();
  f.facts[key] = null;
  install(f);
  expect(
    evaluateAtomicBoundary(f.path, f.command, f.authority).receipt?.boundary,
  ).toBe('DENIED');
});
it.each(['expires_at', 'observed_at', 'valid_from'] as const)(
  'invalid authority time %s denies inside transaction',
  async (key) => {
    const f = await fixture();
    f.facts[key] =
      key === 'expires_at'
        ? '2026-12-28T12:00:00.000Z'
        : '2026-12-28T12:00:30.000Z';
    install(f);
    expect(
      evaluateAtomicBoundary(f.path, f.command, f.authority).receipt?.denials,
    ).toContain('AUTHORITY_TIME');
  },
);
it.each(['backwards', 'too-old', 'change-at-commit'] as const)(
  'clock %s fails closed',
  async (kind) => {
    const f = await fixture();
    install(f);
    if (kind === 'backwards')
      f.authority.clock = () => '2026-12-28T11:59:59.000Z';
    if (kind === 'too-old')
      f.authority.clock = () => '2026-12-28T12:02:00.000Z';
    if (kind === 'change-at-commit') {
      let calls = 0;
      f.authority.clock = () =>
        ++calls === 1 ? f.command.expected_at : '2026-12-28T12:00:01.000Z';
    }
    const r = evaluateAtomicBoundary(f.path, f.command, f.authority);
    if (kind === 'change-at-commit') expect(r.status).toBe('UNKNOWN');
    else expect(r.receipt?.denials).toContain('CLOCK_OR_COMMAND_AGE');
  },
);
it.each([
  'organization_id',
  'actor_id',
  'customer_id',
  'property_id',
  'job_id',
  'purpose',
  'channel',
  'recipient_reference',
  'sender_reference',
  'source_revision',
  'source_sha256',
] as const)('fixture %s mismatch cannot be installed', async (key) => {
  const f = await fixture();
  Object.assign(f.facts, {
    [key]:
      key === 'source_revision'
        ? 999
        : key === 'channel'
          ? 'sms'
          : key === 'purpose'
            ? 'marketing'
            : key === 'source_sha256'
              ? 'a'.repeat(64)
              : 'foreign',
  });
  expect(() => install(f)).toThrow();
});
it('schema downgrade never establishes fixture authority', async () => {
  const f = await fixture();
  Object.assign(f.facts, { schema_revision: 0 });
  expect(() => install(f)).toThrow('schema');
});
it('participating withdrawal before boundary causes stale CAS and suppression denial', async () => {
  const f = await fixture();
  install(f);
  const changed = changeSyntheticConsent(
    f.path,
    f.review.envelope,
    0,
    { ...f.facts, suppressed: true },
    f.authority,
  );
  const r = evaluateAtomicBoundary(f.path, f.command, f.authority);
  expect(r.receipt?.boundary).toBe('DENIED');
  expect(r.receipt?.denials).toEqual(
    expect.arrayContaining(['STALE_REVISION', 'SUPPRESSION']),
  );
  expect(r.receipt!.linearization_sequence).toBeGreaterThan(
    changed.linearization_sequence,
  );
});
it('two real processes serialize suppression change against authority capture', async () => {
  const f = await fixture();
  install(f);
  const a = worker(f, 'normal'),
    b = worker(f, 'withdraw', { ...f.facts, suppressed: true });
  await Promise.all([a.event('READY'), b.event('READY')]);
  a.child.send('GO');
  b.child.send('GO');
  const [x, y] = await Promise.all([a.event('RESULT'), b.event('RESULT')]);
  const r = (x.result as ReturnType<typeof evaluateAtomicBoundary>).receipt!,
    change = y.result as { linearization_sequence: number };
  expect(r.send).toBe(false);
  if (r.linearization_sequence < change.linearization_sequence)
    expect(r.boundary).toBe('WOULD_MEET_SYNTHETIC_REQUIREMENTS');
  else {
    expect(r.boundary).toBe('DENIED');
    expect(r.denials).toContain('SUPPRESSION');
  }
}, 20_000);
it('withdrawal during held boundary linearizes after capture and old receipt becomes stale', async () => {
  const f = await fixture();
  install(f);
  const a = worker(f, 'hold-boundary');
  await a.event('READY');
  a.child.send('GO');
  await a.event('AT_BOUNDARY');
  const b = worker(f, 'withdraw', { ...f.facts, purpose_allowed: false });
  await b.event('READY');
  b.child.send('GO');
  await b.event('SOURCE_CHECKED');
  await new Promise((resolve) => setTimeout(resolve, 150));
  writeFileSync(a.release, 'release');
  const [x, y] = await Promise.all([a.event('RESULT'), b.event('RESULT')]);
  const r = (x.result as ReturnType<typeof evaluateAtomicBoundary>).receipt!,
    change = y.result as { linearization_sequence: number };
  expect(r.boundary).toBe('WOULD_MEET_SYNTHETIC_REQUIREMENTS');
  expect(r.linearization_sequence).toBeLessThan(change.linearization_sequence);
  expect(reconcileAtomicBoundary(f.path, f.command, f.authority)).toMatchObject(
    {
      status: 'EXACT_RECEIPT',
      currentness: 'STALE_FIXTURE_REVISION',
      send: false,
    },
  );
}, 20_000);
it.each(['interrupt-claim', 'interrupt-commit'])(
  'SIGKILL %s retains exact read-only recovery and no new identity',
  async (mode) => {
    const f = await fixture();
    install(f);
    const w = worker(f, mode);
    await w.event('READY');
    w.child.send('GO');
    await w.event(
      mode === 'interrupt-claim' ? 'CLAIM_COMMITTED' : 'RECEIPT_COMMITTED',
    );
    w.child.kill('SIGKILL');
    await new Promise<void>((resolve) => w.child.once('exit', () => resolve()));
    const r = reconcileAtomicBoundary(f.path, f.command, f.authority);
    expect(r.status).toBe(
      mode === 'interrupt-claim' ? 'UNKNOWN' : 'EXACT_RECEIPT',
    );
    expect(evaluateAtomicBoundary(f.path, f.command, f.authority)).toEqual(r);
    expect(
      evaluateAtomicBoundary(
        f.path,
        { ...f.command, command_id: 'lab-no-replay' },
        f.authority,
      ).status,
    ).toBe('UNKNOWN');
  },
  20_000,
);
it.each(['afterClaim', 'afterCommit'] as const)(
  'lost %s acknowledgment retains one durable attempt',
  async (hook) => {
    const f = await fixture();
    install(f);
    f.authority[hook] = () => {
      throw Error('lost acknowledgment');
    };
    expect(evaluateAtomicBoundary(f.path, f.command, f.authority).status).toBe(
      'UNKNOWN',
    );
    delete f.authority[hook];
    const r = reconcileAtomicBoundary(f.path, f.command, f.authority);
    expect(r.status).toBe(hook === 'afterCommit' ? 'EXACT_RECEIPT' : 'UNKNOWN');
    expect(evaluateAtomicBoundary(f.path, f.command, f.authority)).toEqual(r);
  },
);
it('actual SQLite receipt refusal rolls back boundary while durable claim remains held', async () => {
  const f = await fixture();
  install(f);
  const db = new DatabaseSync(f.path);
  db.exec(
    "CREATE TRIGGER deny_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(FAIL,'synthetic journal refusal');END;",
  );
  db.close();
  expect(evaluateAtomicBoundary(f.path, f.command, f.authority).status).toBe(
    'UNKNOWN',
  );
  const check = new DatabaseSync(f.path);
  expect(check.prepare('SELECT COUNT(*) AS n FROM claims').get()?.n).toBe(1);
  expect(check.prepare('SELECT COUNT(*) AS n FROM receipts').get()?.n).toBe(0);
  check.exec('DROP TRIGGER deny_receipt');
  check.close();
  expect(
    evaluateAtomicBoundary(
      f.path,
      { ...f.command, command_id: 'lab-replacement' },
      f.authority,
    ).status,
  ).toBe('UNKNOWN');
});
it('UNKNOWN cannot be bypassed by changed purpose or channel', async () => {
  const f = await fixture();
  install(f);
  f.authority.afterClaim = () => {
    throw Error('loss');
  };
  evaluateAtomicBoundary(f.path, f.command, f.authority);
  delete f.authority.afterClaim;
  const e = {
      ...f.review.envelope,
      purpose: 'marketing' as const,
      channel: 'sms' as const,
    },
    sha = createHash('sha256').update(JSON.stringify(e)).digest('hex');
  expect(
    evaluateAtomicBoundary(
      f.path,
      {
        ...f.command,
        command_id: 'lab-other-purpose',
        envelope: e,
        sha256: sha,
      },
      { ...f.authority, checkSource: () => sha },
    ).status,
  ).toBe('UNKNOWN');
});
it('duplicate boundary reads exact receipt without repeating linearization event', async () => {
  const f = await fixture();
  install(f);
  const a = evaluateAtomicBoundary(f.path, f.command, f.authority),
    b = evaluateAtomicBoundary(f.path, f.command, f.authority);
  expect(b).toEqual(a);
  const db = new DatabaseSync(f.path);
  expect(
    db
      .prepare("SELECT COUNT(*) AS n FROM events WHERE kind='BOUNDARY_CHECKED'")
      .get()?.n,
  ).toBe(1);
  db.close();
});
it('foreign/copy/stale source cannot become atomic authority', async () => {
  const f = await fixture(),
    g = await fixture(1);
  expect(
    (await reconcileAtomicConsentRequirements(structuredClone(f.review)))
      .status,
  ).toBe('UNKNOWN');
  expect(() =>
    evaluateAtomicBoundary(
      f.path,
      {
        ...f.command,
        envelope: g.review.envelope,
        sha256: g.review.integrity.sha256,
      },
      f.authority,
    ),
  ).toThrow();
  const before = JSON.stringify(f.review);
  f.sources.entries = [...f.sources.entries];
  expect(() => assertAtomicConsentCurrentNow(f.desk)).toThrow();
  expect(() => assertAtomicConsentRequirementsNow(f.review)).toThrow();
  expect((await reconcileAtomicConsentRequirements(f.review)).status).toBe(
    'UNKNOWN',
  );
  expect(JSON.stringify(f.review)).toBe(before);
});
it.each(['gate', 'proposal', 'source-container', 'model'] as const)(
  'final requirements hash rechecks original live %s',
  async (kind) => {
    const gate = { enabled: true, confirmed: true },
      sources = await prepareOperatingSources(sampleCompanies[0], gate),
      desk = await readAtomicConsentLab(sources, windowInput(), gate),
      c = desk.candidates[0],
      input = {
        candidate_key: c.key,
        proposed_on: c.selection.due_on,
        purpose: 'service_follow_up' as const,
        plan_kind: 'follow_up' as const,
      },
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const r = await digest(...args);
      if (
        !changed &&
        new TextDecoder()
          .decode(args[1] as ArrayBuffer)
          .includes('LOCAL_ATOMIC_CONSENT_REQUIREMENTS_SOURCE')
      ) {
        changed = true;
        if (kind === 'gate') gate.confirmed = false;
        if (kind === 'proposal') input.proposed_on = '2027-01-16';
        if (kind === 'source-container') sources.entries = [...sources.entries];
        if (kind === 'model')
          sources.entries[0].customerModel = sources.entries[1].customerModel;
      }
      return r;
    });
    await expect(
      inspectAtomicConsentRequirements(desk, input, gate),
    ).rejects.toThrow();
    expect(changed).toBe(true);
  },
);
it('revoked actual synthetic staff withdraws retained browser requirements', async () => {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[0], gate),
    actor = sources.company.id + '-estimator';
  await sources.operations.manageMember(
    sources.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  sources.entries.forEach((e) => (e.target.actor_id = actor));
  const desk = await readAtomicConsentLab(sources, windowInput(), gate);
  await sources.operations.manageMember(
    sources.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  expect(() => assertAtomicConsentCurrentNow(desk)).toThrow();
});
it('OFF and malformed accessors are rejected before caller code runs', async () => {
  const hook = vi.fn();
  expect(() =>
    evaluateAtomicBoundary('unused', Object.create(null), {
      checkSource: hook,
      clock: hook,
    }),
  ).toThrow('OFF');
  expect(hook).not.toHaveBeenCalled();
  const f = await fixture();
  Object.defineProperty(f.facts, 'purpose_allowed', { get: hook });
  expect(() => install(f)).toThrow();
  expect(hook).not.toHaveBeenCalled();
});
it('private arbitrary files and symlinks are preserved without opening as authority DB', async () => {
  const f = await fixture();
  writeFileSync(f.path, 'private original', { mode: 0o600 });
  expect(() => install(f)).toThrow();
  expect(readFileSync(f.path, 'utf8')).toBe('private original');
  rmSync(f.path);
  const original = join(f.folder, 'original');
  writeFileSync(original, 'unchanged');
  symlinkSync(original, f.path);
  expect(() => install(f)).toThrow();
  expect(readFileSync(original, 'utf8')).toBe('unchanged');
});
it('missing or corrupted receipt is UNKNOWN, never delivery failure or replay', async () => {
  const f = await fixture();
  expect(reconcileAtomicBoundary(f.path, f.command, f.authority).status).toBe(
    'UNKNOWN',
  );
  install(f);
  evaluateAtomicBoundary(f.path, f.command, f.authority);
  const db = new DatabaseSync(f.path);
  db.prepare('UPDATE receipts SET body=?').run('{}');
  db.close();
  expect(reconcileAtomicBoundary(f.path, f.command, f.authority).status).toBe(
    'UNKNOWN',
  );
  expect(evaluateAtomicBoundary(f.path, f.command, f.authority).status).toBe(
    'UNKNOWN',
  );
});
it('app import graph contains no server writer, send, outbox or provider connection', () => {
  const files = [
    'src/lib/workflows/atomic-consent-lab.ts',
    'src/components/workflows/AtomicConsentLab.tsx',
  ];
  for (const file of files)
    expect(
      readFileSync(new URL('../' + file, import.meta.url), 'utf8'),
    ).not.toMatch(
      /node:sqlite|consent-lab\/atomic-boundary|fetch\(|localStorage|indexedDB/,
    );
  const server = readFileSync(
    new URL('../server/consent-lab/atomic-boundary.ts', import.meta.url),
    'utf8',
  );
  expect(server).not.toMatch(
    /fetch\(|https?:\/\/|sendMail|sendMessage|dispatch\(/,
  );
});

it.each(['source', 'confirmation', 'command', 'principal-witness'] as const)(
  'at-boundary %s withdrawal rolls back to permanent UNKNOWN',
  async (kind) => {
    const f = await fixture();
    install(f);
    f.authority.atBoundary = () => {
      if (kind === 'source') f.sources.entries = [...f.sources.entries];
      if (kind === 'confirmation') f.gate.confirmed = false;
      if (kind === 'command') f.command.max_age_ms = 500;
      if (kind === 'principal-witness')
        f.authority.checkSource = () => 'f'.repeat(64);
    };
    expect(evaluateAtomicBoundary(f.path, f.command, f.authority).status).toBe(
      'UNKNOWN',
    );
    delete f.authority.atBoundary;
    const check = new DatabaseSync(f.path);
    expect(check.prepare('SELECT COUNT(*) AS n FROM claims').get()?.n).toBe(1);
    expect(check.prepare('SELECT COUNT(*) AS n FROM receipts').get()?.n).toBe(
      0,
    );
    check.close();
  },
);
it('concurrent staff commands cannot create a second hypothetical boundary receipt', async () => {
  const f = await fixture();
  install(f);
  const a = worker(f, 'normal'),
    b = worker(
      { ...f, command: { ...f.command, command_id: 'lab-competing' } },
      'normal',
    );
  await Promise.all([a.event('READY'), b.event('READY')]);
  a.child.send('GO');
  b.child.send('GO');
  const values = await Promise.all([a.event('RESULT'), b.event('RESULT')]);
  expect(
    values
      .map(
        (v) => (v.result as ReturnType<typeof evaluateAtomicBoundary>).status,
      )
      .sort(),
  ).toEqual(['EXACT_RECEIPT', 'UNKNOWN']);
  const db = new DatabaseSync(f.path);
  expect(db.prepare('SELECT COUNT(*) AS n FROM receipts').get()?.n).toBe(1);
  db.close();
}, 20_000);
