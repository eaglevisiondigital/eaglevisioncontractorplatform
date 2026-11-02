import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  advancedHandoffKinds,
  prepareAdvancedHandoff,
  type AdvancedHandoffInput,
} from '../src/lib/workflows/advanced-handoffs';
import {
  inspectSyncReviewHandoff,
  prepareSyncReviewHandoff,
  readSyncAdmissionSource,
  reviewSyncAdmission,
  selectSyncAdmissionJob,
  syncSourceReference,
  type SyncReferenceProposal,
} from '../src/lib/workflows/sync-admission-review';
afterEach(() => vi.restoreAllMocks());
async function fixture(i = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[i], gate);
  const input: AdvancedHandoffInput = {
    job_id: sources.entries[0].target.job_id!,
    kind: 'offline',
    note: 'Review this exact synthetic source; no execution authority.',
    review_on: '2026-12-28',
    manual_priority: 'normal',
    edition: 'property_services',
  };
  return { sources, gate, input };
}
const proposal = (
  requirements: Awaited<ReturnType<typeof readSyncAdmissionSource>>,
  label = 'external-review-001',
): SyncReferenceProposal => ({
  external_reference: label,
  source: syncSourceReference(requirements),
});
it.each([0, 1, 2])(
  'brand %s compares all seven actual existing modes and delegates immutable review-only handoffs without business effects',
  async (i) => {
    const { sources, gate, input } = await fixture(i),
      before = sources.property.read(sources.company.id),
      versions = await Promise.all(
        sources.entries.map((e) =>
          sources.estimates.get(sources.company.id, e.target.estimate_id),
        ),
      ),
      release = sources.entries.map((e) => e.release.read('staff'));
    const writers = [
      vi.spyOn(sources.estimates, 'create'),
      vi.spyOn(sources.estimates, 'revise'),
      vi.spyOn(sources.estimates, 'issue'),
      vi.spyOn(sources.estimates, 'approveJob'),
      vi.spyOn(sources.estimates, 'assignJob'),
      vi.spyOn(sources.property, 'saveVisit'),
      vi.spyOn(sources.property, 'publish'),
      ...sources.entries.map((e) => vi.spyOn(e.release, 'command')),
    ];
    for (const kind of advancedHandoffKinds) {
      const requirements = await readSyncAdmissionSource(
          sources,
          { ...input, kind },
          gate,
        ),
        reference = proposal(requirements),
        comparison = await reviewSyncAdmission(requirements, reference);
      expect(comparison).toMatchObject({
        kind,
        reference_status: 'EXACT_REFERENCE_REVIEW_ONLY',
        exact_reference: true,
        atomic_network_admission: 'NOT_IMPLEMENTED',
        operational_ready: false,
      });
      expect(comparison.differences).toHaveLength(8);
      expect(comparison.differences.every((d) => d.status === 'MATCH')).toBe(
        true,
      );
      expect(selectSyncAdmissionJob(comparison)).toBe(input.job_id);
      expect(
        Object.values(comparison.authority).every((v) => v === false),
      ).toBe(true);
      const packet = await prepareSyncReviewHandoff(comparison, {
        confirmed: true,
        reviewed_comparison_sha256: comparison.integrity.sha256,
      });
      expect(packet).toMatchObject({
        imported: false,
        synchronized: false,
        delivery: 'NOT_SENT',
        operational_ready: false,
      });
      expect(
        packet.existing_handoff.requirements.source.issued_version_id,
      ).toBe(requirements.source.issued_version_id);
      expect((await inspectSyncReviewHandoff(packet)).status).toBe(
        'CURRENT_REVIEW_ONLY',
      );
      expect(Object.isFrozen(packet.comparison.differences)).toBe(true);
      expect(JSON.stringify(packet)).not.toMatch(
        /PRIVATE|unit_cost_minor|supplier_cost|payroll|margin_bps|hourly_rate_minor|internal_notes|staff_type/,
      );
      if (kind === 'procurement')
        expect(packet.comparison.catalog_links.state).toBe(
          'MISSING_RECORDED_CATALOG_ASSOCIATION',
        );
      if (kind === 'accounting')
        expect(
          packet.existing_handoff.evidence.facts.some(
            (f) =>
              f.label === 'Overall invoice readiness' && f.value === 'NO_GO',
          ),
        ).toBe(true);
    }
    expect(sources.property.read(sources.company.id)).toEqual(before);
    expect(
      await Promise.all(
        sources.entries.map((e) =>
          sources.estimates.get(sources.company.id, e.target.estimate_id),
        ),
      ),
    ).toEqual(versions);
    expect(sources.entries.map((e) => e.release.read('staff'))).toEqual(
      release,
    );
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
  },
);
it('stays OFF before accessing source getters', async () => {
  let invoked = false;
  const sources = Object.defineProperty({}, 'company', {
    get() {
      invoked = true;
      throw Error('read');
    },
  }) as OperatingSources;
  await expect(
    readSyncAdmissionSource(sources, {} as AdvancedHandoffInput),
  ).rejects.toThrow(/OFF/);
  expect(invoked).toBe(false);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'estimate_id',
  'issued_version_id',
  'source_sha256',
  'saved_lock_revision',
] as const)(
  'quarantines conflicting proposed %s without substitution',
  async (field) => {
    const { sources, gate, input } = await fixture(),
      requirements = await readSyncAdmissionSource(sources, input, gate),
      reference = proposal(requirements);
    Object.assign(reference.source, {
      [field]: field === 'saved_lock_revision' ? 999 : 'foreign-reference',
    });
    const review = await reviewSyncAdmission(requirements, reference);
    expect(review.reference_status).toBe(
      'QUARANTINED_MISSING_OR_CONFLICTING_REFERENCE',
    );
    expect(review.differences.find((d) => d.field === field)?.status).toBe(
      'CONFLICT',
    );
    await expect(
      prepareSyncReviewHandoff(review, {
        confirmed: true,
        reviewed_comparison_sha256: review.integrity.sha256,
      }),
    ).rejects.toThrow(/matching/);
    expect(review.source.job_id).toBe(input.job_id);
  },
);
it.each(['organization_id', 'source_sha256', 'saved_lock_revision'] as const)(
  'retains explicit missing %s as quarantined UNKNOWN evidence',
  async (field) => {
    const { sources, gate, input } = await fixture(),
      requirements = await readSyncAdmissionSource(sources, input, gate),
      reference = proposal(requirements);
    reference.source[field] = null;
    const review = await reviewSyncAdmission(requirements, reference);
    expect(review.exact_reference).toBe(false);
    expect(review.differences.find((d) => d.field === field)?.status).toBe(
      'MISSING',
    );
  },
);
it('concurrent same-mode external labels cannot claim two different canonical jobs', async () => {
  const { sources, gate, input } = await fixture(),
    a = await readSyncAdmissionSource(sources, input, gate),
    b = await readSyncAdmissionSource(
      sources,
      { ...input, job_id: sources.entries[1].target.job_id! },
      gate,
    ),
    results = await Promise.all([
      reviewSyncAdmission(a, proposal(a)),
      reviewSyncAdmission(b, proposal(b)),
    ]);
  expect(results.filter((r) => r.exact_reference)).toHaveLength(1);
  expect(results[1].reference_status).toBe(
    'QUARANTINED_MULTI_TARGET_REFERENCE',
  );
});
it('a fresh label cannot bypass the existing canonical one-use handoff after a successful preparation', async () => {
  const { sources, gate, input } = await fixture(),
    requirements = await readSyncAdmissionSource(sources, input, gate),
    review = await reviewSyncAdmission(requirements, proposal(requirements));
  await prepareSyncReviewHandoff(review, {
    confirmed: true,
    reviewed_comparison_sha256: review.integrity.sha256,
  });
  const fresh = await reviewSyncAdmission(
    requirements,
    proposal(requirements, 'different-label'),
  );
  await expect(
    prepareSyncReviewHandoff(fresh, {
      confirmed: true,
      reviewed_comparison_sha256: fresh.integrity.sha256,
    }),
  ).rejects.toThrow(/no replay/);
});
it('does not reopen an already prepared C10 handoff through the new review adapter', async () => {
  const { sources, gate, input } = await fixture(),
    requirements = await readSyncAdmissionSource(sources, input, gate);
  await prepareAdvancedHandoff(requirements, {
    confirmed: true,
    reviewed_requirements_sha256: requirements.integrity.sha256,
  });
  const review = await reviewSyncAdmission(
    requirements,
    proposal(requirements),
  );
  await expect(
    prepareSyncReviewHandoff(review, {
      confirmed: true,
      reviewed_comparison_sha256: review.integrity.sha256,
    }),
  ).rejects.toThrow(/no replay/);
});
it('lost final handoff acknowledgement permanently holds new labels and replacement containers', async () => {
  const { sources, gate, input } = await fixture(),
    requirements = await readSyncAdmissionSource(sources, input, gate),
    review = await reviewSyncAdmission(requirements, proposal(requirements)),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'IMMUTABLE_SYNC_REVIEW_HANDOFF') {
      reached = true;
      throw Error('lost acknowledgment');
    }
    return digest(...args);
  });
  await expect(
    prepareSyncReviewHandoff(review, {
      confirmed: true,
      reviewed_comparison_sha256: review.integrity.sha256,
    }),
  ).rejects.toThrow();
  expect(reached).toBe(true);
  vi.restoreAllMocks();
  const newSource = await readSyncAdmissionSource(
      { ...sources },
      { ...input },
      gate,
    ),
    fresh = await reviewSyncAdmission(
      newSource,
      proposal(newSource, 'new-label'),
    );
  await expect(
    prepareSyncReviewHandoff(fresh, {
      confirmed: true,
      reviewed_comparison_sha256: fresh.integrity.sha256,
    }),
  ).rejects.toThrow(/no replay/);
});
it('duplicate concurrent staff confirmations result in one existing-engine handoff only', async () => {
  const { sources, gate, input } = await fixture(),
    requirements = await readSyncAdmissionSource(sources, input, gate),
    review = await reviewSyncAdmission(requirements, proposal(requirements)),
    confirmation = {
      confirmed: true,
      reviewed_comparison_sha256: review.integrity.sha256,
    },
    outcomes = await Promise.allSettled([
      prepareSyncReviewHandoff(review, confirmation),
      prepareSyncReviewHandoff(review, { ...confirmation }),
    ]);
  expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'version_id',
  'job_id',
] as const)(
  'denies actual foreign canonical %s before comparison',
  async (field) => {
    const { sources, gate, input } = await fixture();
    sources.entries[0].target[field] = 'foreign';
    await expect(
      readSyncAdmissionSource(sources, input, gate),
    ).rejects.toThrow();
  },
);
it('revoked staff cannot navigate, compare or prepare retained reference evidence', async () => {
  const { sources, gate, input } = await fixture(),
    requirements = await readSyncAdmissionSource(sources, input, gate),
    reference = proposal(requirements),
    review = await reviewSyncAdmission(requirements, reference);
  await sources.operations.configure(
    sources.company.id,
    'active',
    'starter',
    {},
    sources.company.id + '-backup',
  );
  await sources.operations.revokeOwner(
    sources.company.id,
    sources.entries[0].target.actor_id,
  );
  expect(() => selectSyncAdmissionJob(review)).toThrow();
  await expect(reviewSyncAdmission(requirements, reference)).rejects.toThrow();
  await expect(
    prepareSyncReviewHandoff(review, {
      confirmed: true,
      reviewed_comparison_sha256: review.integrity.sha256,
    }),
  ).rejects.toThrow();
});
it('stale canonical revisions never accept the old hash as current authority', async () => {
  const { sources, gate, input } = await fixture(),
    requirements = await readSyncAdmissionSource(sources, input, gate),
    reference = proposal(requirements);
  await sources.estimates.revise(sources.company.id, sources.entries[0].issued);
  await expect(reviewSyncAdmission(requirements, reference)).rejects.toThrow();
});
it('copied requirements, comparison and handoff are not retained source authority', async () => {
  const { sources, gate, input } = await fixture(),
    requirements = await readSyncAdmissionSource(sources, input, gate),
    reference = proposal(requirements);
  await expect(
    reviewSyncAdmission(JSON.parse(JSON.stringify(requirements)), reference),
  ).rejects.toThrow();
  const review = await reviewSyncAdmission(requirements, reference);
  expect(() =>
    selectSyncAdmissionJob(JSON.parse(JSON.stringify(review))),
  ).toThrow();
  const packet = await prepareSyncReviewHandoff(review, {
    confirmed: true,
    reviewed_comparison_sha256: review.integrity.sha256,
  });
  expect(
    (await inspectSyncReviewHandoff(JSON.parse(JSON.stringify(packet)))).status,
  ).toBe('UNKNOWN');
});
it.each(['source', 'label', 'gate', 'canonical'] as const)(
  'rechecks original %s after final difference hash',
  async (change) => {
    const { sources, gate, input } = await fixture(),
      requirements = await readSyncAdmissionSource(sources, input, gate),
      reference = proposal(requirements),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.mode === 'LOCAL_SYNC_REFERENCE_ADMISSION_REVIEW') {
        reached = true;
        if (change === 'source') reference.source.job_id = 'foreign';
        if (change === 'label') reference.external_reference = 'changed';
        if (change === 'gate') gate.confirmed = false;
        if (change === 'canonical')
          sources.entries[0].target.location_id = 'foreign';
      }
      return value;
    });
    await expect(
      reviewSyncAdmission(requirements, reference),
    ).rejects.toThrow();
    expect(reached).toBe(true);
  },
);
it('final preparation hash rechecks explicit confirmation and leaves permanent no-replay hold', async () => {
  const { sources, gate, input } = await fixture(),
    requirements = await readSyncAdmissionSource(sources, input, gate),
    reference = proposal(requirements),
    review = await reviewSyncAdmission(requirements, reference),
    confirmation = {
      confirmed: true,
      reviewed_comparison_sha256: review.integrity.sha256,
    },
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'IMMUTABLE_SYNC_REVIEW_HANDOFF') {
      reached = true;
      confirmation.confirmed = false;
    }
    return value;
  });
  await expect(
    prepareSyncReviewHandoff(review, confirmation),
  ).rejects.toThrow();
  expect(reached).toBe(true);
  confirmation.confirmed = true;
  await expect(prepareSyncReviewHandoff(review, confirmation)).rejects.toThrow(
    /no replay/,
  );
});
it('retained packet becomes terminal UNKNOWN after source changes while frozen evidence remains unchanged', async () => {
  const { sources, gate, input } = await fixture(),
    requirements = await readSyncAdmissionSource(sources, input, gate),
    reference = proposal(requirements),
    review = await reviewSyncAdmission(requirements, reference),
    packet = await prepareSyncReviewHandoff(review, {
      confirmed: true,
      reviewed_comparison_sha256: review.integrity.sha256,
    }),
    before = JSON.stringify(packet);
  reference.external_reference = 'changed';
  expect((await inspectSyncReviewHandoff(packet)).status).toBe('UNKNOWN');
  reference.external_reference = 'external-review-001';
  expect((await inspectSyncReviewHandoff(packet)).status).toBe('UNKNOWN');
  expect(JSON.stringify(packet)).toBe(before);
});
it('requires exact reviewed hash and confirmation before consuming preparation', async () => {
  const { sources, gate, input } = await fixture(),
    requirements = await readSyncAdmissionSource(sources, input, gate),
    review = await reviewSyncAdmission(requirements, proposal(requirements));
  await expect(
    prepareSyncReviewHandoff(review, {
      confirmed: false,
      reviewed_comparison_sha256: review.integrity.sha256,
    }),
  ).rejects.toThrow();
  await expect(
    prepareSyncReviewHandoff(review, {
      confirmed: true,
      reviewed_comparison_sha256: '0'.repeat(64),
    }),
  ).rejects.toThrow();
  expect(
    (
      await prepareSyncReviewHandoff(review, {
        confirmed: true,
        reviewed_comparison_sha256: review.integrity.sha256,
      })
    ).operational_ready,
  ).toBe(false);
});
it.each([
  '',
  'a'.repeat(81),
  'user@example.com',
  'https://provider.test/path',
  'has spaces',
])('rejects unsafe or unbounded external reference %s', async (label) => {
  const { sources, gate, input } = await fixture(),
    requirements = await readSyncAdmissionSource(sources, input, gate);
  await expect(
    reviewSyncAdmission(requirements, proposal(requirements, label)),
  ).rejects.toThrow();
});
it('rejects executable/accessor/extra proposed fields without invoking them', async () => {
  const { sources, gate, input } = await fixture(),
    requirements = await readSyncAdmissionSource(sources, input, gate),
    reference = proposal(requirements);
  let invoked = false;
  const evil = Object.defineProperty({ ...reference.source }, 'job_id', {
    enumerable: true,
    get() {
      invoked = true;
      return input.job_id;
    },
  });
  await expect(
    reviewSyncAdmission(requirements, { ...reference, source: evil }),
  ).rejects.toThrow();
  await expect(
    reviewSyncAdmission(requirements, {
      ...reference,
      toJSON() {
        invoked = true;
        return reference;
      },
    } as SyncReferenceProposal),
  ).rejects.toThrow();
  expect(invoked).toBe(false);
});
