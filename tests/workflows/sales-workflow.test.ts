import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readSalesWorkflow,
  prepareSalesWorkflowContract,
  verifySalesWorkflowReview,
  type SalesWorkflowReview,
} from '../../src/lib/workflows/sales-workflow';
import { salesWorkflowFixture } from './sales-workflow-fixture';
const review = (hash: string): SalesWorkflowReview => ({
  enabled: true,
  confirmed: true,
  reviewed_source_hash: hash,
  association_confirmed: true,
  checks: { scope: true, preference: true, terms: true, boundaries: true },
});
afterEach(() => vi.restoreAllMocks());
describe('actual lead → exact issued scope → contract preparation', () => {
  for (const index of [0, 1, 2]) {
    it(`reads actual exact sources and canonical safe values for company ${index}`, async () => {
      const f = await salesWorkflowFixture(index);
      const view = await readSalesWorkflow(f.repo, f.release, f.target, f.gate);
      expect(view.status).toBe('current');
      expect(view.evidence?.lead.id).toBe(f.lead.id);
      expect(view.evidence?.lead.customer_id).toBe(f.customer.id);
      expect(view.evidence?.lead.location_id).toBe(f.target.location_id);
      expect(view.evidence?.source.version_id).toBe(f.issued.version.id);
      expect(view.evidence?.source.scope.total_minor).toBe(
        f.issued.version.calculation.total_minor,
      );
      expect(view.evidence?.receipt.id).toBe(f.target.receipt_id);
      expect(view.evidence?.recorded_estimate_lead_link).toBe('UNAVAILABLE');
      expect(view.evidence?.contract_execution).toBe('BLOCKED');
      expect(JSON.stringify(view)).not.toMatch(
        /PRIVATE|unit_cost_minor|internal_notes|profit_margin|payroll|authorization_id/,
      );
      expect(Object.isFrozen(view.evidence?.source.scope.lines)).toBe(true);
    });
    it(`composes immutable existing-engine preparation with no business side effects for company ${index}`, async () => {
      const f = await salesWorkflowFixture(index);
      const workspace = f.release.read('staff'),
        source = await f.repo.get(f.company.id, f.issued.estimate.id);
      const jobs = await f.repo.jobs(f.company.id);
      const writers = [
        'create',
        'save',
        'issue',
        'revise',
        'approveJob',
      ] as const;
      const spies = writers.map((key) => vi.spyOn(f.repo, key));
      const command = vi.spyOn(f.release, 'command');
      const view = await readSalesWorkflow(f.repo, f.release, f.target, f.gate);
      const packet = await prepareSalesWorkflowContract(
        f.repo,
        f.release,
        f.target,
        review(view.source_hash!),
      );
      expect(packet.preparation.reference.receipt.id).toBe(f.target.receipt_id);
      expect(packet.preparation.reference.source.version_id).toBe(
        f.target.version_id,
      );
      expect(packet.lead.id).toBe(f.target.intake_request_id);
      expect(packet.integrity.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(Object.isFrozen(packet.preparation.reference.source.scope)).toBe(
        true,
      );
      expect(
        await verifySalesWorkflowReview(f.repo, f.release, f.target, packet),
      ).toBe('current');
      expect(f.release.read('staff')).toEqual(workspace);
      expect(await f.repo.get(f.company.id, f.issued.estimate.id)).toEqual(
        source,
      );
      expect(await f.repo.jobs(f.company.id)).toEqual(jobs);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      expect(command).not.toHaveBeenCalled();
      expect(JSON.stringify(packet)).not.toMatch(
        /PRIVATE|unit_cost_minor|internal_notes|profit_margin|payroll/,
      );
    });
  }
  it('stays default OFF before reading any source', async () => {
    const f = await salesWorkflowFixture();
    const read = vi.spyOn(f.repo, 'readSyntheticPrototypeSources');
    expect((await readSalesWorkflow(f.repo, f.release, f.target)).status).toBe(
      'unknown',
    );
    expect(read).not.toHaveBeenCalled();
  });
  for (const key of [
    'organization_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'intake_request_id',
    'offer_id',
    'receipt_id',
  ] as const) {
    it(`rejects a foreign or missing exact ${key}`, async () => {
      const f = await salesWorkflowFixture();
      const view = await readSalesWorkflow(
        f.repo,
        f.release,
        { ...f.target, [key]: 'foreign-exact-id' },
        f.gate,
      );
      expect(view.status).toBe('unknown');
      expect(view.evidence).toBeNull();
    });
  }
  for (const choice of ['declined', 'changes_requested', null] as const) {
    it(`does not replace missing or ${choice} customer preference`, async () => {
      const f = await salesWorkflowFixture(0, choice);
      const view = await readSalesWorkflow(f.repo, f.release, f.target, f.gate);
      expect(view.status).not.toBe('current');
      await expect(
        prepareSalesWorkflowContract(
          f.repo,
          f.release,
          f.target,
          review(view.source_hash ?? '0'.repeat(64)),
        ),
      ).rejects.toThrow();
    });
  }
  it('rejects inactive/field/foreign staff and does not inherit an earlier manager read', async () => {
    const f = await salesWorkflowFixture();
    for (const actor_id of [
      f.company.id + '-field',
      f.company.id + '-estimator',
      'foreign-owner',
    ])
      expect(
        (
          await readSalesWorkflow(
            f.repo,
            f.release,
            { ...f.target, actor_id },
            f.gate,
          )
        ).evidence,
      ).toBeNull();
    const view = await readSalesWorkflow(f.repo, f.release, f.target, f.gate);
    await f.operations.configure(
      f.company.id,
      'active',
      'starter',
      {},
      f.company.id + '-backup-owner',
    );
    await f.operations.revokeOwner(f.company.id, f.target.actor_id);
    await expect(
      prepareSalesWorkflowContract(
        f.repo,
        f.release,
        f.target,
        review(view.source_hash!),
      ),
    ).rejects.toThrow();
  });
  it('rejects a newly saved version and retains the original packet as stale', async () => {
    const f = await salesWorkflowFixture();
    const view = await readSalesWorkflow(f.repo, f.release, f.target, f.gate);
    const packet = await prepareSalesWorkflowContract(
      f.repo,
      f.release,
      f.target,
      review(view.source_hash!),
    );
    const immutable = JSON.stringify(packet);
    await f.repo.revise(f.company.id, f.issued);
    expect(
      (await readSalesWorkflow(f.repo, f.release, f.target, f.gate)).status,
    ).toBe('blocked');
    expect(
      await verifySalesWorkflowReview(f.repo, f.release, f.target, packet),
    ).toBe('stale');
    expect(JSON.stringify(packet)).toBe(immutable);
    await expect(
      prepareSalesWorkflowContract(
        f.repo,
        f.release,
        f.target,
        review(view.source_hash!),
      ),
    ).rejects.toThrow();
  });
  it('binds current lead status to the reviewed snapshot without inventing estimate provenance', async () => {
    const f = await salesWorkflowFixture();
    const view = await readSalesWorkflow(f.repo, f.release, f.target, f.gate);
    const packet = await prepareSalesWorkflowContract(
      f.repo,
      f.release,
      f.target,
      review(view.source_hash!),
    );
    await f.operations.assignIntake(f.company.id, f.lead.id, null, 'reviewed');
    const current = await readSalesWorkflow(
      f.repo,
      f.release,
      f.target,
      f.gate,
    );
    expect(current.source_hash).not.toBe(view.source_hash);
    expect(
      await verifySalesWorkflowReview(f.repo, f.release, f.target, packet),
    ).toBe('stale');
    await expect(
      prepareSalesWorkflowContract(
        f.repo,
        f.release,
        f.target,
        review(view.source_hash!),
      ),
    ).rejects.toThrow();
  });
  for (const change of [
    'lead',
    'membership',
    'confirmation',
    'version',
  ] as const) {
    it(`denies actual ${change} drift during the remaining hash await`, async () => {
      const f = await salesWorkflowFixture(),
        view = await readSalesWorkflow(f.repo, f.release, f.target, f.gate);
      const input = review(view.source_hash!);
      const original = crypto.subtle.digest.bind(crypto.subtle);
      let changed = false;
      vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
        const result = await original(...args);
        if (!changed) {
          changed = true;
          if (change === 'lead')
            await f.operations.assignIntake(
              f.company.id,
              f.lead.id,
              null,
              'reviewed',
            );
          if (change === 'membership') {
            await f.operations.configure(
              f.company.id,
              'active',
              'starter',
              {},
              f.company.id + '-backup-owner',
            );
            await f.operations.revokeOwner(f.company.id, f.target.actor_id);
          }
          if (change === 'confirmation') input.confirmed = false;
          if (change === 'version') await f.repo.revise(f.company.id, f.issued);
        }
        return result;
      });
      await expect(
        prepareSalesWorkflowContract(f.repo, f.release, f.target, input),
      ).rejects.toThrow();
      expect(f.release.read('staff').release_contracts).toEqual([]);
    });
  }
  for (const change of ['lead', 'version', 'confirmation'] as const) {
    it(`rejects ${change} drift at the final wrapper digest, after existing preparation completes`, async () => {
      const f = await salesWorkflowFixture(),
        view = await readSalesWorkflow(f.repo, f.release, f.target, f.gate);
      const input = review(view.source_hash!);
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      let reached = false;
      vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
        const result = await digest(...args);
        const body = JSON.parse(
          new TextDecoder().decode(args[1] as ArrayBuffer),
        );
        if (
          body.mode === 'local-synthetic-workflow-review' &&
          body.preparation
        ) {
          reached = true;
          if (change === 'lead')
            await f.operations.assignIntake(
              f.company.id,
              f.lead.id,
              null,
              'reviewed',
            );
          if (change === 'version') await f.repo.revise(f.company.id, f.issued);
          if (change === 'confirmation') input.confirmed = false;
        }
        return result;
      });
      await expect(
        prepareSalesWorkflowContract(f.repo, f.release, f.target, input),
      ).rejects.toThrow();
      expect(reached).toBe(true);
      expect(f.release.read('staff').release_contracts).toEqual([]);
    });
  }
  it('retains UNKNOWN when original lead changes during exact reconciliation; never re-prepares', async () => {
    const f = await salesWorkflowFixture(),
      view = await readSalesWorkflow(f.repo, f.release, f.target, f.gate);
    const packet = await prepareSalesWorkflowContract(
      f.repo,
      f.release,
      f.target,
      review(view.source_hash!),
    );
    const immutable = JSON.stringify(packet),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      if (!changed) {
        changed = true;
        await f.operations.assignIntake(
          f.company.id,
          f.lead.id,
          null,
          'reviewed',
        );
      }
      return result;
    });
    expect(
      await verifySalesWorkflowReview(f.repo, f.release, f.target, packet),
    ).toBe('unknown');
    expect(JSON.stringify(packet)).toBe(immutable);
  });
  it('rejects malformed primitive input, accessors and foreign retained packets without invoking getters', async () => {
    const f = await salesWorkflowFixture();
    let invoked = false;
    const evil = Object.defineProperty({ ...f.target }, 'intake_request_id', {
      get: () => {
        invoked = true;
        return f.lead.id;
      },
      enumerable: true,
    });
    expect(
      (await readSalesWorkflow(f.repo, f.release, evil, f.gate)).status,
    ).toBe('unknown');
    expect(invoked).toBe(false);
    const retained = Object.defineProperty({}, 'lead', {
      get: () => {
        invoked = true;
        return {};
      },
    });
    expect(
      await verifySalesWorkflowReview(
        f.repo,
        f.release,
        f.target,
        retained as never,
      ),
    ).toBe('unknown');
    expect(invoked).toBe(false);
    for (const input of [
      { ...f.target, extra: true },
      { ...f.target, receipt_id: '' },
      { ...f.target, intake_request_id: 'x'.repeat(201) },
    ])
      expect(
        (await readSalesWorkflow(f.repo, f.release, input, f.gate)).status,
      ).toBe('unknown');
  });
  it('requires all existing checklist sections, reviewed hash and explicit lead selection', async () => {
    const f = await salesWorkflowFixture(),
      view = await readSalesWorkflow(f.repo, f.release, f.target, f.gate);
    for (const input of [
      { ...review(view.source_hash!), association_confirmed: false },
      { ...review(view.source_hash!), reviewed_source_hash: '0'.repeat(64) },
      {
        ...review(view.source_hash!),
        checks: {
          scope: true,
          preference: false,
          terms: true,
          boundaries: true,
        },
      },
      { ...review(view.source_hash!), confirmed: false },
    ])
      await expect(
        prepareSalesWorkflowContract(f.repo, f.release, f.target, input),
      ).rejects.toThrow();
  });
});
