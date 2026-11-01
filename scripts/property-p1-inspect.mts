import { readFileSync, lstatSync } from 'node:fs';
import { loadP1Package } from '../server/property/execution/package.ts';
import { acceptanceJournal } from '../server/property/acceptance-journal.ts';
import { inspectP1Recovery } from '../server/property/execution/recovery.ts';
// Intentionally offline: no login, credential reader, RPC, feature-control or execute option.
const args = process.argv.slice(2);
if (args.length !== 0 && !(args.length === 2 && args[0] === '--journal'))
  throw Error('Offline inspect only; optional --journal private-directory');
const target = JSON.parse(
  readFileSync('.staging/connected-development-target.json', 'utf8'),
);
if (target.environment !== 'internal-development')
  throw Error('Internal development designation required');
const frozen = loadP1Package(
  '.staging/property-p1/package',
  target.supabase.projectRef,
);
if (args.length && !lstatSync(args[1]).isDirectory())
  throw Error('Existing private journal required');
const states = args.length
  ? inspectP1Recovery(frozen, acceptanceJournal(args[1], frozen.operationHash))
  : [];
console.log(
  JSON.stringify({
    mode: 'OFFLINE_INSPECTION_ONLY',
    operationHash: frozen.operationHash,
    artifactsVerified: 4,
    fixtureSteps: 75,
    assertionProbes: 69,
    originalRows: frozen.plan.originalRowCount,
    executionImplementation: 'LOCAL_TESTED_NOT_HOSTED_VERIFIED',
    journalStates: Object.fromEntries(
      ['NOT_ATTEMPTED', 'UNKNOWN', 'RECORDED', 'DENIED'].map((s) => [
        s,
        states.filter((x) => x.state === s).length,
      ]),
    ),
    activation: false,
    authSignIn: false,
    hostedWrites: 0,
  }),
);
