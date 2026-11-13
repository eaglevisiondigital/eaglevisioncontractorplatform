import { expect, it, vi } from 'vitest';
import { Operations } from '../../src/lib/operations';
import { PropertyRepository } from '../../src/lib/property';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareMaintenanceExamples } from '../../src/lib/maintenance-examples';
import {
  saveReviewAndPrepareMaintenance,
  maintenanceSavePreparation,
  maintenanceSavePreparationHeld,
} from '../../src/components/property/maintenance-save-prepare';
async function fixture() {
  const company = sampleCompanies[0],
    org = company.id,
    actor = org + '-owner',
    ops = new Operations(true),
    repo = new PropertyRepository(ops);
  await repo.initialize(company);
  await repo.refreshContexts(org);
  await prepareMaintenanceExamples(repo, org, actor);
  const row = repo.maintenance(org, actor).items[0],
    p = repo.read(org).plans.find((p) => p.id === row.plan_id)!,
    plan = { id: p.id, revision: p.revision },
    input = {
      priority: 'urgent' as const,
      assignee_id: null,
      follow_up_on: '2026-12-10',
      review: 'pending' as const,
      note: 'PRIVATE fictional reviewed scope note',
    },
    before = repo.read(org),
    save = vi.spyOn(repo, 'saveMaintenance'),
    schedule = vi.spyOn(repo, 'scheduleMaintenance');
  const run = (current = () => true, confirm = true) =>
    saveReviewAndPrepareMaintenance(
      repo,
      org,
      actor,
      row.source,
      row.record,
      input,
      plan,
      '2026-12-10',
      confirm,
      current,
    );
  return {
    repo,
    ops,
    org,
    actor,
    row,
    plan,
    input,
    before,
    save,
    schedule,
    run,
  };
}
it('saves entered review and one draft using returned CAS; exact reopen and published sources remain intact', async () => {
  const f = await fixture(),
    portal = f.repo.portal(f.org, f.row.source.customer_id),
    result = await f.run(),
    after = f.repo.read(f.org),
    row = f.repo
      .maintenance(f.org, f.actor)
      .items.find((r) => r.key === f.row.key)!;
  expect(result.status).toBe('prepared');
  expect(f.schedule).toHaveBeenCalledWith(
    f.org,
    f.actor,
    f.row.source,
    1,
    f.plan,
    '2026-12-10',
  );
  expect(row.record).toMatchObject({
    revision: 2,
    priority: 'urgent',
    scheduled_visit_id: result.visitId,
  });
  expect(row.record.notes).toHaveLength(1);
  expect(row.record.notes[0].text).toBe(f.input.note);
  expect(after.visits).toHaveLength(f.before.visits.length + 1);
  expect(after.reports).toEqual(f.before.reports);
  expect(f.repo.portal(f.org, f.row.source.customer_id)).toEqual(portal);
  expect(maintenanceSavePreparationHeld(f.repo, f.row.source)).toBe(false);
});
it('requires deliberate confirmation before either writer', async () => {
  const f = await fixture();
  await expect(f.run(() => true, false)).rejects.toThrow(/Confirm saving/);
  expect(f.save).not.toHaveBeenCalled();
  expect(f.schedule).not.toHaveBeenCalled();
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'report_id',
  'report_version',
  'finding_id',
] as const)('denies foreign/missing %s source before saving', async (key) => {
  const f = await fixture();
  if (key === 'report_version') f.row.source.report_version++;
  else f.row.source[key] = 'foreign';
  await expect(f.run()).rejects.toThrow();
  expect(f.save).not.toHaveBeenCalled();
  expect(f.schedule).not.toHaveBeenCalled();
});
it('denies changed triage CAS before dispatch', async () => {
  const f = await fixture();
  await f.repo.saveMaintenance(f.org, f.actor, f.row.source, 0, {
    ...f.input,
    note: 'Other staff note',
  });
  f.save.mockClear();
  await expect(f.run()).rejects.toThrow(/source changed/);
  expect(f.save).not.toHaveBeenCalled();
  expect(f.schedule).not.toHaveBeenCalled();
});
it.each(['foreign', 'stale'] as const)(
  'denies %s plan before either step',
  async (mode) => {
    const f = await fixture();
    if (mode === 'foreign') f.plan.id = 'foreign';
    else f.plan.revision++;
    await expect(f.run()).rejects.toThrow(/plan required/);
    expect(f.save).not.toHaveBeenCalled();
    expect(f.schedule).not.toHaveBeenCalled();
  },
);
it('denies invalid date before saving entered note', async () => {
  const f = await fixture();
  await expect(
    saveReviewAndPrepareMaintenance(
      f.repo,
      f.org,
      f.actor,
      f.row.source,
      f.row.record,
      f.input,
      f.plan,
      '2026-02-30',
      true,
      () => true,
    ),
  ).rejects.toThrow();
  expect(f.save).not.toHaveBeenCalled();
});
it('reviewed decision cannot silently be reopened by preparing a draft', async () => {
  const f = await fixture();
  await expect(
    saveReviewAndPrepareMaintenance(
      f.repo,
      f.org,
      f.actor,
      f.row.source,
      f.row.record,
      { ...f.input, review: 'reviewed' },
      f.plan,
      '2026-12-10',
      true,
      () => true,
    ),
  ).rejects.toThrow(/pending review/);
  expect(f.save).not.toHaveBeenCalled();
});
it('excludes concurrent combined requests before first await', async () => {
  const f = await fixture(),
    result = await Promise.allSettled([f.run(), f.run()]);
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(f.save).toHaveBeenCalledTimes(1);
  expect(f.schedule).toHaveBeenCalledTimes(1);
});
it('clones submitted edit/plan inputs before awaited save ACK', async () => {
  const f = await fixture(),
    pending = f.run();
  f.input.note = 'Mutated later';
  f.plan.revision++;
  await pending;
  expect(
    f.repo.maintenance(f.org, f.actor).items.find((r) => r.key === f.row.key)
      ?.record.notes[0].text,
  ).toBe('PRIVATE fictional reviewed scope note');
  expect(f.schedule.mock.calls[0][4].revision).toBe(
    f.before.plans.find((p) => p.id === f.plan.id)!.revision,
  );
});
it('context loss after Save produces honest saved-only partial state without discarding entered note', async () => {
  const f = await fixture();
  let current = true;
  const raw = PropertyRepository.prototype.saveMaintenance;
  f.save.mockImplementation(async (...args) => {
    const r = await raw.apply(f.repo, args);
    current = false;
    return r;
  });
  await expect(f.run(() => current)).rejects.toThrow(
    /preparation was not attempted/,
  );
  expect(f.schedule).not.toHaveBeenCalled();
  expect(maintenanceSavePreparation(f.repo, f.row.source)).toMatchObject({
    status: 'partial',
    savedRevision: 1,
  });
  expect(
    f.repo.maintenance(f.org, f.actor).items.find((r) => r.key === f.row.key)
      ?.record.notes[0].text,
  ).toBe(f.input.note);
  await expect(f.run()).rejects.toThrow(/already attempted/);
  expect(f.save).toHaveBeenCalledTimes(1);
});
it('revocation between steps prevents preparation and retains saved-only result', async () => {
  const f = await fixture(),
    raw = PropertyRepository.prototype.saveMaintenance,
    original = f.ops.syntheticMemberships.bind(f.ops);
  f.save.mockImplementation(async (...args) => {
    const result = await raw.apply(f.repo, args);
    vi.spyOn(f.ops, 'syntheticMemberships').mockImplementation((org) =>
      original(org).map((m) => ({ ...m, active: false })),
    );
    return result;
  });
  await expect(f.run()).rejects.toThrow(/not attempted/);
  expect(f.schedule).not.toHaveBeenCalled();
  expect(maintenanceSavePreparation(f.repo, f.row.source)?.status).toBe(
    'partial',
  );
});
it('lost Save ACK holds UNKNOWN and never automatically prepares or repeats saved note', async () => {
  const f = await fixture(),
    raw = PropertyRepository.prototype.saveMaintenance;
  f.save.mockImplementation(async (...args) => {
    await raw.apply(f.repo, args);
    throw Error('PRIVATE lost Save ACK');
  });
  await expect(f.run()).rejects.toThrow(/outcome UNKNOWN/);
  expect(f.schedule).not.toHaveBeenCalled();
  await expect(f.run()).rejects.toThrow(/already attempted/);
  expect(f.save).toHaveBeenCalledTimes(1);
  expect(
    f.repo.maintenance(f.org, f.actor).items.find((r) => r.key === f.row.key)
      ?.record.notes,
  ).toHaveLength(1);
});
it('lost Prepare ACK holds UNKNOWN after one actual draft, never replacement or phase replay', async () => {
  const f = await fixture(),
    raw = PropertyRepository.prototype.scheduleMaintenance;
  f.schedule.mockImplementation(async (...args) => {
    await raw.apply(f.repo, args);
    throw Error('PRIVATE lost Prepare ACK');
  });
  await expect(f.run()).rejects.toThrow(
    /outcome UNKNOWN; review saved at revision 1/,
  );
  await expect(f.run()).rejects.toThrow(/already attempted/);
  expect(f.schedule).toHaveBeenCalledTimes(1);
  expect(f.repo.read(f.org).visits).toHaveLength(f.before.visits.length + 1);
});
it('malformed save evidence remains UNKNOWN and does not dispatch preparation', async () => {
  const f = await fixture();
  f.save.mockResolvedValue({ revision: 1 } as never);
  await expect(f.run()).rejects.toThrow(/UNKNOWN/);
  expect(f.schedule).not.toHaveBeenCalled();
  expect(maintenanceSavePreparationHeld(f.repo, f.row.source)).toBe(true);
});
it('an intervening edit after saved revision cannot be overwritten by preparing with a later CAS', async () => {
  const f = await fixture(),
    raw = PropertyRepository.prototype.saveMaintenance;
  f.save.mockImplementation(async (...args) => {
    const saved = await raw.apply(f.repo, args);
    await raw.call(f.repo, f.org, f.actor, f.row.source, 1, {
      ...f.input,
      note: 'Other exact later staff edit',
    });
    return saved;
  });
  await expect(f.run()).rejects.toThrow(/not attempted/);
  expect(f.schedule).not.toHaveBeenCalled();
  expect(
    f.repo.maintenance(f.org, f.actor).items.find((r) => r.key === f.row.key)
      ?.record.notes,
  ).toHaveLength(2);
});

