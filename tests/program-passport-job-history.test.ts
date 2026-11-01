import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies, type CompanyProfile } from '../src/domain/platform';
import {
  createPropertyPassportJobHistory,
  readPropertyPassportJobEvidence,
  type PassportJobReference,
} from '../src/domain/property/passport-job-history';
import type { ReportBoundary } from '../src/domain/property/report-page';
import * as hashing from '../src/domain/release/preview';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';

const admitted = { enabled: true };
const unknown = { status: 'UNKNOWN', evidence: null };
afterEach(() => vi.restoreAllMocks());

async function fixture(company: CompanyProfile = sampleCompanies[0]) {
  const operations = new Operations(true);
  const repo = new PropertyRepository(operations);
  const model = new CustomerPortalPreviewModel(company, repo);
  await model.login();
  await model.prepare();
  const { organization_id, customer_id, location_id } = model.read().context;
  const boundary: ReportBoundary = {
    organization_id,
    customer_id,
    location_id,
  };
  const job = (await repo.estimates.jobs(company.id))[0];
  const versions = await repo.estimates.history(
    company.id,
    repo.read(company.id).bundle.estimate.id,
  );
  return { operations, repo, model, boundary, job, versions };
}

function afterReport(
  model: CustomerPortalPreviewModel,
  boundary: ReportBoundary,
) {
  const repo = model.repo;
  const state = repo.read(boundary.organization_id);
  const context = state.contexts.find(
    (c) =>
      c.customer_id === boundary.customer_id &&
      c.location_id === boundary.location_id,
  )!;
  const plan = repo.createPlan(
    boundary.organization_id,
    context,
    'Recorded after-stage documentation',
  );
  let visit = repo.addVisit(
    boundary.organization_id,
    plan.id,
    '2026-12-21',
    'after',
  );
  repo.saveVisit(boundary.organization_id, visit, {
    summary: '<script>Recorded after-stage observations only</script>',
    internal_notes: 'PRIVATE crew pay and margin',
    checklist: [
      {
        id: 'observed',
        label: 'Completion documentation recorded',
        required: true,
        completed: true,
      },
    ],
    findings: [],
  });
  visit = repo
    .read(boundary.organization_id)
    .visits.find((v) => v.id === visit.id)!;
  repo.submit(boundary.organization_id, visit);
  visit = repo
    .read(boundary.organization_id)
    .visits.find((v) => v.id === visit.id)!;
  return { report: repo.publish(boundary.organization_id, visit), plan, visit };
}

