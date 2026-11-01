import { it, expect, vi } from 'vitest';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { sampleCompanies } from '../src/domain/platform';
import { prepareMaintenanceExamples } from '../src/lib/maintenance-examples';
import type { MaintenanceSource } from '../src/domain/property/maintenance';

async function fixture(index = 0) {
  const company = sampleCompanies[index],
    org = company.id,
    actor = org + '-owner';
  const repo = new PropertyRepository(new Operations(true));
  await repo.initialize(company);
  await prepareMaintenanceExamples(repo, org, actor);
  const row = repo.maintenance(org, actor).items[0];
  const review = await repo.reviewRepair(company, actor, row.source, 0);
  return { company, org, actor, repo, row, review };
}
it.each([0, 1, 2])(
  'company %s prepares one exact separate draft with immutable provenance and unchanged baselines',
  async (index) => {
    const { company, org, actor, repo, row, review } = await fixture(index);
    const before = repo.read(org),
      jobs = await repo.estimates.jobs(org),
      estimates = await repo.estimates.list(org);
    const history = await repo.estimates.history(
      org,
      before.bundle.estimate.id,
    );
    await repo.saveMaintenance(org, actor, row.source, 0, {
      priority: 'urgent',
      assignee_id: org + '-field',
      review: 'reviewed',
      follow_up_on: '2026-12-01',
      note: 'PRIVATE follow-up note',
    });
    await expect(
      repo.findingEstimate(company, actor, row.source, review.id),
    ).rejects.toThrow('changed');
    const fresh = await repo.reviewRepair(company, actor, row.source, 1);
    const b = await repo.findingEstimate(company, actor, row.source, fresh.id);
    const opened = await repo.openRepair(org, actor, row.source);
    expect(opened.provenance).toMatchObject({
      source: row.source,
      job_id: row.job_id,
      estimate_id: b.estimate.id,
      draft_version_id: b.version.id,
      draft_version_number: 1,
      prepared_by: actor,
      preparation_id: fresh.id,
    });
    expect(b.version.payload).toMatchObject({
      customer_id: row.source.customer_id,
      location_id: row.source.location_id,
      tax_policy_id: null,
      internal_notes: '',
    });
    expect(b.version.payload.lines).toHaveLength(1);
    expect(b.version.payload.lines[0]).toMatchObject({
      description: row.finding.recommendation,
      unit_cost_minor: 0,
      unit_price_minor: 0,
      markup_bps: 0,
      quantity_milli: 1000,
    });
    expect(
      await repo.estimates.history(org, before.bundle.estimate.id),
    ).toEqual(history);
    expect(await repo.estimates.jobs(org)).toEqual(jobs);
    expect((await repo.estimates.list(org)).length).toBe(estimates.length + 1);
    expect(repo.read(org)).toEqual(before);
    expect(repo.maintenance(org, actor).items[0].record).toMatchObject({
      revision: 1,
      priority: 'urgent',
      review: 'reviewed',
    });
    expect(
      JSON.stringify(repo.portal(org, row.source.customer_id)),
    ).not.toContain('PRIVATE follow-up note');
    opened.provenance.source.finding_id = 'forged';
    expect(
      (await repo.openRepair(org, actor, row.source)).provenance.source,
    ).toEqual(row.source);
  },
);
it('replays return the same draft without appended lines; concurrent attempts cannot create two drafts', async () => {
  const { repo, company, org, actor, row, review } = await fixture();
  const results = await Promise.allSettled([
    repo.findingEstimate(company, actor, row.source, review.id),
    repo.findingEstimate(company, actor, row.source, review.id),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const b = await repo.findingEstimate(company, actor, row.source, review.id);
  expect(
    await repo.findingEstimate(company, actor, row.source, review.id),
  ).toEqual(b);
  expect(b.version.payload.lines).toHaveLength(1);
  await expect(
    repo.reviewRepair(company, actor, row.source, 0),
  ).rejects.toThrow('already attempted');
  expect(await repo.estimates.list(org)).toHaveLength(2);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'report_id',
  'finding_id',
  'report_version',
] as const)(
  'rejects a wrong %s before preparation or estimate access',
  async (field) => {
    const { repo, company, org, actor, row, review } = await fixture();
    const source = {
      ...row.source,
      [field]: field === 'report_version' ? 999 : crypto.randomUUID(),
    } as MaintenanceSource;
    await expect(
      repo.findingEstimate(company, actor, source, review.id),
    ).rejects.toThrow();
    expect(await repo.estimates.list(org)).toHaveLength(1);
    expect(repo.repairAttempt(org, actor, row.source)).toBeNull();
  },
);
it('requires the original reviewed token and actor, never a modified proposed payload', async () => {
  const { repo, company, org, actor, row, review } = await fixture();
  review.payload.customer_id = crypto.randomUUID();
  review.payload.lines[0].unit_cost_minor = 987654;
  await expect(
    repo.findingEstimate(company, org + '-field', row.source, review.id),
  ).rejects.toThrow('reviewer');
  await expect(
    repo.findingEstimate(company, actor, row.source, 'missing'),
  ).rejects.toThrow('review required');
  const b = await repo.findingEstimate(company, actor, row.source, review.id);
  expect(b.version.payload.customer_id).toBe(row.source.customer_id);
  expect(b.version.payload.lines[0].unit_cost_minor).toBe(0);
});
it('separate repeated observations and published versions retain separate draft identities', async () => {
  const { repo, company, org, actor, row, review } = await fixture();
  const b = await repo.findingEstimate(company, actor, row.source, review.id);
  const later = repo.maintenance(org, actor).items[1];
  expect(later.source.finding_id).toBe(row.source.finding_id);
  const r2 = await repo.reviewRepair(company, actor, later.source, 0);
  const b2 = await repo.findingEstimate(company, actor, later.source, r2.id);
  expect(b2.estimate.id).not.toBe(b.estimate.id);
  const visit = repo
    .read(org)
    .visits.find((v) => v.id === row.report.visit_id)!;
  repo.revise(org, visit);
  const revised = repo.read(org).visits.find((v) => v.id === visit.id)!;
  repo.submit(org, revised);
  const published = repo.publish(
    org,
    repo.read(org).visits.find((v) => v.id === visit.id)!,
  );
  const source = {
    ...row.source,
    report_id: published.id,
    report_version: published.version,
  };
  const r3 = await repo.reviewRepair(company, actor, source, 0);
  expect(
    (await repo.findingEstimate(company, actor, source, r3.id)).estimate.id,
  ).not.toBe(b.estimate.id);
  expect(
    (await repo.openRepair(org, actor, row.source)).provenance.source
      .report_version,
  ).toBe(row.source.report_version);
});
it('uses immutable published observations even after a mutable visit draft changes', async () => {
  const { repo, company, org, actor, row, review } = await fixture();
  const v = repo.read(org).visits.find((v) => v.id === row.report.visit_id)!;
  repo.revise(org, v);
  const draft = repo.read(org).visits.find((x) => x.id === v.id)!;
  repo.saveVisit(org, draft, { ...draft.content, findings: [] });
  const b = await repo.findingEstimate(company, actor, row.source, review.id);
  expect(b.version.payload.lines[0].description).toBe(
    row.finding.recommendation,
  );
});
it('no-job property creates a correctly scoped separate draft without a job; stale plan rejects', async () => {
  const { repo, company, org, actor } = await fixture();
  const customer = await repo.operations.saveCustomer(org, {
    display_name: 'Synthetic no-job customer',
    email: null,
    phone: null,
    customer_type: 'residential',
    preferred_contact: 'email',
  });
  await repo.operations.saveLocation(org, customer.id, {
    address_line1: '300 No Job Court',
    address_line2: '',
    city: 'Example',
    region: 'FL',
    postal_code: '00000',
    country_code: 'US',
  });
  await repo.refreshContexts(org);
  const context = repo
    .read(org)
    .contexts.find((c) => c.customer_id === customer.id)!;
  const initialPlan = repo.createPlan(org, context, 'No job inspection');
  const v = repo.addVisit(org, initialPlan.id, '2026-12-01');
  repo.saveVisit(org, v, {
    ...v.content,
    checklist: v.content.checklist.map((c) => ({ ...c, completed: true })),
    findings: [
      {
        id: crypto.randomUUID(),
        category: 'Exterior',
        location: 'Entry',
        severity: 'low',
        description: 'Observed joint',
        recommendation: 'Inspect joint',
        customer_visible: true,
      },
    ],
  });
  repo.submit(
    org,
    repo.read(org).visits.find((x) => x.id === v.id)!,
  );
  const report = repo.publish(
    org,
    repo.read(org).visits.find((x) => x.id === v.id)!,
  );
  const row = repo
    .maintenance(org, actor)
    .items.find((i) => i.source.report_id === report.id)!;
  expect(row.job_id).toBeNull();
  const review = await repo.reviewRepair(company, actor, row.source, 0);
  const plan = repo.read(org).plans.find((p) => p.id === row.plan_id)!;
  repo.savePlan(org, { ...plan, name: 'Updated plan' });
  await expect(
    repo.findingEstimate(company, actor, row.source, review.id),
  ).rejects.toThrow('plan changed');
  const fresh = await repo.reviewRepair(company, actor, row.source, 0);
  const b = await repo.findingEstimate(company, actor, row.source, fresh.id);
  expect(b.version.payload.location_id).toBe(row.source.location_id);
  expect(
    (await repo.openRepair(org, actor, row.source)).provenance.job_id,
  ).toBeNull();
});
it('lost response after commit retains uncertain evidence, blocks retry, and reconciles only the exact existing draft', async () => {
  const { repo, company, org, actor, row, review } = await fixture();
  const create = repo.estimates.createSyntheticRepair.bind(repo.estimates);
  const spy = vi
    .spyOn(repo.estimates, 'createSyntheticRepair')
    .mockImplementationOnce(async (...args) => {
      await create(...args);
      throw Error('Lost response');
    });
  await expect(
    repo.findingEstimate(company, actor, row.source, review.id),
  ).rejects.toThrow('Reconcile');
  expect(repo.repairAttempt(org, actor, row.source)?.status).toBe('uncertain');
  await expect(
    repo.findingEstimate(company, actor, row.source, review.id),
  ).rejects.toThrow('do not retry');
  await expect(repo.openRepair(org, actor, row.source)).rejects.toThrow(
    'Reconcile',
  );
  const b = await repo.openRepair(org, actor, row.source, true);
  expect(b.bundle.version.payload.lines).toHaveLength(1);
  expect(repo.repairAttempt(org, actor, row.source)?.status).toBe('prepared');
  expect(spy).toHaveBeenCalledTimes(1);
});
it('interruption before commit holds the attempt without selecting another estimate or retrying', async () => {
  const { repo, company, org, actor, row, review } = await fixture();
  vi.spyOn(repo.estimates, 'createSyntheticRepair').mockRejectedValueOnce(
    Error('Interrupted'),
  );
  await expect(
    repo.findingEstimate(company, actor, row.source, review.id),
  ).rejects.toThrow('stopped');
  await expect(repo.openRepair(org, actor, row.source, true)).rejects.toThrow(
    'No committed draft identity',
  );
  await expect(
    repo.findingEstimate(company, actor, row.source, review.id),
  ).rejects.toThrow('do not retry');
  expect(await repo.estimates.list(org)).toHaveLength(1);
});
it('rechecks current membership and maintenance revision immediately before the estimating commit', async () => {
  const { repo, company, org, actor, row, review } = await fixture();
  const settings = repo.operations.getSettings.bind(repo.operations);
  vi.spyOn(repo.operations, 'getSettings').mockImplementationOnce(
    async (...args) => {
      const result = await settings(...args);
      vi.spyOn(repo.operations, 'syntheticMemberships').mockReturnValue([]);
      return result;
    },
  );
  await expect(
    repo.findingEstimate(company, actor, row.source, review.id),
  ).rejects.toThrow('reviewer');
  expect(await repo.estimates.list(org)).toHaveLength(1);
});
it.each([
  'customer',
  'property',
  'source line',
  'stale revision',
  'issue',
  'duplicate',
])(
  'repair editor rejects %s changes while normal scope edits remain version-aware',
  async (kind) => {
    const { repo, company, org, actor, row, review } = await fixture();
    const b = await repo.findingEstimate(company, actor, row.source, review.id);
    const p = structuredClone(b.version.payload);
    if (kind === 'customer') p.customer_id = crypto.randomUUID();
    if (kind === 'property') p.location_id = null;
    if (kind === 'source line') p.lines[0].id = crypto.randomUUID();
    if (kind === 'stale revision') await repo.estimates.save(org, b, p);
    const request =
      kind === 'issue'
        ? repo.estimates.issue(org, b)
        : kind === 'duplicate'
          ? repo.estimates.duplicate(company, b)
          : repo.estimates.save(org, b, p);
    await expect(request).rejects.toThrow();
    const fresh = (await repo.openRepair(org, actor, row.source)).bundle;
    const saved = await repo.estimates.save(org, fresh, {
      ...fresh.version.payload,
      lines: fresh.version.payload.lines.map((l) => ({
        ...l,
        description: 'Reviewed scope wording',
        quantity_milli: 2000,
        unit_cost_minor: 100,
        unit_price_minor: 200,
      })),
    });
    expect(
      (await repo.openRepair(org, actor, row.source)).bundle.version
        .lock_revision,
    ).toBe(saved.version.lock_revision);
  },
);
it('connected and cross-company contexts stop before any adapter or unrelated estimate can be read', async () => {
  const connected = new PropertyRepository(new Operations(false));
  const { repo, company, actor, row, review } = await fixture();
  await expect(
    connected.findingEstimate(company, actor, row.source, review.id),
  ).rejects.toThrow('unavailable');
  await repo.initialize(sampleCompanies[1]);
  await expect(
    repo.findingEstimate(
      sampleCompanies[1],
      sampleCompanies[1].id + '-owner',
      row.source,
      review.id,
    ),
  ).rejects.toThrow('source unavailable');
});

it.each(['customer', 'property', 'estimate', 'version', 'tenant', 'issued'])(
  'exact draft navigation rejects a forged %s response without selecting a fallback',
  async (kind) => {
    const { repo, company, org, actor, row, review } = await fixture();
    await repo.findingEstimate(company, actor, row.source, review.id);
    const get = repo.estimates.get.bind(repo.estimates);
    vi.spyOn(repo.estimates, 'get').mockImplementationOnce(async (...args) => {
      const b = await get(...args);
      if (kind === 'customer')
        b.version.payload.customer_id = crypto.randomUUID();
      if (kind === 'property')
        b.version.payload.location_id = crypto.randomUUID();
      if (kind === 'estimate') b.estimate.id = crypto.randomUUID();
      if (kind === 'version') b.version.id = crypto.randomUUID();
      if (kind === 'tenant') b.version.organization_id = 'foreign';
      if (kind === 'issued') b.version.status = 'issued';
      return b;
    });
    await expect(repo.openRepair(org, actor, row.source)).rejects.toThrow(
      'binding unavailable',
    );
  },
);
it.each(['job', 'customer', 'property', 'version'])(
  'review rejects wrong linked baseline %s evidence before creating a repair draft',
  async (kind) => {
    const { repo, company, org, actor, row } = await fixture();
    const get = repo.estimates.sourceEstimate.bind(repo.estimates);
    if (kind === 'job') vi.spyOn(repo.estimates, 'jobs').mockResolvedValue([]);
    else
      vi.spyOn(repo.estimates, 'sourceEstimate').mockImplementationOnce(
        async (...args) => {
          const b = await get(...args);
          if (kind === 'customer')
            b.version.payload.customer_id = crypto.randomUUID();
          if (kind === 'property')
            b.version.payload.location_id = crypto.randomUUID();
          if (kind === 'version') b.version.id = crypto.randomUUID();
          return b;
        },
      );
    await expect(
      repo.reviewRepair(company, actor, row.source, 0),
    ).rejects.toThrow();
    expect(await repo.estimates.list(org)).toHaveLength(1);
  },
);
it('captures request identity before asynchronous preparation; mutating caller objects cannot change provenance', async () => {
  const { repo, company, org, actor, row, review } = await fixture();
  const source = structuredClone(row.source),
    profile = structuredClone(company);
  const pending = repo.findingEstimate(profile, actor, source, review.id);
  source.finding_id = crypto.randomUUID();
  profile.id = 'foreign';
  await pending;
  expect(
    (await repo.openRepair(org, actor, row.source)).provenance.source,
  ).toEqual(row.source);
});
it.each(['revision', 'plan'])(
  'post-wait %s change prevents a commit and holds the interrupted attempt',
  async (kind) => {
    const { repo, company, org, actor, row, review } = await fixture();
    const settings = repo.operations.getSettings.bind(repo.operations);
    vi.spyOn(repo.operations, 'getSettings').mockImplementationOnce(
      async (...args) => {
        const result = await settings(...args);
        if (kind === 'revision')
          await repo.saveMaintenance(org, actor, row.source, 0, {
            priority: 'high',
            assignee_id: null,
            review: 'pending',
            follow_up_on: '',
            note: '',
          });
        else {
          const plan = repo.read(org).plans.find((p) => p.id === row.plan_id)!;
          repo.savePlan(org, {
            ...plan,
            name: 'Changed while awaiting settings',
          });
        }
        return result;
      },
    );
    await expect(
      repo.findingEstimate(company, actor, row.source, review.id),
    ).rejects.toThrow('changed');
    expect(await repo.estimates.list(org)).toHaveLength(1);
    expect(repo.repairAttempt(org, actor, row.source)?.status).toBe(
      'uncertain',
    );
  },
);
