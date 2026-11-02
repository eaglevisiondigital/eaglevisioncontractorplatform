import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies, type CompanyProfile } from '../src/domain/platform';
import {
  createPropertyPassportTimeline,
  readPropertyPassportTimelineEvidence,
  type PassportTimelineReference,
} from '../src/domain/property/passport-timeline';
import { readPropertyPassportEvidence } from '../src/domain/property/passport';
import { documentHash } from '../src/domain/release/preview';
import * as hashing from '../src/domain/release/preview';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
const enabled = { enabled: true };
const unknown = { status: 'UNKNOWN', evidence: null };
afterEach(() => vi.restoreAllMocks());
async function fixture(company: CompanyProfile = sampleCompanies[0]) {
  const repo = new PropertyRepository(new Operations(true));
  const model = new CustomerPortalPreviewModel(company, repo);
  await model.login();
  await model.prepare();
  await model.prepareHistory();
  const c = model.read().context;
  const boundary = {
    organization_id: c.organization_id,
    customer_id: c.customer_id,
    location_id: c.location_id,
  };
  return { repo, model, boundary };
}
function after(model: CustomerPortalPreviewModel) {
  const c = model.read().context,
    repo = model.repo;
  const property = repo
    .read(c.organization_id)
    .contexts.find(
      (p) => p.customer_id === c.customer_id && p.location_id === c.location_id,
    )!;
  const plan = repo.createPlan(
    c.organization_id,
    property,
    'After stage documentation',
  );
  let visit = repo.addVisit(c.organization_id, plan.id, '2026-12-21', 'after');
  repo.saveVisit(c.organization_id, visit, {
    summary: '<script>After documentation</script>',
    internal_notes: 'PRIVATE payroll supplier margin',
    checklist: [
      {
        id: 'document',
        label: 'Record reviewed',
        completed: true,
        required: true,
      },
    ],
    findings: [],
  });
  visit = repo.read(c.organization_id).visits.find((v) => v.id === visit.id)!;
  repo.submit(c.organization_id, visit);
  visit = repo.read(c.organization_id).visits.find((v) => v.id === visit.id)!;
  return repo.publish(c.organization_id, visit);
}
function ref(
  event: Awaited<
    ReturnType<typeof createPropertyPassportTimeline>
  >['snapshot']['events'][number],
): PassportTimelineReference {
  return {
    kind: event.kind,
    source: event.reference,
    source_sha256: event.source_sha256,
  };
}
it.each(sampleCompanies)(
  '$name combines actual exact authorized issued jobs and published reports without mutations, private fields or completion claims',
  async (company) => {
    const { repo, model, boundary } = await fixture(company);
    const report = after(model);
    const before = {
      state: repo.read(company.id),
      customer: model.read(),
      jobs: await repo.estimates.jobs(company.id),
    };
    const result = await createPropertyPassportTimeline(
      model,
      boundary,
      enabled,
    );
    expect(result.snapshot.contractor).toEqual({
      id: company.id,
      name: company.name,
      primary_color: company.primary_color,
      accent_color: company.accent_color,
    });
    expect(result.snapshot.events).toHaveLength(
      model.read().reports.length + 1,
    );
    expect(result.snapshot).toMatchObject({
      ...boundary,
      history_completeness: 'UNKNOWN',
      physical_completion: 'UNVERIFIED',
      ordering:
        'recorded-date-descending-without-intraday-or-timezone-inference',
    });
    expect(result.integrity.sha256).toBe(await documentHash(result.snapshot));
    expect(Object.isFrozen(result.snapshot.events)).toBe(true);
    const dates = result.snapshot.events.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
    const recorded = result.snapshot.events.find(
      (e) =>
        e.kind === 'inspection-documentation' &&
        e.reference.report_id === report.id,
    )!;
    expect(recorded).toMatchObject({
      date: '2026-12-21',
      date_meaning: 'recorded-visit-date',
      reference: { report_id: report.id, published_version: report.version },
      completion_documentation: {
        after_phase_recorded: true,
        checklist_items_recorded_completed: 1,
        physical_completion: 'UNVERIFIED',
        warranty: 'UNVERIFIED',
        customer_approval: 'UNVERIFIED',
      },
    });
    for (const event of result.snapshot.events) {
      expect(
        await readPropertyPassportTimelineEvidence(model, ref(event), enabled),
      ).toEqual({ status: 'AVAILABLE', evidence: event });
      expect(Object.isFrozen(event)).toBe(true);
      if (event.kind === 'issued-job-scope')
        expect(event.date).toBe(
          new Date(event.issued_at).toISOString().slice(0, 10),
        );
    }
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|INTERNAL|unit_cost|unit_price|amount_minor|payroll|margin|supplier|workforce|internal_notes|financials|customer_notes|https?:/,
    );
    expect({
      state: repo.read(company.id),
      customer: model.read(),
      jobs: await repo.estimates.jobs(company.id),
    }).toEqual(before);
  },
);
it('is default OFF', async () => {
  const { model, boundary } = await fixture();
  await expect(createPropertyPassportTimeline(model, boundary)).rejects.toThrow(
    /disabled/,
  );
});
it.each(['organization_id', 'customer_id', 'location_id'] as const)(
  'rejects foreign %s',
  async (key) => {
    const { model, boundary } = await fixture();
    await expect(
      createPropertyPassportTimeline(
        model,
        { ...boundary, [key]: '00000000-0000-0000-0000-000000000999' },
        enabled,
      ),
    ).rejects.toThrow();
  },
);
it('rejects ended customer session', async () => {
  const { model, boundary } = await fixture();
  model.logout();
  await expect(
    createPropertyPassportTimeline(model, boundary, enabled),
  ).rejects.toThrow();
});
it('retains immutable snapshots and raw published reports, while changed timeline associations remain UNKNOWN', async () => {
  const { model, boundary } = await fixture();
  const first = await createPropertyPassportTimeline(model, boundary, enabled);
  const original = JSON.stringify(first);
  after(model);
  const next = await createPropertyPassportTimeline(model, boundary, enabled);
  expect(JSON.stringify(first)).toBe(original);
  expect(next.integrity.sha256).not.toBe(first.integrity.sha256);
  const report = first.snapshot.events.find(
    (e) => e.kind === 'inspection-documentation',
  )!;
  expect(
    (await readPropertyPassportTimelineEvidence(model, ref(report), enabled))
      .status,
  ).toBe('UNKNOWN');
  if (report.kind === 'inspection-documentation')
    expect(
      readPropertyPassportEvidence(model, report.reference, enabled).status,
    ).toBe('AVAILABLE');
  const job = first.snapshot.events.find((e) => e.kind === 'issued-job-scope')!;
  expect(
    await readPropertyPassportTimelineEvidence(model, ref(job), enabled),
  ).toEqual(unknown);
});
it.each(['source_sha256', 'kind'] as const)(
  'rejects changed %s and never substitutes latest source',
  async (key) => {
    const { model, boundary } = await fixture();
    const event = (
      await createPropertyPassportTimeline(model, boundary, enabled)
    ).snapshot.events[0];
    expect(
      await readPropertyPassportTimelineEvidence(
        model,
        {
          ...ref(event),
          [key]: key === 'source_sha256' ? '0'.repeat(64) : 'invalid',
        } as PassportTimelineReference,
        enabled,
      ),
    ).toEqual(unknown);
  },
);
it('rejects extra fields and wrong report version / property, and accepts reordered identical primitives', async () => {
  const { model, boundary } = await fixture();
  const event = (
    await createPropertyPassportTimeline(model, boundary, enabled)
  ).snapshot.events.find((e) => e.kind === 'inspection-documentation')!;
  const retained = ref(event);
  const source = Object.fromEntries(Object.entries(retained.source).reverse());
  expect(
    (
      await readPropertyPassportTimelineEvidence(
        model,
        {
          source_sha256: retained.source_sha256,
          source,
          kind: retained.kind,
        } as PassportTimelineReference,
        enabled,
      )
    ).status,
  ).toBe('AVAILABLE');
  for (const source of [
    { ...retained.source, published_version: 999 },
    { ...retained.source, location_id: '00000000-0000-0000-0000-000000000999' },
    { ...retained.source, private_note: 'PRIVATE' },
  ])
    expect(
      await readPropertyPassportTimelineEvidence(
        model,
        { ...retained, source } as PassportTimelineReference,
        enabled,
      ),
    ).toEqual(unknown);
});
it('does not invoke inherited serializers and pins retained source primitives before await', async () => {
  const { model, boundary } = await fixture();
  const event = (await createPropertyPassportTimeline(model, boundary, enabled))
    .snapshot.events[0];
  const serializer = vi.fn(() => {
    throw Error('caller serializer');
  });
  const source = Object.assign(
    Object.create({ toJSON: serializer }),
    event.reference,
  );
  const pending = readPropertyPassportTimelineEvidence(
    model,
    { ...ref(event), source },
    enabled,
  );
  source.location_id = '00000000-0000-0000-0000-000000000999';
  expect((await pending).status).toBe('AVAILABLE');
  expect(serializer).not.toHaveBeenCalled();
});
it('rejects source change during hashing and authorization loss during final source read', async () => {
  const { model, boundary } = await fixture();
  const original = hashing.documentHash;
  let changed = false;
  vi.spyOn(hashing, 'documentHash').mockImplementation(async (value) => {
    if (!changed) {
      changed = true;
      model.logout();
    }
    return original(value);
  });
  await expect(
    createPropertyPassportTimeline(model, boundary, enabled),
  ).rejects.toThrow();
});
it('pins boundary before await and never freezes caller object', async () => {
  const { model, boundary } = await fixture();
  const pending = createPropertyPassportTimeline(model, boundary, enabled);
  boundary.location_id = '00000000-0000-0000-0000-000000000999';
  const packet = await pending;
  expect(packet.snapshot.location_id).not.toBe(boundary.location_id);
  expect(Object.isFrozen(boundary)).toBe(false);
});
it('returns no evidence for the second authorized property without treating absence as completion', async () => {
  const { model } = await fixture();
  model.selectProperty(model.properties()[1].id);
  const packet = await createPropertyPassportTimeline(
    model,
    model.read().context,
    enabled,
  );
  expect(packet.snapshot.events).toEqual([]);
  expect(packet.snapshot.history_completeness).toBe('UNKNOWN');
  expect(packet.snapshot.physical_completion).toBe('UNVERIFIED');
});
it('retained source cannot confer access after property switch', async () => {
  const { model, boundary } = await fixture();
  const event = (await createPropertyPassportTimeline(model, boundary, enabled))
    .snapshot.events[0];
  model.selectProperty(model.properties()[1].id);
  expect(
    await readPropertyPassportTimelineEvidence(model, ref(event), enabled),
  ).toEqual(unknown);
});