it.each(sampleCompanies)(
  '$name joins actual immutable job baselines and exact published after documentation without completion claims or side effects',
  async (company) => {
    const { model, repo, operations, boundary, job, versions } =
      await fixture(company);
    const after = afterReport(model, boundary);
    const before = {
      state: repo.read(company.id),
      customer: model.read(),
      jobs: await repo.estimates.jobs(company.id),
      versions: await repo.estimates.history(
        company.id,
        versions[0].estimate_id,
      ),
      portal: repo.portal(company.id, boundary.customer_id),
    };
    const writer = vi.spyOn(repo, 'publish');
    const issuer = vi.spyOn(repo.estimates, 'issue');
    const baselineWriter = vi.spyOn(repo.estimates, 'approveJob');
    const selector = vi.spyOn(model, 'selectProperty');
    const crmWriter = vi.spyOn(operations, 'saveLocation');
    const packet = await createPropertyPassportJobHistory(
      model,
      boundary,
      admitted,
    );
    expect(packet.snapshot).toMatchObject({
      ...boundary,
      synthetic_only: true,
      history_completeness: 'UNKNOWN',
      physical_proof_of_work: 'UNVERIFIED',
      coverage: 'authorized-issued-jobs-and-available-published-reports',
    });
    expect(packet.snapshot.jobs).toHaveLength(1);
    const documentation = packet.snapshot.jobs[0];
    const issued = versions.find(
      (v) => v.id === job.baseline.issued_version_id,
    )!;
    expect(documentation.issued_source).toMatchObject({
      ...boundary,
      job_id: job.id,
      estimate_id: issued.estimate_id,
      issued_version_id: issued.id,
      issued_version_number: issued.version_number,
      issued_at: issued.issued_at,
      property_binding: 'existing-plan-job-id',
      immutable_property_snapshot: { status: 'UNKNOWN' },
      scope: {
        name: issued.payload.project.name,
        description: issued.payload.project.description,
      },
    });
    expect(documentation).toMatchObject({
      documentation: { status: 'RECORDED' },
      physical_completion: 'UNVERIFIED',
      warranty: 'UNVERIFIED',
      customer_approval: 'UNVERIFIED',
    });
    expect(documentation.documentation.reports).toContainEqual({
      reference: {
        ...boundary,
        kind: 'report',
        report_id: after.report.id,
        published_version: after.report.version,
      },
      visit_id: after.visit.id,
      plan_id: after.plan.id,
    });
    const recorded = packet.snapshot.inspections.snapshot.reports.find(
      (r) => r.reference.report_id === after.report.id,
    )!;
    expect(recorded.phase).toBe('after');
    expect(recorded.observations).toEqual([]);
    expect(recorded.checklist[0].recorded_completed).toBe(true);
    expect(recorded.summary).toBe(after.report.summary);
    expect(documentation.reference.issued_source_sha256).toBe(
      await hashing.documentHash(documentation.issued_source),
    );
    expect(packet.integrity.sha256).toBe(
      await hashing.documentHash(packet.snapshot),
    );
    expect(
      await readPropertyPassportJobEvidence(
        model,
        documentation.reference,
        admitted,
      ),
    ).toEqual({ status: 'AVAILABLE', evidence: documentation });
    expect(
      await createPropertyPassportJobHistory(model, boundary, admitted),
    ).toEqual(packet);
    expect(JSON.stringify(packet)).not.toMatch(
      /PRIVATE|INTERNAL|costs|margin|payroll|unit_cost|unit_price|amount_minor|revenue_minor|rates|workforce|customer_notes|internal_note|terms|repair_readiness|media|https?:/,
    );
    expect({
      state: repo.read(company.id),
      customer: model.read(),
      jobs: await repo.estimates.jobs(company.id),
      versions: await repo.estimates.history(
        company.id,
        versions[0].estimate_id,
      ),
      portal: repo.portal(company.id, boundary.customer_id),
    }).toEqual(before);
    for (const action of [writer, issuer, baselineWriter, selector, crmWriter])
      expect(action).not.toHaveBeenCalled();
  },
);

it('is disabled before reads, never prepares fixtures and refuses connected sources', async () => {
  const { model, boundary } = await fixture();
  const reader = vi.spyOn(model, 'read');
  await expect(
    createPropertyPassportJobHistory(model, boundary),
  ).rejects.toThrow('disabled');
  await expect(
    createPropertyPassportJobHistory(model, boundary, { enabled: false }),
  ).rejects.toThrow('disabled');
  await expect(
    readPropertyPassportJobEvidence(model, {} as PassportJobReference),
  ).rejects.toThrow('disabled');
  expect(reader).not.toHaveBeenCalled();
  Object.defineProperty(model, 'repo', {
    value: new PropertyRepository(new Operations(false)),
  });
  await expect(
    createPropertyPassportJobHistory(model, boundary, admitted),
  ).rejects.toThrow('disabled');
  expect(reader).not.toHaveBeenCalled();
});

it('existing reports and a global job are insufficient before the existing customer issued-version context is prepared', async () => {
  const operations = new Operations(true);
  const repo = new PropertyRepository(operations);
  const model = new CustomerPortalPreviewModel(sampleCompanies[0], repo);
  await model.login();
  await model.prepareHistory();
  const { organization_id, customer_id, location_id } = model.read().context;
  expect(await repo.estimates.jobs(organization_id)).toHaveLength(1);
  const packet = await createPropertyPassportJobHistory(
    model,
    { organization_id, customer_id, location_id },
    admitted,
  );
  expect(packet.snapshot.jobs).toEqual([]);
  expect(packet.snapshot.inspections.snapshot.reports_available).toBe(3);
  expect(packet.snapshot.history_completeness).toBe('UNKNOWN');
});

