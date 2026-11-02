import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies, type CompanyProfile } from '../src/domain/platform';
import {
  createPropertyPassportFoundation,
  readPropertyPassportEvidence,
  type PassportEvidenceReference,
} from '../src/domain/property/passport';
import type { VisitContent } from '../src/domain/property/inspections';
import type { ReportBoundary } from '../src/domain/property/report-page';
import { documentHash } from '../src/domain/release/preview';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';

const admitted = { enabled: true };
const unknown = { status: 'UNKNOWN', evidence: null };
afterEach(() => vi.restoreAllMocks());

async function fixture(
  company: CompanyProfile = sampleCompanies[0],
  history = true,
) {
  const operations = new Operations(true);
  const repo = new PropertyRepository(operations);
  const model = new CustomerPortalPreviewModel(company, repo);
  await model.login();
  if (history) await model.prepareHistory();
  const context = model.read().context;
  const boundary: ReportBoundary = {
    organization_id: context.organization_id,
    customer_id: context.customer_id,
    location_id: context.location_id,
  };
  return { operations, repo, model, boundary };
}

function publish(
  model: CustomerPortalPreviewModel,
  boundary: ReportBoundary,
  content: VisitContent,
) {
  const repo = model.repo;
  const context = repo
    .read(boundary.organization_id)
    .contexts.find(
      (context) =>
        context.customer_id === boundary.customer_id &&
        context.location_id === boundary.location_id,
    )!;
  const plan = repo.createPlan(
    boundary.organization_id,
    context,
    'Evidence test',
  );
  let visit = repo.addVisit(boundary.organization_id, plan.id, '2026-12-21');
  repo.saveVisit(boundary.organization_id, visit, content);
  visit = repo
    .read(boundary.organization_id)
    .visits.find((v) => v.id === visit.id)!;
  repo.submit(boundary.organization_id, visit);
  visit = repo
    .read(boundary.organization_id)
    .visits.find((v) => v.id === visit.id)!;
  return repo.publish(boundary.organization_id, visit);
}

it.each(sampleCompanies)(
  '$name Passport uses actual published flows, exact identities and safe facts without side effects',
  async (company) => {
    const { model, repo, boundary } = await fixture(company);
    await model.prepare();
    const review = model.read().reviews[0];
    await model.respond(
      review.version_id,
      'changes_requested',
      true,
      'PRIVATE customer explanation',
    );
    const before = {
      state: repo.read(company.id),
      customer: model.read(),
      portal: repo.portal(company.id, boundary.customer_id),
    };
    const packet = await createPropertyPassportFoundation(
      model,
      boundary,
      admitted,
    );
    const snapshot = packet.snapshot;
    expect(snapshot).toMatchObject({
      ...boundary,
      synthetic_only: true,
      coverage: 'available-published-inspections-only',
      history_completeness: 'UNKNOWN',
      physical_proof_of_work: 'UNVERIFIED',
      reports_available: 3,
    });
    expect(
      snapshot.reports.map((report) => report.reference.report_id),
    ).toEqual(before.customer.history.map((report) => report.id));
    for (const [index, source] of before.customer.history.entries()) {
      const report = snapshot.reports[index];
      expect(report.reference).toEqual({
        ...boundary,
        kind: 'report',
        report_id: source.id,
        published_version: source.version,
      });
      expect(report.summary).toBe(source.snapshot.summary);
      expect(report.phase).toBe(source.snapshot.phase);
      expect(report.visited_on).toBe(source.snapshot.visited_on);
      expect(report.published_at).toBe(source.published_at);
      for (const [
        source_index,
        finding,
      ] of source.snapshot.findings.entries()) {
        expect(report.observations[source_index]).toEqual({
          reference: {
            ...report.reference,
            kind: 'finding',
            finding_id: finding.id,
            source_index,
          },
          category: finding.category,
          location: finding.location,
          severity: finding.severity,
          observation: finding.description,
          recommendation: finding.recommendation,
        });
      }
      expect(
        report.checklist.map((item) => ({
          label: item.label,
          completed: item.recorded_completed,
        })),
      ).toEqual(source.snapshot.checklist);
      for (const evidence of [
        report,
        ...report.observations,
        ...report.checklist,
      ])
        expect(
          readPropertyPassportEvidence(model, evidence.reference, admitted),
        ).toEqual({ status: 'AVAILABLE', evidence });
    }
    expect(packet.integrity).toEqual({
      algorithm: 'SHA-256',
      sha256: await documentHash(snapshot),
    });
    expect(
      await createPropertyPassportFoundation(model, boundary, admitted),
    ).toEqual(packet);
    expect(JSON.stringify(packet)).not.toMatch(
      /INTERNAL|PRIVATE|unit_cost_minor|markup|internal_notes|customer_visible|visit_id|supplier|payroll|crew|release_decisions/,
    );
    expect({
      state: repo.read(company.id),
      customer: model.read(),
      portal: repo.portal(company.id, boundary.customer_id),
    }).toEqual(before);
  },
);

