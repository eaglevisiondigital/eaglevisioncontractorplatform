/** Marked synthetic authority witness and cooperating SQLite worker only. */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  evaluateAtomicBoundary,
  changeSyntheticConsent,
  type AtomicConsentCommand,
  type SyntheticConsentFacts,
} from '../../server/consent-lab/atomic-boundary.ts';
const [path, inputPath, witnessPath, mode, releasePath] = process.argv.slice(2);
const input = JSON.parse(readFileSync(inputPath, 'utf8')) as {
  command: AtomicConsentCommand;
  facts: SyntheticConsentFacts;
  expected_revision: number;
};
let checks = 0;
function run() {
  process.send?.({ event: 'STARTING' });
  const authority = {
    enabled: true,
    test_only: true,
    clock: () => input.command.expected_at,
    checkSource: (e: AtomicConsentCommand['envelope']) => {
      const witness = JSON.parse(readFileSync(witnessPath, 'utf8'));
      if (
        witness.revoked ||
        JSON.stringify(witness.envelope) !== JSON.stringify(e)
      )
        throw Error('Trusted synthetic source changed');
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
    atBoundary:
      mode === 'hold-boundary'
        ? () => {
            process.send?.({ event: 'AT_BOUNDARY' });
            const deadline = Date.now() + 5000;
            while (!existsSync(releasePath) && Date.now() < deadline)
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
            if (!existsSync(releasePath)) throw Error('Boundary not released');
          }
        : undefined,
  };
  const result =
    mode === 'withdraw'
      ? changeSyntheticConsent(
          path,
          input.command.envelope,
          input.expected_revision,
          input.facts,
          authority,
        )
      : evaluateAtomicBoundary(path, input.command, authority);
  process.send?.({ event: 'RESULT', result });
  process.disconnect?.();
}
process.on('message', (m) => {
  if (m === 'GO') run();
});
process.send?.({ event: 'READY' });