it('keeps unsupported report-to-job links UNKNOWN without discarding the exact report', async () => {
  const { model, boundary } = await fixture();
  const read = model.read.bind(model);
  const selected = read().reports[0].id;
  vi.spyOn(model, 'read').mockImplementation(() => {
    const data = read();
    return {
      ...data,
      reports: data.reports.map((r) =>
        r.id === selected
          ? { ...r, visit_id: '00000000-0000-0000-0000-000000000999' }
          : r,
      ),
    };
  });
  const timeline = await createPropertyPassportTimeline(
    model,
    boundary,
    enabled,
  );
  const report = timeline.snapshot.events.find(
    (e) =>
      e.kind === 'inspection-documentation' &&
      e.reference.report_id === selected,
  )!;
  expect(report).toMatchObject({ job_link_status: 'UNKNOWN', linked_jobs: [] });
  expect(
    (await readPropertyPassportTimelineEvidence(model, ref(report), enabled))
      .status,
  ).toBe('AVAILABLE');
});
it('strictly excludes added private report fields while preserving observation versus recommendation', async () => {
  const { model, boundary } = await fixture();
  const read = model.read.bind(model);
  vi.spyOn(model, 'read').mockImplementation(() => {
    const data = read();
    return {
      ...data,
      reports: data.reports.map((r) => ({
        ...r,
        internal_notes: 'SECRET payroll',
        supplier_cost: 98765,
      })),
    };
  });
  const timeline = await createPropertyPassportTimeline(
    model,
    boundary,
    enabled,
  );
  expect(JSON.stringify(timeline)).not.toMatch(
    /SECRET|supplier_cost|staff_note|cost_minor/,
  );
  const report = timeline.snapshot.events.find(
    (e) =>
      e.kind === 'inspection-documentation' && e.report.observations.length,
  );
  expect(report?.kind).toBe('inspection-documentation');
  if (report?.kind === 'inspection-documentation')
    expect(report.report.observations[0]).toHaveProperty('recommendation');
});
it('extra private fields inside the strict finding shape reject the snapshot rather than leak', async () => {
  const { model, boundary } = await fixture();
  const read = model.read.bind(model);
  vi.spyOn(model, 'read').mockImplementation(() => {
    const data = read();
    return {
      ...data,
      reports: data.reports.map((r) => ({
        ...r,
        findings: r.findings.map((f) => ({
          ...f,
          staff_note: 'SECRET workforce',
        })),
      })),
    };
  });
  await expect(
    createPropertyPassportTimeline(model, boundary, enabled),
  ).rejects.toThrow('Invalid published report');
});
it('rejects current property changes during the NEW timeline hash, not just the underlying foundation hash', async () => {
  const { model, boundary } = await fixture();
  const original = hashing.documentHash;
  vi.spyOn(hashing, 'documentHash').mockImplementation(async (value) => {
    if (
      value &&
      typeof value === 'object' &&
      'format' in value &&
      value.format === 'synthetic-property-passport-timeline-v1'
    )
      model.selectProperty(model.properties()[1].id);
    return original(value);
  });
  await expect(
    createPropertyPassportTimeline(model, boundary, enabled),
  ).rejects.toThrow();
});
it('rejects lost access across the final real job-reader await', async () => {
  const { model, repo, boundary } = await fixture();
  const original = repo.estimates.jobs.bind(repo.estimates);
  let reads = 0;
  vi.spyOn(repo.estimates, 'jobs').mockImplementation(async (...args) => {
    const jobs = await original(...args);
    if (++reads === 3) model.logout();
    return jobs;
  });
  await expect(
    createPropertyPassportTimeline(model, boundary, enabled),
  ).rejects.toThrow();
});
it('an old source digest cannot silently expose changed same-ID report contents', async () => {
  const { model, boundary } = await fixture();
  const timeline = await createPropertyPassportTimeline(
    model,
    boundary,
    enabled,
  );
  const event = timeline.snapshot.events.find(
    (e) => e.kind === 'inspection-documentation',
  )!;
  const read = model.read.bind(model);
  vi.spyOn(model, 'read').mockImplementation(() => {
    const data = read();
    return {
      ...data,
      reports: data.reports.map((r) => ({
        ...r,
        summary: 'Changed evidence body',
      })),
    };
  });
  expect(
    await readPropertyPassportTimelineEvidence(model, ref(event), enabled),
  ).toEqual(unknown);
});
it('validates contractor branding primitives and rejects changes during the composition hash', async () => {
  const company = { ...sampleCompanies[0] };
  const { model, boundary } = await fixture(company);
  const original = hashing.documentHash;
  vi.spyOn(hashing, 'documentHash').mockImplementation(async (value) => {
    if (
      value &&
      typeof value === 'object' &&
      'format' in value &&
      value.format === 'synthetic-property-passport-timeline-v1'
    )
      company.primary_color = '#123456';
    return original(value);
  });
  await expect(
    createPropertyPassportTimeline(model, boundary, enabled),
  ).rejects.toThrow(/sources changed/);
});

