import { afterEach, expect, it, vi } from 'vitest';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { sampleCompanies } from '../src/domain/platform';
import { PropertyRepository } from '../src/lib/property';
import { Operations } from '../src/lib/operations';
import { ReleasePreview } from '../src/domain/release/preview';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function setup(index = 0) {
  const repo = new PropertyRepository(new Operations(true));
  const model = new CustomerPortalPreviewModel(sampleCompanies[index], repo);
  await model.login();
  await model.prepareHistory();
  await model.prepare();
  return { model, repo, data: model.read() };
}

it.each([0, 1, 2])(
  'company %i records a trimmed exact-version change request in the existing engine only',
  async (index) => {
    const { model, repo, data } = await setup(index);
    const before = await Promise.all(
      data.reviews.map((r) =>
        repo.estimates.get(
          data.context.organization_id,
          r.estimate_id,
          r.version_id,
        ),
      ),
    );
    const command = vi.spyOn(ReleasePreview.prototype, 'command');
    const receipt = await model.respond(
      data.reviews[1].version_id,
      'changes_requested',
      true,
      '  Please keep the original fence and review the gate scope. \n',
    );
    expect(receipt.decision).toBe('changes_requested');
    expect(receipt.note).toBe(
      'Please keep the original fence and review the gate scope.',
    );
    expect(command).toHaveBeenCalledTimes(1);
    expect(command.mock.calls[0].slice(0, 2)).toEqual([
      'customer',
      'decide_offer',
    ]);
    const response = model.read().responses;
    expect(response[0].decision).toBeNull();
    expect(response[1]).toMatchObject({
      version_id: data.reviews[1].version_id,
      note: receipt.note,
      receipt_id: receipt.id,
      outcome: 'confirmed',
    });
    expect(
      await Promise.all(
        data.reviews.map((r) =>
          repo.estimates.get(
            data.context.organization_id,
            r.estimate_id,
            r.version_id,
          ),
        ),
      ),
    ).toEqual(before);
    const financial = repo.portal(
      data.context.organization_id,
      data.context.customer_id,
    );
    expect(financial.contracts).toEqual([]);
    expect(financial.invoices).toEqual([]);
    const engine = command.mock.instances[0] as ReleasePreview;
    for (const key of [
      'release_contracts',
      'release_signatures',
      'release_invoices',
      'release_authorizations',
      'release_payment_events',
      'release_ledger_entries',
    ] as const)
      expect(engine.read('staff')[key]).toEqual([]);
    expect(JSON.stringify(model.read())).not.toMatch(
      /unit_cost_minor|internal_notes|payroll|markup_bps|readinessHistory/,
    );
    await model.respond(data.reviews[0].version_id, 'declined', true);
    expect(model.read().responses[1].receipt_id).toBe(receipt.id);
  },
);

