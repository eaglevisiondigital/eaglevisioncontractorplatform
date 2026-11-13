import { expect, it } from 'vitest';
import { Operations } from '../../src/lib/operations';
import { PropertyRepository } from '../../src/lib/property';
import { sampleCompanies } from '../../src/domain/platform';
import { inspectionChecklistLabels } from '../../src/components/property/inspection-plan-fields';
async function fixture(index = 0) {
  const company = sampleCompanies[index],
    repo = new PropertyRepository(new Operations(true));
  await repo.initialize(company);
  const org = company.id,
    plan = repo.read(org).plans[0];
  plan.checklist[0].required = false;
  repo.savePlan(org, plan);
  return {
    repo,
    org,
    plan: repo.read(org).plans.find((p) => p.id === plan.id)!,
  };
}
it.each([0, 1, 2])(
  'company %s saves/reopens optional requirements and exact identities after label editing; new draft inherits them',
  async (index) => {
    const f = await fixture(index),
      original = structuredClone(f.plan),
      labels = f.plan.checklist.map((c) => c.label);
    labels[1] += ' — explicit revised label';
    const changed = {
      ...f.plan,
      checklist: inspectionChecklistLabels(
        f.plan.checklist,
        labels.join('\n') + '\nNew explicit final check',
      ),
    };
    expect(f.plan).toEqual(original);
    f.repo.savePlan(f.org, changed);
    const reopened = f.repo.read(f.org).plans.find((p) => p.id === f.plan.id)!;
    expect(reopened).toMatchObject({
      id: original.id,
      organization_id: original.organization_id,
      customer_id: original.customer_id,
      location_id: original.location_id,
      job_id: original.job_id,
      revision: original.revision + 1,
    });
    expect(
      reopened.checklist
        .slice(0, original.checklist.length)
        .map((c) => ({ id: c.id, required: c.required })),
    ).toEqual(
      original.checklist.map((c) => ({ id: c.id, required: c.required })),
    );
    expect(reopened.checklist.at(-1)).toMatchObject({
      label: 'New explicit final check',
      required: true,
      completed: false,
    });
    expect(new Set(reopened.checklist.map((c) => c.id)).size).toBe(
      reopened.checklist.length,
    );
    const visit = f.repo.addVisit(f.org, reopened.id, '2026-12-10');
    expect(visit.content.checklist).toEqual(reopened.checklist);
    expect(visit.status).toBe('draft');
  },
);
it('an explicit later required toggle persists through subsequent label edits', async () => {
  const f = await fixture();
  f.plan.checklist[0].required = true;
  f.repo.savePlan(f.org, f.plan);
  const current = f.repo.read(f.org).plans.find((p) => p.id === f.plan.id)!;
  f.repo.savePlan(f.org, {
    ...current,
    checklist: inspectionChecklistLabels(
      current.checklist,
      current.checklist.map((c) => c.label + ' changed').join('\n'),
    ),
  });
  expect(
    f.repo.read(f.org).plans.find((p) => p.id === f.plan.id)?.checklist[0]
      .required,
  ).toBe(true);
});
it('a stale template save cannot replace a newer required choice', async () => {
  const f = await fixture(),
    stale = structuredClone(f.plan);
  f.plan.checklist[0].required = true;
  f.repo.savePlan(f.org, f.plan);
  const current = f.repo.read(f.org);
  expect(() =>
    f.repo.savePlan(f.org, {
      ...stale,
      checklist: inspectionChecklistLabels(
        stale.checklist,
        'Stale replacement\nSecond stale label',
      ),
    }),
  ).toThrow('immutable');
  expect(f.repo.read(f.org)).toEqual(current);
});
it('label serialization cannot authorize saving a plan into another tenant', async () => {
  const f = await fixture();
  await f.repo.initialize(sampleCompanies[1]);
  const other = sampleCompanies[1].id,
    before = f.repo.read(other);
  expect(() =>
    f.repo.savePlan(other, {
      ...f.plan,
      organization_id: other,
      checklist: inspectionChecklistLabels(
        f.plan.checklist,
        'Foreign replacement',
      ),
    }),
  ).toThrow('immutable');
  expect(f.repo.read(other)).toEqual(before);
});
it('template editing leaves original published report and inspection content unchanged', async () => {
  const f = await fixture(),
    visit = f.repo.read(f.org).visits[0];
  f.repo.saveVisit(f.org, visit, {
    ...visit.content,
    summary: 'Fictional original inspection',
    checklist: visit.content.checklist.map((c) => ({ ...c, completed: true })),
  });
  f.repo.submit(
    f.org,
    f.repo.read(f.org).visits.find((v) => v.id === visit.id)!,
  );
  f.repo.publish(
    f.org,
    f.repo.read(f.org).visits.find((v) => v.id === visit.id)!,
  );
  const before = f.repo.read(f.org),
    portal = f.repo.portal(f.org, f.plan.customer_id);
  f.repo.savePlan(f.org, {
    ...f.plan,
    checklist: inspectionChecklistLabels(
      f.plan.checklist,
      f.plan.checklist.map((c) => c.label + ' future template').join('\n'),
    ),
  });
  const after = f.repo.read(f.org);
  expect(after.reports).toEqual(before.reports);
  expect(after.visits).toEqual(before.visits);
  expect(f.repo.portal(f.org, f.plan.customer_id)).toEqual(portal);
});
