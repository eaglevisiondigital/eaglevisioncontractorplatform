import { afterEach, expect, it, vi } from 'vitest';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { CustomerChangeWorkspace } from '../src/lib/customer-change-workspace';
import { CustomerRevisionPackets } from '../src/lib/customer-revision-packets';
import { CustomerIssuanceReadiness } from '../src/lib/customer-issuance-readiness';
import { CustomerRevisedEstimateLoop } from '../src/lib/customer-revised-estimate-loop';
import { Phase3Repository } from '../src/lib/phase3';
import { sampleCompanies } from '../src/domain/platform';
import { ReleasePreview, documentHash } from '../src/domain/release/preview';
import { blankLine } from '../src/domain/estimating/calculation';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function setup(index = 0) {
  const repo = new PropertyRepository(new Operations(true)),
    changes = new CustomerChangeWorkspace(repo),
    packets = new CustomerRevisionPackets(changes),
    readiness = new CustomerIssuanceReadiness(packets);
  const company = sampleCompanies[index],
    org = company.id,
    model = changes.customer(company);
  await model.login();
  await model.prepareHistory();
  await model.prepare();
  const actor = changes.reviewer(org);
  const receipt = await model.respond(
    model.read().reviews[1].version_id,
    'changes_requested',
    true,
    'Please clarify <img src=x onerror=alert(1)> & the proposed scope.',
  );
  const change = await changes.review(org, actor, receipt.id),
    original = structuredClone(change.source);
  let draft = await changes.prepare(change, true);
  draft = await repo.estimates.save(org, draft, {
    ...draft.version.payload,
    customer_notes: 'Safe customer note <script>bad()</script>',
    internal_notes: 'STAFF_ONLY_CANARY',
    terms: 'Proposed synthetic terms & conditions',
    expires_on: '2027-12-31',
    project: {
      ...draft.version.payload.project,
      start_on: '2027-02-01',
      end_on: '2027-02-03',
    },
  });
  const pr = await packets.review(
      org,
      actor,
      draft.estimate.id,
      draft.version.id,
      draft.version.lock_revision,
    ),
    packet = await packets.prepare(pr, draft.version.payload, true),
    estimate = draft.estimate.id;
  const review = await readiness.open(
    org,
    actor,
    estimate,
    draft.version.id,
    draft.version.lock_revision,
    packet.snapshot.id,
  );
  const dryRun = await readiness.record(
    review,
    () => draft.version.payload,
    true,
  );
  const loop = new CustomerRevisedEstimateLoop(readiness);
  const issueReview = await loop.open(
    org,
    actor,
    estimate,
    draft.version.id,
    draft.version.lock_revision,
    packet.snapshot.id,
    dryRun.snapshot.id,
  );
  return {
    loop,
    issueReview,
    dryRun,
    repo,
    changes,
    packets,
    readiness,
    company,
    org,
    actor,
    model,
    receipt,
    original,
    draft,
    packet,
    review,
    estimate,
  };
}

