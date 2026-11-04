// Offline build/test checks only: no business writer, database or restore port.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  cycle26Parent,
  cycle25SourcePorts,
  inspectCycle26Sources,
} from './cycle25-source-lineage.mjs';
import { checkCycle24Preservation } from './check-cycle24.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function validateCycle26Matrix(m, supplied = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied };
  if (
    m?.schema !== 'propel-cycle26-owner-writer-responsibility-v1' ||
    m.source_commit !== cycle26Parent ||
    m.scope !== 'STATIC_DESIGN_REVIEW_ONLY' ||
    m.status !== 'NO_GO_OPERATIONAL_IMPLEMENTATION' ||
    m.release !== 'NOT_READY_NOT_AUTHORIZED'
  )
    throw Error('Exact static NO_GO matrix required');
  for (const k of [
    'implementation_authorized',
    'schema_authorized',
    'restore_adapter_authorized',
    'operational_ready',
  ])
    if (m[k] !== false) throw Error('No operational authority granted');
  const priorPath = 'docs/program/CYCLE25_OPERATIONAL_READINESS.json',
    priorBytes = ports.git(cycle26Parent, priorPath),
    prior = JSON.parse(priorBytes);
  if (
    m.prior_register?.path !== priorPath ||
    m.prior_register.sha256 !== sha(priorBytes)
  )
    throw Error('Exact original readiness binding required');
  const original = JSON.parse(
    ports.git(cycle26Parent, 'docs/program/CYCLE24_RESTART_READINESS.json'),
  );
  if (
    !same(
      m.original_requirements?.map((x) => x.original_record),
      original.requirements,
    )
  )
    throw Error('All original nineteen dependencies required');
  if (
    !same(
      m.operational_families?.map((x) => x.id),
      prior.operations.map((x) => x.id),
    )
  )
    throw Error('Exactly original eight families required');
  for (const [i, row] of m.operational_families.entries()) {
    const op = prior.operations[i];
    if (
      row.kind !== op.operation_kind ||
      !same(row.source_paths, op.source_paths) ||
      !same(row.requirements, op.requirements) ||
      row.operational_accountable_owner !== 'UNASSIGNED_OR_UNVERIFIED' ||
      row.operational_acceptance !== 'NOT_RUN' ||
      row.authority_granted !== false
    )
      throw Error('Original source ownership, gaps and authority retained');
    if (
      op.operation_kind === 'READ_ONLY' &&
      [
        'admission_owner',
        'transaction_owner',
        'receipt_owner',
        'ack_owner',
      ].some((k) => row.responsibilities.includes(k))
    )
      throw Error('No invented mutation ownership for read-only family');
  }
  for (const k of [
    'complete',
    'all_writers_participate',
    'bypasses_excluded',
    'target_catalog_verified',
  ])
    if (m.writer_inventory?.[k] !== false)
      throw Error('Universal writer coverage is unverified');
  if (
    m.backup_restore?.physical_rehearsal !== 'NOT_RUN' ||
    m.backup_restore?.historical_evidence_is_canonical_restore !== false ||
    m.backup_restore?.RPO !== 'UNMEASURED' ||
    m.backup_restore?.RTO !== 'UNMEASURED' ||
    m.smallest_future_slice?.status !== 'PROPOSED_NOT_AUTHORIZED' ||
    m.smallest_future_slice?.new_schema_or_restore_adapter !== false
  )
    throw Error('No physical acceptance or restoration authority');
  // Admission list comes from the immutable matrix commit, before any source IO.
  const reviewed = JSON.parse(
    ports.git(
      'e4ba39fbf2e00a8992316ca73adb9e6922730d9c',
      'docs/program/CYCLE26_OWNER_WRITER_MATRIX.json',
    ),
  );
  const fixed = reviewed.source_evidence;
  if (
    !same(
      m.source_evidence?.map((x) => x.path),
      fixed.map((x) => x.path),
    )
  )
    throw Error('Finite exact source allowlist required before IO');
  if (!same(m, reviewed))
    throw Error(
      'Exact independently reviewed matrix, Auth/MFA/fence and future gates required',
    );
  for (const ref of m.source_evidence) {
    const bytes = ports.git(cycle26Parent, ref.path);
    if (
      ref.commit !== cycle26Parent ||
      ref.sha256 !== sha(bytes) ||
      ref.bytes !== bytes.length
    )
      throw Error('Source hash is not exact original source');
  }
  return {
    families: 8,
    requirements: 19,
    source_refs: fixed.length,
    operational_ready: false,
    restore_adapter: false,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const matrix = validateCycle26Matrix(
    JSON.parse(readFileSync('docs/program/CYCLE26_OWNER_WRITER_MATRIX.json')),
  );
  const source = inspectCycle26Sources({
    requireCombined: process.argv.includes('--combined'),
  });
  checkCycle24Preservation();
  console.log(
    JSON.stringify(
      { matrix, source, release: 'NOT_READY_NOT_AUTHORIZED' },
      null,
      2,
    ),
  );
}