it('requires explicit admission before reading, rejects connected sources and never prepares fixtures', async () => {
  const { model, boundary } = await fixture();
  const reader = vi.spyOn(model, 'read');
  await expect(
    createPropertyPassportFoundation(model, boundary),
  ).rejects.toThrow('disabled');
  await expect(
    createPropertyPassportFoundation(model, boundary, { enabled: false }),
  ).rejects.toThrow('disabled');
  expect(() =>
    readPropertyPassportEvidence(model, {
      ...boundary,
      kind: 'report',
      report_id: crypto.randomUUID(),
      published_version: 1,
    }),
  ).toThrow('disabled');
  expect(reader).not.toHaveBeenCalled();
  const connected = new PropertyRepository(new Operations(false));
  Object.defineProperty(model, 'repo', { value: connected });
  await expect(
    createPropertyPassportFoundation(model, boundary, admitted),
  ).rejects.toThrow('disabled');
  expect(reader).not.toHaveBeenCalled();
});

it('empty available history remains incomplete and does not mean that work or inspections never occurred', async () => {
  const { model, repo, boundary } = await fixture(sampleCompanies[0], false);
  const before = repo.read(boundary.organization_id);
  const { snapshot } = await createPropertyPassportFoundation(
    model,
    boundary,
    admitted,
  );
  expect(snapshot.reports).toEqual([]);
  expect(snapshot.reports_available).toBe(0);
  expect(snapshot.history_completeness).toBe('UNKNOWN');
  expect(snapshot.physical_proof_of_work).toBe('UNVERIFIED');
  expect(repo.read(boundary.organization_id)).toEqual(before);
});

it('allowlists safe facts even if top-level source or context records acquire private data', async () => {
  const { model, boundary } = await fixture();
  const data = model.read();
  Object.assign(data.reports[0], {
    internal_notes: 'PRIVATE contractor note',
    unit_cost_minor: 9999,
    payroll: 'PRIVATE workforce',
    media: ['PRIVATE unapproved object'],
  });
  Object.assign(data.context, { private_note: 'PRIVATE customer data' });
  vi.spyOn(model, 'read').mockReturnValue(data);
  const packet = await createPropertyPassportFoundation(
    model,
    boundary,
    admitted,
  );
  expect(JSON.stringify(packet)).not.toMatch(
    /PRIVATE|unit_cost_minor|payroll|media|private_note|internal_notes/,
  );
  expect(packet.snapshot.reports[0].summary).toBe(data.reports[0].summary);
});

it.each(['organization_id', 'customer_id', 'location_id'] as const)(
  'rejects foreign %s even when a retained source reference is otherwise valid',
  async (key) => {
    const { model, boundary } = await fixture();
    const packet = await createPropertyPassportFoundation(
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
      createPropertyPassportFoundation(model, foreign, admitted),
    ).rejects.toThrow('unavailable');
    expect(
      readPropertyPassportEvidence(
        model,
        { ...packet.snapshot.reports[0].reference, ...foreign },
        admitted,
      ),
    ).toEqual(unknown);
  },
);

