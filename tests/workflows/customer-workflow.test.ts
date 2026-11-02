import { afterEach, describe, expect, it, vi } from 'vitest';
import * as proofOfWork from '../../src/domain/property/proof-of-work-pack';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareLocalJourney } from '../../src/lib/workflows/journey-runtime';
import {
  readCustomerWorkflow,
  prepareCustomerWorkflowPack,
  verifyCustomerWorkflowPack,
} from '../../src/lib/workflows/customer-workflow';
const gate = () => ({ enabled: true, confirmed: true });
async function fixture(index = 0) {
  const journey = await prepareLocalJourney(sampleCompanies[index], gate());
  const selection = {
    report_id: journey.report_id,
    published_version: journey.published_version,
  };
  return { ...journey, selection };
}
afterEach(() => vi.restoreAllMocks());
describe('same-repository Field → customer Passport documentation', () => {
  for (const index of [0, 1, 2]) {
    it(`reads actual exact issued job and published report for brand ${index}`, async () => {
      const f = await fixture(index),
        read = await readCustomerWorkflow(
          f.customerModel,
          f.target,
          f.selection,
          gate(),
        );
      expect(read.status).toBe('CURRENT');
      expect(read.timeline?.snapshot.organization_id).toBe(
        f.target.organization_id,
      );
      expect(read.timeline?.snapshot.customer_id).toBe(f.target.customer_id);
      expect(read.timeline?.snapshot.location_id).toBe(f.target.location_id);
      const events = read.timeline!.snapshot.events;
      expect(events).toHaveLength(2);
      expect(
        events.find((e) => e.kind === 'inspection-documentation')?.reference,
      ).toMatchObject({
        report_id: f.report_id,
        published_version: f.published_version,
      });
      expect(
        events.find((e) => e.kind === 'issued-job-scope')?.reference,
      ).toMatchObject({
        job_id: f.target.job_id,
        estimate_id: f.target.estimate_id,
        issued_version_id: f.target.version_id,
      });
      expect(JSON.stringify(read)).not.toMatch(
        /PRIVATE|unit_cost_minor|amount_minor|internal_notes|profit_margin|payroll|actor_id|worker_id|supplier/,
      );
      expect(read.physical_completion).toBe('UNVERIFIED');
      expect(read.timeline?.snapshot.history_completeness).toBe('UNKNOWN');
    });
    it(`explicitly prepares the existing immutable two-source pack with no business effects for brand ${index}`, async () => {
      const f = await fixture(index),
        before = f.property.read(f.company.id),
        release = f.release.read('staff');
      const writes = [
        vi.spyOn(f.customerModel, 'prepareHistory'),
        vi.spyOn(f.property, 'publish'),
        vi.spyOn(f.property, 'saveVisit'),
        vi.spyOn(f.property, 'savePlan'),
        vi.spyOn(f.estimates, 'approveJob'),
        vi.spyOn(f.estimates, 'issue'),
        vi.spyOn(f.release, 'command'),
      ];
      const read = await readCustomerWorkflow(
        f.customerModel,
        f.target,
        f.selection,
        gate(),
      );
      const pack = await prepareCustomerWorkflowPack(
        f.customerModel,
        f.target,
        f.selection,
        { ...gate(), reviewed_source_hash: read.source_hash! },
      );
      expect(pack.snapshot.events).toHaveLength(2);
      expect(pack.snapshot.media).toEqual({
        status: 'UNAVAILABLE',
        reason: 'authorized-projection-has-no-media',
        items: [],
      });
      expect(pack.snapshot.physical_completion).toBe('UNVERIFIED');
      expect(pack.snapshot.customer_acceptance).toBe('UNVERIFIED');
      expect(pack.snapshot.warranty).toBe('UNVERIFIED');
      expect(pack.snapshot.delivery).toBe('NOT_SENT');
      expect(Object.isFrozen(pack.snapshot.events)).toBe(true);
      expect(
        await verifyCustomerWorkflowPack(
          f.customerModel,
          f.target,
          f.selection,
          pack,
          gate(),
        ),
      ).toBe('CURRENT');
      expect(JSON.stringify(pack)).not.toMatch(
        /PRIVATE|unit_cost_minor|amount_minor|internal_notes|profit_margin|payroll|actor_id|worker_id|supplier/,
      );
      expect(f.property.read(f.company.id)).toEqual(before);
      expect(f.release.read('staff')).toEqual(release);
      for (const spy of writes) expect(spy).not.toHaveBeenCalled();
    });
  }
  it('is default OFF before reading customer sources', async () => {
    const f = await fixture(),
      source = vi.spyOn(f.customerModel, 'read');
    expect(
      (await readCustomerWorkflow(f.customerModel, f.target, f.selection))
        .status,
    ).toBe('UNKNOWN');
    expect(source).not.toHaveBeenCalled();
  });
  for (const key of [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'job_id',
    'estimate_id',
    'version_id',
  ] as const) {
    it(`independently rejects foreign ${key} navigation context`, async () => {
      const f = await fixture();
      const result = await readCustomerWorkflow(
        f.customerModel,
        { ...f.target, [key]: 'foreign-exact-id' },
        f.selection,
        gate(),
      );
      expect(result.status).toBe('UNKNOWN');
      expect(result.timeline).toBeNull();
    });
  }
  for (const selection of [
    { report_id: crypto.randomUUID(), published_version: 1 },
    { report_id: '', published_version: 1 },
    { report_id: 'replace', published_version: 0 },
    { report_id: 'replace', published_version: 2 },
  ]) {
    it(`does not select a different report for absent/invalid published version ${selection.published_version}`, async () => {
      const f = await fixture();
      const selected = {
        ...selection,
        report_id:
          selection.report_id === 'replace' ? f.report_id : selection.report_id,
      };
      expect(
        (
          await readCustomerWorkflow(
            f.customerModel,
            f.target,
            selected,
            gate(),
          )
        ).status,
      ).toBe('UNKNOWN');
    });
  }
  it('requires original model access and current synthetic staff independently of a retained navigation handoff', async () => {
    const f = await fixture(),
      read = await readCustomerWorkflow(
        f.customerModel,
        f.target,
        f.selection,
        gate(),
      );
    await f.operations.configure(
      f.company.id,
      'active',
      'starter',
      {},
      f.company.id + '-backup-owner',
    );
    await f.operations.revokeOwner(f.company.id, f.target.actor_id);
    expect(
      (
        await readCustomerWorkflow(
          f.customerModel,
          f.target,
          f.selection,
          gate(),
        )
      ).timeline,
    ).toBeNull();
    await expect(
      prepareCustomerWorkflowPack(f.customerModel, f.target, f.selection, {
        ...gate(),
        reviewed_source_hash: read.source_hash!,
      }),
    ).rejects.toThrow();
  });
  it('keeps immutable original pack stale when another exact published report extends the property history', async () => {
    const f = await fixture(),
      read = await readCustomerWorkflow(
        f.customerModel,
        f.target,
        f.selection,
        gate(),
      );
    const pack = await prepareCustomerWorkflowPack(
      f.customerModel,
      f.target,
      f.selection,
      { ...gate(), reviewed_source_hash: read.source_hash! },
    );
    const immutable = JSON.stringify(pack);
    let visit = f.property.addVisit(
      f.company.id,
      f.plan_id,
      '2026-12-14',
      'after',
    );
    f.property.saveVisit(f.company.id, visit, {
      summary: 'Separate later published observation; no inferred repair.',
      internal_notes: 'PRIVATE',
      findings: [],
      checklist: [],
    });
    visit = f.property
      .read(f.company.id)
      .visits.find((v) => v.id === visit.id)!;
    f.property.submit(f.company.id, visit);
    visit = f.property
      .read(f.company.id)
      .visits.find((v) => v.id === visit.id)!;
    f.property.publish(f.company.id, visit);
    expect(
      await verifyCustomerWorkflowPack(
        f.customerModel,
        f.target,
        f.selection,
        pack,
        gate(),
      ),
    ).toBe('STALE');
    expect(JSON.stringify(pack)).toBe(immutable);
    await expect(
      prepareCustomerWorkflowPack(f.customerModel, f.target, f.selection, {
        ...gate(),
        reviewed_source_hash: read.source_hash!,
      }),
    ).rejects.toThrow();
  });
  for (const change of ['logout', 'confirmation', 'published-link'] as const) {
    it(`withholds preparation on ${change} while existing source hashing is pending`, async () => {
      const f = await fixture(),
        read = await readCustomerWorkflow(
          f.customerModel,
          f.target,
          f.selection,
          gate(),
        ),
        input = { ...gate(), reviewed_source_hash: read.source_hash! };
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      let changed = false;
      vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
        const result = await digest(...args);
        if (!changed) {
          changed = true;
          if (change === 'logout') f.customerModel.logout();
          if (change === 'confirmation') input.confirmed = false;
          if (change === 'published-link') {
            const plan = f.property
              .read(f.company.id)
              .plans.find((p) => p.id === f.plan_id)!;
            f.property.savePlan(f.company.id, {
              ...plan,
              name: plan.name + ' changed',
            });
          }
        }
        return result;
      });
      await expect(
        prepareCustomerWorkflowPack(
          f.customerModel,
          f.target,
          f.selection,
          input,
        ),
      ).rejects.toThrow();
      expect(f.release.read('staff').release_invoices).toEqual([]);
    });
  }
  it('rejects withdrawn default-off admission at the last reader hash wait', async () => {
    const f = await fixture(),
      g = gate(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.timeline_sha256 && body.sources) {
        reached = true;
        g.confirmed = false;
      }
      return result;
    });
    expect(
      (await readCustomerWorkflow(f.customerModel, f.target, f.selection, g))
        .status,
    ).toBe('UNKNOWN');
    expect(reached).toBe(true);
  });
  it('rejects missing confirmation and unreviewed source hashes', async () => {
    const f = await fixture(),
      read = await readCustomerWorkflow(
        f.customerModel,
        f.target,
        f.selection,
        gate(),
      );
    for (const input of [
      { ...gate(), reviewed_source_hash: '0'.repeat(64) },
      {
        enabled: true,
        confirmed: false,
        reviewed_source_hash: read.source_hash!,
      },
    ])
      await expect(
        prepareCustomerWorkflowPack(
          f.customerModel,
          f.target,
          f.selection,
          input,
        ),
      ).rejects.toThrow();
  });
  for (const change of ['source', 'confirmation'] as const) {
    it(`rejects ${change} change after the existing pack completes its last asynchronous work`, async () => {
      const f = await fixture(),
        read = await readCustomerWorkflow(
          f.customerModel,
          f.target,
          f.selection,
          gate(),
        );
      const input = { ...gate(), reviewed_source_hash: read.source_hash! };
      const existing = proofOfWork.prepareProofOfWorkPack;
      vi.spyOn(proofOfWork, 'prepareProofOfWorkPack').mockImplementation(
        async (...args) => {
          const actual = await existing(...args);
          if (change === 'confirmation') input.confirmed = false;
          else {
            const plan = f.property
              .read(f.company.id)
              .plans.find((p) => p.id === f.plan_id)!;
            f.property.savePlan(f.company.id, {
              ...plan,
              name: plan.name + ' changed at final source fence',
            });
          }
          return actual;
        },
      );
      await expect(
        prepareCustomerWorkflowPack(
          f.customerModel,
          f.target,
          f.selection,
          input,
        ),
      ).rejects.toThrow();
    });
  }
  it('rejects malformed/getter inputs and copied pack evidence without executing caller accessors', async () => {
    const f = await fixture();
    let called = false;
    const evil = Object.defineProperty({ ...f.selection }, 'report_id', {
      get: () => {
        called = true;
        return f.report_id;
      },
      enumerable: true,
    });
    expect(
      (await readCustomerWorkflow(f.customerModel, f.target, evil, gate()))
        .timeline,
    ).toBeNull();
    expect(called).toBe(false);
    expect(
      (
        await readCustomerWorkflow(
          f.customerModel,
          { ...f.target, extra: true } as typeof f.target,
          f.selection,
          gate(),
        )
      ).timeline,
    ).toBeNull();
    const fake = Object.defineProperty({}, 'snapshot', {
      get: () => {
        called = true;
        return {};
      },
    });
    expect(
      await verifyCustomerWorkflowPack(
        f.customerModel,
        f.target,
        f.selection,
        fake as never,
        gate(),
      ),
    ).toBe('UNKNOWN');
    expect(called).toBe(false);
  });
});

describe('original customer navigation selection at the final digest', () => {
  it('withholds the old report when the caller changes its exact published version', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      const body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.timeline_sha256 && body.sources) {
        reached = true;
        f.selection.published_version++;
      }
      return result;
    });
    expect(
      (
        await readCustomerWorkflow(
          f.customerModel,
          f.target,
          f.selection,
          gate(),
        )
      ).status,
    ).toBe('UNKNOWN');
    expect(reached).toBe(true);
  });
});
