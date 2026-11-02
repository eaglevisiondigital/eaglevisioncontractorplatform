/** Explicit controlled synthetic test witness, not Auth, trusted time or a service. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  executeScheduleRevision,
  type ScheduleRevisionCommand,
} from '../../server/field-lab/proposal-revisions.ts';
const [crewPath, path, commandPath, witnessPath, mode] = process.argv.slice(2);
const command = JSON.parse(
  readFileSync(commandPath, 'utf8'),
) as ScheduleRevisionCommand;
let checked = false;
function pause(event: string) {
  process.send?.({ event });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
}
function run() {
  process.send?.({ event: 'STARTING' });
  let result: unknown;
  try {
    result = executeScheduleRevision(crewPath, path, command, {
      enabled: true,
      test_only: true,
      clock: () => {
        const witness = JSON.parse(readFileSync(witnessPath, 'utf8'));
        return witness.now;
      },
      checkSource(envelope) {
        const witness = JSON.parse(readFileSync(witnessPath, 'utf8'));
        if (
          witness.revoked ||
          !witness.envelopes.some(
            (e: unknown) => JSON.stringify(e) === JSON.stringify(envelope),
          )
        )
          throw Error('Synthetic source/staff witness changed');
        if (!checked) {
          checked = true;
          process.send?.({ event: 'SOURCE_CHECKED' });
        }
        return createHash('sha256')
          .update(JSON.stringify(envelope))
          .digest('hex');
      },
      afterClaim:
        mode === 'interrupt-claim' ? () => pause('CLAIM_COMMITTED') : undefined,
      afterCommit:
        mode === 'interrupt-commit'
          ? () => pause('RECEIPT_COMMITTED')
          : undefined,
    });
  } catch {
    result = { status: 'UNKNOWN', receipt: null };
  }
  process.send?.({ event: 'RESULT', result });
  process.disconnect?.();
}
process.on('message', (message) => {
  if (message === 'GO') run();
});
process.send?.({ event: 'READY' });
