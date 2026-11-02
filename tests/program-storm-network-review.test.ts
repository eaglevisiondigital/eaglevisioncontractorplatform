import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import { prototypeFixture } from './program/prototype-fixture';
import { readPrototypeSource } from '../src/lib/program/prototype-source';
import {
  prepareStormNetworkReview,
  reconcileStormNetworkReview,
  type StormNetworkInput,
} from '../src/lib/program/storm-network-review';

afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0, job = false) {
  const f = await prototypeFixture(sampleCompanies[index], job);
  const line = f.bundle.version.calculation.lines.find(
    (line) => line.included,
  )!;
  const input: StormNetworkInput = {
    incident_label: 'Synthetic incident · needs staff assessment',
    reported_on: '2026-11-01',
    manual_priority: 'high',
    conditions: ['WATER_ENTRY_REPORTED', 'CONDITION_NOT_YET_ASSESSED'],
    scope_line_ids: [line.id],
    sharing_purpose: 'INTERNAL_COORDINATION_REVIEW',
  };
  return { ...f, input };
}
const prepare = (f: Awaited<ReturnType<typeof fixture>>) =>
  prepareStormNetworkReview(f.repo, f.target, f.input, f.gate);
it.each([0, 1, 2])(
  'company %s produces useful exact-source triage and ids-only sharing content without effects',
  async (index) => {
    const f = await fixture(index, true),
      jobs = await f.repo.jobs(f.company.id),
      history = await f.repo.history(f.company.id, f.target.estimate_id);
    const writers = [
      vi.spyOn(f.repo, 'save'),
      vi.spyOn(f.repo, 'issue'),
      vi.spyOn(f.repo, 'approveJob'),
      vi.spyOn(f.repo, 'recordTime'),
      vi.spyOn(f.repo, 'assignJob'),
    ];
    const review = await prepare(f);
    expect(review.source).toMatchObject({
      organization_id: f.company.id,
      customer_id: f.target.customer_id,
      property_id: f.target.location_id,
      estimate_id: f.target.estimate_id,
      version_id: f.target.version_id,
      saved_lock_revision: f.bundle.version.lock_revision,
      job_id: f.target.job_id,
    });
    expect(review.triage).toMatchObject({
      manual_priority: 'high',
      priority_origin: 'EXPLICIT_HUMAN_SELECTION',
      physical_condition: 'UNVERIFIED',
      completion: 'UNVERIFIED',
      historical_coverage: 'UNKNOWN',
      job_association: 'EXACT_EXISTING_ISSUED_BASELINE',
    });
    expect(review.triage.review_tasks.map((task) => task.condition)).toEqual(
      f.input.conditions,
    );
    expect(
      review.triage.review_tasks.every(
        (task) =>
          task.status === 'STAFF_REVIEW_PROPOSAL' &&
          task.source_line_ids[0] === f.input.scope_line_ids[0],
      ),
    ).toBe(true);
    expect(review.sharing_preview).toMatchObject({
      audience: 'SAME_TENANT_INTERNAL_REVIEW_ONLY',
      recipient: null,
      delivery: 'BLOCKED',
      partner_discovery: 'NOT_PERFORMED',
      cross_tenant_access: 'BLOCKED',
    });
    expect(Object.keys(review.sharing_preview.content).sort()).toEqual(
      [
        'organization_id',
        'property_id',
        'estimate_id',
        'version_id',
        'version_number',
        'saved_lock_revision',
        'job_id',
        'job_revision',
        'scope_line_ids',
      ].sort(),
    );
    expect(review.sharing_preview.content.scope_line_ids).toEqual(
      f.input.scope_line_ids,
    );
    expect(review.source.content_sha256).toMatch(/^[a-f0-9]{64}$/);
    const { integrity, ...body } = review;
    expect(integrity.content_sha256).toBe(
      Buffer.from(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify(body)),
        ),
      ).toString('hex'),
    );
    expect(Object.isFrozen(review.sharing_preview.content.scope_line_ids)).toBe(
      true,
    );
    expect(Object.values(review.authority).every((v) => v === false)).toBe(
      true,
    );
    expect(writers.every((writer) => writer.mock.calls.length === 0)).toBe(
      true,
    );
    expect(await f.repo.jobs(f.company.id)).toEqual(jobs);
    expect(await f.repo.history(f.company.id, f.target.estimate_id)).toEqual(
      history,
    );
    expect(await reconcileStormNetworkReview(review)).toEqual({
      state: 'CURRENT_REVIEW_ONLY',
      reason: 'EXACT_SOURCE_MATCH',
      replay: 'FORBIDDEN',
      replacement: null,
    });
  },
);
it('strictly excludes private details and personal/contact/incident content from share content', async () => {
  const f = await fixture(0, true);
  f.input.incident_label =
    'HUMAN LABEL contact private@example.invalid 555-0100';
  const review = await prepare(f),
    shared = JSON.stringify(review.sharing_preview.content),
    all = JSON.stringify({
      source: review.source,
      triage: review.triage,
      shared: review.sharing_preview.content,
    });
  for (const text of [
    'PRIVATE',
    'internal_notes',
    'internal_note',
    'unit_cost_minor',
    'supplier_cost',
    'cash_hour',
    'margin',
    'payroll',
    'email',
    'phone',
    'workers',
    'rates',
    'deductions',
  ])
    expect(all).not.toContain(text);
  for (const text of [
    'HUMAN LABEL',
    'private@example',
    '555-0100',
    'customer_id',
    'description',
    'incident_label',
    'conditions',
    'amount',
    'weather',
    'address',
    'reviewer',
  ])
    expect(shared).not.toContain(text);
  expect(all).not.toContain(f.bundle.version.payload.internal_notes);
});
it.each(['low', 'normal', 'high', 'urgent'] as const)(
  'uses existing explicit manual priority %s without deciding physical severity',
  async (priority) => {
    const f = await fixture();
    f.input.manual_priority = priority;
    const review = await prepare(f);
    expect(review.triage.manual_priority).toBe(priority);
    expect(review.triage.physical_condition).toBe('UNVERIFIED');
    expect(review.unverified.safety_and_legal_acceptance).toBe('UNVERIFIED');
  },
);
it('supports an explicitly unassessed incident with no invented line association or issued job', async () => {
  const f = await fixture();
  f.input.conditions = ['CONDITION_NOT_YET_ASSESSED'];
  f.input.scope_line_ids = [];
  f.input.reported_on = null;
  const source = await readPrototypeSource(f.repo, f.target, f.gate);
  const review = await prepare(f);
  expect(review.triage).toMatchObject({
    reported_on: null,
    property_snapshot: source.snapshot.property_snapshot,
    job_association: 'NOT_SELECTED',
    source_scope: [],
  });
  expect(review.triage.review_tasks[0].source_line_ids).toEqual([]);
  expect(review.sharing_preview.content.job_id).toBeNull();
});
it('retains immutable proposal bytes when the human selection changes', async () => {
  const f = await fixture(),
    review = await prepare(f),
    before = JSON.stringify(review);
  f.input.manual_priority = 'urgent';
  expect(await reconcileStormNetworkReview(review)).toMatchObject({
    state: 'STALE',
    reason: 'HUMAN_SELECTION_CHANGED',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  expect(JSON.stringify(review)).toBe(before);
});
it('rejects edited source drafts as stale without finding a replacement estimate', async () => {
  const f = await fixture(),
    review = await prepare(f),
    before = JSON.stringify(review);
  await f.repo.save(f.company.id, f.bundle, {
    ...f.bundle.version.payload,
    customer_notes: 'Edited current source',
  });
  expect(await reconcileStormNetworkReview(review)).toMatchObject({
    state: 'STALE',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  expect(JSON.stringify(review)).toBe(before);
});
it('clone/import/lost session binding remains UNKNOWN rather than an authority or replay token', async () => {
  const f = await fixture(),
    review = await prepare(f);
  expect(
    await reconcileStormNetworkReview(structuredClone(review)),
  ).toMatchObject({ state: 'UNKNOWN', replacement: null, replay: 'FORBIDDEN' });
});
it('lost exact source acknowledgment stays UNKNOWN with no replay, discovery or replacement', async () => {
  const f = await fixture(),
    review = await prepare(f);
  const reader = vi
    .spyOn(f.repo, 'readSyntheticPrototypeSources')
    .mockImplementation(() => {
      throw Error('Source acknowledgment uncertain');
    });
  expect(await reconcileStormNetworkReview(review)).toMatchObject({
    state: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  expect(await reconcileStormNetworkReview(review)).toMatchObject({
    state: 'UNKNOWN',
    replacement: null,
  });
  expect(reader).toHaveBeenCalledTimes(2);
});
it.each([
  undefined,
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
  { enabled: 'true', confirmed: true },
])(
  'requires exact default-off confirmation %s before source reads',
  async (gate) => {
    const f = await fixture(),
      source = vi.spyOn(f.repo, 'readSyntheticPrototypeSources');
    await expect(
      prepareStormNetworkReview(
        f.repo,
        f.target,
        f.input,
        gate as typeof f.gate,
      ),
    ).rejects.toThrow();
    expect(source).not.toHaveBeenCalled();
  },
);
it('connected repositories are unavailable before any operational read', async () => {
  const f = await fixture(),
    connected = new Phase3Repository(new Operations(false)),
    source = vi.spyOn(connected, 'readSyntheticPrototypeSources');
  await expect(
    prepareStormNetworkReview(connected, f.target, f.input, f.gate),
  ).rejects.toThrow('synthetic');
  expect(source).not.toHaveBeenCalled();
});
it.each([
  'organization_id',
  'actor_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'version_id',
  'job_id',
] as const)(
  'rejects foreign exact %s and never selects another source',
  async (key) => {
    const f = await fixture(0, true);
    f.target[key] = 'foreign-source';
    await expect(prepare(f)).rejects.toThrow();
  },
);
it('does not grant estimator or field-staff review authority', async () => {
  for (const role of ['estimator', 'field']) {
    const f = await fixture();
    f.target.actor_id = f.company.id + '-' + role;
    await expect(prepare(f)).rejects.toThrow('owner/admin');
  }
});
it('actual revoked or downgraded administrative membership blocks review and reconciliation', async () => {
  const f = await fixture(),
    user = f.company.id + '-estimator';
  await f.ops.manageMember(f.company.id, user, true, 'admin', 'office_manager');
  f.target.actor_id = user;
  const review = await prepare(f);
  await f.ops.manageMember(
    f.company.id,
    user,
    false,
    'admin',
    'office_manager',
  );
  await expect(prepare(f)).rejects.toThrow('owner/admin');
  expect(await reconcileStormNetworkReview(review)).toMatchObject({
    state: 'UNKNOWN',
    replacement: null,
  });
});
it.each(['foreign', 'duplicate', 'excluded'])(
  'denies %s scope associations',
  async (kind) => {
    const f = await fixture(kind === 'excluded' ? 2 : 0);
    if (kind === 'foreign') f.input.scope_line_ids = ['foreign-source-line'];
    if (kind === 'duplicate')
      f.input.scope_line_ids.push(f.input.scope_line_ids[0]);
    if (kind === 'excluded') {
      const excluded = f.bundle.version.calculation.lines.find(
        (line) => !line.included,
      )!;
      expect(excluded).toBeDefined();
      f.input.scope_line_ids = [excluded.id];
    }
    await expect(prepare(f)).rejects.toThrow();
  },
);
it.each(['bad', '2026-02-30', '2026-11-01T10:00'])(
  'denies invalid incident date %s',
  async (date) => {
    const f = await fixture();
    f.input.reported_on = date;
    await expect(prepare(f)).rejects.toThrow();
  },
);
it.each([
  'label',
  'priority',
  'condition',
  'duplicate-condition',
  'empty-condition',
  'purpose',
  'oversize',
  'missing',
  'extra',
  'symbol',
])('denies malformed %s input', async (kind) => {
  const f = await fixture();
  if (kind === 'label') f.input.incident_label = 'x'.repeat(161);
  if (kind === 'priority')
    Object.assign(f.input, { manual_priority: 'resolved' });
  if (kind === 'condition')
    Object.assign(f.input, { conditions: ['REPAIRED'] });
  if (kind === 'duplicate-condition')
    f.input.conditions.push(f.input.conditions[0]);
  if (kind === 'empty-condition') f.input.conditions = [];
  if (kind === 'purpose')
    Object.assign(f.input, { sharing_purpose: 'PUBLIC_CONTRACTOR_NETWORK' });
  if (kind === 'oversize')
    f.input.scope_line_ids = Array.from({ length: 17 }, () =>
      crypto.randomUUID(),
    );
  if (kind === 'missing')
    delete (f.input as Partial<typeof f.input>).reported_on;
  if (kind === 'extra')
    Object.assign(f.input, { recipient: 'someone@example.invalid' });
  if (kind === 'symbol') Object.assign(f.input, { [Symbol('private')]: true });
  await expect(prepare(f)).rejects.toThrow();
});
it.each(['input', 'row', 'target', 'gate', 'serializer'])(
  'does not invoke %s getters or serializers',
  async (kind) => {
    const f = await fixture(),
      getter = vi.fn(() => 'unexpected');
    if (kind === 'input')
      Object.defineProperty(f.input, 'incident_label', { get: getter });
    if (kind === 'row')
      Object.defineProperty(f.input.scope_line_ids, 0, { get: getter });
    if (kind === 'target')
      Object.defineProperty(f.target, 'customer_id', { get: getter });
    if (kind === 'gate')
      Object.defineProperty(f.gate, 'enabled', { get: getter });
    if (kind === 'serializer') Object.assign(f.input, { toJSON: getter });
    await expect(prepare(f)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each(['input', 'target', 'confirmation'])(
  'denies live %s change during initial source hashing',
  async (kind) => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let once = true;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args);
      if (once) {
        once = false;
        if (kind === 'input')
          f.input.conditions = ['EXPOSED_COMPONENT_REPORTED'];
        else if (kind === 'target') f.target.location_id = 'foreign-property';
        else f.gate.confirmed = false;
      }
      return value;
    });
    await expect(prepare(f)).rejects.toThrow();
  },
);
it.each([2, 3])(
  'denies actual draft edits during consumer digest wait %s',
  async (pause) => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let calls = 0;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args);
      if (++calls === pause)
        await f.repo.save(f.company.id, f.bundle, {
          ...f.bundle.version.payload,
          terms: 'Changed at final consumer wait',
        });
      return value;
    });
    await expect(prepare(f)).rejects.toThrow('Stale');
    expect(calls).toBe(3);
  },
);
it('denies actual issued-job revision changes during final consumer verification', async () => {
  const f = await fixture(0, true),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    if (++calls === 3) {
      const job = f.repo.syntheticJob(f.company.id, f.target.job_id!)!;
      await f.repo.projection(f.company.id, job, {
        ...job.projection,
        costs_complete: !job.projection.costs_complete,
      });
    }
    return value;
  });
  await expect(prepare(f)).rejects.toThrow('Stale');
});
it('final verification honors confirmation withdrawal and does not create a review', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    if (++calls === 3) f.gate.confirmed = false;
    return value;
  });
  await expect(prepare(f)).rejects.toThrow('confirmed');
});
it('reconciliation detects a real edit during its final digest without replay', async () => {
  const f = await fixture(),
    review = await prepare(f),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    await f.repo.save(f.company.id, f.bundle, {
      ...f.bundle.version.payload,
      terms: 'Changed while reconciling',
    });
    return value;
  });
  expect(await reconcileStormNetworkReview(review)).toMatchObject({
    state: 'STALE',
    replacement: null,
    replay: 'FORBIDDEN',
  });
});
