import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies, type CompanyProfile } from '../src/domain/platform';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { createPropertyPassportTimeline } from '../src/domain/property/passport-timeline';
import {
  prepareProofOfWorkPack,
  proofOfWorkSourceReference,
  readProofOfWorkPackSource,
  verifyProofOfWorkPack,
  type ProofOfWorkPackReference,
  type ProofOfWorkSelection,
} from '../src/domain/property/proof-of-work-pack';
import { documentHash } from '../src/domain/release/preview';
import * as hashing from '../src/domain/release/preview';
const enabled = { enabled: true };
const unknown = { status: 'UNKNOWN', authority: 'DOCUMENTATION_ONLY' };
afterEach(() => vi.restoreAllMocks());
async function fixture(company: CompanyProfile = sampleCompanies[0]) {
  const repo = new PropertyRepository(new Operations(true));
  const model = new CustomerPortalPreviewModel(company, repo);
  await model.login();
  await model.prepare();
  await model.prepareHistory();
  const c = model.read().context;
  const boundary = {
    organization_id: c.organization_id,
    customer_id: c.customer_id,
    location_id: c.location_id,
  };
  const timeline = await createPropertyPassportTimeline(
    model,
    boundary,
    enabled,
  );
  const selection = {
    timeline_sha256: timeline.integrity.sha256,
    sources: timeline.snapshot.events.map(proofOfWorkSourceReference),
    confirmed: true,
  };
  return { model, repo, boundary, timeline, selection };
}
function publish(model: CustomerPortalPreviewModel) {
  const c = model.read().context,
    repo = model.repo;
  const property = repo
    .read(c.organization_id)
    .contexts.find(
      (p) => p.customer_id === c.customer_id && p.location_id === c.location_id,
    )!;
  const plan = repo.createPlan(
    c.organization_id,
    property,
    'After-stage documentation',
  );
  let visit = repo.addVisit(c.organization_id, plan.id, '2026-12-21', 'after');
  repo.saveVisit(c.organization_id, visit, {
    summary: 'After-stage documentation',
    internal_notes: 'PRIVATE workforce supplier payroll',
    checklist: [
      {
        id: 'reviewed',
        label: 'Documented condition',
        completed: true,
        required: true,
      },
    ],
    findings: [],
  });
  visit = repo.read(c.organization_id).visits.find((v) => v.id === visit.id)!;
  repo.submit(c.organization_id, visit);
  visit = repo.read(c.organization_id).visits.find((v) => v.id === visit.id)!;
  return repo.publish(c.organization_id, visit);
}
it.each(sampleCompanies)(
  '$name: actual selected report/job pack is detached, exact, immutable, current and free of side effects',
  async (company) => {
    const { model, repo, boundary, selection } = await fixture(company);
    const before = {
      reports: model.read(),
      state: repo.read(company.id),
      jobs: await repo.estimates.jobs(company.id),
    };
    const pack = await prepareProofOfWorkPack(
      model,
      boundary,
      selection,
      enabled,
    );
    expect(pack.snapshot).toMatchObject({
      ...boundary,
      contractor: { name: company.name },
      delivery: 'NOT_SENT',
      physical_completion: 'UNVERIFIED',
      warranty: 'UNVERIFIED',
      customer_acceptance: 'UNVERIFIED',
      history_completeness: 'UNKNOWN',
      media: { status: 'UNAVAILABLE', items: [] },
    });
    expect(pack.snapshot.events).toHaveLength(selection.sources.length);
    expect(pack.integrity.sha256).toBe(await documentHash(pack.snapshot));
    expect(pack.reference.pack_id).toBe(
      `synthetic-proof-${pack.integrity.sha256}`,
    );
    expect(Object.isFrozen(pack)).toBe(true);
    expect(Object.isFrozen(pack.snapshot.events)).toBe(true);
    expect(Object.isFrozen(selection)).toBe(false);
    expect(pack.snapshot.events[0]).not.toBe(model.read().reports[0]);
    expect(JSON.stringify(pack)).not.toMatch(
      /PRIVATE|INTERNAL|unit_cost|unit_price|amount_minor|payroll|margin|supplier|workforce|internal_notes|financials|customer_notes|https?:|storage_path|signed_url/,
    );
    expect(await verifyProofOfWorkPack(model, pack.reference, enabled)).toEqual(
      { status: 'CURRENT', authority: 'DOCUMENTATION_ONLY' },
    );
    for (const e of pack.snapshot.events)
      expect(
        await readProofOfWorkPackSource(
          model,
          pack.reference,
          proofOfWorkSourceReference(e),
          enabled,
        ),
      ).toEqual({ status: 'AVAILABLE', evidence: e });
    const second = await prepareProofOfWorkPack(
      model,
      boundary,
      selection,
      enabled,
    );
    expect(second.reference).toEqual(pack.reference); // Identical content has one stable content identity, never a duplicate command.
    expect({
      reports: model.read(),
      state: repo.read(company.id),
      jobs: await repo.estimates.jobs(company.id),
    }).toEqual(before);
  },
);
it('selects exactly the named source without automatic related inclusion', async () => {
  const { model, boundary, selection } = await fixture();
  selection.sources = selection.sources.slice(0, 1);
  const p = await prepareProofOfWorkPack(model, boundary, selection, enabled);
  expect(p.snapshot.events).toHaveLength(1);
  expect(p.reference.sources).toEqual(selection.sources);
});
it('is OFF before customer reads and rejects connected repositories before reads', async () => {
  const { model, boundary, selection } = await fixture();
  const read = vi.spyOn(model, 'read');
  await expect(
    prepareProofOfWorkPack(model, boundary, selection),
  ).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
  Object.defineProperty(model.repo.operations, 'sample', { value: false });
  await expect(
    prepareProofOfWorkPack(model, boundary, selection, enabled),
  ).rejects.toThrow(/disabled/);
  expect(read).not.toHaveBeenCalled();
});
it.each(['organization_id', 'customer_id', 'location_id'] as const)(
  'rejects foreign %s and all cross-property selected sources',
  async (key) => {
    const { model, boundary, selection } = await fixture();
    await expect(
      prepareProofOfWorkPack(
        model,
        { ...boundary, [key]: crypto.randomUUID() },
        selection,
        enabled,
      ),
    ).rejects.toThrow();
    const foreign = structuredClone(selection);
    Object.assign(foreign.sources[0].source, { [key]: crypto.randomUUID() });
    await expect(
      prepareProofOfWorkPack(model, boundary, foreign, enabled),
    ).rejects.toThrow();
  },
);
it.each([false, undefined, 'true', 1])(
  'requires strict explicit confirmation: %s',
  async (confirmed) => {
    const { model, boundary, selection } = await fixture();
    await expect(
      prepareProofOfWorkPack(
        model,
        boundary,
        { ...selection, confirmed } as ProofOfWorkSelection,
        enabled,
      ),
    ).rejects.toThrow(/Confirm/);
  },
);
it.each([
  'empty',
  'duplicate',
  'too-many',
  'wrong-digest',
  'wrong-version',
  'private-extra',
] as const)('rejects invalid selection: %s', async (kind) => {
  const { model, boundary, selection } = await fixture();
  const s = structuredClone(selection);
  if (kind === 'empty') s.sources = [];
  if (kind === 'duplicate') s.sources = [s.sources[0], s.sources[0]];
  if (kind === 'too-many') s.sources = Array(21).fill(s.sources[0]);
  if (kind === 'wrong-digest')
    Object.assign(s.sources[0], { source_sha256: '0'.repeat(64) });
  if (kind === 'wrong-version')
    Object.assign(
      s.sources.find((r) => r.kind === 'inspection-documentation')!.source,
      { published_version: 999 },
    );
  if (kind === 'private-extra')
    Object.assign(s.sources[0].source, { private_note: 'PRIVATE' });
  await expect(
    prepareProofOfWorkPack(model, boundary, s, enabled),
  ).rejects.toThrow();
});
it('rejects accessors, inherited serializers, symbol fields and coercive values without invocation', async () => {
  const { model, boundary, selection } = await fixture();
  const getter = vi.fn(() => true),
    serializer = vi.fn(() => 'unsafe');
  const attacks = [
    Object.defineProperty({ ...selection }, 'confirmed', { get: getter }),
    Object.assign(Object.create({ toJSON: serializer }), selection),
    { ...selection, [Symbol('private')]: 'PRIVATE' },
    { ...selection, confirmed: { valueOf: serializer } },
  ];
  for (const s of attacks)
    await expect(
      prepareProofOfWorkPack(
        model,
        boundary,
        s as ProofOfWorkSelection,
        enabled,
      ),
    ).rejects.toThrow();
  const source = Object.defineProperty({ ...selection.sources[0] }, 'source', {
    get: getter,
  });
  await expect(
    prepareProofOfWorkPack(
      model,
      boundary,
      { ...selection, sources: [source] },
      enabled,
    ),
  ).rejects.toThrow();
  const admission = Object.defineProperty({}, 'enabled', { get: getter });
  await expect(
    prepareProofOfWorkPack(model, boundary, selection, admission),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(serializer).not.toHaveBeenCalled();
});
it('accepts reordered named primitives, pins inputs, and never freezes caller-owned objects', async () => {
  const { model, boundary, selection } = await fixture();
  const reordered = {
    sources: selection.sources.map((r) => ({
      source_sha256: r.source_sha256,
      source: Object.fromEntries(Object.entries(r.source).reverse()),
      kind: r.kind,
    })),
    confirmed: true,
    timeline_sha256: selection.timeline_sha256,
  } as unknown as ProofOfWorkSelection;
  const pending = prepareProofOfWorkPack(model, boundary, reordered, enabled);
  boundary.location_id = crypto.randomUUID();
  const p = await pending;
  expect(p.snapshot.location_id).not.toBe(boundary.location_id);
  expect(Object.isFrozen(reordered)).toBe(false);
});
it('retains frozen evidence after a later publication, marks exact old binding stale, and never substitutes latest', async () => {
  const { model, boundary, selection } = await fixture();
  const p = await prepareProofOfWorkPack(model, boundary, selection, enabled),
    before = JSON.stringify(p);
  publish(model);
  expect(await verifyProofOfWorkPack(model, p.reference, enabled)).toEqual({
    status: 'STALE',
    authority: 'DOCUMENTATION_ONLY',
  });
  expect(
    await readProofOfWorkPackSource(
      model,
      p.reference,
      p.reference.sources[0],
      enabled,
    ),
  ).toEqual({ status: 'UNKNOWN', evidence: null });
  expect(JSON.stringify(p)).toBe(before);
  await expect(
    prepareProofOfWorkPack(model, boundary, selection, enabled),
  ).rejects.toThrow(/stale/);
});
it('after-stage/checklist evidence never becomes physical completion, acceptance, warranty or authority', async () => {
  const { model, boundary } = await fixture();
  publish(model);
  const t = await createPropertyPassportTimeline(model, boundary, enabled);
  const s = {
    timeline_sha256: t.integrity.sha256,
    sources: t.snapshot.events
      .filter(
        (e) =>
          e.kind === 'inspection-documentation' && e.report.phase === 'after',
      )
      .map(proofOfWorkSourceReference),
    confirmed: true,
  };
  const p = await prepareProofOfWorkPack(model, boundary, s, enabled);
  expect(p.snapshot.events[0]).toMatchObject({
    completion_documentation: {
      after_phase_recorded: true,
      checklist_items_recorded_completed: 1,
      physical_completion: 'UNVERIFIED',
    },
  });
  expect(p.snapshot.physical_completion).toBe('UNVERIFIED');
  expect(p.snapshot.warranty).toBe('UNVERIFIED');
  expect(p.snapshot.customer_acceptance).toBe('UNVERIFIED');
});
it('outer private media, paths, notes and financial fields never enter the allowlisted pack', async () => {
  const { model, boundary } = await fixture();
  const read = model.read.bind(model);
  vi.spyOn(model, 'read').mockImplementation(() => {
    const s = read();
    return {
      ...s,
      reports: s.reports.map((r) => ({
        ...r,
        media: [
          { url: 'https://private.invalid/SECRET', storage_path: 'SECRET' },
        ],
        internal_notes: 'SECRET payroll',
        supplier_cost: 123,
      })),
    };
  });
  const t = await createPropertyPassportTimeline(model, boundary, enabled);
  const p = await prepareProofOfWorkPack(
    model,
    boundary,
    {
      timeline_sha256: t.integrity.sha256,
      sources: t.snapshot.events.map(proofOfWorkSourceReference),
      confirmed: true,
    },
    enabled,
  );
  expect(JSON.stringify(p)).not.toMatch(
    /SECRET|https:|storage_path|supplier_cost|payroll/,
  );
  expect(p.snapshot.media).toEqual({
    status: 'UNAVAILABLE',
    reason: 'authorized-projection-has-no-media',
    items: [],
  });
});
it.each([
  'confirmation',
  'admission',
  'selection',
  'property',
  'logout',
  'source',
] as const)(
  'rejects %s changes across the new pack hash await',
  async (change) => {
    const { model, boundary, selection } = await fixture();
    const a = { enabled: true },
      hash = hashing.documentHash;
    vi.spyOn(hashing, 'documentHash').mockImplementation(async (value) => {
      if (
        value &&
        typeof value === 'object' &&
        'format' in value &&
        value.format === 'synthetic-proof-of-work-documentation-pack-v1'
      ) {
        if (change === 'confirmation') selection.confirmed = false;
        if (change === 'admission') a.enabled = false;
        if (change === 'selection')
          selection.sources = selection.sources.slice(0, 1);
        if (change === 'property')
          model.selectProperty(model.properties()[1].id);
        if (change === 'logout') model.logout();
        if (change === 'source') publish(model);
      }
      return hash(value);
    });
    await expect(
      prepareProofOfWorkPack(model, boundary, selection, a),
    ).rejects.toThrow();
  },
);
it('withdrawn original admission during the first current-source read withholds the pack', async () => {
  const { model, repo, boundary, selection } = await fixture();
  const a = { enabled: true },
    jobs = repo.estimates.jobs.bind(repo.estimates);
  vi.spyOn(repo.estimates, 'jobs').mockImplementation(async (...args) => {
    const j = await jobs(...args);
    a.enabled = false;
    return j;
  });
  await expect(
    prepareProofOfWorkPack(model, boundary, selection, a),
  ).rejects.toThrow();
});
it.each(['logout', 'property'] as const)(
  'retained pack and source cannot confer access after %s',
  async (change) => {
    const { model, boundary, selection } = await fixture();
    const p = await prepareProofOfWorkPack(model, boundary, selection, enabled);
    if (change === 'logout') model.logout();
    else model.selectProperty(model.properties()[1].id);
    expect(await verifyProofOfWorkPack(model, p.reference, enabled)).toEqual(
      unknown,
    );
    expect(
      await readProofOfWorkPackSource(
        model,
        p.reference,
        p.reference.sources[0],
        enabled,
      ),
    ).toEqual({ status: 'UNKNOWN', evidence: null });
  },
);
it('rejects altered pack identity/hash/extra fields and an unselected source', async () => {
  const { model, boundary, selection, timeline } = await fixture();
  const p = await prepareProofOfWorkPack(
    model,
    boundary,
    { ...selection, sources: [selection.sources[0]] },
    enabled,
  );
  for (const ref of [
    { ...p.reference, pack_id: 'fake' },
    { ...p.reference, sha256: '0'.repeat(64) },
    { ...p.reference, secret: 'PRIVATE' },
  ])
    expect(
      await verifyProofOfWorkPack(
        model,
        ref as ProofOfWorkPackReference,
        enabled,
      ),
    ).toEqual(unknown);
  expect(
    await readProofOfWorkPackSource(
      model,
      p.reference,
      proofOfWorkSourceReference(timeline.snapshot.events[1]),
      enabled,
    ),
  ).toEqual({ status: 'UNKNOWN', evidence: null });
});
it('empty accessible history cannot be turned into a completion pack', async () => {
  const { model } = await fixture();
  model.selectProperty(model.properties()[1].id);
  const c = model.read().context;
  await expect(
    prepareProofOfWorkPack(
      model,
      {
        organization_id: c.organization_id,
        customer_id: c.customer_id,
        location_id: c.location_id,
      },
      { timeline_sha256: '0'.repeat(64), sources: [], confirmed: true },
      enabled,
    ),
  ).rejects.toThrow();
});

it.each([
  'reports-denied',
  'version-revoked',
  'crm-denied',
  'jobs-denied',
] as const)(
  'current authoritative %s loss makes retained exact pack and source UNKNOWN',
  async (denied) => {
    const { model, repo, boundary, selection } = await fixture();
    const pack = await prepareProofOfWorkPack(
      model,
      boundary,
      selection,
      enabled,
    );
    if (denied === 'reports-denied' || denied === 'version-revoked') {
      const read = model.read.bind(model);
      vi.spyOn(model, 'read').mockImplementation(() => {
        const result = read();
        return {
          ...result,
          context: {
            ...result.context,
            reports: denied !== 'reports-denied',
            version_ids:
              denied === 'version-revoked' ? [] : result.context.version_ids,
          },
        };
      });
    }
    if (denied === 'crm-denied')
      vi.spyOn(repo.operations, 'syntheticProperty').mockImplementation(() => {
        throw Error('Current CRM denied');
      });
    if (denied === 'jobs-denied')
      vi.spyOn(repo.estimates, 'jobs').mockRejectedValue(
        Error('Current jobs denied'),
      );
    expect(await verifyProofOfWorkPack(model, pack.reference, enabled)).toEqual(
      unknown,
    );
    expect(
      await readProofOfWorkPackSource(
        model,
        pack.reference,
        pack.reference.sources[0],
        enabled,
      ),
    ).toEqual({ status: 'UNKNOWN', evidence: null });
  },
);

it('altered timeline digest is UNKNOWN, never a fabricated STALE result; actual retained drift is STALE', async () => {
  const { model, boundary, selection } = await fixture();
  const pack = await prepareProofOfWorkPack(
    model,
    boundary,
    selection,
    enabled,
  );
  expect(
    await verifyProofOfWorkPack(
      model,
      { ...pack.reference, timeline_sha256: '0'.repeat(64) },
      enabled,
    ),
  ).toEqual(unknown);
  expect(
    await verifyProofOfWorkPack(
      model,
      structuredClone(pack.reference),
      enabled,
    ),
  ).toEqual(unknown);
  expect(
    await readProofOfWorkPackSource(
      model,
      { ...pack.reference, timeline_sha256: '0'.repeat(64) },
      pack.reference.sources[0],
      enabled,
    ),
  ).toEqual({ status: 'UNKNOWN', evidence: null });
  expect(await verifyProofOfWorkPack(model, pack.reference, enabled)).toEqual({
    status: 'CURRENT',
    authority: 'DOCUMENTATION_ONLY',
  });
  publish(model);
  expect(await verifyProofOfWorkPack(model, pack.reference, enabled)).toEqual({
    status: 'STALE',
    authority: 'DOCUMENTATION_ONLY',
  });
});
it('a prepared reference does not transfer preparation provenance to another model', async () => {
  const { model, repo, boundary, selection } = await fixture();
  const pack = await prepareProofOfWorkPack(
    model,
    boundary,
    selection,
    enabled,
  );
  const other = new CustomerPortalPreviewModel(model.company, repo);
  await other.login();
  expect(await verifyProofOfWorkPack(other, pack.reference, enabled)).toEqual(
    unknown,
  );
});
