import { afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const seed = 'performance424-controlled-input-v1';
const clock = '2026-11-13T12:00:00.000Z';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
let count = 0;
const stream = createHash('sha256');
const outputs: string[] = [];
afterEach(() => {
  try {
    const destination = process.env.PROPEL_INPUT_PROOF;
    if (!destination) throw Error('Explicit measurement proof output required');
    const evidence = {
      seed,
      clock,
      uuidCount: count,
      uuidStreamSha256: stream.digest('hex'),
      outputCaptures: outputs.length,
      outputIdsSha256: digest(JSON.stringify(outputs)),
    };
    writeFileSync(
      destination,
      JSON.stringify({
        ...evidence,
        inputSignature: digest(JSON.stringify(evidence)),
      }),
      { mode: 0o600 },
    );
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
});
try {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(clock));
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
    const id =
      `00000000-0000-4000-8000-${(++count).toString(16).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`;
    stream.update(id + '\n');
    return id;
  });
  const runtime = await import('../src/lib/workflows/operating-center-runtime');
  const prepare = runtime.prepareOperatingSources;
  vi.spyOn(runtime, 'prepareOperatingSources').mockImplementation(
    async (...args) => {
      const result = await prepare(...args);
      const ids = result.entries.map((e) => ({
        target: e.target,
        intake: e.intake_request_id,
        offer: e.offer_id,
        receipt: e.receipt_id,
        plan: e.plan_id,
        visit: e.visit_id,
        scheduled: e.scheduled_visit_id,
        report: e.report_id,
        published: e.published_version,
        issuedSha256: digest(JSON.stringify(e.issued)),
      }));
      outputs.push(
        digest(
          JSON.stringify({ company: result.company.id, gate: args[1], ids }),
        ),
      );
      return result;
    },
  );
} catch (error) {
  vi.useRealTimers();
  vi.restoreAllMocks();
  throw error;
}
