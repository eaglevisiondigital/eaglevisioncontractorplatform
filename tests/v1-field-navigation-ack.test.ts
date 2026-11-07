import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readFieldWorkspace,
  navigateFieldWorkspace,
  reconcileFieldWorkspace,
} from '../src/lib/workflows/field-workspace';

afterEach(() => vi.restoreAllMocks());
const observations: unknown[] = [];
afterAll(() => {
  mkdirSync('test-results/v1-field-navigation-ack', { recursive: true });
  writeFileSync(
    'test-results/v1-field-navigation-ack/observations.json',
    JSON.stringify(observations, null, 2) + '\n',
  );
});

async function fixture(brand: number) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[2],
    org = sources.company.id;
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-field-navigation-remaining-owner',
  );
  const input = { job_id: entry.target.job_id!, worker_id: '' },
    view = await readFieldWorkspace(sources, input, gate);
  return { gate, sources, entry, org, input, view };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fresh(f: Fixture) {
  return readFieldWorkspace(
    { ...f.sources },
    { job_id: f.input.job_id, worker_id: f.entry.worker_id },
    f.gate,
  );
}
function outcome(result: PromiseSettledResult<unknown>) {
  return {
    status: result.status,
    ...(result.status === 'rejected'
      ? {
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        }
      : {}),
  };
}
function writers(f: Fixture) {
  return [
    vi.spyOn(f.sources.estimates, 'save'),
    vi.spyOn(f.sources.estimates, 'issue'),
    vi.spyOn(f.sources.estimates, 'approveJob'),
    vi.spyOn(f.sources.estimates, 'assignJob'),
    vi.spyOn(f.sources.estimates, 'recordTime'),
    vi.spyOn(f.sources.estimates, 'submitExpense'),
    vi.spyOn(f.sources.property, 'saveVisit'),
    vi.spyOn(f.sources.property, 'savePlan'),
    vi.spyOn(f.sources.property, 'publish'),
    vi.spyOn(f.sources.operations, 'recordConsent'),
    vi.spyOn(f.entry.release, 'command'),
    vi.spyOn(globalThis, 'fetch'),
  ];
}

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: pending native Promise from the synchronous Field callback cannot report success or admit a second invocation`, async () => {
    const f = await fixture(brand);
    let rejectPending!: (reason: Error) => void;
    let acknowledgmentFinished = false;
    const pending = new Promise<void>((_resolve, reject) => {
        rejectPending = reject;
      }),
      diagnostic = pending.then(
        () => {
          acknowledgmentFinished = true;
          return 'fulfilled';
        },
        (error: unknown) => {
          acknowledgmentFinished = true;
          return error instanceof Error ? error.message : String(error);
        },
      ),
      first = vi.fn(() => pending),
      second = vi.fn(),
      [firstResult] = await Promise.allSettled([
        navigateFieldWorkspace(f.view, first),
      ]),
      finishedBeforeRejection = acknowledgmentFinished,
      replacement = await fresh(f),
      [secondResult] = await Promise.allSettled([
        navigateFieldWorkspace(replacement, second),
      ]);
    // This is a harness observer of an unsupported native Promise, not a
    // controller acknowledgment, action-completion receipt or retry permission.
    rejectPending(
      Error('Original host navigation acknowledgment rejected late'),
    );
    const diagnosticResult = await diagnostic,
      reconciled = await reconcileFieldWorkspace(f.view);
    observations.push({
      brand,
      kind: 'UNSUPPORTED_NATIVE_PROMISE',
      first: outcome(firstResult),
      second: outcome(secondResult),
      finished_before_manual_rejection: finishedBeforeRejection,
      first_calls: first.mock.calls.length,
      second_calls: second.mock.calls.length,
      diagnostic_only: diagnosticResult,
      reconciliation: reconciled,
    });
    expect(first).toHaveBeenCalledExactlyOnceWith(f.input.job_id, 'field');
    expect(finishedBeforeRejection).toBe(false);
    expect(diagnosticResult).toBe(
      'Original host navigation acknowledgment rejected late',
    );
    expect(firstResult.status).toBe('rejected');
    expect(secondResult.status).toBe('rejected');
    expect(second).not.toHaveBeenCalled();
    expect(reconciled).toMatchObject({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
      replacement: null,
      dispatch: false,
    });
  });

  it(`brand ${brand}: actual native revocation inside a void Field callback cannot clear its original outcome or replay after regrant`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined;
    const first = vi.fn(() => {
        revoked = f.sources.operations.revokeOwner(
          f.org,
          f.entry.target.actor_id,
        );
      }),
      [firstResult] = await Promise.allSettled([
        navigateFieldWorkspace(f.view, first),
      ]);
    expect(revoked).toBeDefined();
    await revoked;
    const activeAfterInvocation = f.sources.operations
      .syntheticMemberships(f.org)
      .find((m) => m.user_id === f.entry.target.actor_id)!.active;
    await f.sources.operations.configure(
      f.org,
      'active',
      'synthetic',
      {},
      f.entry.target.actor_id,
    );
    const replacement = await fresh(f),
      second = vi.fn(),
      [secondResult] = await Promise.allSettled([
        navigateFieldWorkspace(replacement, second),
      ]),
      reconciled = await reconcileFieldWorkspace(f.view);
    observations.push({
      brand,
      kind: 'NATIVE_CALLBACK_REVOCATION',
      native_active_after_invocation: activeAfterInvocation,
      first: outcome(firstResult),
      second: outcome(secondResult),
      first_calls: first.mock.calls.length,
      second_calls: second.mock.calls.length,
      reconciliation: reconciled,
    });
    expect(activeAfterInvocation).toBe(false);
    expect(first).toHaveBeenCalledExactlyOnceWith(f.input.job_id, 'field');
    expect(firstResult.status).toBe('rejected');
    expect(secondResult.status).toBe('rejected');
    expect(second).not.toHaveBeenCalled();
    expect(reconciled).toMatchObject({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
      replacement: null,
      dispatch: false,
    });
  });

  it(`brand ${brand}: ordinary synchronous presentation changes and a known void no-op preserve exact current context without business writers`, async () => {
    const f = await fixture(brand),
      canonical = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      property = f.sources.property.read(f.org),
      calls = writers(f),
      selected: { job_id: string; section?: string }[] = [],
      callback = vi.fn((jobId: string, section?: string) => {
        selected.push({ job_id: jobId, section });
      });
    await navigateFieldWorkspace(f.view, () => {});
    expect((await reconcileFieldWorkspace(f.view)).status).toBe(
      'CURRENT_REVIEW_ONLY',
    );
    await navigateFieldWorkspace(f.view, callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith(f.input.job_id, 'field');
    expect(selected).toEqual([{ job_id: f.input.job_id, section: 'field' }]);
    expect((await reconcileFieldWorkspace(f.view)).status).toBe(
      'CURRENT_REVIEW_ONLY',
    );
    expect(f.view.source).toMatchObject({
      organization_id: f.org,
      customer_id: f.entry.target.customer_id,
      location_id: f.entry.target.location_id,
      job_id: f.entry.target.job_id,
      issued_version_id: f.entry.target.version_id,
    });
    expect(f.view.physical_completion).toBe('UNVERIFIED');
    expect(f.view.operational_ready).toBe(false);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(canonical);
    expect(f.sources.property.read(f.org)).toEqual(property);
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: an actual canonical forecast change inside the void callback keeps the original company/job outcome UNKNOWN`, async () => {
    const f = await fixture(brand),
      original = JSON.stringify(f.view),
      job = f.sources.estimates.syntheticJob(f.org, f.input.job_id)!;
    let saved: Promise<unknown> | undefined;
    const callback = vi.fn(() => {
      saved = f.sources.estimates.projection(f.org, job, {
        ...job.projection,
        remaining: {
          ...job.projection.remaining,
          other: job.projection.remaining.other + 500,
        },
      });
    });
    await expect(navigateFieldWorkspace(f.view, callback)).rejects.toThrow();
    expect(saved).toBeDefined();
    await saved;
    expect(
      f.sources.estimates.syntheticJob(f.org, f.input.job_id)!.lock_revision,
    ).toBe(job.lock_revision + 1);
    const current = await fresh(f),
      retry = vi.fn();
    await expect(navigateFieldWorkspace(current, retry)).rejects.toThrow();
    expect(retry).not.toHaveBeenCalled();
    expect((await reconcileFieldWorkspace(f.view)).status).toBe('UNKNOWN');
    expect(JSON.stringify(f.view)).toBe(original);
  });
}

