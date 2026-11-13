import { expect, it, vi } from 'vitest';
import { Session } from 'node:inspector/promises';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { sampleCompanies } from '../src/domain/platform';
import * as operating from '../src/lib/workflows/operating-center-runtime';
import {
  readServiceRequestActions,
  inspectServiceRequestActions,
  readServiceRequestEvidence,
  inspectServiceRequestEvidence,
  inspectServiceRequestReport,
} from '../src/lib/workflows/service-request-actions';

it('measures one exact original property-report scenario without removing its guards', async () => {
  const scenario = process.env.PROPEL_DIAG_CASE;
  if (scenario !== 'c25-concurrent' && scenario !== 'c28-sibling')
    throw Error('Exact diagnostic scenario required');
  const destination = process.env.PROPEL_DIAG_OUTPUT;
  if (!destination)
    throw Error('Explicit disposable diagnostic output required');
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  });
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.setSamplingInterval', { interval: 1000 });
  const counters = { externalCaptures: 0, externalChecks: 0 };
  const capture = operating.captureOperatingSources;
  vi.spyOn(operating, 'captureOperatingSources').mockImplementation(
    (...args) => {
      counters.externalCaptures++;
      const original = capture(...args);
      return {
        ...original,
        check: () => {
          counters.externalChecks++;
          original.check();
        },
      };
    },
  );
  const phases: {
    name: string;
    wallMs: number;
    externalCaptures: number;
    externalChecks: number;
  }[] = [];
  async function phase<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    const before = { ...counters },
      start = performance.now();
    try {
      return await fn();
    } finally {
      phases.push({
        name,
        wallMs: performance.now() - start,
        externalCaptures: counters.externalCaptures - before.externalCaptures,
        externalChecks: counters.externalChecks - before.externalChecks,
      });
    }
  }
  await session.post('Profiler.start');
  try {
    const gate = { enabled: true, confirmed: true },
      brand = scenario === 'c25-concurrent' ? 2 : 0,
      sources = await phase('prepareOperatingSources', () =>
        operating.prepareOperatingSources(sampleCompanies[brand], gate),
      ),
      entry = sources.entries[0],
      job = entry.target.job_id!,
      view = await phase('readServiceRequestActions', () =>
        readServiceRequestActions(sources, job, gate),
      ),
      expected = await phase('inspectServiceRequestActions', () =>
        inspectServiceRequestActions(view),
      ),
      evidence = await phase('readServiceRequestEvidence', () =>
        readServiceRequestEvidence(view, sources, job, expected, gate),
      );
    if (scenario === 'c25-concurrent') {
      const ref = (
          await phase('inspectServiceRequestEvidence', () =>
            inspectServiceRequestEvidence(view, evidence, expected),
          )
        ).reports[0].reference,
        writer = vi.spyOn(sources.operations, 'assignIntake'),
        results = await phase('twoConcurrentReportReads', () =>
          Promise.all([
            inspectServiceRequestReport(view, evidence, expected, ref),
            inspectServiceRequestReport(view, evidence, expected, ref),
          ]),
        );
      expect(results[0]).toEqual(results[1]);
      expect(writer).not.toHaveBeenCalled();
      expect(
        await phase('finalRequestInspection', () =>
          inspectServiceRequestActions(view),
        ),
      ).toHaveProperty('can_edit', true);
    } else {
      const other = sources.entries.find(
        (e) =>
          e.target.job_id !== job &&
          e.target.location_id === entry.target.location_id,
      )!;
      expect(other).toBeDefined();
      const sibling = await phase('siblingReadServiceRequestActions', () =>
          readServiceRequestActions(sources, other.target.job_id!, gate),
        ),
        siblingExpected = await phase(
          'siblingInspectServiceRequestActions',
          () => inspectServiceRequestActions(sibling),
        ),
        siblingEvidence = await phase('siblingReadServiceRequestEvidence', () =>
          readServiceRequestEvidence(
            sibling,
            sources,
            other.target.job_id!,
            siblingExpected,
            gate,
          ),
        ),
        foreign = (
          await phase('siblingInspectServiceRequestEvidence', () =>
            inspectServiceRequestEvidence(
              sibling,
              siblingEvidence,
              siblingExpected,
            ),
          )
        ).reports[0].reference;
      await phase('denySiblingReportSubstitution', () =>
        expect(
          inspectServiceRequestReport(view, evidence, expected, foreign),
        ).rejects.toThrow('Exact retained published report reference'),
      );
      const original = (
        await phase('inspectOriginalReportReference', () =>
          inspectServiceRequestEvidence(view, evidence, expected),
        )
      ).reports[0].reference;
      const result = await phase('inspectOriginalReport', () =>
        inspectServiceRequestReport(view, evidence, expected, original),
      );
      expect(result.report.reference).toEqual(original);
    }
    const { profile } = await session.post('Profiler.stop');
    writeFileSync(
      destination,
      JSON.stringify({ scenario, phases, counters, profile }),
      { mode: 0o600 },
    );
  } finally {
    session.disconnect();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
