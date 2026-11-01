import { readFileSync } from 'node:fs';
import {
  readConnectedPreflight,
  type ReadPreflightTarget,
} from '../server/staging/preflight.ts';
if (!process.env.EV_ACCEPTANCE_READ_TARGET)
  throw new Error(
    'Supply an ignored read-target JSON path; no default hosted target.',
  );
try {
  const target = JSON.parse(
    readFileSync(process.env.EV_ACCEPTANCE_READ_TARGET, 'utf8'),
  ) as ReadPreflightTarget;
  const report = await readConnectedPreflight(target);
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
} catch {
  console.error(
    'Read-only preflight failed; inspect privately. No response body or credential logged.',
  );
  process.exitCode = 1;
}
