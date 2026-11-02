import { afterEach, expect, it, vi } from 'vitest';
import {
  captureSalesApprovedScopeReference as captureReference,
  verifySalesApprovedScopeReference as verify,
  type SalesHandoffTarget,
  type SalesApprovedScopeReference,
} from '../src/lib/sales-approval-handoff';
import { customerPreview } from '../src/domain/estimating/customer-preview';
import { documentHash, ReleasePreview } from '../src/domain/release/preview';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import { salesHandoffFixture } from './helpers/sales-handoff';

// A staff view pins the exact displayed canonical hash before an explicit capture.
async function capture(
  repo: Phase3Repository,
  release: ReleasePreview,
  target: SalesHandoffTarget,
  confirmed: boolean,
  reviewedHash?: string,
) {
  const hash =
    reviewedHash ??
    (await documentHash({
      ...customerPreview(release.version),
      internal_test: true,
    }));
  return captureReference(repo, release, target, confirmed, hash);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each([0, 1, 2])(
  'retains and independently verifies exact accepted scope for company %i without writes',
  async (index) => {
    const f = await salesHandoffFixture(index);
    const before = {
      release: f.release.read('staff'),
      history: await f.repo.history(f.company.id, f.issued.estimate.id),
      jobs: await f.repo.jobs(f.company.id),
    };
    const command = vi.spyOn(f.release, 'command');
    const issue = vi.spyOn(f.repo, 'issue');
    const save = vi.spyOn(f.repo, 'save');
    const approveJob = vi.spyOn(f.repo, 'approveJob');
    const record = await capture(f.repo, f.release, f.target, true);
    expect(record.source).toMatchObject({
      organization_id: f.company.id,
      customer_id: f.customer.id,
      location_id: f.location.id,
      estimate_id: f.issued.estimate.id,
      version_id: f.issued.version.id,
      version_number: 1,
      lock_revision: f.issued.version.lock_revision,
      issued_at: f.issued.version.issued_at,
      scope: { ...customerPreview(f.issued.version), internal_test: true },
    });
    expect(record.receipt).toEqual({
      id: f.receipt.id,
      offer_id: f.offer.id,
      decision: 'accepted',
      consent_version: 'internal-test-v1',
      recorded_at: f.receipt.created_at,
    });
    expect(record.offer).toEqual({
      id: f.offer.id,
      created_at: f.offer.created_at,
      expires_at: f.offer.expires_at,
    });
    expect(record.reviewer_id).toBe(f.target.actor_id);
    expect(record.contract_execution).toBe('BLOCKED');
    expect(record.integrity.sha256).toMatch(/^[0-9a-f]{64}$/);
    const { integrity, ...content } = record;
    expect(integrity.sha256).toBe(await documentHash(content));
    expect(record.source.scope_hash).toBe(
      await documentHash(record.source.scope),
    );
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.source.scope.company)).toBe(true);
    expect(Object.isFrozen(record.source.scope.lines)).toBe(true);
    expect(() =>
      Object.assign(record.source.scope.lines[0], { amount_minor: 1 }),
    ).toThrow();
    expect(JSON.stringify(record)).not.toMatch(
      /PRIVATE|internal_note|unit_cost_minor|profit_margin|payroll|staff_type|note is not needed/,
    );
    expect(await verify(f.repo, f.release, f.target, record)).toMatchObject({
      status: 'current',
      reference_hash: integrity.sha256,
      contract_execution: 'BLOCKED',
    });
    // Retaining identical evidence twice creates no record/store/command and keeps stable identity.
    expect(
      (await capture(f.repo, f.release, f.target, true)).integrity,
    ).toEqual(integrity);
    expect({
      release: f.release.read('staff'),
      history: await f.repo.history(f.company.id, f.issued.estimate.id),
      jobs: await f.repo.jobs(f.company.id),
    }).toEqual(before);
    expect(command).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(approveJob).not.toHaveBeenCalled();
    for (const key of [
      'release_contracts',
      'release_signatures',
      'release_invoices',
      'release_authorizations',
      'release_payment_events',
      'release_ledger_entries',
    ] as const)
      expect(before.release[key]).toEqual([]);
    expect(before.release.release_messages).toHaveLength(1);
    expect(before.release.release_messages[0].channel).toBe('internal_sink');
  },
);

