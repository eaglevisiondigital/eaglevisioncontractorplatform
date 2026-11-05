import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readTaskReceiptReconciliation,
  inspectTaskReceiptReconciliation,
  assertTaskReceiptObservationAccess,
} from '../src/lib/workflows/task-receipt-reconciliation';

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
  const gate = { enabled: true, confirmed: true };
  const sources = await prepareOperatingSources(sampleCompanies[brand], gate);
  const entry = sources.entries[0];
  const review = await readTaskReceiptReconciliation(
    sources,
    entry.target.job_id!,
    gate,
  );
  return { sources, entry, review };
}
it.each([0, 1, 2])(
  'brand %i rejects a foreign company receipt graft at both current and retained observation boundaries',
  async (brand) => {
    const a = await fixture(brand);
    const b = await fixture((brand + 1) % 3);
    const graft = { view: a.review.view, receipt: b.review.receipt };
    expect(() => inspectTaskReceiptReconciliation(graft)).toThrow();
    expect(() => assertTaskReceiptObservationAccess(graft)).toThrow();
  },
);
it.each(
  [0, 1, 2].flatMap((brand) =>
    (['visit_id', 'plan_id'] as const).map((field) => [brand, field] as const),
  ),
)(
  'brand %i rejects a receipt with substituted original %s',
  async (brand, field) => {
    const f = await fixture(brand);
    const graft = {
      view: f.review.view,
      receipt: { ...f.review.receipt, [field]: 'foreign-original-reference' },
    };
    expect(() => inspectTaskReceiptReconciliation(graft)).toThrow();
    expect(() => assertTaskReceiptObservationAccess(graft)).toThrow();
  },
);
it.each([0, 1, 2])(
  'brand %i rejects executable receipt substitution without introducing a new receipt owner',
  async (brand) => {
    const f = await fixture(brand);
    const receipt = new Proxy(f.review.receipt, {
      get(target, key, receiver) {
        return key === 'classification'
          ? 'UNCONFIRMED_SUBSTITUTION'
          : Reflect.get(target, key, receiver);
      },
    });
    const graft = { view: f.review.view, receipt };
    expect(() => inspectTaskReceiptReconciliation(graft)).toThrow();
    expect(() => assertTaskReceiptObservationAccess(graft)).toThrow();
  },
);
it.each(
  [0, 1, 2].flatMap((brand) =>
    (['visit_id', 'plan_id'] as const).map((field) => [brand, field] as const),
  ),
)(
  'brand %i rejects a frozen receipt with a different original %s',
  async (brand, field) => {
    const f = await fixture(brand);
    const graft = {
      view: f.review.view,
      receipt: Object.freeze({
        ...f.review.receipt,
        [field]: 'different-original-reference',
      }),
    };
    expect(() => inspectTaskReceiptReconciliation(graft)).toThrow();
    expect(() => assertTaskReceiptObservationAccess(graft)).toThrow();
  },
);
it.each(
  [0, 1, 2].flatMap((brand) =>
    (['customer_id', 'location_id', 'job_id', 'version_id'] as const).map(
      (field) => [brand, field] as const,
    ),
  ),
)(
  'brand %i rejects a frozen same-company receipt with a different %s',
  async (brand, field) => {
    const f = await fixture(brand);
    const graft = {
      view: f.review.view,
      receipt: Object.freeze({
        ...f.review.receipt,
        identity: Object.freeze({
          ...f.review.receipt.identity,
          [field]: 'different-original-identity',
        }),
      }),
    };
    expect(() => inspectTaskReceiptReconciliation(graft)).toThrow();
    expect(() => assertTaskReceiptObservationAccess(graft)).toThrow();
  },
);
it.each([0, 1, 2])(
  'brand %i retains the exact original receipt and native authorization without writes or replay',
  async (brand) => {
    const f = await fixture(brand);
    const writer = vi.spyOn(f.sources.estimates, 'recordTime');
    expect(inspectTaskReceiptReconciliation(f.review)).toBe(f.review.receipt);
    expect(() => assertTaskReceiptObservationAccess(f.review)).not.toThrow();
    expect(f.review.receipt.identity).toEqual(f.review.view.identity);
    expect(f.review.receipt.replay).toBe('FORBIDDEN');
    expect(f.review.receipt.financial).toBe(false);
    expect(writer).not.toHaveBeenCalled();
    const members = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    );
    vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
      (org) =>
        members(org).map((member) =>
          member.user_id === f.entry.target.actor_id
            ? { ...member, active: false }
            : member,
        ),
    );
    expect(() => inspectTaskReceiptReconciliation(f.review)).toThrow();
    expect(() => assertTaskReceiptObservationAccess(f.review)).toThrow();
    expect(writer).not.toHaveBeenCalled();
  },
);

it.each(
  [0, 1, 2].flatMap((brand) =>
    (['current', 'retained'] as const).flatMap((mode) =>
      (['top-level', 'nested-identity', 'nested-counts'] as const).map(
        (kind) => [brand, mode, kind] as const,
      ),
    ),
  ),
)(
  'brand %i %s rejects frozen %s accessors without invoking executable receipt fields',
  async (brand, mode, kind) => {
    const { review } = await fixture(brand);
    let calls = 0;
    const receipt = Object.freeze(
      kind === 'top-level'
        ? {
            ...review.receipt,
            get visit_id() {
              calls++;
              return review.receipt.visit_id;
            },
          }
        : kind === 'nested-identity'
          ? {
              ...review.receipt,
              identity: Object.freeze({
                ...review.receipt.identity,
                get customer_id() {
                  calls++;
                  return review.receipt.identity.customer_id;
                },
              }),
            }
          : {
              ...review.receipt,
              counts: Object.freeze({
                ...review.receipt.counts,
                get source_rows() {
                  calls++;
                  return review.receipt.counts.source_rows;
                },
              }),
            },
    );
    const graft = { view: review.view, receipt };
    expect(() =>
      (mode === 'current'
        ? inspectTaskReceiptReconciliation
        : assertTaskReceiptObservationAccess)(graft),
    ).toThrow();
    expect(calls).toBe(0);
  },
);