it('does not select another property or a different customer to satisfy a retained reference', async () => {
  const { operations, repo, model, boundary } = await fixture();
  const packet = await createPropertyPassportFoundation(
    model,
    boundary,
    admitted,
  );
  const second = model
    .properties()
    .find((property) => property.id !== boundary.location_id)!;
  const other = await operations.saveCustomer(boundary.organization_id, {
    display_name: 'PRIVATE other customer',
    email: '',
    phone: '',
    customer_type: 'residential',
    preferred_contact: 'email',
  });
  await operations.saveLocation(boundary.organization_id, other!.id, {
    address_line1: 'PRIVATE other property',
    address_line2: '',
    city: 'Example',
    region: 'FL',
    postal_code: '00000',
    country_code: 'US',
  });
  await repo.refreshContexts(boundary.organization_id);
  expect(JSON.stringify(packet)).not.toContain('PRIVATE');
  model.selectProperty(second.id);
  await expect(
    createPropertyPassportFoundation(model, boundary, admitted),
  ).rejects.toThrow('unavailable');
  expect(
    readPropertyPassportEvidence(
      model,
      packet.snapshot.reports[0].reference,
      admitted,
    ),
  ).toEqual(unknown);
  const empty = await createPropertyPassportFoundation(
    model,
    { ...boundary, location_id: second.id },
    admitted,
  );
  expect(empty.snapshot.reports).toEqual([]);
  model.selectProperty(boundary.location_id);
  expect(
    readPropertyPassportEvidence(
      model,
      packet.snapshot.reports[0].reference,
      admitted,
    ).status,
  ).toBe('AVAILABLE');
});

it.each(['organization_id', 'customer_id', 'location_id'] as const)(
  'fails closed on a foreign %s row rather than silently discarding contaminated history',
  async (key) => {
    const { model, boundary } = await fixture();
    const data = model.read();
    data.reports[0][key] = crypto.randomUUID();
    vi.spyOn(model, 'read').mockReturnValue(data);
    await expect(
      createPropertyPassportFoundation(model, boundary, admitted),
    ).rejects.toThrow();
    expect(
      readPropertyPassportEvidence(
        model,
        {
          ...boundary,
          kind: 'report',
          report_id: data.reports[0].id,
          published_version: data.reports[0].version,
        },
        admitted,
      ),
    ).toEqual(unknown);
  },
);

it.each([
  'private-finding',
  'invalid-date',
  'invalid-version',
  'duplicate-finding',
  'duplicate-report',
  'conflicting-report-version',
] as const)(
  'rejects malformed or ambiguous published evidence: %s',
  async (attack) => {
    const { model, boundary } = await fixture();
    const data = model.read();
    const source = data.reports[0];
    if (attack === 'private-finding')
      Object.assign(source.findings[0], {
        internal_notes: 'PRIVATE',
        customer_visible: false,
      });
    if (attack === 'invalid-date') source.visited_on = '2026-02-30';
    if (attack === 'invalid-version') source.version = 0;
    if (attack === 'duplicate-finding')
      source.findings.push(structuredClone(source.findings[0]));
    if (attack === 'duplicate-report')
      data.reports.push(structuredClone(source));
    if (attack === 'conflicting-report-version')
      data.reports.push({
        ...structuredClone(source),
        version: source.version + 1,
      });
    vi.spyOn(model, 'read').mockReturnValue(data);
    await expect(
      createPropertyPassportFoundation(model, boundary, admitted),
    ).rejects.toThrow();
    expect(
      readPropertyPassportEvidence(
        model,
        {
          ...boundary,
          kind: 'report',
          report_id: source.id,
          published_version: source.version,
        },
        admitted,
      ),
    ).toEqual(unknown);
  },
);

