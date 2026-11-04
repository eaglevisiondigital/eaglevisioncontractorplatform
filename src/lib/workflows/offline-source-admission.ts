import { prototypeFields } from '../program/prototype-source';
import { journeyEnabled, type JourneyAdmission } from './journey-runtime';
import {
  reconcileOperationsExperiment,
  type OperationsExperimentReview,
} from '../operations-experiments';
import {
  assertAdvancedRequirementsCurrentNow,
  type AdvancedRequirements,
} from './advanced-handoffs';
import {
  syncSourceReference,
  reviewSyncAdmission,
  assertSyncAdmissionCurrentNow,
} from './sync-admission-review';
import { parseOfflineSourceProtocol } from './offline-source-protocol';
export { parseOfflineSourceProtocol } from './offline-source-protocol';
export type { OfflineSourceProtocol } from './offline-source-protocol';

function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(p).length !== 2 ||
    p.enabled !== true ||
    p.confirmed !== true ||
    typeof window === 'undefined' ||
    !journeyEnabled({
      development: import.meta.env.DEV,
      flag: 'true',
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    })
  )
    throw Error(
      'Offline source admission is OFF without explicit local review',
    );
}
/** Bind a finite external proposal to TWO original retained current readers.
 * Returns the original comparison; no wrapper, registry, receipt, writer or sync. */
export async function reviewOfflineSourceAdmission(
  requirements: AdvancedRequirements,
  experiment: OperationsExperimentReview,
  input: unknown,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate); // Before external/source getters.
  const check = () => {
    admit(gate);
    assertAdvancedRequirementsCurrentNow(requirements);
    if (requirements.kind !== 'offline')
      throw Error('Exact original offline requirements required');
    const expected = syncSourceReference(requirements),
      capture = experiment.offline_capture.source;
    if (
      expected.organization_id !== capture.organization_id ||
      expected.customer_id !== capture.customer_id ||
      expected.location_id !== capture.property_id ||
      expected.job_id !== capture.job_id ||
      expected.estimate_id !== capture.estimate_id ||
      expected.issued_version_id !== capture.issued_version_id
    )
      throw Error('Original offline capture differs from exact source target');
    return { expected, capture };
  };
  admit(gate);
  assertAdvancedRequirementsCurrentNow(requirements);
  if (requirements.kind !== 'offline')
    throw Error('Exact original offline requirements required');
  syncSourceReference(requirements);
  if (
    (await reconcileOperationsExperiment(experiment)).state !==
    'CURRENT_REVIEW_ONLY'
  )
    throw Error('Original offline capture source UNKNOWN or stale');
  const { expected, capture } = check(),
    parsed = parseOfflineSourceProtocol(input),
    signature = JSON.stringify(parsed);
  const stable = () => {
    const live = check();
    if (
      JSON.stringify(parseOfflineSourceProtocol(input)) !== signature ||
      JSON.stringify(parsed.source) !== JSON.stringify(live.expected) ||
      parsed.visit.visit_id !== live.capture.visit_id ||
      parsed.visit.visit_revision !== live.capture.visit_revision ||
      parsed.visit.plan_id !== live.capture.plan_id ||
      parsed.visit.plan_revision !== live.capture.plan_revision
    )
      throw Error(
        'Exact original offline visit, plan and source revisions required',
      );
  };
  // Comparisons are field-based; caller object property order confers no meaning.
  if (
    Object.entries(expected).some(
      ([key, value]) => parsed.source[key as keyof typeof expected] !== value,
    ) ||
    parsed.visit.visit_id !== capture.visit_id ||
    parsed.visit.visit_revision !== capture.visit_revision ||
    parsed.visit.plan_id !== capture.plan_id ||
    parsed.visit.plan_revision !== capture.plan_revision
  )
    throw Error(
      'Exact original offline visit, plan and source revisions required',
    );
  stable();
  const original = await reviewSyncAdmission(requirements, {
    external_reference: parsed.external_reference,
    source: parsed.source,
  });
  stable();
  if (
    (await reconcileOperationsExperiment(experiment)).state !==
    'CURRENT_REVIEW_ONLY'
  )
    throw Error('Original offline capture source UNKNOWN after comparison');
  stable();
  assertSyncAdmissionCurrentNow(original);
  return original;
}
