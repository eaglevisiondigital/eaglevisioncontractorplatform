import { afterEach, expect, it, vi } from 'vitest';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { CustomerChangeWorkspace } from '../src/lib/customer-change-workspace';
import { CustomerRevisionPackets } from '../src/lib/customer-revision-packets';
import { CustomerIssuanceReadiness } from '../src/lib/customer-issuance-readiness';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash, ReleasePreview } from '../src/domain/release/preview';
import { revisionDeliveryContent } from '../src/domain/estimating/issuance-readiness';
import {
  brandedCommunicationHtml,
  escapeCommunicationText,
} from '../src/domain/communications/content';

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
  return {
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
async function next(
  s: Awaited<ReturnType<typeof setup>>,
  payload = s.draft.version.payload,
) {
  const draft = await s.repo.estimates.save(s.org, s.draft, payload);
  const pr = await s.packets.review(
    s.org,
    s.actor,
    s.estimate,
    draft.version.id,
    draft.version.lock_revision,
  );
  const packet = await s.packets.prepare(pr, draft.version.payload, true);
  const review = await s.readiness.open(
    s.org,
    s.actor,
    s.estimate,
    draft.version.id,
    draft.version.lock_revision,
    packet.snapshot.id,
  );
  return { draft, packet, review };
}
it.each([0, 1, 2])(
  'actual3A->3B->3C->3D company %i retains exact identity, safe scope and no issue/send/financial effects',
  async (index) => {
    const s = await setup(index),
      before = structuredClone(s.model.read()),
      versions = await s.repo.estimates.history(s.org, s.estimate),
      jobs = await s.repo.estimates.jobs(s.org);
    const command = vi.spyOn(ReleasePreview.prototype, 'command'),
      issue = vi.spyOn(s.repo.estimates, 'issue'),
      fetch = vi.fn(() => {
        throw Error('Network forbidden');
      });
    vi.stubGlobal('fetch', fetch);
    const result = await s.readiness.record(
        s.review,
        () => s.draft.version.payload,
        true,
      ),
      v = result.snapshot.review;
    expect(result.current).toBe(true);
    expect(result.snapshot.verdict).toBe('BLOCKED');
    expect(result.snapshot.authority).toContain('no approval');
    expect(v.packet).toEqual({
      id: s.packet.snapshot.id,
      sha256: s.packet.integrity.sha256,
    });
    expect(v.scope_sha256).toBe(
      await documentHash(s.packet.snapshot.comparison.revised_scope),
    );
    expect(v.comparison.request.id).toBe(s.receipt.id);
    expect(v.comparison.original.id).toBe(s.original.version.id);
    expect(v.comparison.revised).toEqual({
      id: s.draft.version.id,
      version: 3,
      saved_revision: 2,
    });
    expect(v.comparison.binding).toMatchObject({
      organization_id: s.org,
      customer_id: s.receipt.customer_id,
      estimate_id: s.estimate,
      location_id: s.original.version.payload.location_id,
    });
    expect(
      v.conditions.filter((c) => c.status === 'PASS').map((c) => c.id),
    ).toEqual(['source', 'saved', 'staff', 'tax', 'expiration', 'terms']);
    expect(v.conditions.find((c) => c.id === 'issuance')?.status).toBe(
      'BLOCKED',
    );
    for (const id of ['sender', 'recipient', 'consent', 'operational'])
      expect(v.conditions.find((c) => c.id === id)?.status).toBe('UNVERIFIED');
    expect(v.delivery).toMatchObject({
      from: null,
      to: null,
      reply_to: null,
      secure_link: null,
      delivery: 'disabled',
      providerRequest: null,
    });
    expect(v.delivery.subject).toContain(s.company.name);
    expect(v.delivery.text).toContain('Version 3');
    expect(v.delivery.text).toContain(s.receipt.id);
    expect(v.delivery.html).toContain('&lt;img');
    expect(v.delivery.html).toContain('&lt;script&gt;');
    expect(v.delivery.html).not.toMatch(/<script|<img|<a\b|<form\b/i);
    expect(JSON.stringify(result)).not.toMatch(
      /STAFF_ONLY|unit_cost|gross_profit|profit_margin|internal_notes|contact_email|customerEmail/,
    );
    expect(command).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(await s.repo.estimates.history(s.org, s.estimate)).toEqual(versions);
    expect(await s.repo.estimates.jobs(s.org)).toEqual(jobs);
    expect(s.model.read().reviews).toEqual(before.reviews);
    expect(
      (await s.repo.estimates.get(s.org, s.estimate, s.original.version.id))
        .version,
    ).toEqual(s.original.version);
  },
);
it('requires actual immutable reviewed context, explicit confirmation and current saved editor', async () => {
  const s = await setup();
  await expect(
    s.readiness.record(s.review, () => s.draft.version.payload, false),
  ).rejects.toThrow('explicitly');
  await expect(
    s.readiness.record({ ...s.review }, () => s.draft.version.payload, true),
  ).rejects.toThrow('exact');
  await expect(
    s.readiness.record(
      s.review,
      () => ({ ...s.draft.version.payload, terms: 'dirty' }),
      true,
    ),
  ).rejects.toThrow('clean saved');
  s.review.view.comparison.request.note = 'forged';
  await expect(
    s.readiness.record(s.review, () => s.draft.version.payload, true),
  ).rejects.toThrow('exact');
  expect(s.readiness.history(s.org, s.actor, s.estimate)).toEqual([]);
});
it('rejects dirty edits introduced during async recording, leaving UNKNOWN without committing', async () => {
  const s = await setup(),
    real = s.readiness.records.append.bind(s.readiness.records);
  let editor = s.draft.version.payload;
  vi.spyOn(s.readiness.records, 'append').mockImplementation(
    async (...args) => {
      editor = { ...editor, customer_notes: 'late dirty edit' };
      return real(...args);
    },
  );
  await expect(
    s.readiness.record(s.review, () => editor, true),
  ).rejects.toThrow('UNKNOWN');
  const h = s.readiness.history(s.org, s.actor, s.estimate)[0];
  expect(s.readiness.records.read(h.id)).toBeNull();
  expect(
    (await s.readiness.reconcile(s.org, s.actor, s.estimate, h.id)).status,
  ).toBe('undetermined');
});
it('stale draft/packet rejects while historical readiness stays frozen and new saved packet needs confirmation', async () => {
  const s = await setup(),
    result = await s.readiness.record(
      s.review,
      () => s.draft.version.payload,
      true,
    ),
    old = structuredClone(result);
  const n = await next(s, { ...s.draft.version.payload, terms: 'Later terms' });
  await expect(
    s.readiness.open(
      s.org,
      s.actor,
      s.estimate,
      n.draft.version.id,
      n.draft.version.lock_revision,
      s.packet.snapshot.id,
    ),
  ).rejects.toThrow('non-stale');
  await expect(
    s.readiness.record(s.review, () => n.draft.version.payload, true),
  ).rejects.toThrow();
  const read = await s.readiness.read(
    s.org,
    s.actor,
    s.estimate,
    result.snapshot.id,
  );
  expect(read.current).toBe(false);
  expect(read.snapshot).toEqual(old.snapshot);
  expect(read.sha256).toBe(old.sha256);
  read.snapshot.review.comparison.request.note = 'tamper copy';
  expect(
    (await s.readiness.read(s.org, s.actor, s.estimate, result.snapshot.id))
      .snapshot,
  ).toEqual(old.snapshot);
  await expect(
    s.readiness.record(n.review, () => n.draft.version.payload, false),
  ).rejects.toThrow();
  const newer = await s.readiness.record(
    n.review,
    () => n.draft.version.payload,
    true,
  );
  expect(newer.snapshot.id).not.toBe(result.snapshot.id);
});
it('current tax mismatch is truthfully BLOCKED; policy changes after opening invalidate the review', async () => {
  const s = await setup(),
    tax = s.repo.estimates.customerRevisionTaxState(
      s.org,
      s.actor,
      s.estimate,
    )!;
  vi.spyOn(s.repo.estimates, 'customerRevisionTaxState').mockReturnValue({
    ...tax,
    rate_bps: tax.rate_bps + 100,
    policy_version: tax.policy_version + 1,
  });
  await expect(
    s.readiness.record(s.review, () => s.draft.version.payload, true),
  ).rejects.toThrow('tax policy');
  const review = await s.readiness.open(
    s.org,
    s.actor,
    s.estimate,
    s.draft.version.id,
    s.draft.version.lock_revision,
    s.packet.snapshot.id,
  );
  expect(review.view.conditions.find((c) => c.id === 'tax')?.status).toBe(
    'BLOCKED',
  );
  expect(
    (await s.readiness.record(review, () => s.draft.version.payload, true))
      .snapshot.verdict,
  ).toBe('BLOCKED');
});
it('new saved calculation/tax selection requires a new packet and retains original canonical amounts', async () => {
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
  const p = structuredClone(s.draft.version.payload);
  p.tax_policy_id = (await s.repo.estimates.taxes(s.org)).at(-1)!.id;
  p.lines[0].taxable = true;
  p.lines[0].unit_price_minor = 22222;
  p.discount = { kind: 'percent', value: 500 };
  const n = await next(s, p),
    r = await s.readiness.record(n.review, () => n.draft.version.payload, true);
  expect(r.snapshot.review.comparison.revised_scope.totals).toEqual({
    subtotal_minor: n.draft.version.calculation.subtotal_minor,
    discount_minor: n.draft.version.calculation.discount_minor,
    tax_minor: n.draft.version.calculation.tax_minor,
    total_minor: n.draft.version.calculation.total_minor,
  });
  expect(r.snapshot.review.comparison.original_scope).toEqual(
    s.packet.snapshot.comparison.original_scope,
  );
  expect(r.snapshot.review.scope_sha256).not.toBe(s.review.view.scope_sha256);
});
it('expired proposals and absent terms are BLOCKED without invented compliance evidence', async () => {
  const s = await setup(),
    n = await next(s, {
      ...s.draft.version.payload,
      expires_on: '2020-01-01',
      terms: '',
    });
  expect(
    n.review.view.conditions
      .filter((c) => ['expiration', 'terms'].includes(c.id))
      .every((c) => c.status === 'BLOCKED'),
  ).toBe(true);
  expect(
    (await s.readiness.record(n.review, () => n.draft.version.payload, true))
      .snapshot.verdict,
  ).toBe('BLOCKED');
});
it('concurrent eligible reviewers and duplicates produce one review-only result', async () => {
  const s = await setup(),
    other = await s.readiness.open(
      s.org,
      s.org + '-estimator',
      s.estimate,
      s.draft.version.id,
      s.draft.version.lock_revision,
      s.packet.snapshot.id,
    );
  const out = await Promise.allSettled([
    s.readiness.record(s.review, () => s.draft.version.payload, true),
    s.readiness.record(other, () => s.draft.version.payload, true),
  ]);
  expect(out.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(s.readiness.history(s.org, s.actor, s.estimate)).toHaveLength(1);
  await expect(
    s.readiness.record(s.review, () => s.draft.version.payload, true),
  ).rejects.toThrow('already');
});
it.each(['before', 'after'])(
  'lost %s-commit result stays UNKNOWN; exact reconciliation never replays or bypasses with a new revision',
  async (when) => {
    const s = await setup(),
      real = s.readiness.records.append.bind(s.readiness.records);
    const append = vi
      .spyOn(s.readiness.records, 'append')
      .mockImplementation(async (...args) => {
        if (when === 'after') await real(...args);
        throw Error('lost');
      });
    await expect(
      s.readiness.record(s.review, () => s.draft.version.payload, true),
    ).rejects.toThrow('UNKNOWN');
    const h = s.readiness.history(s.org, s.actor, s.estimate)[0];
    expect(h.state).toBe('unknown');
    await expect(
      s.readiness.read(s.org, s.actor, s.estimate, h.id),
    ).rejects.toThrow('UNKNOWN');
    const n = await next(s, {
      ...s.draft.version.payload,
      terms: 'Later terms',
    });
    await expect(
      s.readiness.record(n.review, () => n.draft.version.payload, true),
    ).rejects.toThrow('Unresolved');
    const r = await s.readiness.reconcile(s.org, s.actor, s.estimate, h.id);
    expect(r.status).toBe(when === 'after' ? 'reviewed' : 'undetermined');
    if (r.status === 'reviewed') {
      expect(r.result.current).toBe(false);
      expect(r.result.snapshot.id).toBe(h.id);
    }
    expect(append).toHaveBeenCalledTimes(1);
  },
);
it('pending hold precedes async recording, denies reconciliation and a second review', async () => {
  const s = await setup(),
    real = s.readiness.records.append.bind(s.readiness.records);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  vi.spyOn(s.readiness.records, 'append').mockImplementation(
    async (...args) => {
      await gate;
      return real(...args);
    },
  );
  const pending = s.readiness.record(
      s.review,
      () => s.draft.version.payload,
      true,
    ),
    h = s.readiness.history(s.org, s.actor, s.estimate)[0];
  expect(h.state).toBe('pending');
  await expect(
    s.readiness.reconcile(s.org, s.actor, s.estimate, h.id),
  ).rejects.toThrow();
  await expect(
    s.readiness.record(s.review, () => s.draft.version.payload, true),
  ).rejects.toThrow('already');
  release();
  await pending;
});
it.each(['inactive', 'field', 'foreign'])(
  'rejects %s staff and guessed foreign review IDs',
  async (kind) => {
    const s = await setup(),
      r = await s.readiness.record(
        s.review,
        () => s.draft.version.payload,
        true,
      );
    const actor =
      kind === 'inactive'
        ? s.actor
        : kind === 'field'
          ? s.org + '-field'
          : 'sample-roofing-owner';
    if (kind === 'inactive')
      vi.spyOn(s.repo.operations, 'syntheticMemberships').mockReturnValue([]);
    await expect(
      s.readiness.open(
        s.org,
        actor,
        s.estimate,
        s.draft.version.id,
        s.draft.version.lock_revision,
        s.packet.snapshot.id,
      ),
    ).rejects.toThrow();
    await expect(
      s.readiness.read(s.org, actor, s.estimate, r.snapshot.id),
    ).rejects.toThrow();
    await expect(
      s.readiness.record(
        { ...s.review, actor },
        () => s.draft.version.payload,
        true,
      ),
    ).rejects.toThrow();
  },
);
it('revocation at the final post-hash checkpoint denies commit and keeps UNKNOWN', async () => {
  const s = await setup(),
    real = s.readiness.records.append.bind(s.readiness.records);
  vi.spyOn(s.readiness.records, 'append').mockImplementation(
    async (...args) => {
      vi.spyOn(s.repo.operations, 'syntheticMemberships').mockReturnValue([]);
      return real(...args);
    },
  );
  await expect(
    s.readiness.record(s.review, () => s.draft.version.payload, true),
  ).rejects.toThrow('UNKNOWN');
  vi.restoreAllMocks();
  const h = s.readiness.history(s.org, s.actor, s.estimate)[0];
  expect(s.readiness.records.read(h.id)).toBeNull();
});
it('wrong packet/property/source and tampered calculations cannot enter readiness', async () => {
  const s = await setup(),
    foreign = await setup(1);
  await expect(
    s.readiness.open(
      s.org,
      s.actor,
      s.estimate,
      s.draft.version.id,
      s.draft.version.lock_revision,
      foreign.packet.snapshot.id,
    ),
  ).rejects.toThrow();
  await expect(
    s.readiness.open(
      s.org,
      s.actor,
      s.estimate,
      s.original.version.id,
      s.original.version.lock_revision,
      s.packet.snapshot.id,
    ),
  ).rejects.toThrow();
  const real = s.repo.estimates.customerRevisionState.bind(s.repo.estimates);
  vi.spyOn(s.repo.estimates, 'customerRevisionState').mockImplementation(
    (...args) => {
      const e = real(...args);
      e.draft.version.calculation.total_minor++;
      return e;
    },
  );
  await expect(
    s.readiness.open(
      s.org,
      s.actor,
      s.estimate,
      s.draft.version.id,
      s.draft.version.lock_revision,
      s.packet.snapshot.id,
    ),
  ).rejects.toThrow();
});
it('packet integrity mismatch and malformed acknowledgment never produce a reviewed result', async () => {
  const s = await setup(),
    real = s.readiness.records.append.bind(s.readiness.records);
  vi.spyOn(s.readiness.records, 'append').mockImplementation(
    async (...args) => ({ ...(await real(...args)), id: crypto.randomUUID() }),
  );
  await expect(
    s.readiness.record(s.review, () => s.draft.version.payload, true),
  ).rejects.toThrow('UNKNOWN');
  const h = s.readiness.history(s.org, s.actor, s.estimate)[0];
  const read = s.readiness.records.read.bind(s.readiness.records);
  vi.spyOn(s.readiness.records, 'read').mockImplementation((id) => {
    const r = read(id);
    if (r) r.sha256 = '0'.repeat(64);
    return r;
  });
  await expect(
    s.readiness.reconcile(s.org, s.actor, s.estimate, h.id),
  ).rejects.toThrow('integrity');
});
it('a tax change during recording or UTC-day rollover cannot pass stale evidence', async () => {
  const s = await setup(),
    real = s.readiness.records.append.bind(s.readiness.records);
  vi.spyOn(s.readiness.records, 'append').mockImplementation(
    async (...args) => {
      vi.spyOn(s.repo.estimates, 'customerRevisionTaxState').mockReturnValue(
        null,
      );
      return real(...args);
    },
  );
  await expect(
    s.readiness.record(s.review, () => s.draft.version.payload, true),
  ).rejects.toThrow('UNKNOWN');
  vi.restoreAllMocks();
  const t = await setup();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 86400000);
  await expect(
    t.readiness.record(t.review, () => t.draft.version.payload, true),
  ).rejects.toThrow('changed');
});
it('repair-origin drafts remain excluded and issue restrictions remain unchanged after a review', async () => {
  const s = await setup();
  await s.readiness.record(s.review, () => s.draft.version.payload, true);
  await expect(s.repo.estimates.issue(s.org, s.draft)).rejects.toThrow(
    'separate reviewed handoff',
  );
  const { prepareMaintenanceExamples } =
    await import('../src/lib/maintenance-examples');
  await prepareMaintenanceExamples(s.repo, s.org, s.actor);
  const row = s.repo.maintenance(s.org, s.actor).items[0],
    review = await s.repo.reviewRepair(s.company, s.actor, row.source, 0),
    draft = await s.repo.findingEstimate(
      s.company,
      s.actor,
      row.source,
      review.id,
    );
  await expect(
    s.readiness.open(
      s.org,
      s.actor,
      draft.estimate.id,
      draft.version.id,
      draft.version.lock_revision,
      s.packet.snapshot.id,
    ),
  ).rejects.toThrow();
  await expect(s.repo.estimates.issue(s.org, draft)).rejects.toThrow(
    'issuance is disabled',
  );
});
it('pure branded formatting preserves the established template and escapes every dynamic field', async () => {
  expect(
    brandedCommunicationHtml('A < B', 'Company & Co', '#123456', '<p>Safe</p>'),
  ).toBe(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A &lt; B</title></head><body><main style="border-top:4px solid #123456"><h1>Company &amp; Co</h1><p>Safe</p></main></body></html>',
  );
  expect(escapeCommunicationText(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  expect(() =>
    brandedCommunicationHtml('x', 'x', 'url(https://evil.test)', ''),
  ).toThrow();
  const s = await setup();
  const c = structuredClone(s.review.view.comparison);
  c.contractor.name = '<img src=x>\r\nBcc: private';
  c.customer_name = '<svg/onload=x>';
  c.property_label = '<iframe>';
  c.revised_scope.terms = '<script>bad()</script>';
  const content = revisionDeliveryContent(c);
  expect(content.subject).not.toMatch(/[\r\n]/);
  expect(content.html).not.toMatch(/<img|<svg|<iframe|<script/i);
  expect(content.html).toContain('lang="en" dir="ltr"');
  expect(content.to).toBeNull();
});

it.each(['customer', 'property', 'tenant'])(
  'rejects changed %s source evidence instead of rebinding a packet',
  async (kind) => {
    const s = await setup(),
      real = s.repo.estimates.customerRevisionState.bind(s.repo.estimates);
    vi.spyOn(s.repo.estimates, 'customerRevisionState').mockImplementation(
      (...args) => {
        const e = real(...args);
        if (kind === 'customer')
          e.draft.version.payload.customer_id = crypto.randomUUID();
        if (kind === 'property')
          e.draft.version.payload.location_id = crypto.randomUUID();
        if (kind === 'tenant')
          e.draft.version.organization_id = 'sample-roofing';
        return e;
      },
    );
    await expect(
      s.readiness.open(
        s.org,
        s.actor,
        s.estimate,
        s.draft.version.id,
        s.draft.version.lock_revision,
        s.packet.snapshot.id,
      ),
    ).rejects.toThrow();
    await expect(
      s.readiness.record(s.review, () => s.draft.version.payload, true),
    ).rejects.toThrow();
  },
);
it('actual UNKNOWN3C packet cannot advance3D until separate exact packet reconciliation', async () => {
  const s = await setup(),
    draft = await s.repo.estimates.save(s.org, s.draft, {
      ...s.draft.version.payload,
      terms: 'Later packet scope',
    });
  const pr = await s.packets.review(
      s.org,
      s.actor,
      s.estimate,
      draft.version.id,
      draft.version.lock_revision,
    ),
    real = s.packets.archive.append.bind(s.packets.archive);
  vi.spyOn(s.packets.archive, 'append').mockImplementation(async (...args) => {
    await real(...args);
    throw Error('lost3C');
  });
  await expect(
    s.packets.prepare(pr, draft.version.payload, true),
  ).rejects.toThrow('UNKNOWN');
  const h = s.packets
    .history(s.org, s.actor, s.estimate)
    .find((h) => h.revision === draft.version.lock_revision)!;
  await expect(
    s.readiness.open(
      s.org,
      s.actor,
      s.estimate,
      draft.version.id,
      draft.version.lock_revision,
      h.id,
    ),
  ).rejects.toThrow('uncertain');
  expect(s.readiness.history(s.org, s.actor, s.estimate)).toEqual([]);
  await s.packets.reconcile(s.org, s.actor, s.estimate, h.id);
  const review = await s.readiness.open(
    s.org,
    s.actor,
    s.estimate,
    draft.version.id,
    draft.version.lock_revision,
    h.id,
  );
  expect(review.view.packet.id).toBe(h.id);
});
