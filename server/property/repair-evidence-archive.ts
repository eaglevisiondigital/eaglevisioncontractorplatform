import { maintenanceKey } from '../../src/domain/property/maintenance';
import {
  evaluateRepairReadiness,
  recordRepairReadiness,
  type RepairReadinessContext,
  type RepairReadinessReview,
} from '../../src/domain/property/repair-readiness';

/** Private, bounded evidence representation; not an import API or a connected command. */
export interface RepairEvidenceArchive {
  schema_version: 1;
  context: RepairReadinessContext;
  history: RepairReadinessReview[];
}
function validate(archive: RepairEvidenceArchive) {
  if (
    !archive ||
    Object.keys(archive).sort().join(',') !==
      'context,history,schema_version' ||
    archive.schema_version !== 1 ||
    !Array.isArray(archive.history) ||
    archive.history.length > 1000
  )
    throw Error('Invalid private repair evidence archive.');
  evaluateRepairReadiness(archive.context, []);
  const prior: RepairReadinessReview[] = [];
  for (const review of archive.history) {
    const context: RepairReadinessContext = JSON.parse(review.request.snapshot);
    if (
      maintenanceKey(context.origin.source) !==
        maintenanceKey(archive.context.origin.source) ||
      JSON.stringify(context.origin) !==
        JSON.stringify(archive.context.origin) ||
      review.sequence !== prior.length + 1 ||
      !review.actor ||
      !Number.isFinite(Date.parse(review.recorded_at))
    )
      throw Error('Repair archive provenance/sequence changed.');
    const replay = recordRepairReadiness(
      context,
      prior,
      review.actor,
      review.request,
    );
    if (
      replay.duplicate ||
      replay.review.sequence !== review.sequence ||
      replay.review.policy_id !== review.policy_id ||
      replay.review.policy_version !== review.policy_version ||
      JSON.stringify(replay.review.calculation) !==
        JSON.stringify(review.calculation)
    )
      throw Error(
        'Repair archive receipt does not match the existing review engine.',
      );
    prior.push(structuredClone(review));
  }
}
export function encodeRepairEvidence(
  context: RepairReadinessContext,
  history: RepairReadinessReview[],
) {
  const archive: RepairEvidenceArchive = structuredClone({
    schema_version: 1,
    context,
    history,
  });
  validate(archive);
  const text = JSON.stringify(archive);
  if (Buffer.byteLength(text, 'utf8') > 1048576)
    throw Error('Repair evidence archive exceeds review limit.');
  return text;
}
/** The current context MUST come from a freshly authorized source/estimate/policy/catalog read.
 * Restore history, then use the canonical engine again; never trust a stored 6/6 count.
 * This validates evidence fidelity, not historical Auth, measurement truth or issue authority.
 */
export function restoreRepairEvidence(
  text: string,
  current: RepairReadinessContext,
) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 1048576)
    throw Error('Invalid repair evidence size.');
  const archive: RepairEvidenceArchive = JSON.parse(text);
  validate(archive);
  if (
    maintenanceKey(current.origin.source) !==
      maintenanceKey(archive.context.origin.source) ||
    JSON.stringify(current.origin) !== JSON.stringify(archive.context.origin)
  )
    throw Error('Exact retained repair target/source required; no fallback.');
  return {
    historical: evaluateRepairReadiness(archive.context, archive.history),
    current: evaluateRepairReadiness(current, archive.history),
  };
}
