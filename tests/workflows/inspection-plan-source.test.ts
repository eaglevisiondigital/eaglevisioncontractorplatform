import { expect, it, vi } from 'vitest';
import { Operations } from '../../src/lib/operations';
import { PropertyRepository } from '../../src/lib/property';
import { sampleCompanies } from '../../src/domain/platform';
import { industryEstimate } from '../../src/domain/estimating/fixtures';
import { requireInspectionPlanSource } from '../../src/components/property/inspection-plan-source';

async function fixture() {
  const company = sampleCompanies[0],
    repo = new PropertyRepository(new Operations(true));
  await repo.initialize(company);
  const first = repo.read(company.id).contexts[0];
  await repo.operations.saveLocation(company.id, first.customer_id, {
    address_line1: '200 Fictional Second Property',
    address_line2: '',
    city: 'Example',
    region: 'TX',
    postal_code: '00000',
    country_code: 'US',
  });
  const input = industryEstimate(company, first.customer_id);
  input.location_id = first.location_id;
  input.expires_on = '2099-12-31';
  input.tax_policy_id = (await repo.estimates.taxes(company.id))[0].id;
  const issued = await repo.estimates.issue(
      company.id,
      await repo.estimates.create(company, input),
    ),
    jobId = await repo.estimates.approveJob(company.id, issued);
  await repo.refreshContexts(company.id);
  const contexts = repo.read(company.id).contexts,
    correct = contexts.find(
      (c) => c.job_id === jobId && c.location_id === first.location_id,
    )!,
    wrong = contexts.find(
      (c) => c.job_id === jobId && c.location_id !== first.location_id,
    )!;
  const writer = vi.spyOn(repo, 'createPlan');
  const create = async (context = correct, current = () => true) => {
    const checked = await requireInspectionPlanSource(
      repo,
      company.id,
      context,
      current,
    );
    if (!current()) throw Error('Context changed');
    return repo.createPlan(
      company.id,
      checked,
      'Exact fictional property survey',
    );
  };
  return { company, repo, issued, jobId, correct, wrong, writer, create };
}
it('creates and reopens a plan for only the exact issued customer/property/job source', async () => {
  const f = await fixture(),
    p = await f.create();
  expect(p).toMatchObject({
    organization_id: f.company.id,
    customer_id: f.correct.customer_id,
    location_id: f.correct.location_id,
    job_id: f.jobId,
  });
  expect(
    f.repo.read(f.company.id).plans.find((plan) => plan.id === p.id),
  ).toEqual(p);
  expect(f.writer).toHaveBeenCalledTimes(1);
});
it('denies the raw reader synthesized property-B/job-A relationship before the original writer', async () => {
  const f = await fixture(),
    before = f.repo.read(f.company.id).plans;
  await expect(f.create(f.wrong)).rejects.toThrow(/relationship UNKNOWN/);
  expect(f.writer).not.toHaveBeenCalled();
  expect(f.repo.read(f.company.id).plans).toEqual(before);
});
it.each(['customer', 'property', 'version', 'status'] as const)(
  'denies missing or conflicting issued %s evidence',
  async (mode) => {
    const f = await fixture(),
      source = structuredClone(f.issued);
    if (mode === 'customer')
      source.version.payload.customer_id = crypto.randomUUID();
    if (mode === 'property') source.version.payload.location_id = null;
    if (mode === 'version') source.version.id = crypto.randomUUID();
    if (mode === 'status') source.version.status = 'draft';
    vi.spyOn(f.repo.estimates, 'sourceEstimate').mockResolvedValue(source);
    await expect(f.create()).rejects.toThrow(/UNKNOWN/);
    expect(f.writer).not.toHaveBeenCalled();
  },
);
it.each(['crm', 'estimates'] as const)(
  'revoked %s planning permission after source lookup denies creation',
  async (key) => {
    const f = await fixture(),
      access = await f.repo.operations.companyAccess(f.company.id);
    vi.spyOn(f.repo.operations, 'companyAccess')
      .mockResolvedValueOnce(access)
      .mockResolvedValue({ ...access, [key]: false });
    await expect(f.create()).rejects.toThrow(/planning access/);
    expect(f.writer).not.toHaveBeenCalled();
  },
);
it('denies changed source during the lookup without replacing the selected property/job', async () => {
  const f = await fixture(),
    original = f.repo.estimates.syntheticJob.bind(f.repo.estimates),
    source = original(f.company.id, f.jobId)!;
  vi.spyOn(f.repo.estimates, 'syntheticJob')
    .mockReturnValueOnce(source)
    .mockReturnValue({
      ...source,
      baseline: { ...source.baseline, issued_version_id: crypto.randomUUID() },
    });
  await expect(f.create()).rejects.toThrow(/source changed/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('does not continue after the original selection generation changes during a source read', async () => {
  const f = await fixture(),
    read = f.repo.estimates.sourceEstimate.bind(f.repo.estimates);
  let current = true;
  vi.spyOn(f.repo.estimates, 'sourceEstimate').mockImplementation(
    async (...args) => {
      const source = await read(...args);
      current = false;
      return source;
    },
  );
  await expect(f.create(f.correct, () => current)).rejects.toThrow(/context/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('denies foreign context before any source read or writer', async () => {
  const f = await fixture(),
    read = vi.spyOn(f.repo.estimates, 'sourceEstimate');
  await expect(
    requireInspectionPlanSource(
      f.repo,
      sampleCompanies[1].id,
      f.correct,
      () => true,
    ),
  ).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
  expect(f.writer).not.toHaveBeenCalled();
});
it('preserves explicit property-only survey creation without fabricating a job relationship', async () => {
  const f = await fixture(),
    customer = await f.repo.operations.saveCustomer(f.company.id, {
      display_name: 'Fictional property-only customer',
      email: 'property-only@example.test',
      phone: '',
      customer_type: 'residential',
      preferred_contact: 'phone',
    });
  await f.repo.operations.saveLocation(f.company.id, customer.id, {
    address_line1: '300 Fictional Property',
    address_line2: '',
    city: 'Example',
    region: 'TX',
    postal_code: '00000',
    country_code: 'US',
  });
  await f.repo.refreshContexts(f.company.id);
  const context = f.repo
    .read(f.company.id)
    .contexts.find((c) => c.customer_id === customer.id)!;
  expect(context.job_id).toBeNull();
  const read = vi.spyOn(f.repo.estimates, 'sourceEstimate'),
    plan = await f.create(context);
  expect(plan.job_id).toBeNull();
  expect(plan.customer_id).toBe(customer.id);
  expect(read).not.toHaveBeenCalled();
});
it('rechecks canonical CRM presence after the issued-source read before creating anything', async () => {
  const f = await fixture(),
    read = f.repo.estimates.sourceEstimate.bind(f.repo.estimates);
  vi.spyOn(f.repo.estimates, 'sourceEstimate').mockImplementation(
    async (...args) => {
      const source = await read(...args);
      vi.spyOn(f.repo.operations, 'syntheticEstimateCrm').mockImplementation(
        () => {
          throw Error('CRM customer/property unavailable');
        },
      );
      return source;
    },
  );
  await expect(f.create()).rejects.toThrow(
    /CRM customer\/property unavailable/,
  );
  expect(f.writer).not.toHaveBeenCalled();
});
