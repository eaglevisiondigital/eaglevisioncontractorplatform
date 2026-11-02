import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { readPrototypeSource } from '../src/lib/program/prototype-source';
import {
  prepareCopilotReview,
  inspectCopilotReview,
} from '../src/lib/program/business-copilot';
import { prototypeFixture } from './program/prototype-fixture';
afterEach(() => vi.restoreAllMocks());
async function setup(job = false, company = sampleCompanies[0]) {
  const f = await prototypeFixture(company, job);
  const source = await readPrototypeSource(f.repo, f.target, f.gate);
  return { ...f, source, reviewGate: { enabled: true, confirmed: true } };
}
it.each(sampleCompanies)(
  '$name builds exact explainable queue without business writes or private egress',
  async (company) => {
    const f = await setup(true, company);
    const before = {
      jobs: await f.repo.jobs(company.id),
      history: await f.repo.history(company.id, f.target.estimate_id),
    };
    const p = await prepareCopilotReview(
      f.source,
      { review_on: '2026-11-02' },
      f.reviewGate,
    );
    expect(p.snapshot.target).toEqual(f.target);
    expect(p.snapshot.source_sha256).toBe(f.source.sha256);
    expect(p.snapshot.cards.some((c) => c.kind === 'job_cost_coverage')).toBe(
      true,
    );
    expect(
      p.snapshot.cards.every(
        (c) => c.evidence.length && c.observation && c.suggested_review,
      ),
    ).toBe(true);
    expect(p.snapshot.cards[0].priority).toBe('High');
    expect(p.snapshot.history_coverage).toBe('UNKNOWN');
    expect(p.snapshot.model).toBe('NONE');
    expect(Object.values(p.snapshot.authority)).not.toContain(true);
    expect(p.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(p.snapshot.cards[0])).toBe(true);
    for (const field of [
      'PRIVATE',
      'unit_cost',
      'internal_note',
      'rates',
      'phone',
      'email',
      'gross_profit',
      'cost_minor',
    ])
      expect(JSON.stringify(p)).not.toContain(field);
    await expect(inspectCopilotReview(p)).resolves.toEqual({
      status: 'CURRENT',
      replacement: null,
    });
    expect({
      jobs: await f.repo.jobs(company.id),
      history: await f.repo.history(company.id, f.target.estimate_id),
    }).toEqual(before);
  },
);
it('draft scope fabricates no job/deadline/AI/action', async () => {
  const f = await setup();
  const p = await prepareCopilotReview(
    f.source,
    { review_on: '2026-11-02' },
    f.reviewGate,
  );
  expect(p.snapshot.cards.map((c) => c.kind)).toEqual([
    'source_documentation',
    'estimate_scope',
  ]);
  expect(p.snapshot.job_lock_revision).toBeNull();
  expect(p.snapshot.date_meaning).toContain('no deadline');
});
it('default OFF/unconfirmed reject before consuming source', async () => {
  const f = await setup();
  await expect(
    prepareCopilotReview(f.source, { review_on: '2026-11-02' }),
  ).rejects.toThrow('enabled');
  await expect(
    prepareCopilotReview(
      f.source,
      { review_on: '2026-11-02' },
      { enabled: true },
    ),
  ).rejects.toThrow('confirmed');
  await expect(
    prepareCopilotReview(f.source, { review_on: '2026-11-02' }, f.reviewGate),
  ).resolves.toBeDefined();
});
it.each(['', '2026-02-30', '2026-13-01', '2026-1-2', '2026-11-02T00:00Z'])(
  'invalid review date %s',
  async (review_on) => {
    const f = await setup();
    await expect(
      prepareCopilotReview(f.source, { review_on }, f.reviewGate),
    ).rejects.toThrow('calendar');
  },
);
it('getter/extra input cannot execute/broaden fields', async () => {
  const f = await setup();
  const getter = vi.fn(() => '2026-11-02');
  await expect(
    prepareCopilotReview(
      f.source,
      {
        get review_on() {
          return getter();
        },
      },
      f.reviewGate,
    ),
  ).rejects.toThrow('primitive');
  await expect(
    prepareCopilotReview(
      f.source,
      { review_on: '2026-11-02', customer_id: 'foreign' } as {
        review_on: string;
      },
      f.reviewGate,
    ),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('cloned/foreign source cannot fabricate provenance', async () => {
  const f = await setup();
  await expect(
    prepareCopilotReview(
      structuredClone(f.source),
      { review_on: '2026-11-02' },
      f.reviewGate,
    ),
  ).rejects.toThrow('Unknown');
  await expect(
    readPrototypeSource(
      f.repo,
      { ...f.target, customer_id: 'foreign' },
      f.gate,
    ),
  ).rejects.toThrow();
});
it('duplicate/concurrent reviews cannot produce replacement', async () => {
  const f = await setup();
  const pending = prepareCopilotReview(
    f.source,
    { review_on: '2026-11-02' },
    f.reviewGate,
  );
  await expect(
    prepareCopilotReview(f.source, { review_on: '2026-11-02' }, f.reviewGate),
  ).rejects.toThrow('UNKNOWN');
  const p = await pending;
  await expect(
    prepareCopilotReview(f.source, { review_on: '2026-11-03' }, f.reviewGate),
  ).rejects.toThrow('read-only');
  await expect(inspectCopilotReview(structuredClone(p))).rejects.toThrow(
    'Unknown',
  );
});
it('saved revision invalidates retained immutable evidence', async () => {
  const f = await setup();
  const p = await prepareCopilotReview(
    f.source,
    { review_on: '2026-11-02' },
    f.reviewGate,
  );
  const old = JSON.stringify(p);
  await f.repo.save(f.company.id, f.bundle, {
    ...f.bundle.version.payload,
    terms: 'Changed',
  });
  await expect(inspectCopilotReview(p)).rejects.toThrow('Stale');
  expect(JSON.stringify(p)).toBe(old);
});
it('revoked staff/withdrawn confirmation deny retained review', async () => {
  const f = await setup();
  const p = await prepareCopilotReview(
    f.source,
    { review_on: '2026-11-02' },
    f.reviewGate,
  );
  f.reviewGate.confirmed = false;
  await expect(inspectCopilotReview(p)).rejects.toThrow('confirmed');
  f.reviewGate.confirmed = true;
  f.gate.confirmed = false;
  await expect(inspectCopilotReview(p)).rejects.toThrow('confirmed');
});
it('source edit during proposal hashing retains UNKNOWN/no retry', async () => {
  const f = await setup();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    if (++calls === 2)
      await f.repo.save(f.company.id, f.bundle, {
        ...f.bundle.version.payload,
        terms: 'Changed at hash',
      });
    return digest(...args);
  });
  await expect(
    prepareCopilotReview(f.source, { review_on: '2026-11-02' }, f.reviewGate),
  ).rejects.toThrow('Stale');
  await expect(
    prepareCopilotReview(f.source, { review_on: '2026-11-02' }, f.reviewGate),
  ).rejects.toThrow('UNKNOWN');
});
it('review confirmation withdrawal across hashing denies output', async () => {
  const f = await setup();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    f.reviewGate.confirmed = false;
    return digest(...args);
  });
  await expect(
    prepareCopilotReview(f.source, { review_on: '2026-11-02' }, f.reviewGate),
  ).rejects.toThrow('confirmed');
});

it('a real save after awaited source validation is denied by final synchronous consumer checkpoint', async () => {
  const f = await setup();
  const boundary = await import('../src/lib/program/prototype-source');
  const original = boundary.assertPrototypeSourceCurrent;
  let calls = 0;
  vi.spyOn(boundary, 'assertPrototypeSourceCurrent').mockImplementation(
    async (source) => {
      await original(source);
      if (++calls === 2)
        await f.repo.save(f.company.id, f.bundle, {
          ...f.bundle.version.payload,
          terms: 'Changed after awaited validator',
        });
    },
  );
  await expect(
    prepareCopilotReview(f.source, { review_on: '2026-11-02' }, f.reviewGate),
  ).rejects.toThrow('Stale');
});