it('requires explicit primitive confirmation before reading', async () => {
  const f = await salesHandoffFixture(),
    get = vi.spyOn(f.repo, 'get');
  for (const confirmation of [false, undefined, new Boolean(true), 'true'])
    await expect(
      capture(f.repo, f.release, f.target, confirmation as boolean),
    ).rejects.toThrow('confirmation');
  expect(get).not.toHaveBeenCalled();
});

it.each(['declined', 'changes_requested', null] as const)(
  'does not capture %s or fabricate accepted evidence',
  async (decision) => {
    const f = await salesHandoffFixture(0, decision);
    await expect(capture(f.repo, f.release, f.target, true)).rejects.toThrow(
      'accepted test preference',
    );
  },
);

it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'version_id',
  'actor_id',
  'offer_id',
  'receipt_id',
] as const)(
  'rejects a foreign exact %s for capture and verification',
  async (field) => {
    const f = await salesHandoffFixture(),
      record = await capture(f.repo, f.release, f.target, true);
    const target = { ...f.target, [field]: 'foreign-reference' };
    await expect(capture(f.repo, f.release, target, true)).rejects.toThrow();
    expect(await verify(f.repo, f.release, target, record)).toMatchObject({
      status: 'unknown',
      reference_hash: null,
      contract_execution: 'BLOCKED',
    });
  },
);

it('retains immutable original version after newer drafts and never selects the latest', async () => {
  const f = await salesHandoffFixture(),
    record = await capture(f.repo, f.release, f.target, true);
  const bytes = JSON.stringify(record),
    issued = structuredClone(f.issued.version);
  const draft = await f.repo.revise(f.company.id, f.issued);
  const input = structuredClone(draft.version.payload);
  input.project.description = 'Later private scope';
  await f.repo.save(f.company.id, draft, input);
  expect(await verify(f.repo, f.release, f.target, record)).toMatchObject({
    status: 'stale',
    reference_hash: record.integrity.sha256,
  });
  expect(JSON.stringify(record)).toBe(bytes);
  expect(
    (await f.repo.get(f.company.id, f.issued.estimate.id, issued.id)).version,
  ).toEqual(issued);
  await expect(capture(f.repo, f.release, f.target, true)).rejects.toThrow();
  expect(
    (
      await verify(
        f.repo,
        f.release,
        { ...f.target, version_id: draft.version.id },
        record,
      )
    ).status,
  ).toBe('unknown');
});

it('keeps expired original evidence stale without renewing it', async () => {
  const f = await salesHandoffFixture(),
    record = await capture(f.repo, f.release, f.target, true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.parse(f.offer.expires_at) + 1));
  expect(await verify(f.repo, f.release, f.target, record)).toMatchObject({
    status: 'stale',
    reference_hash: record.integrity.sha256,
  });
  await expect(capture(f.repo, f.release, f.target, true)).rejects.toThrow();
});

it.each([
  'scope',
  'hash',
  'extra-field',
  'nested-private',
  'primitive-wrapper',
  'array-extra',
  'non-enumerable',
] as const)(
  'rejects altered %s reference with no echoed content',
  async (kind) => {
    const f = await salesHandoffFixture(),
      record = await capture(f.repo, f.release, f.target, true);
    const changed = structuredClone(record);
    if (kind === 'scope')
      Object.assign(changed.source.scope.lines[0], { amount_minor: 900 });
    if (kind === 'hash')
      Object.assign(changed.integrity, { sha256: '0'.repeat(64) });
    if (kind === 'extra-field') Object.assign(changed, { secret: 'PRIVATE' });
    if (kind === 'nested-private')
      Object.assign(changed.source.scope.company, { private_note: 'PRIVATE' });
    if (kind === 'primitive-wrapper')
      Object.assign(changed.receipt, { decision: new String('accepted') });
    if (kind === 'array-extra')
      Object.assign(changed.source.scope.lines, { extra: 'PRIVATE' });
    if (kind === 'non-enumerable')
      Object.defineProperty(changed, 'private', { value: 'PRIVATE' });
    const value = await verify(f.repo, f.release, f.target, changed);
    expect(value).toMatchObject({ status: 'unknown', reference_hash: null });
    expect(JSON.stringify(value)).not.toContain('PRIVATE');
  },
);

it('does not treat a recomputed caller hash or alternate accepted receipt as authority', async () => {
  const f = await salesHandoffFixture(),
    g = await salesHandoffFixture();
  const record = structuredClone(
    await capture(f.repo, f.release, f.target, true),
  );
  Object.assign(record.receipt, { id: g.receipt.id });
  const { integrity, ...content } = record;
  expect(integrity.algorithm).toBe('SHA-256');
  Object.assign(record.integrity, { sha256: await documentHash(content) });
  expect((await verify(f.repo, f.release, f.target, record)).status).toBe(
    'unknown',
  );
  expect((await verify(g.repo, g.release, g.target, record)).status).toBe(
    'unknown',
  );
});

