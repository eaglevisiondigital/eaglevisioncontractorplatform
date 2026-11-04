// Offline source verification only. No runtime writer or recovery authority.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  cycle25SourcePorts,
  inspectCycle27Sources,
} from './cycle25-source-lineage.mjs';
import { checkCycle24Preservation } from './check-cycle24.mjs';
import { validateCycle26Matrix } from './check-cycle26.mjs';
export function checkCycle27Readiness(ports = cycle25SourcePorts) {
  const path = 'docs/program/CYCLE27_MINIMUM_READINESS.md';
  if (
    !Buffer.from(ports.read(path)).equals(
      Buffer.from(ports.git('28aaa835c63802a8ad571804028b6700e20e3924', path)),
    )
  )
    throw Error('Exact independently reviewed readiness document required');
  return {
    scope: 'STATIC_REVIEW_ONLY',
    implementation_authorized: false,
    restore_adapter: false,
    operational_ready: false,
    physical_recovery: 'NOT_RUN',
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(
    JSON.stringify(
      {
        sources: inspectCycle27Sources({
          requireCombined: process.argv.includes('--combined'),
        }),
        matrix: validateCycle26Matrix(
          JSON.parse(
            readFileSync('docs/program/CYCLE26_OWNER_WRITER_MATRIX.json'),
          ),
        ),
        readiness: checkCycle27Readiness(),
        preserved: checkCycle24Preservation(),
        release: 'NOT_READY_NOT_AUTHORIZED',
      },
      null,
      2,
    ),
  );
}
