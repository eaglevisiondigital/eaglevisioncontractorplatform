/** Offline plan only. Deliberately has no execution mode, database or credential reader. */
import { sandboxReadinessPlan } from '../server/providers/activation-plan.ts';
if (process.argv.length > 2) {
  console.error(
    'Offline plan takes no arguments. No activation/execution mode exists.',
  );
  process.exitCode = 1;
} else console.log(JSON.stringify(sandboxReadinessPlan(), null, 2));