it('default OFF returns before reading any customer source, including an inactive model', async () => {
  const model = new CustomerPortalPreviewModel(
    sampleCompanies[0],
    new PropertyRepository(new Operations(true)),
  );
  const read = vi.spyOn(model, 'read');
  await expect(
    createPropertyPassportTimeline(model, {
      organization_id: sampleCompanies[0].id,
      customer_id: '',
      location_id: '',
    }),
  ).rejects.toThrow('disabled');
  expect(read).not.toHaveBeenCalled();
});

it.each([1, 3])(
  'withdrawn original admission during actual job read %s withholds the composed timeline',
  async (pauseRead) => {
    const { model, repo, boundary } = await fixture();
    const admission = { enabled: true };
    const original = repo.estimates.jobs.bind(repo.estimates);
    let reached!: () => void;
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const continuation = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let reads = 0;
    vi.spyOn(repo.estimates, 'jobs').mockImplementation(async (...args) => {
      const jobs = await original(...args);
      if (++reads === pauseRead) {
        reached();
        await continuation;
      }
      return jobs;
    });
    const pending = createPropertyPassportTimeline(model, boundary, admission);
    await paused;
    admission.enabled = false;
    resume();
    await expect(pending).rejects.toThrow('disabled');
  },
);
it('withdrawn original admission during an exact retained read returns UNKNOWN without source substitution', async () => {
  const { model, repo, boundary } = await fixture();
  const snapshot = await createPropertyPassportTimeline(
    model,
    boundary,
    enabled,
  );
  const retained = ref(snapshot.snapshot.events[0]);
  const admission = { enabled: true };
  const original = repo.estimates.jobs.bind(repo.estimates);
  let reached!: () => void;
  let resume!: () => void;
  const paused = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const continuation = new Promise<void>((resolve) => {
    resume = resolve;
  });
  vi.spyOn(repo.estimates, 'jobs').mockImplementationOnce(async (...args) => {
    const jobs = await original(...args);
    reached();
    await continuation;
    return jobs;
  });
  const pending = readPropertyPassportTimelineEvidence(
    model,
    retained,
    admission,
  );
  await paused;
  admission.enabled = false;
  resume();
  expect(await pending).toEqual(unknown);
});
