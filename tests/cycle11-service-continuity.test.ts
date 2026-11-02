import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { Phase3Repository } from '../src/lib/phase3';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  assertServiceContinuityCurrentNow,
  assertServiceContinuityDetailCurrentNow,
  inspectServiceContinuity,
  openServiceContinuityJob,
  openServiceContinuityReport,
  readServiceContinuity,
  selectServiceContinuityJob,
  type ServiceContinuityInput,
} from '../src/lib/workflows/service-continuity';
afterEach(() => vi.restoreAllMocks());
async function fixture(i = 0) {
  const gate = { enabled: true, confirmed: true };
  return {
    sources: await prepareOperatingSources(sampleCompanies[i], gate),
    gate,
    input: { query: '', location_id: '', job_id: '' },
  };
}
it.each([0, 1, 2])(
  'brand %s follows actual request, distinct same-property jobs, immutable scope/receipt and safe Passport',
  async (i) => {
    const { sources, gate, input } = await fixture(i),
      before = sources.property.read(sources.company.id),
      estimates = await Promise.all(
        sources.entries.map((e) =>
          sources.estimates.get(sources.company.id, e.target.estimate_id),
        ),
      ),
      release = sources.entries.map((e) => e.release.read('staff'));
    const writers = [
      vi.spyOn(sources.estimates, 'create'),
      vi.spyOn(sources.estimates, 'revise'),
      vi.spyOn(sources.estimates, 'issue'),
      vi.spyOn(sources.estimates, 'approveJob'),
      vi.spyOn(sources.estimates, 'assignJob'),
      vi.spyOn(sources.property, 'publish'),
      vi.spyOn(sources.property, 'saveVisit'),
      vi.spyOn(sources.operations, 'assignIntake'),
      ...sources.entries.map((e) => vi.spyOn(e.release, 'command')),
    ];
    const view = await readServiceContinuity(sources, input, gate);
    expect(view).toMatchObject({
      available_jobs: 4,
      available_properties: 3,
      available_reports: 4,
      matching_jobs: 4,
      history_completeness: 'UNKNOWN',
      physical_completion: 'UNVERIFIED',
      customer_acceptance: 'UNVERIFIED',
      warranty: 'UNVERIFIED',
      authority: 'READ_ONLY_LOCAL_NAVIGATION',
    });
    const siblings = view.paths.filter(
      (p) => p.location_id === sources.entries[0].target.location_id,
    );
    expect(siblings).toHaveLength(2);
    expect(new Set(siblings.map((p) => p.request.id)).size).toBe(1);
    expect(new Set(siblings.map((p) => p.issued_version_id)).size).toBe(2);
    for (const path of siblings) {
      const detail = await openServiceContinuityJob(view, path.job_id);
      expect(detail.staff.request.id).toBe(
        sources.entries[0].intake_request_id,
      );
      expect(detail.staff.issued_version_id).toBe(path.issued_version_id);
      expect(detail.staff.receipt.id).toBe(path.receipt.id);
      expect(detail.staff.request_scope_association).toBe(
        'EXPLICIT_STAFF_SELECTION_NOT_RECORDED_REQUEST_ESTIMATE_FK',
      );
      expect(detail.customer_safe.property_passport.jobs).toHaveLength(2);
      expect(detail.customer_safe.property_passport.reports).toHaveLength(2);
      expect(
        detail.customer_safe.selected_documentation.job.reference.job_id,
      ).toBe(path.job_id);
      expect(selectServiceContinuityJob(detail)).toBe(path.job_id);
      for (const item of detail.customer_safe.property_passport.reports) {
        const report = await openServiceContinuityReport(
          detail,
          item.report.reference,
        );
        expect(report).toEqual(item.report);
        expect(report.reference.location_id).toBe(path.location_id);
      }
      expect(JSON.stringify(detail.customer_safe)).not.toMatch(
        /PRIVATE|unit_cost_minor|amount_minor|internal_notes|supplier|payroll|margin_bps|worker_id|actor_id|recorded_by|receipt_id|offer_id/,
      );
      expect(
        Object.isFrozen(detail.customer_safe.property_passport.jobs[0].lines),
      ).toBe(true);
    }
    expect(sources.property.read(sources.company.id)).toEqual(before);
    expect(
      await Promise.all(
        sources.entries.map((e) =>
          sources.estimates.get(sources.company.id, e.target.estimate_id),
        ),
      ),
    ).toEqual(estimates);
    expect(sources.entries.map((e) => e.release.read('staff'))).toEqual(
      release,
    );
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
  },
);
it('literal request/report/version search and combined exact property/job filtering keep accurate available counts', async () => {
  const { sources, gate, input } = await fixture(),
    all = await readServiceContinuity(sources, input, gate),
    path = all.paths[0];
  for (const query of [
    path.request.id,
    path.issued_version_id,
    path.receipt.id,
    path.linked_reports[0].reference.report_id,
  ]) {
    const filtered = await readServiceContinuity(
      sources,
      { ...input, query, location_id: path.location_id, job_id: path.job_id },
      gate,
    );
    expect(filtered.matching_jobs).toBe(1);
    expect(filtered.paths[0].job_id).toBe(path.job_id);
    expect(filtered.available_jobs).toBe(4);
  }
  for (const query of ['.*', '%', 'unrecorded-text'])
    expect(
      (await readServiceContinuity(sources, { ...input, query }, gate)).paths,
    ).toEqual([]);
});
it('keeps distinct property ownership even when address labels are identical', async () => {
  const { sources, gate, input } = await fixture(),
    a = sources.entries[0],
    b = sources.entries[1],
    address = await sources.operations.getLocation(
      sources.company.id,
      a.target.customer_id,
      a.target.location_id,
    );
  await sources.operations.saveLocation(
    sources.company.id,
    b.target.customer_id,
    {
      address_line1: address.address_line1,
      address_line2: address.address_line2,
      city: address.city,
      region: address.region,
      postal_code: address.postal_code,
      country_code: address.country_code,
    },
    b.target.location_id,
  );
  const view = await readServiceContinuity(sources, input, gate);
  expect(view.available_properties).toBe(3);
  expect(new Set(view.property_options.map((p) => p.location_id)).size).toBe(3);
});
it('default OFF rejects before touching any source getter', async () => {
  let invoked = false;
  const sources = Object.defineProperty({}, 'company', {
    get() {
      invoked = true;
      throw Error('read');
    },
  }) as OperatingSources;
  await expect(
    readServiceContinuity(sources, { query: '', location_id: '', job_id: '' }),
  ).rejects.toThrow(/OFF/);
  expect(invoked).toBe(false);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'version_id',
] as const)('rejects foreign original %s', async (key) => {
  const { sources, gate, input } = await fixture();
  sources.entries[0].target[key] = 'foreign';
  await expect(readServiceContinuity(sources, input, gate)).rejects.toThrow();
});
it.each(['property', 'job', 'property-job'] as const)(
  'denies non-authorized %s filter without returning another source',
  async (kind) => {
    const { sources, gate, input } = await fixture();
    const wrong = { ...input };
    if (kind === 'property') wrong.location_id = 'foreign';
    if (kind === 'job') wrong.job_id = 'foreign';
    if (kind === 'property-job') {
      wrong.location_id = sources.entries[0].target.location_id;
      wrong.job_id = sources.entries[1].target.job_id!;
    }
    await expect(readServiceContinuity(sources, wrong, gate)).rejects.toThrow(
      /authorized/,
    );
  },
);
it('visible filter cannot be bypassed by a valid hidden job or a reconstructed view/detail', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceContinuity(
      sources,
      { ...input, job_id: sources.entries[0].target.job_id! },
      gate,
    );
  await expect(
    openServiceContinuityJob(view, sources.entries[1].target.job_id!),
  ).rejects.toThrow(/visible/);
  await expect(
    openServiceContinuityJob(
      JSON.parse(JSON.stringify(view)),
      view.paths[0].job_id,
    ),
  ).rejects.toThrow(/retained/);
  const detail = await openServiceContinuityJob(view, view.paths[0].job_id);
  expect(() =>
    selectServiceContinuityJob(JSON.parse(JSON.stringify(detail))),
  ).toThrow(/retained/);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'report_id',
  'published_version',
] as const)(
  'rejects wrong exact report %s and never substitutes latest',
  async (key) => {
    const { sources, gate, input } = await fixture(),
      view = await readServiceContinuity(sources, input, gate),
      detail = await openServiceContinuityJob(view, view.paths[0].job_id),
      reference = {
        ...detail.customer_safe.property_passport.reports[0].report.reference,
      };
    Object.assign(reference, {
      [key]: key === 'published_version' ? 2 : 'foreign',
    });
    await expect(
      openServiceContinuityReport(detail, reference),
    ).rejects.toThrow();
  },
);
it('rejects missing exact primary documentation rather than claiming no concerns or complete coverage', async () => {
  const { sources, gate, input } = await fixture();
  sources.entries[0].published_version = 2;
  await expect(readServiceContinuity(sources, input, gate)).rejects.toThrow();
});
it('retains frozen history after later empty observations without inferring completed repairs', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceContinuity(sources, input, gate),
    detail = await openServiceContinuityJob(view, view.paths[0].job_id),
    original = JSON.stringify(detail),
    entry = sources.entries[0];
  let visit = sources.property.addVisit(
    sources.company.id,
    entry.plan_id,
    '2026-12-21',
    'after',
  );
  sources.property.saveVisit(sources.company.id, visit, {
    summary: 'Later observation has no additional findings; repair unverified.',
    internal_notes: 'PRIVATE',
    findings: [],
    checklist: [],
  });
  visit = sources.property
    .read(sources.company.id)
    .visits.find((v) => v.id === visit.id)!;
  sources.property.submit(sources.company.id, visit);
  visit = sources.property
    .read(sources.company.id)
    .visits.find((v) => v.id === visit.id)!;
  sources.property.publish(sources.company.id, visit);
  expect(() => selectServiceContinuityJob(detail)).toThrow();
  expect(JSON.stringify(detail)).toBe(original);
  expect(inspectServiceContinuity(view).status).toBe('UNKNOWN');
  const fresh = await readServiceContinuity(sources, input, gate);
  expect(fresh.available_reports).toBe(5);
  expect(fresh.physical_completion).toBe('UNVERIFIED');
});
it('revoked staff loses detail, report and callback access', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceContinuity(sources, input, gate),
    detail = await openServiceContinuityJob(view, view.paths[0].job_id);
  await sources.operations.configure(
    sources.company.id,
    'active',
    'starter',
    {},
    sources.company.id + '-backup-owner',
  );
  await sources.operations.revokeOwner(
    sources.company.id,
    sources.entries[0].target.actor_id,
  );
  expect(() => assertServiceContinuityDetailCurrentNow(detail)).toThrow();
  expect(() => selectServiceContinuityJob(detail)).toThrow();
  await expect(
    openServiceContinuityReport(
      detail,
      detail.customer_safe.property_passport.reports[0].report.reference,
    ),
  ).rejects.toThrow();
});
it('equal-context model replacement invalidates previous projection and source navigation', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceContinuity(sources, input, gate),
    detail = await openServiceContinuityJob(view, view.paths[0].job_id),
    entry = sources.entries.find(
      (e) => e.target.job_id === detail.staff.job_id,
    )!,
    replacement = new CustomerPortalPreviewModel(
      sources.company,
      sources.property,
    );
  replacement.admitLocalJourney(entry.target, gate);
  entry.customerModel = replacement;
  expect(() => assertServiceContinuityDetailCurrentNow(detail)).toThrow();
  expect(inspectServiceContinuity(view).status).toBe('UNKNOWN');
});
it('equal-ID repository replacement does not retain navigation authority', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceContinuity(sources, input, gate);
  sources.estimates = new Phase3Repository(sources.operations);
  expect(() => assertServiceContinuityCurrentNow(view)).toThrow();
});
it('a newer draft/current source does not silently replace the exact original issued version', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceContinuity(sources, input, gate);
  await sources.estimates.revise(sources.company.id, sources.entries[0].issued);
  await expect(
    openServiceContinuityJob(view, view.paths[0].job_id),
  ).rejects.toThrow();
});
it('concurrent reads return only original immutable identities and create no duplicate records', async () => {
  const { sources, gate, input } = await fixture(),
    before = sources.property.read(sources.company.id),
    views = await Promise.all([
      readServiceContinuity(sources, input, gate),
      readServiceContinuity(sources, { ...input }, gate),
    ]);
  expect(views[0]).toEqual(views[1]);
  expect(sources.property.read(sources.company.id)).toEqual(before);
});
it.each(['query', 'location_id', 'job_id', 'gate', 'source', 'model'] as const)(
  'rechecks original %s after final continuity digest',
  async (change) => {
    const { sources, gate, input } = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.mode === 'LOCAL_SOURCE_SERVICE_CONTINUITY') {
        reached = true;
        if (
          change === 'query' ||
          change === 'location_id' ||
          change === 'job_id'
        )
          input[change] = 'changed';
        if (change === 'gate') gate.confirmed = false;
        if (change === 'source')
          sources.entries[0].target.location_id = 'foreign';
        if (change === 'model') sources.entries[0].customerModel.logout();
      }
      return value;
    });
    await expect(readServiceContinuity(sources, input, gate)).rejects.toThrow();
    expect(reached).toBe(true);
  },
);
it('rechecks original live filter after final detail digest and permanently marks the retained view UNKNOWN', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceContinuity(sources, input, gate),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'LOCAL_SERVICE_CONTINUITY_DETAIL') {
      reached = true;
      input.query = 'changed';
    }
    return value;
  });
  await expect(
    openServiceContinuityJob(view, view.paths[0].job_id),
  ).rejects.toThrow();
  expect(reached).toBe(true);
  input.query = '';
  expect(inspectServiceContinuity(view).status).toBe('UNKNOWN');
});
it('report reference changes during final source digest are rejected without replay', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceContinuity(sources, input, gate),
    detail = await openServiceContinuityJob(view, view.paths[0].job_id),
    reference = {
      ...detail.customer_safe.property_passport.reports[0].report.reference,
    },
    digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    reference.published_version = 2;
    return value;
  });
  await expect(
    openServiceContinuityReport(detail, reference),
  ).rejects.toThrow();
  reference.published_version = 1;
  await expect(
    openServiceContinuityReport(detail, reference),
  ).rejects.toThrow();
});
it.each([
  { query: 'x'.repeat(101), location_id: '', job_id: '' },
  { query: '', location_id: 'x'.repeat(201), job_id: '' },
  { query: '', location_id: '', job_id: 'x'.repeat(201) },
])('rejects invalid bounded input %j', async (bad) => {
  const { sources, gate } = await fixture();
  await expect(readServiceContinuity(sources, bad, gate)).rejects.toThrow();
});
it('rejects accessors, extra fields and coercive filters without executing them', async () => {
  const { sources, gate, input } = await fixture();
  let invoked = false;
  const evil = Object.defineProperty({ ...input }, 'query', {
    enumerable: true,
    get() {
      invoked = true;
      return '';
    },
  });
  await expect(readServiceContinuity(sources, evil, gate)).rejects.toThrow();
  await expect(
    readServiceContinuity(
      sources,
      {
        ...input,
        query: {
          toString() {
            invoked = true;
            return '';
          },
        },
      } as unknown as ServiceContinuityInput,
      gate,
    ),
  ).rejects.toThrow();
  await expect(
    readServiceContinuity(
      sources,
      {
        ...input,
        toJSON() {
          invoked = true;
          return input;
        },
      } as ServiceContinuityInput,
      gate,
    ),
  ).rejects.toThrow();
  expect(invoked).toBe(false);
});
it('source toJSON injection is denied without running the serializer', async () => {
  const { sources, gate, input } = await fixture();
  let invoked = false;
  Object.assign(sources.entries[0].issued, {
    toJSON() {
      invoked = true;
      return {};
    },
  });
  await expect(readServiceContinuity(sources, input, gate)).rejects.toThrow();
  expect(invoked).toBe(false);
});
it('actual request/offer/receipt mismatches are denied rather than joined by summary', async () => {
  const { sources, gate, input } = await fixture();
  sources.entries[0].receipt_id = sources.entries[1].receipt_id;
  await expect(readServiceContinuity(sources, input, gate)).rejects.toThrow();
});
it('current access denial remains UNKNOWN after a source is restored', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceContinuity(sources, input, gate);
  gate.confirmed = false;
  expect(inspectServiceContinuity(view).status).toBe('UNKNOWN');
  gate.confirmed = true;
  expect(inspectServiceContinuity(view).status).toBe('UNKNOWN');
  await expect(
    openServiceContinuityJob(view, view.paths[0].job_id),
  ).rejects.toThrow(/UNKNOWN/);
});
it('a report accessor is rejected without executing it', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceContinuity(sources, input, gate),
    detail = await openServiceContinuityJob(view, view.paths[0].job_id);
  let invoked = false;
  const reference = Object.defineProperty(
    { ...detail.customer_safe.property_passport.reports[0].report.reference },
    'published_version',
    {
      enumerable: true,
      get() {
        invoked = true;
        return 1;
      },
    },
  );
  await expect(
    openServiceContinuityReport(detail, reference),
  ).rejects.toThrow();
  expect(invoked).toBe(false);
});
