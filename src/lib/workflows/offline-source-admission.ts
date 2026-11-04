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
  type SyncAdmissionReview,
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

/** Recheck an EXISTING original comparison against the exact native visit/plan.
 * This function is stateless: it cannot claim a reference, prepare a handoff,
 * replace an UNKNOWN comparison or restore/import/synchronize any business state.
 * Its answer is a point-in-time read, never a durable admission receipt. */
export async function reconcileOfflineSourceAdmission(
  comparison: SyncAdmissionReview,
  requirements: AdvancedRequirements,
  experiment: OperationsExperimentReview,
  input: unknown,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const unknown = {
    status: 'UNKNOWN' as const,
    replay: 'FORBIDDEN' as const,
    replacement: null,
    operational_ready: false as const,
    durable_receipt: false as const,
  };
  // Diagnostics identify only which original read evidence is unavailable.
  // They never classify an uncertain command as failed, authorize replay, or
  // create/clear any original owner's hold.
  let reason:
    | 'LOCAL_REVIEW_NOT_ADMITTED'
    | 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE'
    | 'EXTERNAL_PROTOCOL_INVALID'
    | 'ORIGINAL_CAPTURE_CURRENTNESS_UNVERIFIED'
    | 'ORIGINAL_CAPTURE_SOURCE_CHANGED'
    | 'ORIGINAL_CAPTURE_PROPOSAL_CHANGED'
    | 'EXACT_BINDING_OR_LIVE_PROTOCOL_UNVERIFIED' = 'LOCAL_REVIEW_NOT_ADMITTED';
  const captureUnavailable = (
    result: Awaited<ReturnType<typeof reconcileOperationsExperiment>>,
  ) => ({
    ...unknown,
    reason:
      result.state === 'STALE' && result.reason === 'SOURCE_CHANGED'
        ? ('ORIGINAL_CAPTURE_SOURCE_CHANGED' as const)
        : result.state === 'STALE' && result.reason === 'HUMAN_PROPOSAL_CHANGED'
          ? ('ORIGINAL_CAPTURE_PROPOSAL_CHANGED' as const)
          : ('ORIGINAL_CAPTURE_CURRENTNESS_UNVERIFIED' as const),
  });
  try {
    admit(gate); // No external getters or original handles before admission.
    reason = 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE';
    assertSyncAdmissionCurrentNow(comparison);
    assertAdvancedRequirementsCurrentNow(requirements);
    reason = 'EXTERNAL_PROTOCOL_INVALID';
    const parsed = parseOfflineSourceProtocol(input),
      signature = JSON.stringify(parsed);
    const check = () => {
      reason = 'LOCAL_REVIEW_NOT_ADMITTED';
      admit(gate);
      reason = 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE';
      // The original owners keep any prior UNKNOWN state; no claim is replaced.
      assertSyncAdmissionCurrentNow(comparison);
      assertAdvancedRequirementsCurrentNow(requirements);
      reason = 'EXACT_BINDING_OR_LIVE_PROTOCOL_UNVERIFIED';
      const expected = syncSourceReference(requirements),
        capture = experiment.offline_capture.source;
      if (
        requirements.kind !== 'offline' ||
        comparison.kind !== 'offline' ||
        !comparison.exact_reference ||
        comparison.reference_status !== 'EXACT_REFERENCE_REVIEW_ONLY' ||
        comparison.requirements_sha256 !== requirements.integrity.sha256 ||
        comparison.external_reference !== parsed.external_reference ||
        JSON.stringify(parseOfflineSourceProtocol(input)) !== signature ||
        Object.entries(expected).some(
          ([key, value]) =>
            parsed.source[key as keyof typeof expected] !== value ||
            comparison.source[key as keyof typeof expected] !== value,
        ) ||
        expected.organization_id !== capture.organization_id ||
        expected.customer_id !== capture.customer_id ||
        expected.location_id !== capture.property_id ||
        expected.job_id !== capture.job_id ||
        expected.estimate_id !== capture.estimate_id ||
        expected.issued_version_id !== capture.issued_version_id ||
        parsed.visit.visit_id !== capture.visit_id ||
        parsed.visit.visit_revision !== capture.visit_revision ||
        parsed.visit.plan_id !== capture.plan_id ||
        parsed.visit.plan_revision !== capture.plan_revision
      )
        throw Error(
          'Exact original offline comparison and native source required',
        );
    };
    // Establish that the capture is original before reading its own data.
    reason = 'ORIGINAL_CAPTURE_CURRENTNESS_UNVERIFIED';
    const before = await reconcileOperationsExperiment(experiment);
    if (before.state !== 'CURRENT_REVIEW_ONLY')
      return captureUnavailable(before);
    check();
    // The existing operations owner performs its own native current-source read.
    // Recheck all eight plus four fields and the live protocol after this await.
    reason = 'ORIGINAL_CAPTURE_CURRENTNESS_UNVERIFIED';
    const after = await reconcileOperationsExperiment(experiment);
    if (after.state !== 'CURRENT_REVIEW_ONLY') return captureUnavailable(after);
    check();
    return {
      ...unknown,
      status: 'CURRENT_EXACT_READ_ONLY' as const,
      scope: 'ORIGINAL_COMPARISON_AND_NATIVE_VISIT_PLAN_AT_THIS_READ' as const,
    };
  } catch {
    return { ...unknown, reason };
  }
}