it('never exposes another current-customer or foreign-customer job from the actual global list, even with similar scope', async () => {
  const { repo, model, operations, boundary, job, versions } = await fixture();
  const current = versions.find((v) => v.status === 'issued')!;
  const foreign = await operations.saveCustomer(boundary.organization_id, {
    display_name: 'PRIVATE other customer',
    email: '',
    phone: '',
    customer_type: 'residential',
    preferred_contact: 'email',
  });
  for (const customer_id of [boundary.customer_id, foreign!.id]) {
    const draft = await repo.estimates.create(model.company, {
      ...current.payload,
      customer_id,
      location_id: boundary.location_id,
      project: {
        ...current.payload.project,
        name: current.payload.project.name,
      },
    });
    const issued = await repo.estimates.issue(boundary.organization_id, draft);
    await repo.estimates.approveJob(boundary.organization_id, issued);
  }
  expect(await repo.estimates.jobs(boundary.organization_id)).toHaveLength(3);
  const packet = await createPropertyPassportJobHistory(
    model,
    boundary,
    admitted,
  );
  expect(packet.snapshot.jobs.map((j) => j.reference.job_id)).toEqual([job.id]);
  expect(JSON.stringify(packet)).not.toContain('PRIVATE');
});

it.each(['organization_id', 'customer_id', 'location_id'] as const)(
  'foreign boundary %s cannot reveal an otherwise retained job source',
  async (key) => {
    const { model, boundary } = await fixture();
    const packet = await createPropertyPassportJobHistory(
      model,
      boundary,
      admitted,
    );
    const foreign = {
      ...boundary,
      [key]:
        key === 'organization_id' ? sampleCompanies[1].id : crypto.randomUUID(),
    };
    await expect(
      createPropertyPassportJobHistory(model, foreign, admitted),
    ).rejects.toThrow();
    expect(
      await readPropertyPassportJobEvidence(
        model,
        { ...packet.snapshot.jobs[0].reference, ...foreign },
        admitted,
      ),
    ).toEqual(unknown);
  },
);

it('another property, including the same address label, cannot inherit a retained job or version', async () => {
  const { operations, repo, model, boundary } = await fixture();
  const packet = await createPropertyPassportJobHistory(
    model,
    boundary,
    admitted,
  );
  const source = (
    await operations.listLocations(
      boundary.organization_id,
      boundary.customer_id,
    )
  ).find((l) => l.id === boundary.location_id)!;
  await operations.saveLocation(
    boundary.organization_id,
    boundary.customer_id,
    {
      address_line1: source.address_line1,
      address_line2: '',
      city: source.city,
      region: source.region,
      postal_code: source.postal_code,
      country_code: source.country_code,
    },
  );
  const location = (
    await operations.listLocations(
      boundary.organization_id,
      boundary.customer_id,
    )
  ).find((l) => l.id !== boundary.location_id)!;
  await repo.refreshContexts(boundary.organization_id);
  model.selectProperty(location.id);
  expect(
    await readPropertyPassportJobEvidence(
      model,
      packet.snapshot.jobs[0].reference,
      admitted,
    ),
  ).toEqual(unknown);
  const other = await createPropertyPassportJobHistory(
    model,
    { ...boundary, location_id: location.id },
    admitted,
  );
  expect(other.snapshot.jobs).toEqual([]);
});

it('revoked authorized version IDs hide the global job and make exact retained reads UNKNOWN', async () => {
  const { model, boundary } = await fixture();
  const packet = await createPropertyPassportJobHistory(
    model,
    boundary,
    admitted,
  );
  const data = model.read();
  const version = packet.snapshot.jobs[0].reference.issued_version_id;
  data.context.version_ids = data.context.version_ids.filter(
    (id) => id !== version,
  );
  data.reviews = data.reviews.filter((r) => r.version_id !== version);
  vi.spyOn(model, 'read').mockReturnValue(data);
  expect(
    (await createPropertyPassportJobHistory(model, boundary, admitted)).snapshot
      .jobs,
  ).toEqual([]);
  expect(
    await readPropertyPassportJobEvidence(
      model,
      packet.snapshot.jobs[0].reference,
      admitted,
    ),
  ).toEqual(unknown);
});