it.each([
  'unknown-kind',
  'extra-field',
  'missing-position',
  'fractional-position',
  'invalid-report-id',
  'invalid-version',
] as const)('malformed exact reference %s remains UNKNOWN', async (attack) => {
  const { model, boundary } = await fixture();
  const packet = await createPropertyPassportFoundation(
    model,
    boundary,
    admitted,
  );
  const reference: Record<string, unknown> = {
    ...packet.snapshot.reports[0].observations[0].reference,
  };
  if (attack === 'unknown-kind') reference.kind = 'latest';
  if (attack === 'extra-field') reference.source_line_id = 'unexpected';
  if (attack === 'missing-position') delete reference.source_index;
  if (attack === 'fractional-position') reference.source_index = 0.5;
  if (attack === 'invalid-report-id') reference.report_id = 'nearest';
  if (attack === 'invalid-version') reference.published_version = 0;
  expect(
    readPropertyPassportEvidence(
      model,
      reference as unknown as PassportEvidenceReference,
      admitted,
    ),
  ).toEqual(unknown);
});

it.each([
  'report',
  'version',
  'finding',
  'position',
  'negative-position',
  'checklist-position',
] as const)(
  'missing exact %s returns UNKNOWN without latest, fuzzy or position-only fallback',
  async (missing) => {
    const { model, boundary } = await fixture();
    const { snapshot } = await createPropertyPassportFoundation(
      model,
      boundary,
      admitted,
    );
    const report = snapshot.reports[0];
    let ref: PassportEvidenceReference = {
      ...report.observations[0].reference,
    };
    if (missing === 'report') ref.report_id = crypto.randomUUID();
    if (missing === 'version') ref.published_version++;
    if (missing === 'finding') ref.finding_id = crypto.randomUUID();
    if (missing === 'position') ref.source_index++;
    if (missing === 'negative-position') ref.source_index = -1;
    if (missing === 'checklist-position')
      ref = { ...report.checklist[0].reference, source_index: 99 };
    const before = model.repo.read(boundary.organization_id);
    expect(readPropertyPassportEvidence(model, ref, admitted)).toEqual(unknown);
    expect(model.repo.read(boundary.organization_id)).toEqual(before);
  },
);

it('keeps duplicate checklist labels and ambiguous/repeated finding IDs as separate exact evidence positions', async () => {
  const { model, boundary } = await fixture();
  const finding = model.read().reports[0].findings[0];
  const content: VisitContent = {
    summary: '<script>Published literal summary</script>',
    internal_notes: 'PRIVATE costs and payroll',
    checklist: [
      { id: 'first', label: 'Same label', required: false, completed: true },
      { id: 'second', label: 'Same label', required: false, completed: false },
    ],
    findings: [
      {
        ...finding,
        location: 'Different location with reused identifier',
        customer_visible: true,
      },
    ],
  };
  const source = publish(model, boundary, content);
  model.prepareComparisonExamples();
  const { snapshot } = await createPropertyPassportFoundation(
    model,
    boundary,
    admitted,
  );
  const report = snapshot.reports.find(
    (report) => report.reference.report_id === source.id,
  )!;
  expect(report.summary).toBe(content.summary);
  expect(
    report.checklist.map((item) => [
      item.reference.source_index,
      item.label,
      item.recorded_completed,
    ]),
  ).toEqual([
    [0, 'Same label', true],
    [1, 'Same label', false],
  ]);
  for (const item of report.checklist)
    expect(
      readPropertyPassportEvidence(model, item.reference, admitted),
    ).toEqual({ status: 'AVAILABLE', evidence: item });
  const repeated = snapshot.reports
    .flatMap((report) => report.observations)
    .filter((observation) => observation.reference.finding_id === finding.id);
  expect(repeated).toHaveLength(2);
  expect(
    new Set(repeated.map((observation) => observation.reference.report_id))
      .size,
  ).toBe(2);
  const generic = snapshot.reports
    .flatMap((report) => report.observations)
    .filter(
      (observation) => observation.reference.finding_id === 'generic-drain',
    );
  expect(generic).toHaveLength(2);
  expect(
    new Set(generic.map((observation) => observation.reference.report_id)).size,
  ).toBe(2);
  expect(snapshot.history_completeness).toBe('UNKNOWN');
  expect(snapshot.physical_proof_of_work).toBe('UNVERIFIED');
});

