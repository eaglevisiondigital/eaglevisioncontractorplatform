// Exclusive local filesystem rehearsal only; never connects to a provider.
import { acceptanceJournal } from '../../server/property/acceptance-journal.ts';
const journal = acceptanceJournal(process.argv[2], 'a'.repeat(64));
process.on('message', () => {
  try {
    journal.reserveRun();
    journal.begin(process.argv[3], 'fixture', 'b'.repeat(64));
    process.send?.('UNKNOWN');
  } catch {
    process.send?.('BLOCKED');
  } finally {
    process.disconnect?.();
  }
});
process.send?.('READY');