it.each([
  'job',
  'estimate',
  'version',
  'version-number',
  'digest',
  'extra-field',
  'kind',
  'object-digest',
] as const)(
  'malformed or changed exact reference %s remains UNKNOWN',
  async (attack) => {
    const { model, boundary } = await fixture();
    const packet = await createPropertyPassportJobHistory(
      model,
      boundary,
      admitted,
    );
    const ref: Record<string, unknown> = {
      ...packet.snapshot.jobs[0].reference,
    };
    if (attack === 'job') ref.job_id = crypto.randomUUID();
    if (attack === 'estimate') ref.estimate_id = crypto.randomUUID();
    if (attack === 'version') ref.issued_version_id = crypto.randomUUID();
    if (attack === 'version-number') ref.issued_version_number = 99;
    if (attack === 'digest') ref.issued_source_sha256 = '0'.repeat(64);
    if (attack === 'extra-field') ref.media_url = 'PRIVATE';
    if (attack === 'kind') ref.kind = 'latest';
    if (attack === 'object-digest')
      ref.issued_source_sha256 = {
        toString: () => packet.snapshot.jobs[0].reference.issued_source_sha256,
      };
    expect(
      await readPropertyPassportJobEvidence(
        model,
        ref as unknown as PassportJobReference,
        admitted,
      ),
    ).toEqual(unknown);
  },
);

it.each([
  'draft',
  'foreign-tenant',
  'foreign-customer',
  'foreign-property',
  'foreign-estimate',
  'missing-issued-at',
  'foreign-snapshot',
  'duplicate-version',
  'duplicate-job',
  'version-number-drift',
  'safe-scope-drift',
] as const)(
  'rejects contaminated existing job/source provenance: %s',
  async (attack) => {
    const { repo, model, boundary, versions, job } = await fixture();
    const source = versions.find(
      (v) => v.id === job.baseline.issued_version_id,
    )!;
    if (attack === 'version-number-drift') source.version_number++;
    if (attack === 'safe-scope-drift')
      source.payload.project.name = 'Changed retained issued scope';
    if (attack === 'draft') source.status = 'draft';
    if (attack === 'foreign-tenant')
      source.organization_id = sampleCompanies[1].id;
    if (attack === 'foreign-customer')
      source.payload.customer_id = crypto.randomUUID();
    if (attack === 'foreign-property')
      source.payload.location_id = crypto.randomUUID();
    if (attack === 'foreign-estimate') source.estimate_id = crypto.randomUUID();
    if (attack === 'missing-issued-at') source.issued_at = null;
    if (attack === 'foreign-snapshot')
      Object.assign(source, { location_snapshot: { id: crypto.randomUUID() } });
    if (attack === 'duplicate-version') versions.push(source);
    vi.spyOn(repo.estimates, 'history').mockResolvedValue(versions);
    if (attack === 'duplicate-job')
      vi.spyOn(repo.estimates, 'jobs').mockResolvedValue([
        job,
        structuredClone(job),
      ]);
    await expect(
      createPropertyPassportJobHistory(model, boundary, admitted),
    ).rejects.toThrow();
  },
);