it('freezes detached snapshots and preserves old evidence after draft edits and later published absence', async () => {
  const { model, repo, boundary } = await fixture();
  model.prepareAttentionExamples();
  const packet = await createPropertyPassportFoundation(
    model,
    boundary,
    admitted,
  );
  const serialized = JSON.stringify(packet);
  const missing = packet.snapshot.reports
    .flatMap((report) => report.observations)
    .find((observation) => observation.location === 'West path')!;
  expect(missing).toBeDefined();
  expect(
    packet.snapshot.reports
      .at(-1)!
      .observations.some(
        (observation) =>
          observation.reference.finding_id === missing.reference.finding_id,
      ),
  ).toBe(false);
  expect(
    readPropertyPassportEvidence(model, missing.reference, admitted),
  ).toEqual({ status: 'AVAILABLE', evidence: missing });
  expect(Object.isFrozen(packet)).toBe(true);
  expect(
    Object.isFrozen(packet.snapshot.reports[0].observations[0].reference),
  ).toBe(true);
  expect(() =>
    Object.assign(packet.snapshot.reports[0].observations[0], {
      observation: 'forged',
    }),
  ).toThrow();
  const source = repo.read(boundary.organization_id).reports[0];
  const draft = repo.addVisit(
    boundary.organization_id,
    repo.read(boundary.organization_id).plans[0].id,
    '2027-01-01',
  );
  repo.saveVisit(boundary.organization_id, draft, {
    ...draft.content,
    summary: 'Changed private draft; not published evidence',
  });
  expect(
    (await createPropertyPassportFoundation(model, boundary, admitted))
      .integrity,
  ).toEqual(packet.integrity);
  model.prepareComparisonExamples();
  const newer = await createPropertyPassportFoundation(
    model,
    boundary,
    admitted,
  );
  expect(newer.integrity.sha256).not.toBe(packet.integrity.sha256);
  expect(JSON.stringify(packet)).toBe(serialized);
  expect(repo.read(boundary.organization_id).reports[0]).toEqual(source);
  expect(
    newer.snapshot.reports.slice(0, packet.snapshot.reports.length),
  ).toEqual(packet.snapshot.reports);
});

it('binds safe identities, version, positions, observations and recommendations in the integrity digest', async () => {
  const { model, boundary } = await fixture();
  const packet = await createPropertyPassportFoundation(
    model,
    { ...boundary, internal_notes: 'PRIVATE' } as ReportBoundary,
    admitted,
  );
  const first = packet.snapshot.reports[0];
  const changes = [
    { ...packet.snapshot, organization_id: sampleCompanies[1].id },
    { ...packet.snapshot, customer_id: crypto.randomUUID() },
    { ...packet.snapshot, location_id: crypto.randomUUID() },
    {
      ...packet.snapshot,
      reports: [
        {
          ...first,
          reference: {
            ...first.reference,
            published_version: first.reference.published_version + 1,
          },
        },
      ],
    },
    {
      ...packet.snapshot,
      reports: [
        {
          ...first,
          observations: [
            {
              ...first.observations[0],
              reference: {
                ...first.observations[0].reference,
                source_index: 9,
              },
            },
          ],
        },
      ],
    },
    {
      ...packet.snapshot,
      reports: [
        {
          ...first,
          observations: [
            {
              ...first.observations[0],
              observation: 'Different fact',
              recommendation: 'Different recommendation',
            },
          ],
        },
      ],
    },
  ];
  for (const changed of changes)
    expect(await documentHash(changed)).not.toBe(packet.integrity.sha256);
  expect(JSON.stringify(packet)).not.toContain('PRIVATE');
});

it.each([
  'logout',
  'property-switch',
  'new-publication',
  'admission-revoked',
] as const)(
  'rejects %s during hashing without retaining an archive or changing sources',
  async (change) => {
    const { model, boundary } = await fixture();
    const admission = { enabled: true };
    const pending = createPropertyPassportFoundation(
      model,
      boundary,
      admission,
    );
    if (change === 'logout') model.logout();
    if (change === 'property-switch')
      model.selectProperty(
        model
          .properties()
          .find((property) => property.id !== boundary.location_id)!.id,
      );
    if (change === 'new-publication') model.prepareAttentionExamples();
    if (change === 'admission-revoked') admission.enabled = false;
    await expect(pending).rejects.toThrow();
  },
);

