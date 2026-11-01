import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { preparePropertyAcceptance } from '../server/property/acceptance-plan.ts';
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(
    JSON.stringify({
      status: 'PREPARED_NOT_AUTHORIZED',
      companies: 3,
      cases: 72,
      hostedExecutor: false,
      requires:
        'Private read-only verified binding file and explicit run key; no hosted activation',
    }),
  );
} else {
  if (args.length !== 2)
    throw Error(
      'Expected private binding file and run key; no execute option exists',
    );
  const text = readFileSync(args[0], 'utf8');
  if (Buffer.byteLength(text) > 65536) throw Error('Binding file too large');
  const plan = preparePropertyAcceptance(JSON.parse(text), args[1]);
  mkdirSync('.staging/property-p0', { recursive: true });
  writeFileSync(
    '.staging/property-p0/connected-plan.private.json',
    JSON.stringify(plan, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      status: plan.status,
      cases: plan.plannedCases,
      companies: plan.companies.length,
      hostedExecution: false,
      written: 'ignored private plan only',
    }),
  );
}
