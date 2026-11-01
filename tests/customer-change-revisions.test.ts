import { afterEach, expect, it, vi } from 'vitest';
import { CustomerChangeWorkspace } from '../src/lib/customer-change-workspace';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { sampleCompanies } from '../src/domain/platform';
import { ReleasePreview } from '../src/domain/release/preview';

afterEach(() => vi.restoreAllMocks());
async function setup(index = 0, versionIndex = 1) {
  const repo = new PropertyRepository(new Operations(true));
  const workspace = new CustomerChangeWorkspace(repo),
    company = sampleCompanies[index];
  const model = workspace.customer(company);
  await model.login();
  await model.prepareHistory();
  await model.prepare();
  const data = model.read(),
    org = company.id,
    actor = workspace.reviewer(org);
  const receipt = await model.respond(
    data.reviews[versionIndex].version_id,
    'changes_requested',
    true,
    'Please retain the original scope. <script>not executable</script>',
  );
  return { repo, workspace, company, model, data, org, actor, receipt };
}
it.each([0, 1, 2])(
  'company %i actual receipt -> staff confirmation -> existing version engine -> editable private draft',
  async (index) => {
    const { repo, workspace, model, org, actor, receipt } = await setup(index);
    model.logout(); // customer session lifecycle does not fabricate or erase the shared receipt
    const requests = workspace.requests(org, actor);
    expect(requests).toHaveLength(1);
    expect(requests[0].receipt).toEqual(receipt);
    const review = await workspace.review(org, actor, receipt.id);
    const original = structuredClone(review.source.version);
    const jobs = await repo.estimates.jobs(org);
    const command = vi.spyOn(ReleasePreview.prototype, 'command');
    const revision = await workspace.prepare(review, true);
    expect(command).not.toHaveBeenCalled();
    expect(revision.version).toMatchObject({
      status: 'draft',
      version_number: 3,
      supersedes_version_id: original.id,
      lock_revision: 1,
    });
    expect(revision.estimate.id).toBe(original.estimate_id);
    expect(revision.version.payload).toEqual(original.payload);
    expect(revision.version.calculation).toEqual(original.calculation);
    expect(
      (await repo.estimates.get(org, original.estimate_id, original.id))
        .version,
    ).toEqual(original);
    const origin = repo.estimates.customerRevisionOrigin(
      org,
      original.estimate_id,
    )!;
    expect(origin.receipt).toEqual(receipt);
    expect(origin.draft_version_id).toBe(revision.version.id);
    expect(origin.reviewed_by).toBe(actor);
    const payload = structuredClone(revision.version.payload);
    payload.project.description = 'Staff-revised scope after explicit review';
    payload.internal_notes = 'PRIVATE-STAFF-ONLY';
    payload.lines[0].unit_price_minor = 78000;
    const saved = await repo.estimates.save(org, revision, payload);
    expect(saved.version.lock_revision).toBe(2);
    await expect(repo.estimates.save(org, revision, payload)).rejects.toThrow(
      'changed',
    );
    for (const action of [
      () => repo.estimates.issue(org, saved),
      () => repo.estimates.duplicate(sampleCompanies[index], saved),
      () => repo.estimates.revise(org, saved),
      () => repo.estimates.approveJob(org, saved),
    ])
      await expect(action()).rejects.toThrow();
    expect(await repo.estimates.jobs(org)).toEqual(jobs);
    expect(workspace.requests(org, actor)[0].receipt).toEqual(receipt);
    await model.login();
    expect(model.read().reviews).toHaveLength(2);
    expect(JSON.stringify(model.read())).not.toMatch(
      /PRIVATE-STAFF|reviewed_by|unit_cost_minor|markup_bps|draft_version_id/,
    );
    expect(model.read().responses[1].receipt_id).toBe(receipt.id);
    expect(repo.portal(org, receipt.customer_id).contracts).toEqual([]);
    expect(repo.portal(org, receipt.customer_id).invoices).toEqual([]);
  },
);
it('confirmation is mandatory, and ordinary revision cannot bypass customer review', async () => {
  const { workspace, repo, org, actor, receipt } = await setup();
  const review = await workspace.review(org, actor, receipt.id);
  await expect(workspace.prepare(review, false)).rejects.toThrow(
    'confirmation',
  );
  await expect(repo.estimates.revise(org, review.source)).rejects.toThrow(
    'Review',
  );
  expect(
    await repo.estimates.history(org, review.source.estimate.id),
  ).toHaveLength(2);
});
it('two simultaneous preparations produce only one draft; later attempts cannot replay', async () => {
  const { workspace, repo, org, actor, receipt } = await setup();
  const review = await workspace.review(org, actor, receipt.id);
  const results = await Promise.allSettled([
    workspace.prepare(review, true),
    workspace.prepare(review, true),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  await expect(workspace.prepare(review, true)).rejects.toThrow(
    'already attempted',
  );
  expect(
    await repo.estimates.history(org, review.source.estimate.id),
  ).toHaveLength(3);
});
it.each(['before', 'after'])(
  'lost %s-commit result stays UNKNOWN, exact reads only, no replacement',
  async (when) => {
    const { workspace, repo, org, actor, receipt } = await setup();
    const review = await workspace.review(org, actor, receipt.id);
    const real = repo.estimates.prepareSyntheticCustomerRevision.bind(
      repo.estimates,
    );
    const write = vi
      .spyOn(repo.estimates, 'prepareSyntheticCustomerRevision')
      .mockImplementation(async (...args) => {
        if (when === 'after') await real(...args);
        throw Error('Lost acknowledgment');
      });
    await expect(workspace.prepare(review, true)).rejects.toThrow('UNKNOWN');
    expect(workspace.requests(org, actor)[0].outcome).toBe('unknown');
    await expect(workspace.prepare(review, true)).rejects.toThrow(
      'already attempted',
    );
    const result = await workspace.reconcile(org, actor, receipt.id);
    expect(result.status).toBe(when === 'after' ? 'prepared' : 'undetermined');
    expect(write).toHaveBeenCalledTimes(1);
    expect(
      await repo.estimates.history(org, review.source.estimate.id),
    ).toHaveLength(when === 'after' ? 3 : 2);
  },
);
it('stale earlier-version request cannot create a revision or alter the current issued scope', async () => {
  const { workspace, repo, org, actor, receipt } = await setup(0, 0);
  const review = await workspace.review(org, actor, receipt.id);
  expect(review.blocked).not.toBe('');
  await expect(workspace.prepare(review, true)).rejects.toThrow();
  await expect(repo.estimates.revise(org, review.source)).rejects.toThrow();
  expect(
    await repo.estimates.history(org, review.source.estimate.id),
  ).toHaveLength(2);
});
it.each(['note', 'property', 'customer', 'source', 'actor', 'token'])(
  'tampered review %s rejects before engine mutation',
  async (field) => {
    const { workspace, repo, org, actor, receipt } = await setup();
    const review = structuredClone(
      await workspace.review(org, actor, receipt.id),
    );
    if (field === 'note') review.request.receipt.note = 'forged';
    if (field === 'property') review.request.location_id = 'foreign';
    if (field === 'customer')
      review.source.version.payload.customer_id = 'foreign';
    if (field === 'source') review.source.version.id = 'foreign';
    if (field === 'actor') review.actor = 'foreign';
    if (field === 'token') review.token = 'forged';
    // Caller-supplied copies must match every reviewed field, not only a caller token.
    await expect(workspace.prepare(review, true)).rejects.toThrow();
    expect(
      await repo.estimates.history(org, review.source.estimate.id),
    ).toHaveLength(2);
  },
);
it('current membership is checked after waits and when editing; field staff/foreign users denied', async () => {
  const { workspace, repo, org, actor, receipt } = await setup();
  for (const user of ['foreign', org + '-field', 'sample-construction-owner']) {
    expect(() => workspace.requests(org, user)).toThrow();
    await expect(workspace.review(org, user, receipt.id)).rejects.toThrow();
  }
  const review = await workspace.review(org, actor, receipt.id);
  const members = vi.spyOn(repo.operations, 'syntheticMemberships');
  members.mockReturnValue([]);
  await expect(workspace.prepare(review, true)).rejects.toThrow();
  members.mockRestore();
  const draft = await workspace.prepare(review, true);
  vi.spyOn(repo.operations, 'syntheticMemberships').mockReturnValue([]);
  await expect(
    repo.estimates.save(org, draft, draft.version.payload),
  ).rejects.toThrow();
});
it('wrong company receipts and property rebinding reject, while empty queues create no fixtures', async () => {
  const { workspace, repo, org, actor, receipt } = await setup();
  const other = sampleCompanies[1];
  await repo.initialize(other);
  expect(workspace.requests(other.id, workspace.reviewer(other.id))).toEqual(
    [],
  );
  await expect(
    workspace.review(other.id, workspace.reviewer(other.id), receipt.id),
  ).rejects.toThrow();
  const review = await workspace.review(org, actor, receipt.id);
  const draft = await workspace.prepare(review, true);
  for (const patch of [{ customer_id: 'foreign' }, { location_id: 'foreign' }])
    await expect(
      repo.estimates.save(org, draft, { ...draft.version.payload, ...patch }),
    ).rejects.toThrow('immutable');
});

it.each([
  'admin',
  'office_manager',
  'estimator',
  'field_staff',
  'employee',
  'inactive',
])('current staff eligibility: %s', async (kind) => {
  const { workspace, repo, org, receipt } = await setup();
  const actor = org + '-field';
  await repo.operations.manageMember(
    org,
    actor,
    kind !== 'inactive',
    kind === 'admin' ? 'admin' : 'staff',
    kind === 'admin' ? 'office_manager' : kind,
  );
  if (['admin', 'office_manager', 'estimator'].includes(kind)) {
    const review = await workspace.review(org, actor, receipt.id);
    expect((await workspace.prepare(review, true)).version.status).toBe(
      'draft',
    );
  } else
    await expect(workspace.review(org, actor, receipt.id)).rejects.toThrow();
});
it('revocation at engine entry holds UNKNOWN with no revision, no automatic retry', async () => {
  const { workspace, repo, org, actor, receipt } = await setup();
  const review = await workspace.review(org, actor, receipt.id);
  const real = repo.estimates.prepareSyntheticCustomerRevision.bind(
    repo.estimates,
  );
  vi.spyOn(
    repo.estimates,
    'prepareSyntheticCustomerRevision',
  ).mockImplementation(async (...args) => {
    vi.spyOn(repo.operations, 'syntheticMemberships').mockReturnValue([]);
    return real(...args);
  });
  await expect(workspace.prepare(review, true)).rejects.toThrow('UNKNOWN');
  vi.restoreAllMocks();
  expect(
    await repo.estimates.history(org, review.source.estimate.id),
  ).toHaveLength(2);
  await expect(workspace.prepare(review, true)).rejects.toThrow(
    'already attempted',
  );
  expect((await workspace.reconcile(org, actor, receipt.id)).status).toBe(
    'undetermined',
  );
});
it('archival after review makes the review stale without manufacturing a revision', async () => {
  const { workspace, repo, org, actor, receipt } = await setup();
  const review = await workspace.review(org, actor, receipt.id);
  await repo.estimates.archive(org, review.source.estimate.id, true);
  await expect(workspace.prepare(review, true)).rejects.toThrow('stale');
  expect(
    await repo.estimates.history(org, review.source.estimate.id),
  ).toHaveLength(2);
});
it('repair-origin drafts remain restricted through ordinary and customer revision entry points', async () => {
  const { repo, company, org, actor, receipt } = await setup();
  const { prepareMaintenanceExamples } =
    await import('../src/lib/maintenance-examples');
  await prepareMaintenanceExamples(repo, org, actor);
  const row = repo.maintenance(org, actor).items[0];
  const review = await repo.reviewRepair(company, actor, row.source, 0);
  const repair = await repo.findingEstimate(
    company,
    actor,
    row.source,
    review.id,
  );
  await expect(repo.estimates.revise(org, repair)).rejects.toThrow(
    'Maintenance repair',
  );
  await expect(
    repo.estimates.prepareSyntheticCustomerRevision(
      org,
      repair,
      {
        organization_id: org,
        customer_id: receipt.customer_id,
        location_id: row.source.location_id,
        estimate_id: repair.estimate.id,
        source_version_id: repair.version.id,
        source_version_number: 1,
        offer_id: receipt.offer_id,
        receipt,
        reviewed_by: actor,
        reviewed_at: new Date().toISOString(),
      },
      () => {},
    ),
  ).rejects.toThrow('repair origins');
  expect(await repo.estimates.history(org, repair.estimate.id)).toHaveLength(1);
});

it('returning from staff preserves original customer/property after CRM order changes, and missing context fails closed', async () => {
  const { model, repo, org, data } = await setup();
  model.logout();
  // Existing CRM records can reorder independently of the pinned customer session.
  const read = repo.read.bind(repo);
  const original = read(org);
  vi.spyOn(repo, 'read').mockImplementation((o) => ({
    ...read(o),
    contexts: [
      {
        ...original.contexts[0],
        customer_id: 'other-customer',
        location_id: 'other-property',
      },
      ...original.contexts,
    ],
  }));
  await model.login();
  expect(model.read().context.customer_id).toBe(data.context.customer_id);
  expect(model.read().context.location_id).toBe(data.context.location_id);
  model.logout();
  vi.spyOn(repo, 'read').mockReturnValue({ ...original, contexts: [] });
  await expect(model.login()).rejects.toThrow(
    'Original customer property unavailable',
  );
});

it('shares actual estimate and CRM state without leaking portal inspection fixtures into staff maintenance', async () => {
  const operations = new Operations(true);
  const customerRepo = new PropertyRepository(operations);
  const staffRepo = new PropertyRepository(operations);
  const workspace = new CustomerChangeWorkspace(customerRepo);
  const company = sampleCompanies[0],
    org = company.id;
  const model = workspace.customer(company);
  await model.login();
  await model.prepareHistory();
  await model.prepare();
  model.prepareAttentionExamples();
  model.prepareComparisonExamples();
  await staffRepo.initialize(company);
  expect(staffRepo.estimates).toBe(customerRepo.estimates);
  expect(staffRepo.operations).toBe(customerRepo.operations);
  expect(customerRepo.read(org).reports.length).toBeGreaterThan(0);
  expect(staffRepo.read(org).reports).toEqual([]);
  const actor = workspace.reviewer(org);
  expect(staffRepo.maintenance(org, actor).items).toEqual([]);
  const data = model.read();
  const receipt = await model.respond(
    data.reviews[1].version_id,
    'changes_requested',
    true,
    'Please review this actual scope.',
  );
  const review = await workspace.review(org, actor, receipt.id);
  const draft = await workspace.prepare(review, true);
  expect(
    (await staffRepo.estimates.get(org, draft.estimate.id)).version.id,
  ).toBe(draft.version.id);
  expect(staffRepo.maintenance(org, actor).items).toEqual([]);
});
