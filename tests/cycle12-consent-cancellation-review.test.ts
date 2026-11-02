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
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readAtomicConsentLab,
  inspectAtomicConsentRequirements,
} from '../src/lib/workflows/atomic-consent-lab';
import {
  readConsentCancellationSources,
  prepareConsentCancellationReview,
  assertConsentCancellationReviewNow,
  consentCancellationStateNow,
  reconcileConsentCancellationReview,
  cancelConsentCancellationReview,
  openConsentCancellationSource,
} from '../src/lib/workflows/consent-cancellation-review';
import { ConsentCancellationReview } from '../src/components/workflows/ConsentCancellationReview';
import {
  changeSyntheticConsent,
  evaluateAtomicBoundary,
  reconcileAtomicBoundary,
  type AtomicConsentCommand,
  type SyntheticConsentFacts,
} from '../server/consent-lab/atomic-boundary';
import {
  installConsentCancellationFixture,
  executeConsentCancellation,
  reconcileConsentCancellation,
  type CancellationLabCommand,
  type CancellationLabAuthority,
} from '../server/consent-lab/cancellation-review';
const folders: string[] = [],
  children: ChildProcess[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  children.splice(0).forEach((c) => {
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
async function context(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    window = windowInput(),
    desk = await readConsentCancellationSources(sources, window, gate),
    candidate = desk.candidates[0];
  const input = {
    proposal: {
      candidate_key: candidate.key,
      proposed_on: candidate.selection.due_on,
      purpose: 'service_follow_up' as const,
      plan_kind: 'follow_up' as const,
    },
    expires_at: Date.now() + 30 * 60_000,
  };
  return { gate, sources, window, desk, input };
}
async function fixture(brand = 0) {
  const c = await context(brand),
    view = await prepareConsentCancellationReview(c.desk, c.input, c.gate),
    e = view.envelope,
    clock = { now: c.window.window.as_of };
  const original: AtomicConsentCommand = {
    command_id: 'lab-original',
    expected_revision: 0,
    envelope: e,
    sha256: view.original_requirements_sha256,
    expected_at: clock.now,
    max_age_ms: 60_000,
  };
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
    observed_at: clock.now,
    valid_from: '2026-12-28T11:59:00.000Z',
    expires_at: '2026-12-28T12:01:00.000Z',
  };
  const command: CancellationLabCommand = {
    command_id: 'lab-c12-check',
    original,
    operation: 'CHECK',
    expected_fixture_revision: 0,
    recipient_reference: facts.recipient_reference,
    sender_reference: facts.sender_reference,
    expected_at: clock.now,
    max_age_ms: 60_000,
    original_receipt_id: null,
  };
  const authority: CancellationLabAuthority = {
    enabled: true,
    test_only: true,
    clock: () => clock.now,
    checkSource(envelope) {
      assertConsentCancellationReviewNow(view);
      if (JSON.stringify(envelope) !== JSON.stringify(e))
        throw Error('Exact retained witness required');
      return view.original_requirements_sha256;
    },
  };
  const folder = mkdtempSync(join(tmpdir(), 'propel-consent-lab-'));
  folders.push(folder);
  const legacyPath = join(folder, 'authority.sqlite'),
    path = join(folder, 'cancellation.sqlite');
  installConsentCancellationFixture(
    legacyPath,
    path,
    command,
    facts,
    authority,
  );
  return {
    ...c,
    view,
    original,
    clock,
    facts,
    command,
    authority,
    folder,
    legacyPath,
    path,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function run(f: Fixture, command = f.command, authority = f.authority) {
  return executeConsentCancellation(f.legacyPath, f.path, command, authority);
}
function read(f: Fixture, command = f.command) {
  return reconcileConsentCancellation(
    f.legacyPath,
    f.path,
    command,
    f.authority,
  );
}
function withdrawal(
  f: Fixture,
  operation: 'CANCEL' | 'REVOKE' | 'SUPPRESS',
  token: string | null = null,
) {
  return {
    ...f.command,
    command_id: 'lab-' + operation.toLowerCase(),
    operation,
    original_receipt_id: token,
  };
}
function counts(f: Fixture) {
  const db = new DatabaseSync(f.path, { readOnly: true });
  try {
    return {
      claims: db.prepare('SELECT count(*) AS n FROM claims').get()?.n,
      receipts: db.prepare('SELECT count(*) AS n FROM receipts').get()?.n,
    };
  } finally {
    db.close();
  }
}
function worker(f: Fixture, command = f.command, mode = 'normal') {
  const suffix = command.command_id + '-' + children.length,
    input = join(f.folder, suffix + '.json'),
    witness = join(f.folder, suffix + '-witness.json'),
    release = join(f.folder, suffix + '-release');
  writeFileSync(input, JSON.stringify({ command, facts: f.facts }));
  writeFileSync(
    witness,
    JSON.stringify({ envelope: f.view.envelope, now: f.clock.now }),
  );
  const child = fork(
    new URL('./helpers/cycle12-consent-worker.ts', import.meta.url),
    [f.legacyPath, f.path, input, witness, mode, release],
    {
      execArgv: ['--experimental-strip-types'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  children.push(child);
  const inbox: Record<string, unknown>[] = [];
  let stderr = '';
  child.on('message', (m) => inbox.push(m as Record<string, unknown>));
  child.stderr?.on('data', (d) => (stderr += String(d)));
  const event = (name: string) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const find = () => inbox.find((m) => m.event === name),
        found = find();
      if (found) {
        resolve(found);
        return;
      }
      const timer = setTimeout(() => {
          cleanup();
          reject(Error('Worker timeout ' + name + ' ' + stderr));
        }, 10_000),
        listener = () => {
          const v = find();
          if (v) {
            cleanup();
            resolve(v);
          }
        },
        exit = () => {
          if (!find()) {
            cleanup();
            reject(Error('Worker exit ' + stderr));
          }
        },
        cleanup = () => {
          clearTimeout(timer);
          child.off('message', listener);
          child.off('exit', exit);
        };
      child.on('message', listener);
      child.on('exit', exit);
    });
  return { child, event, witness, release };
}
it.each([0, 1, 2])(
  'brand %s retains actual blocked sources, privacy and no canonical/provider effects',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      network = vi.spyOn(globalThis, 'fetch'),
      writers = [
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.sources.property, 'saveMaintenance'),
        vi.spyOn(f.sources.property, 'addVisit'),
      ];
    const result = run(f);
    expect(result.receipt?.original_receipt?.boundary).toBe(
      'WOULD_MEET_SYNTHETIC_REQUIREMENTS',
    );
    expect(result.receipt).toMatchObject({
      fixture_only: true,
      send: false,
      provider: false,
      outbox: false,
      source_auth_atomicity: 'UNVERIFIED',
    });
    expect(read(f)).toEqual(result);
    expect(run(f)).toEqual(result);
    expect(network).not.toHaveBeenCalled();
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(f.view.operational_authority).toBe('BLOCKED');
    expect(f.view.observed).toMatchObject({
      current_channel: 'UNKNOWN',
      purpose: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      enrollment: 'UNVERIFIED',
    });
    expect(JSON.stringify(f.view)).not.toMatch(
      /TRUSTED_SYNTHETIC_FIXTURE|recipient_reference|sender_reference|@example.invalid|unit_cost|payroll|supplier|private_notes/,
    );
    const detail = await openConsentCancellationSource(f.view);
    expect(detail).toMatchObject({
      organization_id: f.original.envelope.organization_id,
      job_id: f.original.envelope.job_id,
      issued_version_id: f.original.envelope.issued_version_id,
    });
  },
);
it.each(['CANCEL', 'REVOKE', 'SUPPRESS'] as const)(
  '%s before a claim denies the actual native boundary and retains both receipts',
  async (operation) => {
    const f = await fixture(),
      command = withdrawal(f, operation),
      cancelled = run(f, command),
      checked = run(f);
    expect(cancelled.receipt?.cancellation).toBe(
      operation === 'CANCEL'
        ? 'CANCELLED'
        : operation === 'REVOKE'
          ? 'REVOKED'
          : 'SUPPRESSED',
    );
    expect(checked.receipt?.original_receipt?.boundary).toBe('DENIED');
    expect(checked.current_cancellation).toBe(cancelled.receipt?.cancellation);
    expect(
      checked.receipt!.original_receipt!.linearization_sequence,
    ).toBeGreaterThan(cancelled.receipt!.linearization_sequence);
    expect(read(f, command).receipt).toEqual(cancelled.receipt);
  },
);
it.each(['CANCEL', 'REVOKE', 'SUPPRESS'] as const)(
  '%s after receipt preserves immutable original evidence and forbids reenable/rebind/new ID',
  async (operation) => {
    const f = await fixture(),
      original = run(f),
      command = withdrawal(f, operation, original.receipt!.receipt_id),
      cancelled = run(f, command),
      current = read(f);
    expect(current.receipt).toEqual(original.receipt);
    expect(current.original_receipt).toEqual(original.original_receipt);
    expect(current.current_cancellation).toBe(cancelled.receipt!.cancellation);
    expect(cancelled.receipt!.linearization_sequence).toBeGreaterThan(
      original.receipt!.linearization_sequence,
    );
    expect(
      run(f, { ...f.command, command_id: 'lab-new-sender-attempt' }).status,
    ).toBe('UNKNOWN');
    expect(
      run(f, {
        ...command,
        command_id: 'lab-revoke-replacement',
        operation: 'REVOKE',
      }).status,
    ).toBe('UNKNOWN');
    expect(counts(f)).toEqual({ claims: 2, receipts: 2 });
  },
);
it('two real competing hypothetical senders share the same native C11 and C12 logical holds', async () => {
  const f = await fixture(),
    a = worker(f),
    b = worker(f, { ...f.command, command_id: 'lab-competitor' });
  await Promise.all([a.event('READY'), b.event('READY')]);
  a.child.send('GO');
  b.child.send('GO');
  const values = await Promise.all([a.event('RESULT'), b.event('RESULT')]);
  expect(
    values.map((v) => (v.result as ReturnType<typeof run>).status).sort(),
  ).toEqual(['EXACT_RECEIPT', 'UNKNOWN']);
  expect(counts(f)).toEqual({ claims: 1, receipts: 1 });
  const db = new DatabaseSync(f.legacyPath, { readOnly: true });
  expect(db.prepare('SELECT count(*) AS n FROM claims').get()?.n).toBe(1);
  expect(db.prepare('SELECT count(*) AS n FROM receipts').get()?.n).toBe(1);
  db.close();
}, 20_000);
it.each(['interrupt-claim', 'interrupt-native', 'interrupt-commit'])(
  'actual SIGKILL %s retains permanent native/custody holds and exact read-only outcomes',
  async (mode) => {
    const f = await fixture(),
      w = worker(f, f.command, mode);
    await w.event('READY');
    w.child.send('GO');
    await w.event(
      mode === 'interrupt-claim'
        ? 'CLAIM_COMMITTED'
        : mode === 'interrupt-native'
          ? 'NATIVE_COMMITTED'
          : 'RECEIPT_COMMITTED',
    );
    w.child.kill('SIGKILL');
    await new Promise<void>((resolve) => w.child.once('exit', () => resolve()));
    const result = read(f);
    expect(result.status).toBe(
      mode === 'interrupt-commit' ? 'EXACT_RECEIPT' : 'UNKNOWN',
    );
    expect(run(f)).toEqual(result);
    expect(
      run(f, {
        ...f.command,
        command_id: 'lab-no-resume',
        expected_at: '2026-12-28T12:00:01.000Z',
      }).status,
    ).toBe('UNKNOWN');
    const old = evaluateAtomicBoundary(
      f.legacyPath,
      { ...f.original, command_id: 'lab-old-api-bypass' },
      f.authority,
    );
    expect(old.status).toBe('UNKNOWN');
  },
  20_000,
);
it('original C11 UNKNOWN is preserved across C12 and new source/sender attempts', async () => {
  const f = await fixture();
  evaluateAtomicBoundary(f.legacyPath, f.original, {
    ...f.authority,
    afterClaim: () => {
      throw Error('old loss');
    },
  });
  expect(run(f).status).toBe('UNKNOWN');
  expect(run(f, { ...f.command, command_id: 'lab-replacement' }).status).toBe(
    'UNKNOWN',
  );
  expect(counts(f)).toEqual({ claims: 0, receipts: 0 });
  expect(
    reconcileAtomicBoundary(f.legacyPath, f.original, f.authority).status,
  ).toBe('UNKNOWN');
});
it('lost ACK requires exact unpredictable receipt reconciliation before later withdrawal', async () => {
  const f = await fixture();
  f.authority.afterCommit = () => {
    throw Error('lost ACK');
  };
  expect(run(f).status).toBe('UNKNOWN');
  delete f.authority.afterCommit;
  expect(run(f, withdrawal(f, 'CANCEL')).status).toBe('UNKNOWN');
  const exact = read(f);
  expect(exact.receipt?.receipt_id).toMatch(/^[a-f0-9-]{36}$/);
  expect(
    run(f, withdrawal(f, 'CANCEL', exact.receipt!.receipt_id))
      .current_cancellation,
  ).toBe('CANCELLED');
});
it('real suppression committed during native lock wait is observed by the actual C11 check', async () => {
  const f = await fixture(),
    check = worker(f),
    suppress = worker(f, withdrawal(f, 'SUPPRESS')),
    lock = new DatabaseSync(f.legacyPath);
  lock.exec('BEGIN IMMEDIATE');
  await Promise.all([check.event('READY'), suppress.event('READY')]);
  suppress.child.send('GO');
  await suppress.event('SOURCE_CHECKED');
  lock.exec('COMMIT');
  lock.close();
  const suppressed = (await suppress.event('RESULT')).result as ReturnType<
    typeof run
  >;
  expect(suppressed.current_cancellation).toBe('SUPPRESSED');
  check.child.send('GO');
  const checked = (await check.event('RESULT')).result as ReturnType<
    typeof run
  >;
  expect(checked.receipt?.original_receipt?.denials).toContain('SUPPRESSION');
  expect(checked.receipt?.original_receipt?.boundary).toBe('DENIED');
}, 20_000);
it('native withdrawal racing a held boundary serializes after the immutable original receipt', async () => {
  const f = await fixture(),
    check = worker(f, f.command, 'hold-boundary'),
    suppress = worker(f, withdrawal(f, 'SUPPRESS'), 'old-suppress');
  await Promise.all([check.event('READY'), suppress.event('READY')]);
  check.child.send('GO');
  await check.event('AT_BOUNDARY');
  suppress.child.send('GO');
  await suppress.event('SOURCE_CHECKED');
  writeFileSync(check.release, 'release');
  const checked = (await check.event('RESULT')).result as ReturnType<
      typeof run
    >,
    changed = (await suppress.event('RESULT')).result as {
      linearization_sequence: number;
    };
  expect(checked.receipt?.original_receipt?.boundary).toBe(
    'WOULD_MEET_SYNTHETIC_REQUIREMENTS',
  );
  expect(changed.linearization_sequence).toBeGreaterThan(
    checked.receipt!.linearization_sequence,
  );
  expect(read(f).receipt).toEqual(checked.receipt);
  expect(read(f).current_cancellation).toBe('C11_WITHDRAWN_FIXTURE');
}, 20_000);
it('actual C12 cancellation racing a held native boundary retains original and current cancellation evidence', async () => {
  const f = await fixture(),
    check = worker(f, f.command, 'hold-boundary'),
    cancel = worker(f, withdrawal(f, 'CANCEL'));
  await Promise.all([check.event('READY'), cancel.event('READY')]);
  check.child.send('GO');
  await check.event('AT_BOUNDARY');
  cancel.child.send('GO');
  await cancel.event('SOURCE_CHECKED');
  writeFileSync(check.release, 'release');
  const checked = (await check.event('RESULT')).result as ReturnType<
      typeof run
    >,
    cancelled = (await cancel.event('RESULT')).result as ReturnType<typeof run>;
  expect(checked.receipt?.original_receipt?.boundary).toBe(
    'WOULD_MEET_SYNTHETIC_REQUIREMENTS',
  );
  expect(cancelled.receipt?.cancellation).toBe('CANCELLED');
  expect(cancelled.receipt!.linearization_sequence).toBeGreaterThan(
    checked.receipt!.linearization_sequence,
  );
  const current = read(f);
  expect(current.receipt).toEqual(checked.receipt);
  expect(current.current_cancellation).toBe('CANCELLED');
  expect(counts(f)).toEqual({ claims: 2, receipts: 2 });
}, 20_000);
it.each(['source', 'clock'] as const)(
  'native lock wait rechecks %s after cancellation custody claim',
  async (kind) => {
    const f = await fixture(),
      w = worker(f, withdrawal(f, 'CANCEL')),
      lock = new DatabaseSync(f.legacyPath);
    lock.exec('BEGIN IMMEDIATE');
    await w.event('READY');
    w.child.send('GO');
    await w.event('SOURCE_CHECKED');
    const witness = JSON.parse(readFileSync(w.witness, 'utf8'));
    if (kind === 'source') witness.revoked = true;
    else witness.now = '2026-12-28T11:59:59.999Z';
    writeFileSync(w.witness, JSON.stringify(witness));
    lock.exec('COMMIT');
    lock.close();
    expect(
      ((await w.event('RESULT')).result as ReturnType<typeof run>).status,
    ).toBe('UNKNOWN');
    const db = new DatabaseSync(f.legacyPath, { readOnly: true });
    expect(db.prepare('SELECT revision FROM authority').get()?.revision).toBe(
      0,
    );
    db.close();
  },
  20_000,
);
it.each([
  'purpose_allowed',
  'recipient_verified',
  'enrollment_active',
  'suppressed',
  'sender_authorized',
  'principal_active',
  'source_revoked',
] as const)('actual canonical boundary denies withdrawn %s', async (key) => {
  const f = await fixture(),
    next = {
      ...f.facts,
      [key]: key === 'suppressed' || key === 'source_revoked',
    };
  changeSyntheticConsent(f.legacyPath, f.view.envelope, 0, next, f.authority);
  f.command.original.expected_revision = 1;
  f.command.expected_fixture_revision = 1;
  expect(run(f).receipt?.original_receipt?.boundary).toBe('DENIED');
});
it('stale cancellation CAS is UNKNOWN without retry and cannot overwrite newer fixture evidence', async () => {
  const f = await fixture();
  changeSyntheticConsent(
    f.legacyPath,
    f.view.envelope,
    0,
    { ...f.facts, suppressed: true },
    f.authority,
  );
  const command = withdrawal(f, 'CANCEL');
  expect(run(f, command).status).toBe('UNKNOWN');
  expect(
    run(f, {
      ...command,
      command_id: 'lab-cas-retry',
      expected_fixture_revision: 1,
    }).status,
  ).toBe('UNKNOWN');
  expect(counts(f)).toEqual({ claims: 1, receipts: 0 });
});
it('expiry and clock movement are checked by native evaluation and before receipt commit', async () => {
  const f = await fixture();
  f.clock.now = '2026-12-28T12:01:00.000Z';
  expect(run(f).receipt?.original_receipt?.denials).toContain('AUTHORITY_TIME');
  const g = await fixture();
  g.authority.beforeCommit = () => (g.clock.now = '2026-12-28T12:00:00.001Z');
  expect(run(g).status).toBe('UNKNOWN');
  expect(counts(g)).toEqual({ claims: 1, receipts: 0 });
});
it('receipt-write refusal preserves the actual native receipt and permanent custody UNKNOWN', async () => {
  const f = await fixture(),
    db = new DatabaseSync(f.path);
  db.exec(
    "CREATE TRIGGER refuse_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(FAIL,'fixture receipt refusal');END;",
  );
  db.close();
  expect(run(f).status).toBe('UNKNOWN');
  expect(
    reconcileAtomicBoundary(f.legacyPath, f.original, f.authority).receipt
      ?.send,
  ).toBe(false);
  expect(counts(f)).toEqual({ claims: 1, receipts: 0 });
  const repair = new DatabaseSync(f.path);
  repair.exec('DROP TRIGGER refuse_receipt');
  repair.close();
  expect(run(f).status).toBe('UNKNOWN');
});
it.each(['CANCEL', 'REVOKE'] as const)(
  'browser %s is review-only, irrevocable and retains original blocked evidence',
  async (action) => {
    const f = await fixture(),
      original = JSON.stringify(f.view),
      writer = vi.spyOn(f.sources.operations, 'recordConsent');
    const r = cancelConsentCancellationReview(f.view, action);
    expect(r.consent_mutation).toBe(false);
    expect(consentCancellationStateNow(f.view)).toBe(
      action === 'CANCEL' ? 'CANCELLED_LOCAL_REVIEW' : 'REVOKED_LOCAL_REVIEW',
    );
    expect(JSON.stringify(f.view)).toBe(original);
    expect(writer).not.toHaveBeenCalled();
    expect((await reconcileConsentCancellationReview(f.view)).status).toBe(
      r.status,
    );
    await expect(
      prepareConsentCancellationReview(
        f.desk,
        { ...f.input, expires_at: f.input.expires_at + 1000 },
        f.gate,
      ),
    ).rejects.toThrow('Existing');
    expect(() => cancelConsentCancellationReview(f.view, action)).toThrow(
      'terminal',
    );
  },
);
it('existing C11/C10 one-use hold cannot be bypassed through a new cancellation view', async () => {
  const f = await context(),
    old = await readAtomicConsentLab(f.sources, windowInput(), f.gate);
  await inspectAtomicConsentRequirements(old, f.input.proposal, f.gate);
  await expect(
    prepareConsentCancellationReview(f.desk, f.input, f.gate),
  ).rejects.toThrow('C11/C10');
  const replacement = await readConsentCancellationSources(
    f.sources,
    windowInput(),
    f.gate,
  );
  await expect(
    prepareConsentCancellationReview(replacement, f.input, f.gate),
  ).rejects.toThrow('Existing');
});
it.each(['input', 'gate', 'root', 'model', 'repository'] as const)(
  'final C12 await rechecks original %s and permanently holds UNKNOWN',
  async (kind) => {
    const f = await context(),
      other = kind === 'repository' ? await context() : null,
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      if (
        !changed &&
        new TextDecoder()
          .decode(args[1] as ArrayBuffer)
          .includes('LOCAL_CONSENT_CANCELLATION_REVIEW')
      ) {
        changed = true;
        if (kind === 'input')
          f.input.proposal.purpose = 'marketing' as 'service_follow_up';
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'root') f.sources.entries = [...f.sources.entries];
        if (kind === 'model')
          f.sources.entries[0].customerModel =
            f.sources.entries[1].customerModel;
        if (kind === 'repository') f.sources.property = other!.sources.property;
      }
      return result;
    });
    await expect(
      prepareConsentCancellationReview(f.desk, f.input, f.gate),
    ).rejects.toThrow();
    expect(changed).toBe(true);
    f.gate.confirmed = true;
    await expect(
      prepareConsentCancellationReview(
        f.desk,
        { ...f.input, expires_at: f.input.expires_at + 1000 },
        f.gate,
      ),
    ).rejects.toThrow();
  },
);
it('browser expiry/copied view/role revocation never restores an earlier review', async () => {
  const f = await fixture();
  expect(
    (await reconcileConsentCancellationReview(structuredClone(f.view))).status,
  ).toBe('UNKNOWN');
  await expect(
    openConsentCancellationSource(structuredClone(f.view)),
  ).rejects.toThrow();
  vi.spyOn(Date, 'now').mockReturnValue(f.input.expires_at);
  expect(consentCancellationStateNow(f.view)).toBe('EXPIRED_LOCAL_REVIEW');
  vi.spyOn(Date, 'now').mockReturnValue(f.input.expires_at - 1000);
  expect((await reconcileConsentCancellationReview(f.view)).status).toBe(
    'UNKNOWN',
  );
  const g = await context(),
    actor = g.sources.company.id + '-estimator';
  await g.sources.operations.manageMember(
    g.sources.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  g.sources.entries.forEach((e) => (e.target.actor_id = actor));
  const desk = await readConsentCancellationSources(
      g.sources,
      windowInput(),
      g.gate,
    ),
    view = await prepareConsentCancellationReview(
      desk,
      { ...g.input, expires_at: Date.now() + 1000 },
      g.gate,
    );
  await g.sources.operations.manageMember(
    g.sources.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  expect((await reconcileConsentCancellationReview(view)).status).toBe(
    'UNKNOWN',
  );
});
it('OFF/protocol gates and own-data validation never invoke source getters or serializers', async () => {
  const hook = vi.fn(),
    source = Object.create(null),
    command = Object.create(null);
  Object.defineProperty(source, 'entries', { get: hook });
  Object.defineProperty(command, 'original', { get: hook });
  await expect(
    readConsentCancellationSources(source, Object.create(null)),
  ).rejects.toThrow('OFF');
  expect(() =>
    executeConsentCancellation('/invalid', '/invalid', command, {
      clock: hook,
      checkSource: hook,
    }),
  ).toThrow('OFF');
  expect(
    renderToStaticMarkup(
      createElement(ConsentCancellationReview, { sources: source }),
    ),
  ).toContain('is off');
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'https:' },
  });
  expect(
    renderToStaticMarkup(
      createElement(ConsentCancellationReview, {
        sources: source,
        enabled: true,
      }),
    ),
  ).toContain('is off');
  expect(hook).not.toHaveBeenCalled();
  const f = await fixture();
  expect(() =>
    run(f, { ...f.command, toJSON: hook } as CancellationLabCommand),
  ).toThrow();
  const input = { ...f.input, proposal: { ...f.input.proposal } };
  Object.defineProperty(input.proposal, 'purpose', { get: hook });
  await expect(
    prepareConsentCancellationReview(f.desk, input, f.gate),
  ).rejects.toThrow();
  expect(hook).not.toHaveBeenCalled();
});
it.each([0, 1, 2])(
  'brand %s initial live form has explicit visible labels and blocked authority',
  async (brand) => {
    const f = await context(brand);
    vi.stubGlobal('window', {
      location: { hostname: '127.0.0.1', protocol: 'http:' },
    });
    const markup = renderToStaticMarkup(
      createElement(ConsentCancellationReview, {
        sources: f.sources,
        enabled: true,
      }),
    );
    expect(markup).toContain('Load cancellation review sources');
    expect(markup).toContain('All communication BLOCKED');
    expect(markup).toContain('same-tab review only');
  },
);
it('foreign source, changed sender/recipient and malformed custody receipts cannot grant a new boundary', async () => {
  const f = await fixture(),
    other = await fixture(1);
  expect(() => run(f, { ...f.command, original: other.original })).toThrow(
    'binding',
  );
  expect(() =>
    run(f, { ...f.command, sender_reference: 'synthetic-sender:other' }),
  ).toThrow('binding');
  expect(() =>
    run(f, { ...f.command, recipient_reference: 'actual@example.invalid' }),
  ).toThrow('binding');
  run(f);
  const db = new DatabaseSync(f.path),
    row = db.prepare('SELECT body FROM receipts').get()!,
    body = { ...JSON.parse(String(row.body)), send: true };
  db.prepare('UPDATE receipts SET body=?,sha256=?').run(
    JSON.stringify(body),
    createHash('sha256').update(JSON.stringify(body)).digest('hex'),
  );
  db.close();
  expect(read(f).status).toBe('UNKNOWN');
  expect(run(f).status).toBe('UNKNOWN');
});
it('private arbitrary files/symlinks and missing exact receipts remain UNKNOWN without writes', async () => {
  const f = await fixture();
  rmSync(f.path);
  writeFileSync(f.path, 'retain original', { mode: 0o600 });
  expect(() => run(f)).toThrow();
  expect(readFileSync(f.path, 'utf8')).toBe('retain original');
  rmSync(f.path);
  const target = join(f.folder, 'original-private');
  writeFileSync(target, 'unchanged', { mode: 0o600 });
  symlinkSync(target, f.path);
  expect(() => run(f)).toThrow();
  expect(readFileSync(target, 'utf8')).toBe('unchanged');
  expect(read(f).status).toBe('UNKNOWN');
});
it('browser graph never imports a lab writer or provider and scoped styles preserve approved tokens', () => {
  const module = readFileSync(
      new URL(
        '../src/lib/workflows/consent-cancellation-review.ts',
        import.meta.url,
      ),
      'utf8',
    ),
    component = readFileSync(
      new URL(
        '../src/components/workflows/ConsentCancellationReview.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    css = readFileSync(
      new URL(
        '../src/components/workflows/consent-cancellation-review.css',
        import.meta.url,
      ),
      'utf8',
    );
  expect(module + component).not.toMatch(
    /node:sqlite|server\/consent-lab|fetch\(|localStorage|indexedDB|recordConsent\(/,
  );
  expect(css).toContain('--journey-primary');
  expect(css).toContain('--journey-accent');
  expect(css).toContain('44px');
});