it('accepts identical primitive references after key reordering and never calls inherited serializers', async () => {
  const f = await salesHandoffFixture(),
    record = await capture(f.repo, f.release, f.target, true);
  function reorder(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(reorder);
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([k, v]) => [k, reorder(v)]),
    );
  }
  const reordered = reorder(record) as object;
  const serializer = vi.fn(() => {
    throw Error('Must not call inherited serializer');
  });
  Object.setPrototypeOf(reordered, { toJSON: serializer });
  expect((await verify(f.repo, f.release, f.target, reordered)).status).toBe(
    'current',
  );
  expect(serializer).not.toHaveBeenCalled();
});

it('rejects getters and unknown function fields without executing them', async () => {
  const f = await salesHandoffFixture(),
    record = structuredClone(await capture(f.repo, f.release, f.target, true));
  const getter = vi.fn(() => 'accepted');
  Object.defineProperty(record.receipt, 'decision', {
    enumerable: true,
    get: getter,
  });
  expect((await verify(f.repo, f.release, f.target, record)).status).toBe(
    'unknown',
  );
  expect(getter).not.toHaveBeenCalled();
  const another = structuredClone(
    await capture(f.repo, f.release, f.target, true),
  );
  const serializer = vi.fn(() => 'PRIVATE');
  Object.assign(another, { toJSON: serializer });
  expect((await verify(f.repo, f.release, f.target, another)).status).toBe(
    'unknown',
  );
  expect(serializer).not.toHaveBeenCalled();
});

it('pins caller references and primitive snapshot before the first await', async () => {
  const f = await salesHandoffFixture(),
    record = structuredClone(await capture(f.repo, f.release, f.target, true));
  const target = { ...f.target },
    get = f.repo.get.bind(f.repo);
  let changed = false;
  vi.spyOn(f.repo, 'get').mockImplementation(async (...args) => {
    if (!changed) {
      changed = true;
      target.customer_id = 'foreign';
      Object.assign(record.source.scope.project, { name: 'Caller change' });
    }
    return get(...args);
  });
  const result = await verify(f.repo, f.release, target, record);
  expect(result.status).toBe('current');
  // The caller mutation never changes the checked snapshot or becomes new authority.
  expect(result.reference_hash).toMatch(/^[0-9a-f]{64}$/);
});

it('rechecks actual current staff after the last capture source wait', async () => {
  const f = await salesHandoffFixture(),
    get = f.repo.get.bind(f.repo);
  let reads = 0;
  vi.spyOn(f.repo, 'get').mockImplementation(async (...args) => {
    const value = await get(...args);
    if (++reads === 8)
      await f.operations.manageMember(
        f.company.id,
        f.target.actor_id,
        false,
        'staff',
        'estimator',
      );
    return value;
  });
  await expect(capture(f.repo, f.release, f.target, true)).rejects.toThrow();
});

it.each([0, 1, 2])(
  'denies revoked or field-only staff during independent verify for company %i',
  async (index) => {
    const f = await salesHandoffFixture(index),
      record = await capture(f.repo, f.release, f.target, true);
    const get = f.repo.get.bind(f.repo);
    let reads = 0;
    vi.spyOn(f.repo, 'get').mockImplementation(async (...args) => {
      const value = await get(...args);
      if (++reads === 8)
        await f.operations.manageMember(
          f.company.id,
          f.target.actor_id,
          true,
          'staff',
          'field_worker',
        );
      return value;
    });
    expect(await verify(f.repo, f.release, f.target, record)).toMatchObject({
      status: 'unknown',
      reference_hash: null,
    });
  },
);

it('blocks connected repositories without any evidence/network read', async () => {
  const f = await salesHandoffFixture(),
    record = await capture(f.repo, f.release, f.target, true);
  const repo = new Phase3Repository(new Operations(false)),
    get = vi.spyOn(repo, 'get');
  expect((await verify(repo, f.release, f.target, record)).status).toBe(
    'unknown',
  );
  await expect(capture(repo, f.release, f.target, true)).rejects.toThrow();
  expect(get).not.toHaveBeenCalled();
});

