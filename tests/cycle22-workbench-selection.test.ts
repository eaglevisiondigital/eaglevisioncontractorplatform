import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { resolveSavedWorkbenchSelection } from '../src/lib/workflows/saved-workbench-selection';
import type { OperatingJobSection } from '../src/lib/workflows/operating-navigation';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
for (const [brand, company] of sampleCompanies.entries()) {
  it(`brand ${brand} preserves exact authorized property job and finite existing review destinations`, async () => {
    const s = await prepareOperatingSources(company, {
      enabled: true,
      confirmed: true,
    });
    const before = s.entries.map((e) =>
      s.estimates.readSyntheticPrototypeSources(e.target),
    );
    for (const e of s.entries) {
      expect(resolveSavedWorkbenchSelection(s, e.target.job_id!)).toEqual({
        job_id: e.target.job_id,
        tab: undefined,
      });
      for (const [section, tab] of Object.entries({
        field: 'field',
        finance: 'finance',
        completion: 'customer',
        maintenance: 'maintenance',
        daily: 'priorities',
      }))
        expect(
          resolveSavedWorkbenchSelection(
            s,
            e.target.job_id!,
            section as OperatingJobSection,
          ),
        ).toEqual({ job_id: e.target.job_id, tab });
    }
    expect(
      s.entries.map((e) => s.estimates.readSyntheticPrototypeSources(e.target)),
    ).toEqual(before);
  });
  it(`brand ${brand} rejects foreign job invalid destination and withdrawn host gate`, async () => {
    const s = await prepareOperatingSources(company, {
      enabled: true,
      confirmed: true,
    });
    const job = s.entries[0].target.job_id!;
    for (const id of ['', crypto.randomUUID(), 'x'.repeat(201)])
      expect(() => resolveSavedWorkbenchSelection(s, id)).toThrow();
    for (const section of ['sales', 'advanced', '__proto__', 'constructor'])
      expect(() =>
        resolveSavedWorkbenchSelection(s, job, section as OperatingJobSection),
      ).toThrow();
    s.gate.enabled = false;
    expect(() =>
      resolveSavedWorkbenchSelection(s, job, 'completion'),
    ).toThrow();
  });
  it(`brand ${brand} never substitutes source sets across companies`, async () => {
    const s = await prepareOperatingSources(company, {
      enabled: true,
      confirmed: true,
    });
    const foreign = await prepareOperatingSources(
      sampleCompanies[(brand + 1) % 3],
      { enabled: true, confirmed: true },
    );
    expect(() =>
      resolveSavedWorkbenchSelection(
        s,
        foreign.entries[0].target.job_id!,
        'completion',
      ),
    ).toThrow();
    expect(() =>
      resolveSavedWorkbenchSelection(
        { ...s, operations: foreign.operations },
        s.entries[0].target.job_id!,
      ),
    ).toThrow();
  });
}
