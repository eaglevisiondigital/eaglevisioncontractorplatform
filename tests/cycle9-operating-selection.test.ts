import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  assertOperatingSelectionCurrentNow,
  readOperatingSelection,
  revalidateOperatingSelection,
  type OperatingSelectionInput,
} from '../src/lib/workflows/operating-selection';
afterEach(() => vi.restoreAllMocks());
async function fixture(i = 0) {
  const gate = { enabled: true, confirmed: true };
  return {
    sources: await prepareOperatingSources(sampleCompanies[i], gate),
    gate,
    input: { query: '', page: 0, page_size: 2 },
  };
}
it.each([0, 1, 2])(
  'brand %s uses four actual source handles with accurate deterministic pages and no writers',
  async (i) => {
    const { sources, gate, input } = await fixture(i),
      before = sources.property.read(sources.company.id),
      writers = [
        vi.spyOn(sources.estimates, 'create'),
        vi.spyOn(sources.estimates, 'issue'),
        vi.spyOn(sources.estimates, 'approveJob'),
        vi.spyOn(sources.operations, 'saveCustomer'),
      ];
    const first = await readOperatingSelection(sources, input, gate),
      second = await readOperatingSelection(
        sources,
        { ...input, page: 1 },
        gate,
      );
    expect(first.available).toBe(4);
    expect(first.matching).toBe(4);
    expect(first.rows).toHaveLength(2);
    expect(second.rows).toHaveLength(2);
    expect(
      new Set([...first.rows, ...second.rows].map((r) => r.job_id)).size,
    ).toBe(4);
    for (const row of first.rows) {
      const actual = sources.entries.find(
        (e) => e.target.job_id === row.job_id,
      )!;
      expect(row).toMatchObject({
        organization_id: sources.company.id,
        customer_id: actual.target.customer_id,
        location_id: actual.target.location_id,
        estimate_id: actual.target.estimate_id,
        issued_version_id: actual.target.version_id,
      });
      expect(row.lead.id).toBe(actual.intake_request_id);
      expect(row.receipt.id).toBe(actual.receipt_id);
      const selection = await revalidateOperatingSelection(
        sources,
        first,
        row.job_id,
      );
      expect(selection.job_id).toBe(row.job_id);
      expect(selection.authority).toBe('NAVIGATION_ONLY');
    }
    expect(first.crm_history_completeness).toBe('UNKNOWN');
    expect(Object.isFrozen(first.rows)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(
      /PRIVATE|unit_cost_minor|payroll|supplier|margin_bps|internal_notes/,
    );
    expect(sources.property.read(sources.company.id)).toEqual(before);
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
  },
);
it('literal case-insensitive search combines actual customer/property/lead and issued references', async () => {
  const { sources, gate, input } = await fixture(),
    all = await readOperatingSelection(
      sources,
      { ...input, page_size: 10 },
      gate,
    ),
    one = all.rows.find((r) => r.customer_label.endsWith('2'))!;
  for (const query of [
    one.customer_label.toUpperCase(),
    one.location_id,
    one.job_id,
    one.issued_version_id,
    one.estimate_number,
  ]) {
    const read = await readOperatingSelection(
      sources,
      { ...input, query, page_size: 10 },
      gate,
    );
    expect(read.rows.some((r) => r.job_id === one.job_id)).toBe(true);
    expect(read.matching).toBe(read.rows.length);
  }
  for (const query of ['.*', '%', 'not-existing-source']) {
    const read = await readOperatingSelection(
      sources,
      { ...input, query },
      gate,
    );
    expect(read.matching).toBe(0);
    expect(read.available).toBe(4);
    expect(read.rows).toEqual([]);
  }
});
it('counts both actual jobs sharing one customer/property without pretending separate customers', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readOperatingSelection(
      sources,
      { ...input, page_size: 10 },
      gate,
    );
  expect(new Set(view.rows.map((r) => r.customer_id)).size).toBe(3);
  expect(new Set(view.rows.map((r) => r.location_id)).size).toBe(3);
  expect(
    view.rows.every(
      (r) =>
        r.lead.association === 'EXPLICIT_STAFF_SELECTION_NO_RECORDED_LEAD_FK',
    ),
  ).toBe(true);
});
it('rejects off-page and forged target selection', async () => {
  const { sources, gate, input } = await fixture(),
    first = await readOperatingSelection(sources, input, gate),
    second = await readOperatingSelection(sources, { ...input, page: 1 }, gate);
  await expect(
    revalidateOperatingSelection(sources, first, second.rows[0].job_id),
  ).rejects.toThrow(/visible/);
  await expect(
    revalidateOperatingSelection(
      sources,
      JSON.parse(JSON.stringify(second)),
      second.rows[0].job_id,
    ),
  ).rejects.toThrow();
});
it.each([
  { query: 'x'.repeat(101), page: 0, page_size: 2 },
  { query: '', page: -1, page_size: 2 },
  { query: '', page: 1.5, page_size: 2 },
  { query: '', page: 0, page_size: 0 },
  { query: '', page: 0, page_size: 200 },
])('rejects invalid query/page %j', async (input) => {
  const { sources, gate } = await fixture();
  await expect(readOperatingSelection(sources, input, gate)).rejects.toThrow();
});
it('remains default OFF before private source reads', async () => {
  const { sources, input } = await fixture(),
    reader = vi.spyOn(sources.estimates, 'readSyntheticPrototypeSources');
  await expect(readOperatingSelection(sources, input)).rejects.toThrow();
  expect(reader).not.toHaveBeenCalled();
});
it('rejects foreign tenant or customer/property handle', async () => {
  const { sources, input, gate } = await fixture();
  sources.entries[0].target.customer_id = sources.entries[1].target.customer_id;
  await expect(readOperatingSelection(sources, input, gate)).rejects.toThrow();
});
it('rejects a foreign original receipt instead of choosing another', async () => {
  const { sources, input, gate } = await fixture();
  sources.entries[0].receipt_id = sources.entries[1].receipt_id;
  await expect(readOperatingSelection(sources, input, gate)).rejects.toThrow();
});
it('revocation after display withholds exact source navigation', async () => {
  const { sources, input, gate } = await fixture(),
    view = await readOperatingSelection(sources, input, gate),
    actor = sources.entries[0].target.actor_id;
  await sources.operations.configure(
    sources.company.id,
    'active',
    'starter',
    {},
    sources.company.id + '-backup-owner',
  );
  await sources.operations.revokeOwner(sources.company.id, actor);
  await expect(
    revalidateOperatingSelection(sources, view, view.rows[0].job_id),
  ).rejects.toThrow();
  expect(() => assertOperatingSelectionCurrentNow(view)).toThrow();
});
it('new saved estimate version blocks the old source without latest fallback', async () => {
  const { sources, input, gate } = await fixture(),
    view = await readOperatingSelection(sources, input, gate),
    entry = sources.entries[0];
  await sources.estimates.revise(sources.company.id, entry.issued);
  await expect(
    revalidateOperatingSelection(sources, view, view.rows[0].job_id),
  ).rejects.toThrow();
});
it.each(['query', 'target', 'gate', 'lead'] as const)(
  'rechecks original %s after the last projection hash',
  async (change) => {
    const { sources, input, gate } = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.mode === 'LOCAL_OPERATING_SOURCE_SELECTION') {
        reached = true;
        if (change === 'query') input.query = 'changed';
        if (change === 'target')
          sources.entries[0].target.location_id = 'foreign';
        if (change === 'gate') gate.confirmed = false;
        if (change === 'lead')
          await sources.operations.assignIntake(
            sources.company.id,
            sources.entries[0].intake_request_id,
            null,
            'reviewed',
          );
      }
      return value;
    });
    await expect(
      readOperatingSelection(sources, input, gate),
    ).rejects.toThrow();
    expect(reached).toBe(true);
  },
);
it('read-only navigation retains terminal UNKNOWN even if an exact query is restored', async () => {
  const { sources, input, gate } = await fixture(),
    view = await readOperatingSelection(sources, input, gate);
  input.query = 'changed';
  await expect(
    revalidateOperatingSelection(sources, view, view.rows[0].job_id),
  ).rejects.toThrow();
  input.query = '';
  await expect(
    revalidateOperatingSelection(sources, view, view.rows[0].job_id),
  ).rejects.toThrow(/UNKNOWN/);
});
it('rejects getter/nonprimitive query without coercion', async () => {
  const { sources, input, gate } = await fixture();
  let invoked = false;
  const getter = Object.defineProperty({ ...input }, 'query', {
    enumerable: true,
    get() {
      invoked = true;
      return '';
    },
  });
  await expect(readOperatingSelection(sources, getter, gate)).rejects.toThrow();
  await expect(
    readOperatingSelection(
      sources,
      {
        ...input,
        query: {
          toString() {
            invoked = true;
            return '';
          },
        },
      } as unknown as OperatingSelectionInput,
      gate,
    ),
  ).rejects.toThrow();
  expect(invoked).toBe(false);
});
it('out-of-range pages are empty while preserving accurate matching counts', async () => {
  const { sources, input, gate } = await fixture(),
    view = await readOperatingSelection(sources, { ...input, page: 99 }, gate);
  expect(view.matching).toBe(4);
  expect(view.rows).toEqual([]);
});