it('leaves source loss UNKNOWN and performs only exact read-only reconciliation after it returns', async () => {
  const f = await salesHandoffFixture(),
    record = await capture(f.repo, f.release, f.target, true),
    get = f.repo.get.bind(f.repo);
  const command = vi.spyOn(f.release, 'command');
  vi.spyOn(f.repo, 'get').mockRejectedValue(
    Error('Lost source acknowledgment'),
  );
  expect((await verify(f.repo, f.release, f.target, record)).status).toBe(
    'unknown',
  );
  vi.mocked(f.repo.get).mockImplementation(get);
  expect((await verify(f.repo, f.release, f.target, record)).status).toBe(
    'current',
  );
  expect(command).not.toHaveBeenCalled();
});

it('rejects source drift and receipt conflicts during the final verify read', async () => {
  const f = await salesHandoffFixture(),
    record = await capture(f.repo, f.release, f.target, true),
    get = f.repo.get.bind(f.repo);
  let reads = 0;
  vi.spyOn(f.repo, 'get').mockImplementation(async (...args) => {
    const value = await get(...args);
    if (++reads === 8) value.version.lock_revision += 1;
    return value;
  });
  expect((await verify(f.repo, f.release, f.target, record)).status).toBe(
    'unknown',
  );
  vi.restoreAllMocks();
  const read = f.release.read.bind(f.release);
  let workspaces = 0;
  vi.spyOn(f.release, 'read').mockImplementation((actor) => {
    const value = read(actor);
    if (++workspaces === 4) value.release_decisions[0].decision = 'declined';
    return value;
  });
  expect((await verify(f.repo, f.release, f.target, record)).status).toBe(
    'unknown',
  );
});

it('cannot rebind the original reference to a different version or local offer engine', async () => {
  const f = await salesHandoffFixture(),
    record = await capture(f.repo, f.release, f.target, true);
  const other = await f.repo.issue(
    f.company.id,
    await f.repo.create(f.company, f.issued.version.payload),
  );
  const release = new ReleasePreview(f.company.id, other.version);
  expect(
    (
      await verify(
        f.repo,
        release,
        {
          ...f.target,
          estimate_id: other.estimate.id,
          version_id: other.version.id,
        },
        record,
      )
    ).status,
  ).toBe('unknown');
  const bad = {
    ...f.target,
    version_id: new String(f.target.version_id),
  } as unknown as SalesHandoffTarget;
  expect((await verify(f.repo, f.release, bad, record)).status).toBe('unknown');
});

it('uses canonical tax, discount and schedule amounts without a second calculation engine', async () => {
  const f = await salesHandoffFixture(),
    record = await capture(f.repo, f.release, f.target, true);
  expect(record.source.scope).toEqual({
    ...customerPreview(f.issued.version),
    internal_test: true,
  });
  expect(record.source.scope.total_minor).toBe(
    f.issued.version.calculation.total_minor,
  );
  expect(record.source.scope.tax_minor).toBe(
    f.issued.version.calculation.tax_minor,
  );
  expect(record.source.scope.discount_minor).toBe(
    f.issued.version.calculation.discount_minor,
  );
  expect(record.source.scope.schedule).toEqual(
    f.issued.version.calculation.payment_schedule.map((s) => ({
      label: s.label,
      due_on: s.due_on,
      amount_minor: s.amount_minor,
    })),
  );
});

it('keeps future private source fields outside the exact retained boundary', async () => {
  const f = await salesHandoffFixture();
  Object.assign(f.issued.version.company_snapshot, {
    future_private: 'PRIVATE',
  });
  const get = f.repo.get.bind(f.repo);
  vi.spyOn(f.repo, 'get').mockImplementation(async (...args) => {
    const value = await get(...args);
    Object.assign(value.version.company_snapshot, {
      future_private: 'PRIVATE',
    });
    return value;
  });
  const record: SalesApprovedScopeReference = await capture(
    f.repo,
    f.release,
    f.target,
    true,
  );
  expect(JSON.stringify(record)).not.toContain('PRIVATE');
  expect(record.source.scope.company).not.toHaveProperty('future_private');
});

it('requires the exact staff-reviewed hash and rejects a differently reviewed scope', async () => {
  const f = await salesHandoffFixture();
  await expect(
    capture(f.repo, f.release, f.target, true, '0'.repeat(64)),
  ).rejects.toThrow();
  for (const hash of ['', 'bad', new String('a'.repeat(64))])
    await expect(
      captureReference(f.repo, f.release, f.target, true, hash as string),
    ).rejects.toThrow('reviewed scope hash');
});