it.each(['', ' \n\t ', 'x'.repeat(2001), null, {}, 42])(
  'rejects invalid customer explanation %# without submitting',
  async (note) => {
    const { model, data } = await setup();
    const spy = vi.spyOn(ReleasePreview.prototype, 'command');
    await expect(
      model.respond(
        data.reviews[0].version_id,
        'changes_requested',
        true,
        note as string,
      ),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    expect(model.read().responses[0].outcome).toBe('not_attempted');
  },
);
it('accepts exactly 2,000 trimmed characters and never changes another version', async () => {
  const { model, data } = await setup();
  await model.respond(
    data.reviews[0].version_id,
    'changes_requested',
    true,
    '  ' + 'x'.repeat(2000) + '  ',
  );
  expect(model.read().responses[0].note).toHaveLength(2000);
  expect(model.read().responses[1].decision).toBeNull();
});
it('rejects missing acknowledgment, unknown decision and foreign version without starting an attempt', async () => {
  const { model, data } = await setup();
  const spy = vi.spyOn(ReleasePreview.prototype, 'command');
  await expect(
    model.respond(
      data.reviews[0].version_id,
      'changes_requested',
      false,
      'Scope',
    ),
  ).rejects.toThrow();
  await expect(
    model.respond(data.reviews[0].version_id, 'paid' as never, true, 'Scope'),
  ).rejects.toThrow();
  await expect(
    model.respond(crypto.randomUUID(), 'changes_requested', true, 'Scope'),
  ).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('serializes duplicate submissions without queueing another mutation', async () => {
  const { model, data } = await setup();
  const spy = vi.spyOn(ReleasePreview.prototype, 'command');
  const result = await Promise.allSettled([
    model.respond(
      data.reviews[0].version_id,
      'changes_requested',
      true,
      'Scope',
    ),
    model.respond(data.reviews[0].version_id, 'accepted', true),
  ]);
  expect(result.map((x) => x.status)).toEqual(['fulfilled', 'rejected']);
  expect(spy).toHaveBeenCalledTimes(1);
  await expect(
    model.respond(
      data.reviews[0].version_id,
      'changes_requested',
      true,
      'Other scope',
    ),
  ).rejects.toThrow();
  expect(spy).toHaveBeenCalledTimes(1);
});
it('rejects an expired engine offer even if the issued project expiry has not passed', async () => {
  const { model, data } = await setup();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 25 * 3600000);
  const spy = vi.spyOn(ReleasePreview.prototype, 'command');
  await expect(
    model.respond(
      data.reviews[0].version_id,
      'changes_requested',
      true,
      'Scope',
    ),
  ).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('rejects an unavailable publication without writing or inventing an offer', async () => {
  const { model, data } = await setup();
  const read = ReleasePreview.prototype.read;
  vi.spyOn(ReleasePreview.prototype, 'read').mockImplementation(function (
    this: ReleasePreview,
    actor,
  ) {
    return { ...read.call(this, actor), release_offers: [] };
  });
  const spy = vi.spyOn(ReleasePreview.prototype, 'command');
  await expect(
    model.respond(
      data.reviews[0].version_id,
      'changes_requested',
      true,
      'Scope',
    ),
  ).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it.each(['before', 'after'])(
  'lost response %s commit holds UNKNOWN and reconciles read-only without a replacement',
  async (when) => {
    const { model, data } = await setup();
    const command = ReleasePreview.prototype.command;
    const spy = vi
      .spyOn(ReleasePreview.prototype, 'command')
      .mockImplementation(async function (
        this: ReleasePreview,
        actor,
        action,
        input,
      ) {
        if (when === 'after') await command.call(this, actor, action, input);
        throw Error('Synthetic response loss');
      });
    const version = data.reviews[0].version_id;
    await expect(
      model.respond(
        version,
        'changes_requested',
        true,
        'Keep this exact scope note',
      ),
    ).rejects.toThrow('UNKNOWN');
    expect(model.read().responses[0]).toMatchObject({
      outcome: 'unknown',
      decision: null,
      note: null,
    });
    await expect(
      model.respond(version, 'changes_requested', true, 'Replacement'),
    ).rejects.toThrow();
    expect(model.reconcileResponse(version).status).toBe(
      when === 'after' ? 'confirmed' : 'undetermined',
    );
    expect(model.reconcileResponse(version).status).toBe(
      when === 'after' ? 'confirmed' : 'undetermined',
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(model.read().responses[0].outcome).toBe(
      when === 'after' ? 'confirmed' : 'unknown',
    );
  },
);
it.each(['property', 'logout'])(
  'pending response cannot report success after %s context changes',
  async (change) => {
    const { model, data } = await setup();
    const command = ReleasePreview.prototype.command;
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi
      .spyOn(ReleasePreview.prototype, 'command')
      .mockImplementation(async function (
        this: ReleasePreview,
        actor,
        action,
        input,
      ) {
        await wait;
        return command.call(this, actor, action, input);
      });
    const response = model.respond(
      data.reviews[0].version_id,
      'changes_requested',
      true,
      'Exact original property',
    );
    if (change === 'property') model.selectProperty(model.properties()[1].id);
    else model.logout();
    release();
    await expect(response).rejects.toThrow('UNKNOWN');
    if (change === 'property') {
      expect(model.read().responses).toEqual([]);
      expect(() =>
        model.reconcileResponse(data.reviews[0].version_id),
      ).toThrow();
      model.selectProperty(data.context.location_id);
    } else {
      expect(() => model.read()).toThrow();
      await model.login();
    }
    expect(model.read().responses[0].outcome).toBe('unknown');
    expect(model.reconcileResponse(data.reviews[0].version_id).status).toBe(
      'confirmed',
    );
    expect(spy).toHaveBeenCalledTimes(1);
  },
);
it('rejects foreign contractor/property response and reconciliation identities', async () => {
  const a = await setup(0),
    b = await setup(1);
  await expect(
    a.model.respond(
      b.data.reviews[0].version_id,
      'changes_requested',
      true,
      'Scope',
    ),
  ).rejects.toThrow();
  expect(() =>
    a.model.reconcileResponse(b.data.reviews[0].version_id),
  ).toThrow();
  a.model.selectProperty(a.model.properties()[1].id);
  await expect(
    a.model.respond(
      a.data.reviews[0].version_id,
      'changes_requested',
      true,
      'Scope',
    ),
  ).rejects.toThrow();
  expect(b.model.read().responses.every((r) => r.decision === null)).toBe(true);
});
