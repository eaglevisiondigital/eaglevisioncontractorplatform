/** Independently marked disposable fixture witness; no service or genuine Auth. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  executeWorkOrderRevision,
  reconcileWorkOrderRevision,
  type WorkOrderRevisionCommand,
} from '../../server/field-lab/work-order-revisions.ts';
const [crewPath, path, commandPath, witnessPath, mode] = process.argv.slice(2);
const command = JSON.parse(
  readFileSync(commandPath, 'utf8'),
) as WorkOrderRevisionCommand;
function pause(event: string) {
  process.send?.({ event });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
}
let checked = false;
function witness() {
  return JSON.parse(readFileSync(witnessPath, 'utf8'));
}
function run() {
  let result: unknown;
  try {
    const authority = {
      enabled: true,
      test_only: true,
      clock: () => witness().now,
      checkWorkOrder(c: WorkOrderRevisionCommand) {
        const w = witness();
        if (
          w.revoked ||
          w.scope !== c.issued_scope_sha256 ||
          !w.payloads.includes(JSON.stringify(c))
        )
          throw Error('Exact fixture work-order witness changed');
        return w.scope;
      },
      checkSource(envelope: unknown) {
        const w = witness();
        if (
          w.revoked ||
          !w.envelopes.some(
            (e: unknown) => JSON.stringify(e) === JSON.stringify(envelope),
          )
        )
          throw Error('Synthetic staff/source changed');
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
    };
    result =
      mode === 'read'
        ? reconcileWorkOrderRevision(crewPath, path, command, authority)
        : executeWorkOrderRevision(crewPath, path, command, authority);
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