for (const kind of [
  'false',
  'object',
  'then method',
  'then getter',
  'Proxy',
] as const) {
  it(`unsupported ${kind} acknowledgment is rejected without generic property adoption or a replacement invocation`, async () => {
    const f = await fixture(0),
      touched = vi.fn(() => {
        throw Error('A foreign acknowledgment property must not execute');
      });
    const value: unknown =
      kind === 'false'
        ? false
        : kind === 'object'
          ? { acknowledgment: 'untrusted' }
          : kind === 'then method'
            ? { then: touched }
            : kind === 'then getter'
              ? Object.defineProperty({}, 'then', { get: touched })
              : new Proxy(
                  {},
                  { get: touched, getOwnPropertyDescriptor: touched },
                );
    const callback = vi.fn(() => value);
    await expect(navigateFieldWorkspace(f.view, callback)).rejects.toThrow(
      'synchronous void',
    );
    expect(touched).not.toHaveBeenCalled();
    const retry = vi.fn(),
      replacement = await fresh(f);
    await expect(navigateFieldWorkspace(replacement, retry)).rejects.toThrow();
    expect(retry).not.toHaveBeenCalled();
    expect(touched).not.toHaveBeenCalled();
    expect((await reconcileFieldWorkspace(f.view)).status).toBe('UNKNOWN');
  });
}

it('withdrawn admission rejects before callback invocation and does not claim a business action', async () => {
  const f = await fixture(1),
    callback = vi.fn(),
    calls = writers(f);
  f.gate.confirmed = false;
  await expect(navigateFieldWorkspace(f.view, callback)).rejects.toThrow();
  expect(callback).not.toHaveBeenCalled();
  expect((await reconcileFieldWorkspace(f.view)).status).toBe('UNKNOWN');
  for (const call of calls) expect(call).not.toHaveBeenCalled();
});

it('copied views and a genuine foreign-company job cannot replace the original callback source', async () => {
  const f = await fixture(0),
    other = await fixture(1),
    callback = vi.fn();
  await expect(
    navigateFieldWorkspace(structuredClone(f.view), callback),
  ).rejects.toThrow();
  await expect(
    readFieldWorkspace(other.sources, f.input, other.gate),
  ).rejects.toThrow();
  expect(callback).not.toHaveBeenCalled();
  expect((await reconcileFieldWorkspace(f.view)).status).toBe(
    'CURRENT_REVIEW_ONLY',
  );
});
