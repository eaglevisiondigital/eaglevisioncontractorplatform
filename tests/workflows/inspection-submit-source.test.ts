import { expect, it, vi } from 'vitest';
import { PropertyRepository } from '../../src/lib/property';
import { Operations } from '../../src/lib/operations';
import { sampleCompanies } from '../../src/domain/platform';
import { submitSavedInspection } from '../../src/components/property/inspection-submit-source';
async function fixture() {
  const company = sampleCompanies[0],
    repo = new PropertyRepository(new Operations(true));
  await repo.initialize(company);
  const visit = repo.read(company.id).visits[0],
    writer = vi.spyOn(repo, 'submit');
  return { company, repo, visit, writer };
}
it.each([
  'summary',
  'internal_notes',
  'finding',
  'visibility',
  'checklist',
] as const)(
  'requires explicit Save before submitting changed %s',
  async (field) => {
    const f = await fixture(),
      working = structuredClone(f.visit.content),
      before = f.repo.read(f.company.id);
    if (field === 'summary')
      working.summary = 'Unfinished fictional changed summary';
    if (field === 'internal_notes')
      working.internal_notes = 'Unfinished private note';
    if (field === 'finding')
      working.findings[0].description = 'Unfinished finding correction';
    if (field === 'visibility')
      working.findings[0].customer_visible =
        !working.findings[0].customer_visible;
    if (field === 'checklist')
      working.checklist.push({
        id: crypto.randomUUID(),
        label: 'Explicit additional observation',
        required: false,
        completed: false,
      });
    expect(() =>
      submitSavedInspection(f.repo, f.company.id, f.visit, working),
    ).toThrow(/Save the displayed/);
    expect(f.writer).not.toHaveBeenCalled();
    expect(f.repo.read(f.company.id)).toEqual(before);
  },
);
it('explicit save/reopen retains customized checklist and submits only that exact saved revision once', async () => {
  const f = await fixture(),
    working = structuredClone(f.visit.content);
  working.summary = 'Saved fictional complete summary';
  working.checklist = [
    {
      id: crypto.randomUUID(),
      label: 'Explicitly saved replacement scope',
      required: true,
      completed: true,
    },
  ];
  f.repo.saveVisit(f.company.id, f.visit, working);
  const saved = f.repo
    .read(f.company.id)
    .visits.find((v) => v.id === f.visit.id)!;
  submitSavedInspection(f.repo, f.company.id, saved, saved.content);
  const submitted = f.repo
    .read(f.company.id)
    .visits.find((v) => v.id === saved.id)!;
  expect(submitted).toMatchObject({
    status: 'submitted',
    revision: saved.revision + 1,
    content: saved.content,
  });
  expect(() =>
    submitSavedInspection(f.repo, f.company.id, saved, saved.content),
  ).toThrow(/source changed/);
  expect(f.writer).toHaveBeenCalledTimes(1);
});
it.each(['revision', 'property-plan', 'date', 'foreign'] as const)(
  'denies stale or mismatched %s before submit',
  async (field) => {
    const f = await fixture(),
      displayed = structuredClone(f.visit);
    if (field === 'revision') displayed.revision++;
    if (field === 'property-plan') displayed.plan_id = crypto.randomUUID();
    if (field === 'date') displayed.visited_on = '2026-12-31';
    if (field === 'foreign') displayed.organization_id = sampleCompanies[1].id;
    expect(() =>
      submitSavedInspection(f.repo, f.company.id, displayed, displayed.content),
    ).toThrow(/source changed/);
    expect(f.writer).not.toHaveBeenCalled();
  },
);