it('ignores private job/version fields without serialization, coercion or freezing caller objects', async () => {
  const { repo, model, boundary, versions, job } = await fixture();
  const secret = {
    value: 'PRIVATE cost and crew rates',
    toJSON: vi.fn(() => 'PRIVATE'),
    toString: vi.fn(() => 'PRIVATE'),
  };
  Object.assign(job, { name: secret, status: 'complete', workforce: secret });
  Object.assign(job.baseline, { costs: secret, lines: secret });
  Object.assign(job, { expenses: secret, projection: secret, labor: secret });
  for (const version of versions) {
    Object.assign(version, { company_snapshot: secret, private_notes: secret });
    Object.assign(version.payload, {
      internal_notes: secret,
      repair_readiness: secret,
    });
    version.payload.lines.forEach((line) =>
      Object.assign(line, { internal_note: secret }),
    );
  }
  vi.spyOn(repo.estimates, 'history').mockResolvedValue(versions);
  vi.spyOn(repo.estimates, 'jobs').mockResolvedValue([job]);
  const packet = await createPropertyPassportJobHistory(
    model,
    boundary,
    admitted,
  );
  expect(packet.snapshot.jobs).toHaveLength(1);
  expect(JSON.stringify(packet)).not.toMatch(
    /PRIVATE|status.*complete|workforce|private_notes/,
  );
  expect(secret.toJSON).not.toHaveBeenCalled();
  expect(secret.toString).not.toHaveBeenCalled();
  expect(Object.isFrozen(secret)).toBe(false);
  expect(Object.isFrozen(job)).toBe(false);
});

it.each([
  'project-name',
  'line-description',
  'line-unit',
  'snapshot-address',
] as const)(
  'rejects object-valued customer-safe field %s without coercion or aliasing',
  async (field) => {
    const { repo, model, boundary, versions, job } = await fixture();
    const source = versions.find(
      (v) => v.id === job.baseline.issued_version_id,
    )!;
    const value = {
      private_note: 'PRIVATE',
      toString: vi.fn(() => 'safe'),
      toJSON: vi.fn(() => 'PRIVATE'),
    };
    if (field === 'project-name')
      Object.assign(source.payload.project, { name: value });
    if (field === 'line-description')
      Object.assign(source.payload.lines[0], { description: value });
    if (field === 'line-unit')
      Object.assign(source.payload.lines[0], { unit: value });
    if (field === 'snapshot-address')
      Object.assign(source, {
        location_snapshot: { id: boundary.location_id, address_line1: value },
      });
    vi.spyOn(repo.estimates, 'history').mockResolvedValue(versions);
    await expect(
      createPropertyPassportJobHistory(model, boundary, admitted),
    ).rejects.toThrow();
    expect(value.toJSON).not.toHaveBeenCalled();
    expect(value.toString).not.toHaveBeenCalled();
    expect(Object.isFrozen(value)).toBe(false);
  },
);

it.each([
  'missing-visit',
  'duplicate-visit',
  'foreign-visit',
  'missing-plan',
  'duplicate-plan',
  'foreign-plan',
  'null-job',
  'foreign-job',
] as const)(
  'missing or ambiguous report lineage %s never guesses a job or treats after/checklist as proof',
  async (attack) => {
    const { repo, model, boundary } = await fixture();
    const after = afterReport(model, boundary);
    const state = repo.read(boundary.organization_id);
    const visit = state.visits.find((v) => v.id === after.visit.id)!;
    const plan = state.plans.find((p) => p.id === after.plan.id)!;
    if (attack === 'missing-visit')
      state.visits = state.visits.filter((v) => v.id !== visit.id);
    if (attack === 'duplicate-visit') state.visits.push(structuredClone(visit));
    if (attack === 'foreign-visit')
      visit.organization_id = sampleCompanies[1].id;
    if (attack === 'missing-plan')
      state.plans = state.plans.filter((p) => p.id !== plan.id);
    if (attack === 'duplicate-plan') state.plans.push(structuredClone(plan));
    if (attack === 'foreign-plan') plan.location_id = crypto.randomUUID();
    if (attack === 'null-job') plan.job_id = null;
    if (attack === 'foreign-job') plan.job_id = crypto.randomUUID();
    vi.spyOn(repo, 'read').mockReturnValue(state);
    const packet = await createPropertyPassportJobHistory(
      model,
      boundary,
      admitted,
    );
    expect(
      packet.snapshot.inspections.snapshot.reports.find(
        (r) => r.reference.report_id === after.report.id,
      ),
    ).toBeDefined();
    const job = packet.snapshot.jobs[0];
    expect(
      job.documentation.reports.some(
        (link) => link.reference.report_id === after.report.id,
      ),
    ).toBe(false);
    expect(job.documentation.unknown_report_links).toContainEqual({
      status: 'UNKNOWN',
      reference: {
        ...boundary,
        kind: 'report',
        report_id: after.report.id,
        published_version: after.report.version,
      },
    });
    expect(job.physical_completion).toBe('UNVERIFIED');
    expect(job.warranty).toBe('UNVERIFIED');
  },
);

