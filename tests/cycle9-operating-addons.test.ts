import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  operatingAddonKinds,
  prepareOperatingAddon,
  reconcileOperatingAddon,
} from '../src/lib/workflows/operating-addons';
import { OperatingAddons } from '../src/components/workflows/OperatingAddons';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const gate = () => ({ enabled: true, confirmed: true });
afterEach(() => vi.restoreAllMocks());
for (const company of sampleCompanies)
  for (const kind of operatingAddonKinds)
    it(`${company.slug}/${kind} reuses exact source without execution`, async () => {
      const g = gate(),
        s = await prepareOperatingSources(company, g),
        e = s.entries[0],
        before = JSON.stringify(
          s.estimates.readSyntheticPrototypeSources(e.target),
        );
      const view = await prepareOperatingAddon(
        s,
        {
          job_id: e.target.job_id!,
          kind,
          note: '2 each Exterior review; urgent maintenance estimate, stop contact',
          review_on: '2026-12-28',
          manual_priority: 'normal' as const,
        },
        g,
      );
      expect(view.snapshot.target).toEqual(e.target);
      expect(view.snapshot.intake_request_id).toBe(e.intake_request_id);
      expect(
        Object.values(view.snapshot.authority).every((v) => v === false),
      ).toBe(true);
      expect(await reconcileOperatingAddon(view)).toBe(
        'CURRENT_LOCAL_REVIEW_ONLY',
      );
      expect(Object.isFrozen(view.snapshot)).toBe(true);
      expect(view.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(
        JSON.stringify(s.estimates.readSyntheticPrototypeSources(e.target)),
      ).toBe(before);
      const release = e.release.read('staff');
      expect(release.release_contracts).toHaveLength(0);
      expect(release.release_invoices).toHaveLength(0);
      expect(release.release_ledger_entries).toHaveLength(0);
      if (kind === 'offline')
        expect(JSON.stringify(view.snapshot.evidence)).toContain(
          'EXACT_READ_ONLY_RECONCILIATION_ONLY',
        );
      if (kind === 'storm_network') {
        expect(JSON.stringify(view.snapshot.evidence)).toContain(
          'INTERNAL_COORDINATION_REVIEW',
        );
        expect(JSON.stringify(view.snapshot.evidence)).toContain(
          '"reported_on":null',
        );
      }
      if (kind === 'receptionist') {
        expect(JSON.stringify(view.snapshot.evidence)).toContain(
          'STAFF_REVIEW_OPT_OUT_NO_SEND',
        );
        expect(JSON.stringify(view.snapshot.evidence)).not.toContain(
          'recorded_by',
        );
      }
    });
it('default off blocks before canonical reads', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g);
  const spy = vi.spyOn(s.estimates, 'readSyntheticPrototypeSources');
  await expect(
    prepareOperatingAddon(s, {
      job_id: s.entries[0].target.job_id!,
      kind: 'offline',
      note: 'Test',
      review_on: '2026-12-28',
      manual_priority: 'normal' as const,
    }),
  ).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('does not accept an unadmitted or foreign job', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g);
  await expect(
    prepareOperatingAddon(
      s,
      {
        job_id: crypto.randomUUID(),
        kind: 'voice',
        note: 'Test',
        review_on: '2026-12-28',
        manual_priority: 'normal' as const,
      },
      g,
    ),
  ).rejects.toThrow();
});
it('refuses duplicates after successful preparation', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    input = {
      job_id: s.entries[0].target.job_id!,
      kind: 'procurement' as const,
      note: 'Manual review',
      review_on: '2026-12-28',
      manual_priority: 'normal' as const,
    };
  await prepareOperatingAddon(s, input, g);
  await expect(prepareOperatingAddon({ ...s }, input, g)).rejects.toThrow(
    /read-only/,
  );
});
it('lost acknowledgment stays UNKNOWN with no retry', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    input = {
      job_id: s.entries[0].target.job_id!,
      kind: 'procurement' as const,
      note: 'Manual review',
      review_on: '2026-12-28',
      manual_priority: 'normal' as const,
    };
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(Error('lost'));
  await expect(prepareOperatingAddon(s, input, g)).rejects.toThrow();
  vi.restoreAllMocks();
  await expect(prepareOperatingAddon(s, input, g)).rejects.toThrow(/read-only/);
});
it('rejects source withdrawal at the last awaited hash', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    input = {
      job_id: s.entries[0].target.job_id!,
      kind: 'offline' as const,
      note: 'Review only',
      review_on: '2026-12-28',
      manual_priority: 'normal' as const,
    };
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const out = await digest(...args);
    g.confirmed = false;
    return out;
  });
  await expect(prepareOperatingAddon(s, input, g)).rejects.toThrow();
});
it('original input mutation across awaits rejects', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    input = {
      job_id: s.entries[0].target.job_id!,
      kind: 'procurement' as const,
      note: 'Review only',
      review_on: '2026-12-28',
      manual_priority: 'normal' as const,
    };
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const out = await digest(...args);
    input.job_id = s.entries[1].target.job_id!;
    return out;
  });
  await expect(prepareOperatingAddon(s, input, g)).rejects.toThrow();
});
it('stale exact review reconciles UNKNOWN and cannot be imported', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    view = await prepareOperatingAddon(
      s,
      {
        job_id: s.entries[0].target.job_id!,
        kind: 'procurement',
        note: 'Review only',
        review_on: '2026-12-28',
        manual_priority: 'normal' as const,
      },
      g,
    );
  expect(await reconcileOperatingAddon(structuredClone(view))).toBe('UNKNOWN');
  s.entries[1].report_id = crypto.randomUUID();
  expect(await reconcileOperatingAddon(view)).toBe('UNKNOWN');
});
it('input getters never execute', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    getter = vi.fn();
  const input = {
    job_id: s.entries[0].target.job_id!,
    kind: 'procurement' as const,
    note: 'Review only',
    review_on: '2026-12-28',
    manual_priority: 'normal' as const,
  };
  Object.defineProperty(input, 'note', { get: getter });
  await expect(prepareOperatingAddon(s, input, g)).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('default component has no enabled preparation control', async () => {
  const s = await prepareOperatingSources(sampleCompanies[0], gate());
  const html = renderToStaticMarkup(
    createElement(OperatingAddons, { sources: s }),
  );
  expect(html).toContain('disabled');
  expect(html).not.toContain('<pre>');
});
