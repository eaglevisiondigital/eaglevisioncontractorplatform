import { expect, it } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { CustomerPortalPreviewModel } from '../../src/lib/customer-preview';
import { Operations } from '../../src/lib/operations';
import { PropertyRepository } from '../../src/lib/property';
import {
  customerIssuedSourceHistory,
  readCustomerIssuedSourceHistory,
} from '../../src/components/property/customer-issued-source-history';

async function fixture(index = 0) {
  const model = new CustomerPortalPreviewModel(
    sampleCompanies[index],
    new PropertyRepository(new Operations(true)),
  );
  await model.login();
  await model.prepareHistory();
  await model.prepare();
  const data = model.read();
  const review = data.reviews.find((r) => r.source_report_id)!;
  return { model, data, review };
}
it.each([0, 1, 2])(
  'brand %i: inspects only the exact issued version/report/finding without changing customer state',
  async (brand) => {
    const { model, data, review } = await fixture(brand);
    const before = JSON.stringify(model.read());
    const source = customerIssuedSourceHistory(data, review.version_id)!;
    expect(source.reports).toHaveLength(1);
    expect(source.reports[0]).toEqual(
      data.history.find((r) => r.id === review.source_report_id),
    );
    expect(source.findingId).toBe(review.finding_id);
    expect(
      source.reports[0].snapshot.findings.some(
        (f) => f.id === source.findingId,
      ),
    ).toBe(true);
    expect(JSON.stringify(model.read())).toBe(before);
    expect(data.responses.every((r) => r.decision === null)).toBe(true);
    expect(
      customerIssuedSourceHistory(data, data.reviews[0].version_id),
    ).toBeNull();
  },
);
it.each(['organization_id', 'customer_id', 'location_id'] as const)(
  'denies a review or published report from another %s',
  async (key) => {
    const { data, review } = await fixture();
    const foreignReview = structuredClone(data);
    foreignReview.reviews.find((r) => r.version_id === review.version_id)![
      key
    ] = 'foreign';
    expect(() =>
      customerIssuedSourceHistory(foreignReview, review.version_id),
    ).toThrow();
    const foreignReport = structuredClone(data);
    foreignReport.reports.find((r) => r.id === review.source_report_id)![key] =
      'foreign';
    expect(() =>
      customerIssuedSourceHistory(foreignReport, review.version_id),
    ).toThrow();
  },
);
it.each([
  'missing report',
  'missing finding',
  'stale version',
  'changed projection',
  'duplicate report',
  'duplicate review',
  'withdrawn report access',
  'withdrawn version access',
])('withholds %s instead of substituting a nearby source', async (kind) => {
  const { data, review } = await fixture();
  const raw = data.reports.find((r) => r.id === review.source_report_id)!;
  const projected = data.history.find((r) => r.id === review.source_report_id)!;
  if (kind === 'missing report')
    data.reports = data.reports.filter((r) => r !== raw);
  if (kind === 'missing finding')
    raw.findings = raw.findings.filter((f) => f.id !== review.finding_id);
  if (kind === 'stale version') raw.version++;
  if (kind === 'changed projection')
    projected.snapshot.summary = 'Later, unverified summary';
  if (kind === 'duplicate report')
    data.reports.push({ ...raw, version: raw.version + 1 });
  if (kind === 'duplicate review') data.reviews.push(structuredClone(review));
  if (kind === 'withdrawn report access') data.context.reports = false;
  if (kind === 'withdrawn version access') data.context.version_ids = [];
  expect(() => customerIssuedSourceHistory(data, review.version_id)).toThrow();
});
it('the original safe projection discards root private fields and rejects nested private fields', async () => {
  const { data, review } = await fixture();
  const raw = data.reports.find((r) => r.id === review.source_report_id)!;
  Object.assign(raw, { internal_notes: 'PRIVATE', payroll: 99000 });
  const source = customerIssuedSourceHistory(data, review.version_id)!;
  expect(JSON.stringify(source)).not.toMatch(
    /PRIVATE|payroll|unit_cost_minor|internal_notes/,
  );
  expect(source.reports[0].snapshot.findings.length).toBeGreaterThan(0);
  Object.assign(raw.findings[0], {
    unit_cost_minor: 10000,
    internal_notes: 'PRIVATE',
  });
  expect(() => customerIssuedSourceHistory(data, review.version_id)).toThrow();
});
it('a source-less issued estimate does not gain a report relationship from the current property', async () => {
  const { data } = await fixture();
  expect(data.history.length).toBeGreaterThan(1);
  expect(
    customerIssuedSourceHistory(data, data.reviews[0].version_id),
  ).toBeNull();
  expect(() =>
    customerIssuedSourceHistory(data, 'unpublished-or-draft-version'),
  ).toThrow();
});
it('the original customer reader denies a property switch or revoked session even with retained review props', async () => {
  const { model, review, data } = await fixture();
  expect(
    readCustomerIssuedSourceHistory(
      () => model.read(),
      data,
      review.version_id,
    ),
  ).toEqual(customerIssuedSourceHistory(data, review.version_id));
  const other = model
    .properties()
    .find((p) => p.id !== model.read().context.location_id)!;
  model.selectProperty(other.id);
  expect(() =>
    readCustomerIssuedSourceHistory(
      () => model.read(),
      data,
      review.version_id,
    ),
  ).toThrow();
  model.logout();
  expect(() =>
    readCustomerIssuedSourceHistory(
      () => model.read(),
      data,
      review.version_id,
    ),
  ).toThrow(/session/);
});
it('a changed published source cannot replace the retained original document during disclosure', async () => {
  const { model, data, review } = await fixture();
  const current = model.read();
  current.reports.find((r) => r.id === review.source_report_id)!.summary =
    'Changed source';
  current.history.find(
    (r) => r.id === review.source_report_id,
  )!.snapshot.summary = 'Changed source';
  expect(() =>
    readCustomerIssuedSourceHistory(() => current, data, review.version_id),
  ).toThrow(/source changed/);
});