it('context loss during Prepare ACK cannot report success against a different selection', async () => {
  const f = await fixture(),
    raw = PropertyRepository.prototype.scheduleMaintenance;
  let current = true;
  f.schedule.mockImplementation(async (...args) => {
    const visit = await raw.apply(f.repo, args);
    current = false;
    return visit;
  });
  await expect(f.run(() => current)).rejects.toThrow(/UNKNOWN/);
  expect(maintenanceSavePreparation(f.repo, f.row.source)?.status).toBe(
    'unknown',
  );
  expect(f.repo.read(f.org).visits).toHaveLength(f.before.visits.length + 1);
});
it('rejects an extra source identity field before dispatch', async () => {
  const f = await fixture();
  await expect(
    saveReviewAndPrepareMaintenance(
      f.repo,
      f.org,
      f.actor,
      { ...f.row.source, replacement: 'unknown' } as never,
      f.row.record,
      f.input,
      f.plan,
      '2026-12-10',
      true,
      () => true,
    ),
  ).rejects.toThrow();
  expect(f.save).not.toHaveBeenCalled();
  expect(f.schedule).not.toHaveBeenCalled();
});
it('revoked initial reviewer cannot enter either original writer', async () => {
  const f = await fixture();
  const members = f.ops.syntheticMemberships.bind(f.ops);
  vi.spyOn(f.ops, 'syntheticMemberships').mockImplementation((org) =>
    members(org).map((m) => ({ ...m, active: false })),
  );
  await expect(f.run()).rejects.toThrow(/reviewer required/);
  expect(f.save).not.toHaveBeenCalled();
  expect(f.schedule).not.toHaveBeenCalled();
});
it('changed plan revision after Save cannot prepare against substituted current scope', async () => {
  const f = await fixture(),
    raw = PropertyRepository.prototype.saveMaintenance;
  f.save.mockImplementation(async (...args) => {
    const saved = await raw.apply(f.repo, args);
    const plan = f.repo.read(f.org).plans.find((p) => p.id === f.plan.id)!;
    f.repo.savePlan(f.org, { ...plan, name: 'Explicit different saved plan' });
    return saved;
  });
  await expect(f.run()).rejects.toThrow(/UNKNOWN/);
  expect(f.repo.read(f.org).visits).toHaveLength(f.before.visits.length);
  expect(
    f.repo.maintenance(f.org, f.actor).items.find((r) => r.key === f.row.key)
      ?.record.notes,
  ).toHaveLength(1);
});
it('malformed Prepare ACK cannot claim a different visit or permit replacement', async () => {
  const f = await fixture(),
    raw = PropertyRepository.prototype.scheduleMaintenance;
  f.schedule.mockImplementation(async (...args) => {
    const visit = await raw.apply(f.repo, args);
    return { ...visit, id: 'UNKNOWN-REPLACEMENT' };
  });
  await expect(f.run()).rejects.toThrow(/UNKNOWN/);
  await expect(f.run()).rejects.toThrow(/already attempted/);
  expect(f.repo.read(f.org).visits).toHaveLength(f.before.visits.length + 1);
  expect(f.schedule).toHaveBeenCalledTimes(1);
});