it.each([0, 1, 2])(
  'actual3A->3B->3C->3D->3E preserves identity, canonical amounts, receipts and private boundaries for company%s',
  async (index) => {
    const s = await setup(index),
      before = s.model.read(),
      history = await s.repo.estimates.history(s.org, s.estimate),
      jobs = await s.repo.estimates.jobs(s.org);
    const issued = await s.loop.issue(
      s.issueReview,
      () => s.draft.version.payload,
      true,
    );
    expect(issued.record).toMatchObject({
      mode: 'local-synthetic-only',
      request_id: s.receipt.id,
      source_offer_id: s.receipt.offer_id,
      source_version_id: s.original.version.id,
      version_id: s.draft.version.id,
      version_number: 3,
      saved_revision: s.draft.version.lock_revision,
      packet_id: s.packet.snapshot.id,
      packet_sha256: s.packet.integrity.sha256,
      scope_sha256: await documentHash(
        s.packet.snapshot.comparison.revised_scope,
      ),
    });
    expect(issued.bundle.version).toEqual({
      ...s.draft.version,
      status: 'issued',
      issued_at: issued.record.issued_at,
    });
    expect(issued.bundle.estimate.id).toBe(s.estimate);
    expect(s.model.read().reviews).toEqual(before.reviews);
    expect(s.dryRun.snapshot.verdict).toBe('BLOCKED');
    await expect(s.repo.estimates.issue(s.org, issued.bundle)).rejects.toThrow(
      'separate reviewed',
    );
    const publish = vi.spyOn(ReleasePreview.prototype, 'command'),
      fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const offer = await s.loop.prepareOffer(s.org, s.actor, s.estimate, true);
    expect(offer).toMatchObject({
      version_id: s.draft.version.id,
      channel: 'internal_sink',
      delivered: false,
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith('staff', 'publish_offer', {
      version_id: s.draft.version.id,
    });
    expect(fetch).not.toHaveBeenCalled();
    const customer = s.model.read();
    expect(customer.reviews).toHaveLength(3);
    expect(customer.reviews[2]).toMatchObject({
      version_number: 3,
      version_id: s.draft.version.id,
      customer_id: s.receipt.customer_id,
      location_id: s.original.version.payload.location_id,
      scope: {
        total_minor: s.draft.version.calculation.total_minor,
        notes: s.draft.version.payload.customer_notes,
      },
    });
    expect(customer.responses[1]).toEqual(before.responses[1]);
    expect(customer.responses[2].decision).toBeNull();
    expect(JSON.stringify(customer)).not.toMatch(
      /STAFF_ONLY|unit_cost|gross_profit|profit_margin|internal_notes|reviewer|packet_sha256|saved_revision/,
    );
    const response = await s.model.respond(
      s.draft.version.id,
      'accepted',
      true,
    );
    expect(response.id).not.toBe(s.receipt.id);
    expect(response.offer_id).toBe(offer.id);
    expect(response.decision).toBe('accepted');
    expect(s.model.read().responses[1]).toEqual(before.responses[1]);
    expect(s.model.read().responses[2].receipt_id).toBe(response.id);
    await expect(
      s.model.respond(s.draft.version.id, 'declined', true),
    ).rejects.toThrow();
    const after = await s.repo.estimates.history(s.org, s.estimate);
    expect(after.slice(0, 2)).toEqual(history.slice(0, 2));
    expect(
      (await s.repo.estimates.get(s.org, s.estimate, s.original.version.id))
        .version,
    ).toEqual(s.original.version);
    expect(await s.repo.estimates.jobs(s.org)).toEqual(jobs);
    expect(publish.mock.calls.map((c) => c[1])).toEqual([
      'publish_offer',
      'decide_offer',
    ]);
  },
);
it.each(['accepted', 'declined', 'changes_requested'] as const)(
  'version3 supports separate %s preference and no version4',
  async (choice) => {
    const s = await setup();
    await s.loop.issue(s.issueReview, () => s.draft.version.payload, true);
    await s.loop.prepareOffer(s.org, s.actor, s.estimate, true);
    const r = await s.model.respond(
      s.draft.version.id,
      choice,
      true,
      choice === 'changes_requested'
        ? 'Please clarify this exact revised scope'
        : '',
    );
    expect(r.decision).toBe(choice);
    expect(r.id).not.toBe(s.receipt.id);
    if (choice === 'changes_requested') {
      const review = await s.changes.review(s.org, s.actor, r.id);
      expect(review.blocked).toContain('outside this local package');
      await expect(s.changes.prepare(review, true)).rejects.toThrow();
    }
    expect(
      (await s.repo.estimates.history(s.org, s.estimate)).map(
        (v) => v.version_number,
      ),
    ).toEqual([1, 2, 3]);
  },
);
it('explicit separate confirmation, opaque review and clean saved editor required;3D does not authorize', async () => {
  const s = await setup();
  await expect(
    s.loop.issue(s.issueReview, () => s.draft.version.payload, false),
  ).rejects.toThrow('Separate explicit');
  await expect(
    s.loop.issue({ ...s.issueReview }, () => s.draft.version.payload, true),
  ).rejects.toThrow('Exact');
  await expect(
    s.loop.issue(
      s.issueReview,
      () => ({ ...s.draft.version.payload, terms: 'dirty' }),
      true,
    ),
  ).rejects.toThrow();
  expect(s.loop.status(s.org, s.actor, s.estimate)).toBeNull();
  await expect(s.repo.estimates.issue(s.org, s.draft)).rejects.toThrow(
    'separate reviewed',
  );
});
it('duplicate and concurrent staff issuance produces exactly one version transition', async () => {
  const s = await setup();
  const other = await s.loop.open(
    s.org,
    s.org + '-estimator',
    s.estimate,
    s.draft.version.id,
    s.draft.version.lock_revision,
    s.packet.snapshot.id,
    s.dryRun.snapshot.id,
  );
  const out = await Promise.allSettled([
    s.loop.issue(s.issueReview, () => s.draft.version.payload, true),
    s.loop.issue(other, () => s.draft.version.payload, true),
  ]);
  expect(out.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  await expect(
    s.loop.issue(s.issueReview, () => s.draft.version.payload, true),
  ).rejects.toThrow('already attempted');
  expect(await s.repo.estimates.history(s.org, s.estimate)).toHaveLength(3);
});
it.each(['before', 'after'])(
  'lost %s issuance acknowledgment retains UNKNOWN and reconciles without replay or auto offer',
  async (when) => {
    const s = await setup(),
      real = s.repo.estimates.issueSyntheticCustomerRevision.bind(
        s.repo.estimates,
      );
    const mutation = vi
      .spyOn(s.repo.estimates, 'issueSyntheticCustomerRevision')
      .mockImplementation(async (...args) => {
        if (when === 'after') await real(...args);
        throw Error('lost');
      });
    const command = vi.spyOn(ReleasePreview.prototype, 'command');
    await expect(
      s.loop.issue(s.issueReview, () => s.draft.version.payload, true),
    ).rejects.toThrow('UNKNOWN');
    expect(s.loop.status(s.org, s.actor, s.estimate)?.state).toBe(
      'issuance_unknown',
    );
    await expect(
      s.loop.issue(s.issueReview, () => s.draft.version.payload, true),
    ).rejects.toThrow('already');
    await expect(
      s.loop.prepareOffer(s.org, s.actor, s.estimate, true),
    ).rejects.toThrow('Confirmed');
    const r = await s.loop.reconcile(s.org, s.actor, s.estimate);
    expect(r.status).toBe(when === 'after' ? 'issued' : 'undetermined');
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(command).not.toHaveBeenCalled();
    expect(s.model.read().reviews).toHaveLength(2);
  },
);
it.each(['before', 'after'])(
  'lost %s internal offer ack retains exact engine, UNKNOWN and no second publication',
  async (when) => {
    const s = await setup();
    await s.loop.issue(s.issueReview, () => s.draft.version.payload, true);
    const real = ReleasePreview.prototype.command;
    const command = vi
      .spyOn(ReleasePreview.prototype, 'command')
      .mockImplementation(async function (this: ReleasePreview, ...args) {
        if (when === 'after') await real.apply(this, args);
        throw Error('lost');
      });
    await expect(
      s.loop.prepareOffer(s.org, s.actor, s.estimate, true),
    ).rejects.toThrow('UNKNOWN');
    expect(s.model.read().reviews).toHaveLength(2);
    await expect(
      s.loop.prepareOffer(s.org, s.actor, s.estimate, true),
    ).rejects.toThrow('no replay');
    const r = await s.loop.reconcile(s.org, s.actor, s.estimate);
    expect(r.status).toBe(when === 'after' ? 'offered' : 'undetermined');
    expect(s.model.read().reviews).toHaveLength(when === 'after' ? 3 : 2);
    expect(command).toHaveBeenCalledTimes(1);
  },
);
it('pending holds prevent reconciliation, double offer and second staff transition', async () => {
  const s = await setup(),
    real = s.repo.estimates.issueSyntheticCustomerRevision.bind(
      s.repo.estimates,
    );
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  vi.spyOn(
    s.repo.estimates,
    'issueSyntheticCustomerRevision',
  ).mockImplementation(async (...args) => {
    await gate;
    return real(...args);
  });
  const pending = s.loop.issue(
    s.issueReview,
    () => s.draft.version.payload,
    true,
  );
  await expect(s.loop.reconcile(s.org, s.actor, s.estimate)).rejects.toThrow(
    'pending',
  );
  await expect(
    s.loop.issue(s.issueReview, () => s.draft.version.payload, true),
  ).rejects.toThrow('already');
  release();
  await pending;
  const realCommand = ReleasePreview.prototype.command;
  let publish!: () => void;
  const block = new Promise<void>((r) => (publish = r));
  vi.spyOn(ReleasePreview.prototype, 'command').mockImplementation(
    async function (this: ReleasePreview, ...args) {
      await block;
      return realCommand.apply(this, args);
    },
  );
  const offer = s.loop.prepareOffer(s.org, s.actor, s.estimate, true);
  await expect(
    s.loop.prepareOffer(s.org, s.actor, s.estimate, true),
  ).rejects.toThrow('no replay');
  await expect(s.loop.reconcile(s.org, s.actor, s.estimate)).rejects.toThrow(
    'pending',
  );
  publish();
  await offer;
});
it.each(['foreign', 'inactive', 'field'])(
  'rejects %s staff before transitions or evidence reads',
  async (kind) => {
    const s = await setup();
    const actor =
      kind === 'foreign'
        ? 'sample-roofing-owner'
        : kind === 'field'
          ? s.org + '-field'
          : s.actor;
    if (kind === 'inactive')
      vi.spyOn(s.repo.operations, 'syntheticMemberships').mockReturnValue([]);
    await expect(
      s.loop.open(
        s.org,
        actor,
        s.estimate,
        s.draft.version.id,
        s.draft.version.lock_revision,
        s.packet.snapshot.id,
        s.dryRun.snapshot.id,
      ),
    ).rejects.toThrow();
    expect(() => s.loop.status(s.org, actor, s.estimate)).toThrow();
  },
);
it('late dirty editor or revoked membership at engine final checkpoint prevents transition, retaining UNKNOWN', async () => {
  const s = await setup(),
    real = s.repo.estimates.issueSyntheticCustomerRevision.bind(
      s.repo.estimates,
    );
  let p = s.draft.version.payload;
  vi.spyOn(
    s.repo.estimates,
    'issueSyntheticCustomerRevision',
  ).mockImplementation(async (...args) => {
    p = { ...p, terms: 'late dirty' };
    return real(...args);
  });
  await expect(s.loop.issue(s.issueReview, () => p, true)).rejects.toThrow(
    'UNKNOWN',
  );
  expect((await s.repo.estimates.get(s.org, s.estimate)).version.status).toBe(
    'draft',
  );
  expect((await s.loop.reconcile(s.org, s.actor, s.estimate)).status).toBe(
    'undetermined',
  );
});
it('stale saved revision and changed tax block issuance without replacing originals', async () => {
  const s = await setup();
  await s.repo.estimates.save(s.org, s.draft, {
    ...s.draft.version.payload,
    customer_notes: 'new saved scope',
  });
  await expect(
    s.loop.issue(s.issueReview, () => s.draft.version.payload, true),
  ).rejects.toThrow();
  const t = await setup();
  const tax = t.repo.estimates.customerRevisionTaxState(
    t.org,
    t.actor,
    t.estimate,
  )!;
  vi.spyOn(t.repo.estimates, 'customerRevisionTaxState').mockReturnValue({
    ...tax,
    rate_bps: tax.rate_bps + 1,
  });
  await expect(
    t.loop.issue(t.issueReview, () => t.draft.version.payload, true),
  ).rejects.toThrow();
});
it('expired drafts and offers reject new actions; read reconciliation never issues again', async () => {
  const s = await setup();
  await s.loop.issue(s.issueReview, () => s.draft.version.payload, true);
  await s.loop.prepareOffer(s.org, s.actor, s.estimate, true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 2 * 86400000);
  expect(s.model.read().responses[2].offer_status).toBe('expired');
  await expect(
    s.model.respond(s.draft.version.id, 'accepted', true),
  ).rejects.toThrow('unavailable');
});
it('wrong tenant, property, receipt, scope hash and connected repository cannot use the new engine entry', async () => {
  const s = await setup();
  const pr = await s.packets.review(
    s.org,
    s.actor,
    s.estimate,
    s.draft.version.id,
    s.draft.version.lock_revision,
  );
  const args = [
    s.packets,
    pr,
    s.packet,
    s.issueReview.source.view.scope_sha256,
    crypto.randomUUID(),
    () => s.draft.version.payload,
    true,
    () => {},
  ] as const;
  const connected = new Phase3Repository(new Operations(false));
  await expect(
    connected.issueSyntheticCustomerRevision(...args),
  ).rejects.toThrow('local synthetic');
  await expect(
    s.repo.estimates.issueSyntheticCustomerRevision(
      s.packets,
      { ...pr, org: 'sample-roofing' },
      s.packet,
      args[3],
      args[4],
      args[5],
      true,
      () => {},
    ),
  ).rejects.toThrow();
  await expect(
    s.loop.open(
      s.org,
      s.actor,
      s.estimate,
      s.draft.version.id,
      s.draft.version.lock_revision,
      crypto.randomUUID(),
      s.dryRun.snapshot.id,
    ),
  ).rejects.toThrow();
  await expect(
    s.repo.estimates.issueSyntheticCustomerRevision(
      s.packets,
      pr,
      s.packet,
      '0'.repeat(64),
      args[4],
      args[5],
      true,
      () => {},
    ),
  ).rejects.toThrow('scope');
  await expect(
    s.repo.estimates.issueSyntheticCustomerRevision(...args),
  ).rejects.toThrow('already');
});
it('customer UNKNOWN on version3 only reconciles exact receipt and preserves version2', async () => {
  const s = await setup();
  await s.loop.issue(s.issueReview, () => s.draft.version.payload, true);
  await s.loop.prepareOffer(s.org, s.actor, s.estimate, true);
  const real = ReleasePreview.prototype.command;
  vi.spyOn(ReleasePreview.prototype, 'command').mockImplementation(
    async function (this: ReleasePreview, ...args) {
      await real.apply(this, args);
      throw Error('lost');
    },
  );
  await expect(
    s.model.respond(
      s.draft.version.id,
      'changes_requested',
      true,
      'Please clarify <img src=x>',
    ),
  ).rejects.toThrow('UNKNOWN');
  expect(s.model.read().responses[1].receipt_id).toBe(s.receipt.id);
  expect(s.model.read().responses[2].receipt_id).toBeNull();
  await expect(
    s.model.respond(s.draft.version.id, 'declined', true),
  ).rejects.toThrow();
  expect(s.model.reconcileResponse(s.draft.version.id).status).toBe(
    'confirmed',
  );
});
it('wrong property is isolated; removed source line never inherits another line inspection association', async () => {
  const s = await setup();
  const payload = structuredClone(s.draft.version.payload);
  payload.lines = [
    {
      ...blankLine(),
      description: 'Distinct revised scope',
      unit_price_minor: 12000,
    },
  ];
  const d = await s.repo.estimates.save(s.org, s.draft, payload);
  const pr = await s.packets.review(
    s.org,
    s.actor,
    s.estimate,
    d.version.id,
    d.version.lock_revision,
  );
  const p = await s.packets.prepare(pr, d.version.payload, true);
  const review = await s.readiness.open(
    s.org,
    s.actor,
    s.estimate,
    d.version.id,
    d.version.lock_revision,
    p.snapshot.id,
  );
  const r = await s.readiness.record(review, () => d.version.payload, true);
  const ir = await s.loop.open(
    s.org,
    s.actor,
    s.estimate,
    d.version.id,
    d.version.lock_revision,
    p.snapshot.id,
    r.snapshot.id,
  );
  await s.loop.issue(ir, () => d.version.payload, true);
  await s.loop.prepareOffer(s.org, s.actor, s.estimate, true);
  expect(s.model.read().reviews[2].source_line_id).toBeNull();
  const original = s.model.read().context.location_id;
  const other = s.model.properties().find((x) => x.id !== original)!;
  s.model.selectProperty(other.id);
  expect(s.model.read().reviews).toEqual([]);
  await expect(
    s.model.respond(d.version.id, 'accepted', true),
  ).rejects.toThrow();
});

it('revoked staff at final commit and after issuance cannot continue into an internal offer', async () => {
  const s = await setup(),
    real = s.repo.estimates.issueSyntheticCustomerRevision.bind(
      s.repo.estimates,
    );
  vi.spyOn(
    s.repo.estimates,
    'issueSyntheticCustomerRevision',
  ).mockImplementation(async (...args) => {
    vi.spyOn(s.repo.operations, 'syntheticMemberships').mockReturnValue([]);
    return real(...args);
  });
  await expect(
    s.loop.issue(s.issueReview, () => s.draft.version.payload, true),
  ).rejects.toThrow('UNKNOWN');
  vi.restoreAllMocks();
  expect((await s.repo.estimates.get(s.org, s.estimate)).version.status).toBe(
    'draft',
  );
  const t = await setup();
  await t.loop.issue(t.issueReview, () => t.draft.version.payload, true);
  vi.spyOn(t.repo.operations, 'syntheticMemberships').mockReturnValue([]);
  await expect(
    t.loop.prepareOffer(t.org, t.actor, t.estimate, true),
  ).rejects.toThrow();
  expect(t.model.read().reviews).toHaveLength(2);
});
it('changed calculation, property or immutable issued source invalidates exact issuance review', async () => {
  for (const field of ['calculation', 'property', 'source']) {
    const s = await setup(),
      real = s.repo.estimates.customerRevisionState.bind(s.repo.estimates);
    vi.spyOn(s.repo.estimates, 'customerRevisionState').mockImplementation(
      (...args) => {
        const e = real(...args);
        if (field === 'calculation') e.draft.version.calculation.total_minor++;
        if (field === 'property')
          e.draft.version.payload.location_id = crypto.randomUUID();
        if (field === 'source')
          e.source.payload.lines[0].description = 'different evidence';
        return e;
      },
    );
    await expect(
      s.loop.issue(s.issueReview, () => s.draft.version.payload, true),
    ).rejects.toThrow();
    expect((await s.repo.estimates.get(s.org, s.estimate)).version.status).toBe(
      'draft',
    );
    vi.restoreAllMocks();
  }
});
it('packet integrity loss after issue blocks offering and cannot replay with a replacement packet', async () => {
  const s = await setup();
  await s.loop.issue(s.issueReview, () => s.draft.version.payload, true);
  const read = s.packets.archive.read.bind(s.packets.archive);
  vi.spyOn(s.packets.archive, 'read').mockImplementation((id) => {
    const p = read(id);
    if (p) p.integrity.sha256 = '0'.repeat(64);
    return p;
  });
  await expect(
    s.loop.prepareOffer(s.org, s.actor, s.estimate, true),
  ).rejects.toThrow('UNKNOWN');
  await expect(
    s.loop.prepareOffer(s.org, s.actor, s.estimate, true),
  ).rejects.toThrow('no replay');
  await expect(s.loop.reconcile(s.org, s.actor, s.estimate)).rejects.toThrow(
    'integrity',
  );
  expect(s.model.read().reviews).toHaveLength(2);
});
it('current local tax changes or draft expiration prevent synthetic issuance and offer preparation', async () => {
  const s = await setup();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2028-01-01T00:00:00Z'));
  await expect(
    s.loop.issue(s.issueReview, () => s.draft.version.payload, true),
  ).rejects.toThrow();
  vi.useRealTimers();
  const t = await setup();
  await t.loop.issue(t.issueReview, () => t.draft.version.payload, true);
  vi.spyOn(t.repo.estimates, 'syntheticIssuedTaxState').mockReturnValue(null);
  await expect(
    t.loop.prepareOffer(t.org, t.actor, t.estimate, true),
  ).rejects.toThrow('UNKNOWN');
  expect(t.model.read().reviews).toHaveLength(2);
});
it('reviewed maintenance repair origins remain excluded from synthetic customer issuance', async () => {
  const s = await setup();
  const { prepareMaintenanceExamples } =
    await import('../src/lib/maintenance-examples');
  await prepareMaintenanceExamples(s.repo, s.org, s.actor);
  const row = s.repo.maintenance(s.org, s.actor).items[0];
  const review = await s.repo.reviewRepair(s.company, s.actor, row.source, 0);
  const draft = await s.repo.findingEstimate(
    s.company,
    s.actor,
    row.source,
    review.id,
  );
  await expect(
    s.loop.open(
      s.org,
      s.actor,
      draft.estimate.id,
      draft.version.id,
      draft.version.lock_revision,
      s.packet.snapshot.id,
      s.dryRun.snapshot.id,
    ),
  ).rejects.toThrow();
  await expect(s.repo.estimates.issue(s.org, draft)).rejects.toThrow(
    'issuance is disabled',
  );
});
it('packet snapshots and3D BLOCKED results remain unchanged after issuance', async () => {
  const s = await setup();
  const before = s.packets.archive.read(s.packet.snapshot.id),
    dry = s.readiness.records.read(s.dryRun.snapshot.id);
  await s.loop.issue(s.issueReview, () => s.draft.version.payload, true);
  await s.loop.prepareOffer(s.org, s.actor, s.estimate, true);
  expect(s.packets.archive.read(s.packet.snapshot.id)).toEqual(before);
  expect(s.readiness.records.read(s.dryRun.snapshot.id)).toEqual(dry);
  const result = await s.loop.reconcile(s.org, s.actor, s.estimate);
  if (result.status === 'undetermined') throw Error('expected evidence');
  result.result.bundle.version.payload.lines[0].description = 'tamper copy';
  const again = await s.loop.reconcile(s.org, s.actor, s.estimate);
  if (again.status === 'undetermined') throw Error('expected evidence');
  expect(again.result.bundle.version.payload.lines[0].description).toBe(
    s.draft.version.payload.lines[0].description,
  );
});
it('generic drafts and unconfirmed internal offers reject; duplicate offer stays held after success', async () => {
  const s = await setup();
  await expect(
    s.loop.prepareOffer(s.org, s.actor, s.estimate, true),
  ).rejects.toThrow();
  await s.loop.issue(s.issueReview, () => s.draft.version.payload, true);
  await expect(
    s.loop.prepareOffer(s.org, s.actor, s.estimate, false),
  ).rejects.toThrow('explicit');
  await s.loop.prepareOffer(s.org, s.actor, s.estimate, true);
  await expect(
    s.loop.prepareOffer(s.org, s.actor, s.estimate, true),
  ).rejects.toThrow('no replay');
});

it('edited selling scope, discount and tax keep canonical totals and stable line identity at issuance', async () => {
  const s = await setup();
  await s.repo.estimates.saveTax(s.org, {
    name: 'Synthetic6.25%',
    reference: 'Synthetic',
    jurisdiction: 'Synthetic',
    contract_type: s.draft.version.payload.project.type,
    rate_bps: 625,
    status: 'reviewed',
    active: true,
  });
  const payload = structuredClone(s.draft.version.payload);
  payload.tax_policy_id = (await s.repo.estimates.taxes(s.org)).at(-1)!.id;
  payload.lines[0].unit_price_minor = 22222;
  payload.lines[0].taxable = true;
  payload.discount = { kind: 'percent', value: 500 };
  const d = await s.repo.estimates.save(s.org, s.draft, payload);
  const pr = await s.packets.review(
    s.org,
    s.actor,
    s.estimate,
    d.version.id,
    d.version.lock_revision,
  );
  const p = await s.packets.prepare(pr, d.version.payload, true);
  const review = await s.readiness.open(
    s.org,
    s.actor,
    s.estimate,
    d.version.id,
    d.version.lock_revision,
    p.snapshot.id,
  );
  const r = await s.readiness.record(review, () => d.version.payload, true);
  const ir = await s.loop.open(
    s.org,
    s.actor,
    s.estimate,
    d.version.id,
    d.version.lock_revision,
    p.snapshot.id,
    r.snapshot.id,
  );
  const issued = await s.loop.issue(ir, () => d.version.payload, true);
  await s.loop.prepareOffer(s.org, s.actor, s.estimate, true);
  expect(issued.bundle.version.calculation).toEqual(d.version.calculation);
  expect(issued.bundle.version.payload.lines.map((l) => l.id)).toEqual(
    d.version.payload.lines.map((l) => l.id),
  );
  const scope = s.model.read().reviews[2].scope;
  expect(scope.total_minor).toBe(d.version.calculation.total_minor);
  expect(scope.tax_minor).toBe(d.version.calculation.tax_minor);
  expect(scope.discount_minor).toBe(d.version.calculation.discount_minor);
  expect(scope.total_minor).not.toBe(
    s.original.version.calculation.total_minor,
  );
});
it('tax drift after internal sink commit never reveals an uncertain offer as current', async () => {
  const s = await setup();
  await s.loop.issue(s.issueReview, () => s.draft.version.payload, true);
  const real = ReleasePreview.prototype.command;
  vi.spyOn(ReleasePreview.prototype, 'command').mockImplementation(
    async function (this: ReleasePreview, ...args) {
      const result = await real.apply(this, args);
      vi.spyOn(s.repo.estimates, 'syntheticIssuedTaxState').mockReturnValue(
        null,
      );
      return result;
    },
  );
  await expect(
    s.loop.prepareOffer(s.org, s.actor, s.estimate, true),
  ).rejects.toThrow('UNKNOWN');
  await expect(s.loop.reconcile(s.org, s.actor, s.estimate)).rejects.toThrow(
    'stale tax',
  );
  expect(s.model.read().reviews).toHaveLength(2);
  expect(s.loop.status(s.org, s.actor, s.estimate)?.state).toBe(
    'offer_unknown',
  );
});
