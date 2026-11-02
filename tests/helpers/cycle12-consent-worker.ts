/** Explicit cooperating synthetic fixture worker, never an outbound worker. */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  executeConsentCancellation,
  type CancellationLabCommand,
} from '../../server/consent-lab/cancellation-review.ts';
import {
  changeSyntheticConsent,
  type SyntheticConsentFacts,
} from '../../server/consent-lab/atomic-boundary.ts';
const [legacyPath, path, inputPath, witnessPath, mode, releasePath] =
  process.argv.slice(2);
const input = JSON.parse(readFileSync(inputPath, 'utf8')) as {
  command: CancellationLabCommand;
  facts: SyntheticConsentFacts;
};
let checked = false;
function pause(event: string) {
  process.send?.({ event });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
}
function run() {
  process.send?.({ event: 'STARTING' });
  const authority = {
    enabled: true,
    test_only: true,
    clock: () => JSON.parse(readFileSync(witnessPath, 'utf8')).now as string,
    checkSource(envelope: CancellationLabCommand['original']['envelope']) {
      const witness = JSON.parse(readFileSync(witnessPath, 'utf8'));
      if (
        witness.revoked ||
        JSON.stringify(witness.envelope) !== JSON.stringify(envelope)
      )
        throw Error('Synthetic source/staff witness revoked');
      if (!checked) {
        checked = true;
        process.send?.({ event: 'SOURCE_CHECKED' });
      }
      return createHash('sha256')
        .update(JSON.stringify(witness.envelope))
        .digest('hex');
    },
    afterClaim:
      mode === 'interrupt-claim' ? () => pause('CLAIM_COMMITTED') : undefined,
    afterLegacyCommit:
      mode === 'interrupt-native' ? () => pause('NATIVE_COMMITTED') : undefined,
    afterCommit:
      mode === 'interrupt-commit'
        ? () => pause('RECEIPT_COMMITTED')
        : undefined,
    atBoundary:
      mode === 'hold-boundary'
        ? () => {
            process.send?.({ event: 'AT_BOUNDARY' });
            const deadline = Date.now() + 5000;
            while (!existsSync(releasePath) && Date.now() < deadline)
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
            if (!existsSync(releasePath))
              throw Error('Synthetic boundary not released');
          }
        : undefined,
  };
  let result: unknown;
  try {
    result =
      mode === 'old-suppress'
        ? changeSyntheticConsent(
            legacyPath,
            input.command.original.envelope,
            input.command.expected_fixture_revision,
            { ...input.facts, suppressed: true },
            authority,
          )
        : executeConsentCancellation(
            legacyPath,
            path,
            input.command,
            authority,
          );
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
