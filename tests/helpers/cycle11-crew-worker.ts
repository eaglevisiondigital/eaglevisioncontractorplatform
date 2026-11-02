/** Controlled synthetic child-process witness. Not an operational source adapter. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  executeCrewTransaction,
  type CrewLabCommand,
} from '../../server/field-lab/crew-transaction.ts';
const [path, commandPath, witnessPath, mode] = process.argv.slice(2);
const command = JSON.parse(readFileSync(commandPath, 'utf8')) as CrewLabCommand;
let checks = 0;
function run() {
  process.send?.({ event: 'STARTING' });
  const result = executeCrewTransaction(path, command, {
    enabled: true,
    test_only: true,
    checkSource(envelope) {
      const witness = JSON.parse(readFileSync(witnessPath, 'utf8'));
      if (
        witness.revoked ||
        JSON.stringify(witness.envelope) !== JSON.stringify(envelope)
      )
        throw Error('Trusted synthetic witness changed');
      if (++checks === 1) process.send?.({ event: 'SOURCE_CHECKED' });
      return createHash('sha256')
        .update(JSON.stringify(witness.envelope))
        .digest('hex');
    },
    afterClaim:
      mode === 'interrupt-claim'
        ? () => {
            process.send?.({ event: 'CLAIM_COMMITTED' });
            Atomics.wait(
              new Int32Array(new SharedArrayBuffer(4)),
              0,
              0,
              30_000,
            );
          }
        : undefined,
    afterCommit:
      mode === 'interrupt-commit'
        ? () => {
            process.send?.({ event: 'RECEIPT_COMMITTED' });
            Atomics.wait(
              new Int32Array(new SharedArrayBuffer(4)),
              0,
              0,
              30_000,
            );
          }
        : undefined,
  });
  process.send?.({ event: 'RESULT', result });
  process.disconnect?.();
}
process.on('message', (message) => {
  if (message === 'GO') run();
});
process.send?.({ event: 'READY' });