it('missing every exact property/job plan link cannot recover a null-location issued baseline from similar scope or CRM context', async () => {
  const { repo, model, boundary } = await fixture();
  const state = repo.read(boundary.organization_id);
  state.plans.forEach((plan) => {
    plan.job_id = null;
  });
  vi.spyOn(repo, 'read').mockReturnValue(state);
  await expect(
    createPropertyPassportJobHistory(model, boundary, admitted),
  ).rejects.toThrow('property unavailable');
});

it.each([
  'logout',
  'reports-denied',
  'crm-missing',
  'jobs-denied',
  'history-denied',
] as const)(
  'retained packet/digest does not confer access after %s',
  async (denied) => {
    const { model, repo, operations, boundary } = await fixture();
    const packet = await createPropertyPassportJobHistory(
      model,
      boundary,
      admitted,
    );
    if (denied === 'logout') model.logout();
    if (denied === 'reports-denied') {
      const data = model.read();
      data.context.reports = false;
      vi.spyOn(model, 'read').mockReturnValue(data);
    }
    if (denied === 'crm-missing')
      vi.spyOn(operations, 'syntheticProperty').mockImplementation(() => {
        throw Error('Current CRM denied');
      });
    if (denied === 'jobs-denied')
      vi.spyOn(repo.estimates, 'jobs').mockRejectedValue(Error('Denied'));
    if (denied === 'history-denied')
      vi.spyOn(repo.estimates, 'history').mockRejectedValue(Error('Denied'));
    await expect(
      createPropertyPassportJobHistory(model, boundary, admitted),
    ).rejects.toThrow();
    expect(
      await readPropertyPassportJobEvidence(
        model,
        packet.snapshot.jobs[0].reference,
        admitted,
      ),
    ).toEqual(unknown);
  },
);

it.each([
  'logout',
  'version-revoked',
  'issued-scope-drift',
  'new-publication',
  'admission-revoked',
] as const)(
  'rejects %s during snapshot hashing without retaining or mutating evidence',
  async (change) => {
    const { model, repo, boundary, versions, job } = await fixture();
    const admission = { enabled: true };
    const data = model.read();
    const source = versions.find(
      (v) => v.id === job.baseline.issued_version_id,
    )!;
    const originalHash = hashing.documentHash;
    vi.spyOn(hashing, 'documentHash').mockImplementation(async (value) => {
      if (
        (value as { format?: string }).format ===
        'synthetic-property-job-documentation-v1'
      ) {
        if (change === 'logout') model.logout();
        if (change === 'version-revoked') {
          data.context.version_ids = [];
          data.reviews = [];
          vi.spyOn(model, 'read').mockReturnValue(data);
        }
        if (change === 'issued-scope-drift') {
          source.payload.project.name = 'Different immutable source';
          vi.spyOn(repo.estimates, 'history').mockResolvedValue(versions);
        }
        if (change === 'new-publication') afterReport(model, boundary);
        if (change === 'admission-revoked') admission.enabled = false;
      }
      return originalHash(value);
    });
    await expect(
      createPropertyPassportJobHistory(model, boundary, admission),
    ).rejects.toThrow();
  },
);

