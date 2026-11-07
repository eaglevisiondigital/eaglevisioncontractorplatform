import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import type {
  PassportFindingReference,
  PassportReportReference,
} from '../src/domain/property/passport';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  assertServicePassportDetailCurrentNow,
  inspectServicePassportDesk,
  openServicePassportFinding,
  openServicePassportJob,
  openServicePassportReport,
  readServicePassportDesk,
} from '../src/lib/workflows/service-passport-desk';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture(brand: number) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0],
    org = sources.company.id,
    backupOwner = org + '-passport-final-authority-owner',
    input = {
      query: '',
      customer_id: entry.target.customer_id,
      location_id: entry.target.location_id,
      job_id: entry.target.job_id!,
      state: '',
    };
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    backupOwner,
  );
  const view = await readServicePassportDesk(sources, input, gate),
    detail = await openServicePassportJob(view, entry.target.job_id!),
    report = detail.customer_safe.documentation.find(
      (r) =>
        r.report.reference.report_id === entry.report_id &&
        r.report.reference.published_version === entry.published_version,
    )!.report,
    finding = report.observations[0];
  if (!finding) throw Error('Original exact published finding required');
  return {
    gate,
    sources,
    entry,
    org,
    backupOwner,
    input,
    view,
    detail,
    report,
    finding,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Kind = 'report' | 'finding';

function finalReference(f: Fixture, kind: Kind, change: () => void) {
  const original = kind === 'report' ? f.report.reference : f.finding.reference,
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let afterDigest = false,
    captures = 0,
    changed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (
      (kind === 'report' &&
        body.reference?.kind === 'report' &&
        Array.isArray(body.observations)) ||
      (kind === 'finding' && body.mode === 'LOCAL_SERVICE_PASSPORT_FINDING')
    )
      afterDigest = true;
    return result;
  });
  const reference = new Proxy(
    { ...original },
    {
      getOwnPropertyDescriptor(target, key) {
        // After the canonical report digest, the original portfolio, lifecycle
        // and Passport readers each compare the live report reference once.
        // A finding has one final live-reference comparison after its own digest.
        if (
          afterDigest &&
          key === 'report_id' &&
          ++captures === (kind === 'report' ? 3 : 1)
        ) {
          changed = true;
          change();
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  return {
    reference,
    witness() {
      expect(afterDigest).toBe(true);
      expect(changed).toBe(true);
      expect(captures).toBe(kind === 'report' ? 3 : 1);
    },
  };
}
async function open(
  f: Fixture,
  kind: Kind,
  reference: PassportReportReference | PassportFindingReference,
) {
  return kind === 'report'
    ? openServicePassportReport(f.detail, reference as PassportReportReference)
    : openServicePassportFinding(
        f.detail,
        reference as PassportFindingReference,
      );
}
function writers(f: Fixture) {
  return [
    vi.spyOn(f.sources.estimates, 'save'),
    vi.spyOn(f.sources.estimates, 'issue'),
    vi.spyOn(f.sources.estimates, 'approveJob'),
    vi.spyOn(f.sources.estimates, 'assignJob'),
    vi.spyOn(f.sources.estimates, 'recordTime'),
    vi.spyOn(f.sources.estimates, 'submitExpense'),
    vi.spyOn(f.sources.estimates, 'projection'),
    vi.spyOn(f.sources.property, 'savePlan'),
    vi.spyOn(f.sources.property, 'saveVisit'),
    vi.spyOn(f.sources.property, 'publish'),
    vi.spyOn(f.sources.operations, 'recordConsent'),
    vi.spyOn(f.sources.operations, 'assignIntake'),
    vi.spyOn(f.entry.release, 'command'),
    vi.spyOn(globalThis, 'fetch'),
  ];
}
function privateFields(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...([
      'email',
      'phone',
      'internal_notes',
      'unit_cost_minor',
      'supplier',
      'payroll',
      'actor_id',
      'worker_id',
      'staff_type',
    ].includes(key)
      ? [key]
      : []),
    ...privateFields(child),
  ]);
}

for (const brand of [0, 1, 2]) {
  for (const kind of ['report', 'finding'] as const) {
    it(`brand ${brand}: ${kind} final reference capture with native revocation withholds documentation`, async () => {
      const f = await fixture(brand),
        canonical = f.sources.estimates.readSyntheticPrototypeSources(
          f.entry.target,
        ),
        property = f.sources.property.read(f.org),
        release = f.entry.release.read('staff'),
        calls = writers(f);
      let revoked: Promise<void> | undefined;
      const capture = finalReference(f, kind, () => {
          revoked = f.sources.operations.revokeOwner(
            f.org,
            f.entry.target.actor_id,
          );
        }),
        returned = await open(f, kind, capture.reference).then(
          () => true,
          () => false,
        );
      capture.witness();
      expect(revoked).toBeDefined();
      await revoked;
      expect(
        f.sources.operations
          .syntheticMemberships(f.org)
          .find((m) => m.user_id === f.entry.target.actor_id)!.active,
      ).toBe(false);
      expect(returned).toBe(false);
      expect(() => assertServicePassportDetailCurrentNow(f.detail)).toThrow();
      expect(inspectServicePassportDesk(f.view)).toMatchObject({
        status: 'UNKNOWN',
        replay: false,
        replacement: null,
      });
      await expect(open(f, kind, capture.reference)).rejects.toThrow();
      expect(
        f.sources.estimates.readSyntheticPrototypeSources({
          ...f.entry.target,
          actor_id: f.backupOwner,
        }),
      ).toEqual(canonical);
      expect(f.sources.property.read(f.org)).toEqual(property);
      expect(f.entry.release.read('staff')).toEqual(release);
      for (const call of calls) expect(call).not.toHaveBeenCalled();
    });

    it(`brand ${brand}: ${kind} final reference capture with admission withdrawal retains UNKNOWN`, async () => {
      const f = await fixture(brand),
        calls = writers(f),
        capture = finalReference(f, kind, () => {
          f.gate.confirmed = false;
        }),
        returned = await open(f, kind, capture.reference).then(
          () => true,
          () => false,
        );
      capture.witness();
      expect(f.gate.confirmed).toBe(false);
      expect(returned).toBe(false);
      f.gate.confirmed = true;
      expect(inspectServicePassportDesk(f.view)).toMatchObject({
        status: 'UNKNOWN',
        inspected_sources: null,
        replay: false,
        replacement: null,
      });
      await expect(open(f, kind, capture.reference)).rejects.toThrow();
      for (const call of calls) expect(call).not.toHaveBeenCalled();
    });
  }

  it(`brand ${brand}: exact published report and finding preserve original source, privacy and UNKNOWN completion without writers`, async () => {
    const f = await fixture(brand),
      canonical = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      property = f.sources.property.read(f.org),
      release = f.entry.release.read('staff'),
      calls = writers(f),
      report = await openServicePassportReport(
        f.detail,
        Object.fromEntries(
          Object.entries(f.report.reference).reverse(),
        ) as unknown as PassportReportReference,
      ),
      finding = await openServicePassportFinding(
        f.detail,
        Object.fromEntries(
          Object.entries(f.finding.reference).reverse(),
        ) as unknown as PassportFindingReference,
      );
    expect(report).toEqual(f.report);
    expect(finding.finding).toEqual(f.finding);
    expect(finding.report_reference).toEqual(f.report.reference);
    expect(report.reference).toMatchObject({
      organization_id: f.org,
      customer_id: f.entry.target.customer_id,
      location_id: f.entry.target.location_id,
      report_id: f.entry.report_id,
      published_version: f.entry.published_version,
    });
    expect(f.detail.customer_safe.scope).toMatchObject({
      job_id: f.entry.target.job_id,
      estimate_id: f.entry.target.estimate_id,
      issued_version_id: f.entry.target.version_id,
    });
    expect(f.detail.customer_safe.physical_completion).toBe('UNKNOWN');
    expect(f.detail.customer_safe.customer_acceptance).toBe('UNKNOWN');
    expect(f.detail.customer_safe.warranty).toBe('UNKNOWN');
    expect(privateFields(report)).toEqual([]);
    expect(privateFields(finding)).toEqual([]);
    expect(JSON.stringify(finding)).not.toContain(
      'PRIVATE staff scheduling and supplier details',
    );
    expect(finding.interpretation).toBe(
      'PUBLISHED_OBSERVATION_NOT_COMPLETION_VERIFICATION',
    );
    expect(inspectServicePassportDesk(f.view)).toMatchObject({
      status: 'CURRENT_READ_ONLY',
      inspected_sources: 3,
      replay: false,
      replacement: null,
    });
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(canonical);
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(f.entry.release.read('staff')).toEqual(release);
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: a native saved forecast change rejects stale documentation before caller reference capture`, async () => {
    const f = await fixture(brand),
      job = f.sources.estimates.syntheticJob(f.org, f.entry.target.job_id!)!;
    await f.sources.estimates.projection(f.org, job, {
      ...job.projection,
      remaining: {
        ...job.projection.remaining,
        other: job.projection.remaining.other + 500,
      },
    });
    const calls = writers(f),
      captured = vi.fn(),
      reference = new Proxy(
        { ...f.report.reference },
        {
          getOwnPropertyDescriptor(target, key) {
            captured();
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    await expect(
      openServicePassportReport(f.detail, reference),
    ).rejects.toThrow();
    expect(captured).not.toHaveBeenCalled();
    expect(inspectServicePassportDesk(f.view).status).toBe('UNKNOWN');
    f.gate.confirmed = false;
    f.gate.confirmed = true;
    await expect(
      openServicePassportFinding(f.detail, f.finding.reference),
    ).rejects.toThrow();
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: copied detail and foreign property references cannot replace the original report or finding`, async () => {
    const f = await fixture(brand),
      calls = writers(f);
    await expect(
      openServicePassportReport({ ...f.detail }, f.report.reference),
    ).rejects.toThrow();
    await expect(
      openServicePassportFinding({ ...f.detail }, f.finding.reference),
    ).rejects.toThrow();
    assertServicePassportDetailCurrentNow(f.detail);
    const foreign = {
      ...f.report.reference,
      organization_id: sampleCompanies[(brand + 1) % 3].id,
    };
    await expect(
      openServicePassportReport(f.detail, foreign),
    ).rejects.toThrow();
    expect(inspectServicePassportDesk(f.view).status).toBe('UNKNOWN');
    await expect(
      openServicePassportReport(f.detail, f.report.reference),
    ).rejects.toThrow();
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: default-OFF and withdrawn original admission reject before source or reference descriptors`, async () => {
    const read = vi.fn(() => {
        throw Error('Unadmitted source must not be read');
      }),
      unknown = new Proxy({}, { get: read, getOwnPropertyDescriptor: read });
    await expect(
      readServicePassportDesk(unknown as never, unknown as never),
    ).rejects.toThrow('OFF');
    expect(read).not.toHaveBeenCalled();
    const f = await fixture(brand),
      calls = writers(f),
      captured = vi.fn(),
      reference = new Proxy(
        { ...f.finding.reference },
        {
          getOwnPropertyDescriptor(target, key) {
            captured();
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    f.gate.confirmed = false;
    await expect(
      openServicePassportFinding(f.detail, reference),
    ).rejects.toThrow();
    expect(captured).not.toHaveBeenCalled();
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });
}