it.each([
  'logged-out',
  'report-access-denied',
  'crm-missing',
  'source-error',
] as const)(
  'retained snapshots do not confer access after %s; exact read remains UNKNOWN',
  async (denied) => {
    const { model, operations, boundary } = await fixture();
    const packet = await createPropertyPassportFoundation(
      model,
      boundary,
      admitted,
    );
    if (denied === 'logged-out') model.logout();
    if (denied === 'report-access-denied') {
      const data = model.read();
      data.context.reports = false;
      vi.spyOn(model, 'read').mockReturnValue(data);
    }
    if (denied === 'crm-missing')
      vi.spyOn(operations, 'syntheticProperty').mockImplementation(() => {
        throw Error('Missing current CRM relationship');
      });
    if (denied === 'source-error')
      vi.spyOn(model, 'read').mockImplementation(() => {
        throw Error('Read unavailable');
      });
    await expect(
      createPropertyPassportFoundation(model, boundary, admitted),
    ).rejects.toThrow();
    expect(
      readPropertyPassportEvidence(
        model,
        packet.snapshot.reports[0].reference,
        admitted,
      ),
    ).toEqual(unknown);
    expect(packet.snapshot.reports_available).toBe(3);
  },
);

it.each(['phase', 'severity'] as const)(
  'rejects object-valued %s before coercion, serialization or caller freezing',
  async (field) => {
    const { model, boundary } = await fixture();
    const data = model.read();
    const source = data.reports[0];
    const value = {
      private_note: 'PRIVATE malformed source',
      toString: vi.fn(() => (field === 'phase' ? 'after' : 'urgent')),
      toJSON: vi.fn(() => 'PRIVATE serialized source'),
    };
    if (field === 'phase') Object.assign(source, { phase: value });
    else Object.assign(source.findings[0], { severity: value });
    vi.spyOn(model, 'read').mockReturnValue(data);
    await expect(
      createPropertyPassportFoundation(model, boundary, admitted),
    ).rejects.toThrow('enums');
    expect(
      readPropertyPassportEvidence(
        model,
        {
          ...boundary,
          kind: 'report',
          report_id: source.id,
          published_version: source.version,
        },
        admitted,
      ),
    ).toEqual(unknown);
    expect(value.toString).not.toHaveBeenCalled();
    expect(value.toJSON).not.toHaveBeenCalled();
    expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(source)).toBe(false);
  },
);

it.each(['phase', 'severity'] as const)(
  'rejects boxed-string %s rather than retaining an object in the safe snapshot',
  async (field) => {
    const { model, boundary } = await fixture();
    const data = model.read();
    const value = Object.assign(
      Object(field === 'phase' ? 'after' : 'urgent') as object,
      {
        private_note: 'PRIVATE boxed source',
      },
    );
    if (field === 'phase') Object.assign(data.reports[0], { phase: value });
    else Object.assign(data.reports[0].findings[0], { severity: value });
    vi.spyOn(model, 'read').mockReturnValue(data);
    await expect(
      createPropertyPassportFoundation(model, boundary, admitted),
    ).rejects.toThrow('enums');
    expect(Object.isFrozen(value)).toBe(false);
  },
);

it.each(['phase', 'severity'] as const)(
  'rejects %s source drift during hashing while leaving caller-owned objects mutable',
  async (field) => {
    const { model, boundary } = await fixture();
    const data = model.read();
    vi.spyOn(model, 'read').mockReturnValue(data);
    const pending = createPropertyPassportFoundation(model, boundary, admitted);
    const value = {
      private_note: 'PRIVATE changed while hashing',
      toString: vi.fn(() => (field === 'phase' ? 'after' : 'urgent')),
    };
    if (field === 'phase') Object.assign(data.reports[0], { phase: value });
    else Object.assign(data.reports[0].findings[0], { severity: value });
    await expect(pending).rejects.toThrow('enums');
    expect(value.toString).not.toHaveBeenCalled();
    expect(Object.isFrozen(value)).toBe(false);
  },
);