it('freezes detached evidence, binds safe facts/dates/lineage in hashes and keeps old snapshots unchanged after newer publication', async () => {
  const { model, repo, boundary } = await fixture();
  const packet = await createPropertyPassportJobHistory(
    model,
    boundary,
    admitted,
  );
  const serialized = JSON.stringify(packet);
  const job = packet.snapshot.jobs[0];
  expect(Object.isFrozen(packet)).toBe(true);
  expect(Object.isFrozen(job.issued_source.scope.lines[0])).toBe(true);
  expect(() =>
    Object.assign(job.issued_source.scope.lines[0], { description: 'forged' }),
  ).toThrow();
  for (const changed of [
    { ...job.issued_source, customer_id: crypto.randomUUID() },
    { ...job.issued_source, issued_at: '2026-01-01T00:00:00Z' },
    { ...job.issued_source, issued_version_number: 100 },
    {
      ...job.issued_source,
      scope: { ...job.issued_source.scope, name: 'Changed source' },
    },
  ])
    expect(await hashing.documentHash(changed)).not.toBe(
      job.reference.issued_source_sha256,
    );
  const draft = repo.addVisit(
    boundary.organization_id,
    repo.read(boundary.organization_id).plans[0].id,
    '2027-01-01',
  );
  repo.saveVisit(boundary.organization_id, draft, {
    ...draft.content,
    summary: 'PRIVATE unissued draft',
  });
  expect(
    (await createPropertyPassportJobHistory(model, boundary, admitted))
      .integrity,
  ).toEqual(packet.integrity);
  afterReport(model, boundary);
  const current = await createPropertyPassportJobHistory(
    model,
    boundary,
    admitted,
  );
  expect(current.integrity.sha256).not.toBe(packet.integrity.sha256);
  expect(current.snapshot.jobs[0].reference.issued_source_sha256).not.toBe(
    job.reference.issued_source_sha256,
  );
  expect(JSON.stringify(packet)).toBe(serialized);
  expect(
    (await readPropertyPassportJobEvidence(model, job.reference, admitted))
      .status,
  ).toBe('UNKNOWN');
});

it('resolves reordered primitive references without calling inherited serializers or freezing the caller', async () => {
  const { model, boundary } = await fixture();
  const packet = await createPropertyPassportJobHistory(
    model,
    boundary,
    admitted,
  );
  const source = packet.snapshot.jobs[0];
  const serializer = vi.fn(() => 'PRIVATE inherited serializer');
  const reference: PassportJobReference = Object.assign(
    Object.create({ toJSON: serializer }) as PassportJobReference,
    Object.fromEntries(Object.entries(source.reference).reverse()),
  );
  expect(
    await readPropertyPassportJobEvidence(model, reference, admitted),
  ).toEqual({ status: 'AVAILABLE', evidence: source });
  expect(serializer).not.toHaveBeenCalled();
  expect(Object.isFrozen(reference)).toBe(false);
});

it('pins primitive reference identity before awaiting rather than following caller mutation', async () => {
  const { model, boundary } = await fixture();
  const packet = await createPropertyPassportJobHistory(
    model,
    boundary,
    admitted,
  );
  const reference = { ...packet.snapshot.jobs[0].reference };
  const pending = readPropertyPassportJobEvidence(model, reference, admitted);
  reference.job_id = crypto.randomUUID();
  reference.issued_source_sha256 = '0'.repeat(64);
  expect(await pending).toEqual({
    status: 'AVAILABLE',
    evidence: packet.snapshot.jobs[0],
  });
  expect(Object.isFrozen(reference)).toBe(false);
});

it('published reports with no exact visit link retain explicit UNKNOWN documentation instead of completion', async () => {
  const { model, repo, boundary } = await fixture();
  const state = repo.read(boundary.organization_id);
  state.visits = [];
  vi.spyOn(repo, 'read').mockReturnValue(state);
  const packet = await createPropertyPassportJobHistory(
    model,
    boundary,
    admitted,
  );
  const job = packet.snapshot.jobs[0];
  expect(job.documentation.status).toBe('UNKNOWN');
  expect(job.documentation.reports).toEqual([]);
  expect(job.documentation.unknown_report_links).toHaveLength(
    packet.snapshot.inspections.snapshot.reports_available,
  );
  expect(job.physical_completion).toBe('UNVERIFIED');
});
