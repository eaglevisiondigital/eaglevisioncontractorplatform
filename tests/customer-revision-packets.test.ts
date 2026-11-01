import { afterEach, expect, it, vi } from 'vitest';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { CustomerChangeWorkspace } from '../src/lib/customer-change-workspace';
import { CustomerRevisionPackets } from '../src/lib/customer-revision-packets';
import {
  LocalReviewPacketArchive,
  projectRevisionScope,
} from '../src/domain/estimating/revision-packet';
import { sampleCompanies } from '../src/domain/platform';
import {
  blankLine,
  calculateEstimate,
} from '../src/domain/estimating/calculation';
import { documentHash, ReleasePreview } from '../src/domain/release/preview';
import { projectIssuedReview } from '../src/domain/customer/review';

afterEach(() => vi.restoreAllMocks());
async function setup(index = 0, edit = true) {
  const repo = new PropertyRepository(new Operations(true));
  const changes = new CustomerChangeWorkspace(repo),
    packets = new CustomerRevisionPackets(changes);
  const company = sampleCompanies[index],
    org = company.id,
    model = changes.customer(company);
  await model.login();
  await model.prepareHistory();
  await model.prepare();
  const data = model.read(),
    actor = changes.reviewer(org);
  const receipt = await model.respond(
    data.reviews[1].version_id,
    'changes_requested',
    true,
    'Please inspect the proposed gate scope. <img src=x onerror=alert(1)>',
  );
  const sourceReview = await changes.review(org, actor, receipt.id);
  let draft = await changes.prepare(sourceReview, true);
  const source = sourceReview.source.version;
  if (edit) {
    await repo.estimates.saveTax(org, {
      name: 'Synthetic6.25%',
      reference: 'Synthetic review only',
      jurisdiction: 'Synthetic',
      contract_type: draft.version.payload.project.type,
      rate_bps: 625,
      status: 'reviewed',
      active: true,
    });
    const p = structuredClone(draft.version.payload);
    p.tax_policy_id = (await repo.estimates.taxes(org)).at(-1)!.id;
    p.lines = p.lines.slice(0, -1);
    p.lines[0] = {
      ...p.lines[0],
      description: 'Revised gate scope',
      quantity_milli: 1750,
      unit: 'each',
      unit_price_minor: 22222,
      taxable: true,
      internal_note: 'PRIVATE_LINE_CANARY',
    };
    p.lines.push({
      ...blankLine(),
      description: 'Added safe inspection allowance',
      unit_price_minor: 33333,
      unit_cost_minor: 23456,
      taxable: true,
    });
    p.discount = { kind: 'percent', value: 500 };
    p.internal_notes = 'PRIVATE_STAFF_CANARY';
    p.terms = 'Revised synthetic terms only';
    p.project.start_on = '2027-02-01';
    p.project.end_on = '2027-02-10';
    p.customer_notes = 'Customer-facing note from staff';
    p.payment_schedule[0].label = 'Proposed initial review share';
    draft = await repo.estimates.save(org, draft, p);
  }
  const estimate = draft.estimate.id;
  const review = await packets.review(
    org,
    actor,
    estimate,
    draft.version.id,
    draft.version.lock_revision,
  );
  return {
    repo,
    changes,
    packets,
    company,
    org,
    model,
    actor,
    receipt,
    source,
    draft,
    estimate,
    review,
  };
}
it.each([0, 1, 2])(
  'company%i actual3A->3B->3C comparison and immutable safe packet, with no financial effects',
  async (index) => {
    const s = await setup(index),
      c = s.review.comparison;
    expect(c.request.id).toBe(s.receipt.id);
    expect(c.request.offer_id).toBe(s.receipt.offer_id);
    expect(c.request.note).toBe(s.receipt.note);
    expect(c.original.id).toBe(s.source.id);
    expect(c.revised.id).toBe(s.draft.version.id);
    expect(c.revised.saved_revision).toBe(2);
    expect(c.differences.lines.map((l) => l.status)).toEqual(
      expect.arrayContaining(['Modified', 'Added', 'Removed', 'Unchanged']),
    );
    expect(c.source_association).toMatchObject({
      report_id: s.model.staffIssuedReview(s.source.id).source_report_id,
      published_version: 1,
      source_line_id: s.source.payload.lines.at(-1)!.id,
    });
    expect(c.revised_scope.totals.total_minor).toBe(
      s.draft.version.calculation.total_minor,
    );
    expect(c.revised_scope.totals.tax_minor).toBeGreaterThan(0);
    expect(c.revised_scope.totals.discount_minor).toBeGreaterThan(0);
    expect(c.differences.fields.find((f) => f.field === 'terms')?.changed).toBe(
      true,
    );
    const jobs = await s.repo.estimates.jobs(s.org),
      command = vi.spyOn(ReleasePreview.prototype, 'command');
    const packet = await s.packets.prepare(
      s.review,
      s.draft.version.payload,
      true,
    );
    expect(packet.snapshot.title).toBe(
      'Customer Review Packet — Staff Preview Only',
    );
    expect(packet.snapshot.authority).toBe(
      'Draft Estimate — Not Issued or Sent',
    );
    expect(packet.snapshot.prepared_by).toBe(s.actor);
    expect(packet.integrity.sha256).toBe(await documentHash(packet.snapshot));
    expect(packet.snapshot.comparison).toEqual(c);
    expect(packet.current).toBe(true);
    expect(JSON.stringify(packet)).not.toMatch(
      /PRIVATE_|unit_cost_minor|markup_bps|gross_profit|profit_margin|payroll|internal_note|readiness|calculation|email|phone/,
    );
    expect(command).not.toHaveBeenCalled();
    expect(await s.repo.estimates.jobs(s.org)).toEqual(jobs);
    expect(
      (await s.repo.estimates.get(s.org, s.estimate, s.source.id)).version,
    ).toEqual(s.source);
    expect(s.model.read().responses[1].receipt_id).toBe(s.receipt.id);
    expect(s.model.read().reviews).toHaveLength(2);
    expect(s.repo.portal(s.org, s.receipt.customer_id).contracts).toEqual([]);
    expect(s.repo.portal(s.org, s.receipt.customer_id).invoices).toEqual([]);
  },
);
it('unchanged draft explicitly reports unchanged lines, fields and totals without inferring changes from the note', async () => {
  const s = await setup(0, false);
  expect(
    s.review.comparison.differences.lines.every(
      (l) => l.status === 'Unchanged',
    ),
  ).toBe(true);
  expect(s.review.comparison.differences.fields.every((f) => !f.changed)).toBe(
    true,
  );
  expect(
    s.review.comparison.differences.totals.every(
      (t) => !t.changed && t.difference === 0,
    ),
  ).toBe(true);
});
it('projectIssuedReview still rejects private drafts; narrow projection rejects wrong status, binding or canonical totals', async () => {
  const s = await setup(),
    c = s.model.read().context;
  expect(() =>
    projectIssuedReview(s.draft.version, {
      ...c,
      version_ids: [s.draft.version.id],
    }),
  ).toThrow();
  const binding = s.review.comparison.binding;
  expect(() =>
    projectRevisionScope(s.draft.version, binding, 'issued'),
  ).toThrow();
  expect(() => projectRevisionScope(s.source, binding, 'draft')).toThrow();
  expect(() =>
    projectRevisionScope(
      s.draft.version,
      { ...binding, location_id: crypto.randomUUID() },
      'draft',
    ),
  ).toThrow();
  const bad = structuredClone(s.draft.version);
  bad.calculation.total_minor++;
  expect(() => projectRevisionScope(bad, binding, 'draft')).toThrow(
    'canonical',
  );
  const duplicate = structuredClone(s.draft.version);
  duplicate.payload.lines.push(duplicate.payload.lines[0]);
  expect(() => projectRevisionScope(duplicate, binding, 'draft')).toThrow();
});
it('strict projection drops private snapshot extras and preserves canonical customer amount/tax/discount/schedule', async () => {
  const s = await setup(),
    version = structuredClone(s.draft.version);
  Object.assign(version.company_snapshot, { private_bank: 'PRIVATE_BANK' });
  Object.assign(version.customer_snapshot, {
    private_notes: 'PRIVATE_CONTACT',
  });
  version.attachment_snapshots = [
    {
      document_id: crypto.randomUUID(),
      customer_visible: true,
      display_name: 'Scope summary',
      content_type: 'application/pdf',
    },
    {
      document_id: crypto.randomUUID(),
      customer_visible: false,
      display_name: 'PRIVATE_ATTACHMENT',
      content_type: 'application/pdf',
    },
  ];
  version.payload.attachments = [
    {
      document_id: version.attachment_snapshots[0].document_id,
      customer_visible: true,
    },
  ];
  const projected = projectRevisionScope(
    version,
    s.review.comparison.binding,
    'draft',
  );
  expect(JSON.stringify(projected)).not.toMatch(
    /PRIVATE_|unit_cost|markup|profit/,
  );
  const canonical = calculateEstimate(
    version.payload,
    version.tax_policy_snapshot!.rate_bps,
  );
  expect(projected.totals).toEqual({
    subtotal_minor: canonical.subtotal_minor,
    discount_minor: canonical.discount_minor,
    tax_minor: canonical.tax_minor,
    total_minor: canonical.total_minor,
  });
  expect(projected.schedule.reduce((n, s) => n + s.amount_minor, 0)).toBe(
    canonical.total_minor,
  );
  expect(projected.attachments).toEqual([
    { display_name: 'Scope summary', content_type: 'application/pdf' },
  ]);
});
it('same wording with distinct line IDs is an addition/removal, never a fuzzy match', async () => {
  const s = await setup(0, false),
    p = structuredClone(s.draft.version.payload),
    old = p.lines.at(-1)!.id;
  p.lines.at(-1)!.id = crypto.randomUUID();
  const saved = await s.repo.estimates.save(s.org, s.draft, p);
  const review = await s.packets.review(
    s.org,
    s.actor,
    s.estimate,
    saved.version.id,
    saved.version.lock_revision,
  );
  expect(
    review.comparison.differences.lines.find((l) => l.id === old)?.status,
  ).toBe('Removed');
  expect(
    review.comparison.differences.lines.find((l) => l.id === p.lines.at(-1)!.id)
      ?.status,
  ).toBe('Added');
});
it('requires explicit confirmation, an actual review object and exact saved editor payload', async () => {
  const s = await setup(),
    dirty = structuredClone(s.draft.version.payload);
  dirty.terms += ' unsaved';
  await expect(
    s.packets.prepare(s.review, s.draft.version.payload, false),
  ).rejects.toThrow('confirm');
  await expect(
    s.packets.prepare(structuredClone(s.review), s.draft.version.payload, true),
  ).rejects.toThrow('confirm');
  await expect(s.packets.prepare(s.review, dirty, true)).rejects.toThrow(
    'Unsaved',
  );
  expect(s.packets.history(s.org, s.actor, s.estimate)).toEqual([]);
});
it('stale comparison and optimistic lock edits cannot prepare; original packets freeze and next saved revision needs new confirmation', async () => {
  const s = await setup(),
    first = await s.packets.prepare(s.review, s.draft.version.payload, true);
  const saved = await s.repo.estimates.save(s.org, s.draft, {
    ...s.draft.version.payload,
    terms: 'Later saved terms',
  });
  await expect(
    s.repo.estimates.save(s.org, s.draft, s.draft.version.payload),
  ).rejects.toThrow('changed');
  await expect(
    s.packets.prepare(s.review, saved.version.payload, true),
  ).rejects.toThrow('stale');
  const old = await s.packets.read(
    s.org,
    s.actor,
    s.estimate,
    first.snapshot.id,
  );
  expect(old.current).toBe(false);
  expect(old.snapshot).toEqual(first.snapshot);
  expect(old.integrity).toEqual(first.integrity);
  old.snapshot.comparison.request.note = 'tamper returned copy';
  expect(
    (await s.packets.read(s.org, s.actor, s.estimate, first.snapshot.id))
      .snapshot,
  ).toEqual(first.snapshot);
  const fresh = await s.packets.review(
    s.org,
    s.actor,
    s.estimate,
    saved.version.id,
    saved.version.lock_revision,
  );
  await expect(
    s.packets.prepare(fresh, saved.version.payload, false),
  ).rejects.toThrow();
  const second = await s.packets.prepare(fresh, saved.version.payload, true);
  expect(second.snapshot.id).not.toBe(first.snapshot.id);
  expect(second.snapshot.comparison.revised.saved_revision).toBe(3);
  expect(
    s.packets.history(s.org, s.actor, s.estimate).map((h) => h.current),
  ).toEqual([false, true]);
});
it('duplicate and concurrent eligible staff preparation produces one stable packet', async () => {
  const s = await setup();
  const other = await s.packets.review(
    s.org,
    s.org + '-estimator',
    s.estimate,
    s.draft.version.id,
    s.draft.version.lock_revision,
  );
  const results = await Promise.allSettled([
    s.packets.prepare(s.review, s.draft.version.payload, true),
    s.packets.prepare(other, s.draft.version.payload, true),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  await expect(
    s.packets.prepare(s.review, s.draft.version.payload, true),
  ).rejects.toThrow('already attempted');
  expect(s.packets.history(s.org, s.actor, s.estimate)).toHaveLength(1);
});
it.each(['before', 'after'])(
  'lost %s-commit acknowledgment retains UNKNOWN across edits; exact read only, never new revision bypass',
  async (when) => {
    const s = await setup(),
      real = s.packets.archive.append.bind(s.packets.archive);
    const append = vi
      .spyOn(s.packets.archive, 'append')
      .mockImplementation(async (...args) => {
        if (when === 'after') await real(...args);
        throw Error('lost');
      });
    await expect(
      s.packets.prepare(s.review, s.draft.version.payload, true),
    ).rejects.toThrow('UNKNOWN');
    const row = s.packets.history(s.org, s.actor, s.estimate)[0];
    expect(row.state).toBe('unknown');
    await expect(
      s.packets.read(s.org, s.actor, s.estimate, row.id),
    ).rejects.toThrow('uncertain');
    const saved = await s.repo.estimates.save(s.org, s.draft, {
      ...s.draft.version.payload,
      terms: 'Subsequent saved scope',
    });
    const fresh = await s.packets.review(
      s.org,
      s.actor,
      s.estimate,
      saved.version.id,
      saved.version.lock_revision,
    );
    await expect(
      s.packets.prepare(fresh, saved.version.payload, true),
    ).rejects.toThrow('Unresolved');
    const read = await s.packets.reconcile(s.org, s.actor, s.estimate, row.id);
    expect(read.status).toBe(when === 'after' ? 'prepared' : 'undetermined');
    if (read.status === 'prepared') expect(read.packet.current).toBe(false);
    expect(append).toHaveBeenCalledTimes(1);
  },
);
it('pending packet preparation is held before hashing; no replay or pending reconciliation', async () => {
  const s = await setup();
  let release!: () => void;
  const wait = new Promise<void>((r) => (release = r));
  const real = s.packets.archive.append.bind(s.packets.archive);
  vi.spyOn(s.packets.archive, 'append').mockImplementation(async (...a) => {
    await wait;
    return real(...a);
  });
  const pending = s.packets.prepare(s.review, s.draft.version.payload, true);
  const row = s.packets.history(s.org, s.actor, s.estimate)[0];
  expect(row.state).toBe('pending');
  await expect(
    s.packets.prepare(s.review, s.draft.version.payload, true),
  ).rejects.toThrow('already attempted');
  await expect(
    s.packets.reconcile(s.org, s.actor, s.estimate, row.id),
  ).rejects.toThrow();
  release();
  await pending;
});
it.each(['inactive', 'field', 'foreign'])(
  'rejects %s staff and wrong tenant/customer/property/source edits',
  async (kind) => {
    const s = await setup();
    if (kind === 'inactive')
      vi.spyOn(s.repo.operations, 'syntheticMemberships').mockReturnValue([]);
    const actor =
      kind === 'inactive'
        ? s.actor
        : kind === 'field'
          ? s.org + '-field'
          : 'sample-roofing-owner';
    await expect(
      s.packets.review(
        s.org,
        actor,
        s.estimate,
        s.draft.version.id,
        s.draft.version.lock_revision,
      ),
    ).rejects.toThrow();
    await expect(
      s.packets.prepare(
        kind === 'inactive' ? s.review : { ...s.review, actor },
        s.draft.version.payload,
        true,
      ),
    ).rejects.toThrow();
  },
);
it('foreign reads/guessed IDs, stale source version, forged review and repair-origin conflict reject', async () => {
  const s = await setup();
  await expect(
    s.packets.review(
      s.org,
      s.actor,
      s.estimate,
      s.source.id,
      s.source.lock_revision,
    ),
  ).rejects.toThrow('changed');
  s.review.comparison.binding.location_id = 'foreign';
  await expect(
    s.packets.prepare(s.review, s.draft.version.payload, true),
  ).rejects.toThrow('confirm');
  const fresh = await s.packets.review(
    s.org,
    s.actor,
    s.estimate,
    s.draft.version.id,
    s.draft.version.lock_revision,
  );
  const packet = await s.packets.prepare(fresh, s.draft.version.payload, true);
  await expect(
    s.packets.read(
      'sample-roofing',
      'sample-roofing-owner',
      s.estimate,
      packet.snapshot.id,
    ),
  ).rejects.toThrow();
  await expect(
    s.packets.read(s.org, s.actor, s.estimate, crypto.randomUUID()),
  ).rejects.toThrow();
  vi.spyOn(s.repo.estimates, 'customerRevisionState').mockImplementation(() => {
    throw Error('Repair-origin conflict');
  });
  await expect(
    s.packets.prepare(fresh, s.draft.version.payload, true),
  ).rejects.toThrow('Repair-origin');
});
it('revocation or changed saved draft during hash/commit blocks storage and retains UNKNOWN', async () => {
  const s = await setup(),
    real = s.packets.archive.append.bind(s.packets.archive);
  vi.spyOn(s.packets.archive, 'append').mockImplementation(async (...args) => {
    await s.repo.estimates.save(s.org, s.draft, {
      ...s.draft.version.payload,
      terms: 'Concurrent change',
    });
    return real(...args);
  });
  await expect(
    s.packets.prepare(s.review, s.draft.version.payload, true),
  ).rejects.toThrow('UNKNOWN');
  const row = s.packets.history(s.org, s.actor, s.estimate)[0];
  expect(s.packets.archive.read(row.id)).toBeNull();
  expect(
    (await s.packets.reconcile(s.org, s.actor, s.estimate, row.id)).status,
  ).toBe('undetermined');
});
it('malformed acknowledgment or archive integrity discrepancy never yields a usable success', async () => {
  const s = await setup(),
    real = s.packets.archive.append.bind(s.packets.archive);
  vi.spyOn(s.packets.archive, 'append').mockImplementation(async (...args) => {
    await real(...args);
    return { id: 'wrong', sha256: 'wrong' };
  });
  await expect(
    s.packets.prepare(s.review, s.draft.version.payload, true),
  ).rejects.toThrow('UNKNOWN');
  const row = s.packets.history(s.org, s.actor, s.estimate)[0];
  const read = s.packets.archive.read.bind(s.packets.archive);
  vi.spyOn(s.packets.archive, 'read').mockImplementation((id) => {
    const v = read(id);
    if (v) v.snapshot.comparison.revised_scope.totals.total_minor++;
    return v;
  });
  await expect(
    s.packets.reconcile(s.org, s.actor, s.estimate, row.id),
  ).rejects.toThrow('integrity');
  expect(s.packets.history(s.org, s.actor, s.estimate)[0].state).toBe(
    'unknown',
  );
});
it('3B UNKNOWN cannot advance to packet preparation, even if its draft exists', async () => {
  const s = await setup();
  const evidence = s.changes.confirmedRevision(s.org, s.actor, s.estimate);
  expect(evidence.evidence.draft.version.id).toBe(s.draft.version.id);
  vi.spyOn(s.changes, 'confirmedRevision').mockImplementation(() => {
    throw Error('Reconcile UNKNOWN first');
  });
  await expect(
    s.packets.prepare(s.review, s.draft.version.payload, true),
  ).rejects.toThrow('UNKNOWN');
});
it('archive itself is one-shot per exact revision and protects stored copies from mutation', async () => {
  const s = await setup(),
    stored = await s.packets.prepare(s.review, s.draft.version.payload, true);
  const archive = new LocalReviewPacketArchive();
  await archive.append(stored.snapshot, () => {});
  await expect(
    archive.append({ ...stored.snapshot, id: crypto.randomUUID() }, () => {}),
  ).rejects.toThrow('already');
  const read = archive.read(stored.snapshot.id)!;
  read.snapshot.comparison.request.note = 'tampered';
  expect(archive.read(stored.snapshot.id)!.snapshot).toEqual(stored.snapshot);
});

it('an actual lost3B acknowledgment cannot advance until exact3B read reconciliation', async () => {
  const repo = new PropertyRepository(new Operations(true)),
    changes = new CustomerChangeWorkspace(repo);
  const packets = new CustomerRevisionPackets(changes),
    company = sampleCompanies[0],
    org = company.id;
  const model = changes.customer(company);
  await model.login();
  await model.prepareHistory();
  await model.prepare();
  const data = model.read(),
    actor = changes.reviewer(org);
  const receipt = await model.respond(
    data.reviews[1].version_id,
    'changes_requested',
    true,
    'Please inspect scope',
  );
  const review = await changes.review(org, actor, receipt.id),
    real = repo.estimates.prepareSyntheticCustomerRevision.bind(repo.estimates);
  vi.spyOn(
    repo.estimates,
    'prepareSyntheticCustomerRevision',
  ).mockImplementation(async (...args) => {
    await real(...args);
    throw Error('lost3B');
  });
  await expect(changes.prepare(review, true)).rejects.toThrow('UNKNOWN');
  const draft = await repo.estimates.get(org, review.source.estimate.id);
  expect(draft.version.status).toBe('draft');
  await expect(
    packets.review(
      org,
      actor,
      draft.estimate.id,
      draft.version.id,
      draft.version.lock_revision,
    ),
  ).rejects.toThrow('UNKNOWN');
  await changes.reconcile(org, actor, receipt.id);
  expect(
    (
      await packets.review(
        org,
        actor,
        draft.estimate.id,
        draft.version.id,
        draft.version.lock_revision,
      )
    ).receipt,
  ).toBe(receipt.id);
});
it('actual maintenance repair draft cannot enter the customer packet workflow', async () => {
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
    s.packets.review(
      s.org,
      s.actor,
      draft.estimate.id,
      draft.version.id,
      draft.version.lock_revision,
    ),
  ).rejects.toThrow();
});
it('post-hash membership revocation blocks the last synchronous packet commit', async () => {
  const s = await setup(),
    real = s.packets.archive.append.bind(s.packets.archive);
  vi.spyOn(s.packets.archive, 'append').mockImplementation(async (...args) => {
    vi.spyOn(s.repo.operations, 'syntheticMemberships').mockReturnValue([]);
    return real(...args);
  });
  await expect(
    s.packets.prepare(s.review, s.draft.version.payload, true),
  ).rejects.toThrow('UNKNOWN');
  vi.restoreAllMocks();
  const row = s.packets.history(s.org, s.actor, s.estimate)[0];
  expect(s.packets.archive.read(row.id)).toBeNull();
});
it('different currency is held without conversion, and malformed/foreign source projections reject', async () => {
  const s = await setup(),
    binding = s.review.comparison.binding;
  const foreign = structuredClone(s.source);
  foreign.organization_id = 'other';
  expect(() => projectRevisionScope(foreign, binding, 'issued')).toThrow();
  const saved = await s.repo.estimates.save(s.org, s.draft, {
    ...s.draft.version.payload,
    currency: 'EUR',
  });
  await expect(
    s.packets.review(
      s.org,
      s.actor,
      s.estimate,
      saved.version.id,
      saved.version.lock_revision,
    ),
  ).rejects.toThrow('currency');
});
