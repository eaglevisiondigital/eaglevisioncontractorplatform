import { describe, expect, it } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import {
  journeyEnabled,
  prepareLocalJourney,
} from '../src/lib/workflows/journey-runtime';
import { createPropertyPassportTimeline } from '../src/domain/property/passport-timeline';

describe('Cycle 6 exact existing-engine local journey', () => {
  it.each(sampleCompanies)(
    'preserves source relationships and no financial effects: $name',
    async (company) => {
      const j = await prepareLocalJourney(company, {
        enabled: true,
        confirmed: true,
      });
      expect(
        j.operations.syntheticIntakeRequest(
          company.id,
          j.target.customer_id,
          j.target.location_id,
          j.intake_request_id,
        ).service_location_id,
      ).toBe(j.target.location_id);
      const source = j.estimates.readSyntheticPrototypeSources(j.target);
      expect(source.job?.baseline.issued_version_id).toBe(j.target.version_id);
      const timeline = await createPropertyPassportTimeline(
        j.customerModel,
        j.target,
        { enabled: true },
      );
      expect(
        timeline.snapshot.events.some(
          (e) =>
            e.kind === 'inspection-documentation' &&
            e.reference.report_id === j.report_id,
        ),
      ).toBe(true);
      expect(
        timeline.snapshot.events.some(
          (e) =>
            e.kind === 'issued-job-scope' &&
            e.reference.job_id === j.target.job_id,
        ),
      ).toBe(true);
      const serialized = JSON.stringify(timeline);
      expect(serialized).not.toMatch(
        /PRIVATE|unit_cost_minor|internal_notes|cash_hour_minor/,
      );
      const release = j.release.read('staff');
      for (const key of [
        'release_contracts',
        'release_signatures',
        'release_invoices',
        'release_ledger_entries',
        'release_payment_events',
      ] as const)
        expect(release[key]).toHaveLength(0);
      expect(release.release_decisions[0].id).toBe(j.receipt_id);
      expect(timeline.snapshot.physical_completion).toBe('UNVERIFIED');
      const original = JSON.stringify(j.issued.version);
      await j.estimates.get(
        company.id,
        j.target.estimate_id,
        j.target.version_id,
      );
      expect(JSON.stringify(j.issued.version)).toBe(original);
      expect(() =>
        j.operations.syntheticIntakeRequest(
          sampleCompanies.find((c) => c.id !== company.id)!.id,
          j.target.customer_id,
          j.target.location_id,
          j.intake_request_id,
        ),
      ).toThrow();
      j.customerModel.logout();
      expect(() => j.customerModel.read()).toThrow();
    },
  );
  it('is default off, development/loopback only and requires explicit confirmation', async () => {
    expect(
      journeyEnabled({
        development: true,
        hostname: '127.0.0.1',
        protocol: 'http:',
      }),
    ).toBe(false);
    expect(
      journeyEnabled({
        development: false,
        flag: 'true',
        hostname: '127.0.0.1',
        protocol: 'http:',
      }),
    ).toBe(false);
    expect(
      journeyEnabled({
        development: true,
        flag: 'true',
        hostname: 'example.com',
        protocol: 'http:',
      }),
    ).toBe(false);
    expect(
      journeyEnabled({
        development: true,
        flag: 'true',
        hostname: '127.0.0.1',
        protocol: 'http:',
      }),
    ).toBe(true);
    await expect(
      prepareLocalJourney(sampleCompanies[0], {
        enabled: true,
        confirmed: false,
      }),
    ).rejects.toThrow();
  });
});
