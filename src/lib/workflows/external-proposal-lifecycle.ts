import { documentHash } from '../../domain/release/preview';
import { CustomerPortalPreviewModel } from '../customer-preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  assertAdvancedRequirementsCurrentNow,
  type AdvancedHandoffInput,
  type AdvancedRequirements,
} from './advanced-handoffs';
import {
  readSyncAdmissionSource,
  syncSourceReference,
  reviewSyncAdmission,
  assertSyncAdmissionCurrentNow,
  selectSyncAdmissionJob,
  prepareSyncReviewHandoff,
  inspectSyncReviewHandoff,
  type SyncReferenceProposal,
  type SyncAdmissionReview,
  type SyncReviewHandoff,
} from './sync-admission-review';

const workflowKeys = [
  'plan_id',
  'plan_revision',
  'scheduled_visit_id',
  'scheduled_visit_revision',
  'published_visit_id',
  'published_visit_revision',
] as const;
export interface ExternalWorkflowReference {
  plan_id: string | null;
  plan_revision: number | null;
  scheduled_visit_id: string | null;
  scheduled_visit_revision: number | null;
  published_visit_id: string | null;
  published_visit_revision: number | null;
}
export interface ExternalProposalInput {
  proposal: SyncReferenceProposal;
  workflow: ExternalWorkflowReference;
  review_expires_at_ms: number;
}
/** Explicit trusted synthetic test time. Never an operational clock or expiry guarantee. */
export interface ExternalProposalClock {
  now_ms: number;
}
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error(
      'External proposal lifecycle is OFF without explicit local admission',
    );
}
function clockNow(clock: ExternalProposalClock) {
  const p = prototypeFields(clock, ['now_ms']);
  if (
    Object.keys(p).length !== 1 ||
    typeof p.now_ms !== 'number' ||
    !Number.isSafeInteger(p.now_ms) ||
    p.now_ms < 0 ||
    p.now_ms > 8_000_000_000_000
  )
    throw Error('Exact bounded trusted synthetic clock required');
  return p.now_ms;
}
function pinWorkflow(input: ExternalWorkflowReference) {
  const p = prototypeFields(input, workflowKeys);
  if (Object.keys(p).length !== workflowKeys.length)
    throw Error('All exact workflow references or explicit null required');
  for (const key of workflowKeys) {
    const value = p[key];
    if (value === null) continue;
    if (
      key.endsWith('_revision')
        ? typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0
        : typeof value !== 'string' || !value || value.length > 200
    )
      throw Error('Own primitive workflow revision reference required');
  }
  return p as unknown as ExternalWorkflowReference;
}
function pin(input: ExternalProposalInput) {
  const p = prototypeFields(input, [
      'proposal',
      'workflow',
      'review_expires_at_ms',
    ]),
    proposal = prototypeFields(p.proposal, ['external_reference', 'source']),
    source = prototypeFields(proposal.source, [
      'organization_id',
      'customer_id',
      'location_id',
      'job_id',
      'estimate_id',
      'issued_version_id',
      'source_sha256',
      'saved_lock_revision',
    ]);
  if (
    Object.keys(p).length !== 3 ||
    Object.keys(proposal).length !== 2 ||
    Object.keys(source).length !== 8 ||
    typeof proposal.external_reference !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(proposal.external_reference) ||
    typeof p.review_expires_at_ms !== 'number' ||
    !Number.isSafeInteger(p.review_expires_at_ms)
  )
    throw Error('Exact bounded proposal and reviewer expiry required');
  for (const [key, value] of Object.entries(source)) {
    if (value === null) continue;
    if (
      key === 'saved_lock_revision'
        ? typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0
        : typeof value !== 'string' || !value || value.length > 200
    )
      throw Error('Own primitive source reference or explicit null required');
  }
  return {
    proposal: { external_reference: proposal.external_reference, source },
    workflow: pinWorkflow(p.workflow as ExternalWorkflowReference),
    review_expires_at_ms: p.review_expires_at_ms,
  };
}
interface SourceBinding {
  sources: OperatingSources;
  capture: ReturnType<typeof captureOperatingSources>;
  requirements: AdvancedRequirements;
  workflow: ExternalWorkflowReference;
  models: {
    entry: OperatingSources['entries'][number];
    model: CustomerPortalPreviewModel;
    context: string;
  }[];
  key: string;
  held: boolean;
}
const sourcesByView = new WeakMap<object, SourceBinding>();
function workflowSource(b: SourceBinding): ExternalWorkflowReference {
  const e = b.capture.entries.find(
    (e) => e.target.job_id === b.requirements.source.job_id,
  )!;
  const state = b.sources.property.read(b.capture.organization_id),
    plans = state.plans.filter(
      (p) => p.id === e.plan_id && p.job_id === e.target.job_id,
    ),
    scheduled = state.visits.filter(
      (v) => v.id === e.scheduled_visit_id && v.plan_id === e.plan_id,
    ),
    published = state.visits.filter(
      (v) => v.id === e.visit_id && v.plan_id === e.plan_id,
    );
  if (plans.length !== 1 || scheduled.length !== 1 || published.length !== 1)
    throw Error('Unique exact recorded plan and visit revisions required');
  return {
    plan_id: plans[0].id,
    plan_revision: plans[0].revision,
    scheduled_visit_id: scheduled[0].id,
    scheduled_visit_revision: scheduled[0].revision,
    published_visit_id: published[0].id,
    published_visit_revision: published[0].revision,
  };
}
function sourceCurrent(b: SourceBinding) {
  if (b.held) throw Error('UNKNOWN original source is exact read only');
  try {
    b.capture.check();
    assertAdvancedRequirementsCurrentNow(b.requirements);
    for (const m of b.models)
      if (
        m.entry.customerModel !== m.model ||
        JSON.stringify(m.model.read().context) !== m.context
      )
        throw Error('Original model context changed');
    if (JSON.stringify(workflowSource(b)) !== JSON.stringify(b.workflow))
      throw Error('Original workflow revisions changed');
  } catch (error) {
    b.held = true;
    throw error;
  }
}
/** Read original C11 requirements and actual workflow revisions; no integration/store/parser. */
export async function readExternalProposalSource(
  sources: OperatingSources,
  input: AdvancedHandoffInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const capture = captureOperatingSources(sources, gate),
    models = capture.entries.map((entry) => {
      if (!(entry.customerModel instanceof CustomerPortalPreviewModel))
        throw Error('Actual retained source model required');
      return {
        entry,
        model: entry.customerModel,
        context: JSON.stringify(entry.customerModel.read().context),
      };
    });
  const requirements = await readSyncAdmissionSource(sources, input, gate);
  capture.check();
  assertAdvancedRequirementsCurrentNow(requirements);
  const b: SourceBinding = {
    sources,
    capture,
    requirements,
    workflow: {} as ExternalWorkflowReference,
    models,
    key: JSON.stringify([
      capture.organization_id,
      requirements.source.job_id,
      requirements.kind,
    ]),
    held: false,
  };
  b.workflow = workflowSource(b);
  sourceCurrent(b);
  sourcesByView.set(requirements, b);
  return requirements;
}
export function externalProposalReferences(source: AdvancedRequirements) {
  const b = sourcesByView.get(source);
  if (!b) throw Error('Exact retained external proposal source required');
  sourceCurrent(b);
  return { source: syncSourceReference(source), workflow: { ...b.workflow } };
}
export type ExternalProposalStatus =
  | 'COMPARING'
  | 'REVIEWED'
  | 'QUARANTINED'
  | 'PENDING'
  | 'PREPARED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REVOKED'
  | 'UNKNOWN';
interface Event {
  status: ExternalProposalStatus;
  synthetic_at_ms: number;
  meaning: string;
}
interface LifecycleBinding {
  source: SourceBinding;
  original: ExternalProposalInput;
  signature: string;
  clock: ExternalProposalClock;
  observed: number;
  expires: number;
  status: ExternalProposalStatus;
  events: Readonly<Event>[];
  comparison?: SyncAdmissionReview;
  packet?: SyncReviewHandoff;
  confirmation?: { original: ExternalProposalConfirmation; signature: string };
}
// Ephemeral review-control fence only, never canonical business or synchronization state.
const sessions = new WeakMap<object, Map<string, LifecycleBinding>>();
const lifecycles = new WeakMap<object, LifecycleBinding>();
function event(
  b: LifecycleBinding,
  status: ExternalProposalStatus,
  meaning: string,
) {
  b.status = status;
  b.events.push(
    Object.freeze({ status, synthetic_at_ms: b.observed, meaning }),
  );
}
function current(b: LifecycleBinding) {
  if (b.status === 'UNKNOWN')
    throw Error('UNKNOWN is terminal; no new view, label or clock reset');
  try {
    sourceCurrent(b.source);
    if (JSON.stringify(pin(b.original)) !== b.signature)
      throw Error('Original proposal or expiry changed');
    if (
      b.confirmation &&
      JSON.stringify(
        prototypeFields(b.confirmation.original, [
          'confirmed',
          'reviewed_lifecycle_sha256',
        ]),
      ) !== b.confirmation.signature
    )
      throw Error('Original delegation confirmation changed');
    const now = clockNow(b.clock);
    if (now < b.observed)
      throw Error('Synthetic clock rollback cannot renew a review');
    b.observed = now;
    if (b.comparison) assertSyncAdmissionCurrentNow(b.comparison);
    if (
      now >= b.expires &&
      ['COMPARING', 'REVIEWED', 'PENDING', 'PREPARED', 'QUARANTINED'].includes(
        b.status,
      )
    )
      event(
        b,
        'EXPIRED',
        'Reviewer-set local review deadline reached; no renewal authority.',
      );
  } catch (error) {
    event(
      b,
      'UNKNOWN',
      'Original source, input, admission or synthetic time became uncertain.',
    );
    throw error;
  }
}
/** One fixed review per original repository/job/mode. Missing/conflicting references stay quarantined. */
export async function reviewExternalProposalLifecycle(
  source: AdvancedRequirements,
  input: ExternalProposalInput,
  clock: ExternalProposalClock,
) {
  const s = sourcesByView.get(source);
  if (!s) throw Error('Exact retained external proposal source required');
  sourceCurrent(s);
  const proposed = pin(input),
    now = clockNow(clock);
  if (
    proposed.review_expires_at_ms <= now ||
    proposed.review_expires_at_ms > now + 86_400_000
  )
    throw Error(
      'Reviewer expiry must be after synthetic now and within 24 hours',
    );
  let retained = sessions.get(s.sources.estimates);
  if (!retained) {
    retained = new Map();
    sessions.set(s.sources.estimates, retained);
  }
  if (retained.has(s.key))
    throw Error(
      'Existing lifecycle is exact read only; no new view, label, expiry or clock reset',
    );
  const b: LifecycleBinding = {
    source: s,
    original: input,
    signature: JSON.stringify(proposed),
    clock,
    observed: now,
    expires: proposed.review_expires_at_ms,
    status: 'COMPARING',
    events: [],
  };
  retained.set(s.key, b); // Before the first await, including failed/lost comparison acknowledgments.
  event(
    b,
    'COMPARING',
    'Explicit original proposal comparison reserved in this tab.',
  );
  try {
    const comparison = await reviewSyncAdmission(source, input.proposal);
    b.comparison = comparison;
    current(b);
    if (b.status !== 'COMPARING')
      throw Error('Local review deadline elapsed during comparison');
    const differences = workflowKeys.map((field) => ({
      field,
      expected: s.workflow[field],
      proposed: proposed.workflow[field],
      status:
        proposed.workflow[field] === null
          ? ('MISSING' as const)
          : proposed.workflow[field] === s.workflow[field]
            ? ('MATCH' as const)
            : ('CONFLICT' as const),
    }));
    const exact =
      comparison.exact_reference &&
      differences.every((d) => d.status === 'MATCH');
    const body = {
      mode: 'LOCAL_EXTERNAL_PROPOSAL_LIFECYCLE' as const,
      kind: source.kind,
      comparison,
      workflow_differences: differences,
      reference_status: exact
        ? ('EXACT_SOURCE_AND_WORKFLOW_REVIEW_ONLY' as const)
        : ('QUARANTINED_REFERENCE_OR_WORKFLOW' as const),
      review_expires_at_ms: b.expires,
      synthetic_review_started_at_ms: now,
      clock_authority:
        'EXPLICIT_TRUSTED_SYNTHETIC_TEST_TIME_NOT_OPERATIONAL' as const,
      source_requirements: source.gaps,
      catalog_links: source.catalog_links,
      prior_engine_attempt: source.prior_attempt,
      authority: comparison.authority,
      operational_ready: false as const,
      persistence: 'SAME_TAB_REVIEW_CONTROL_ONLY' as const,
    };
    const sha256 = await documentHash(body);
    current(b);
    if (b.status !== 'COMPARING')
      throw Error('Local review deadline elapsed during comparison');
    event(
      b,
      exact ? 'REVIEWED' : 'QUARANTINED',
      exact
        ? 'Exact comparison only; separate original handoff confirmation required.'
        : 'Missing, conflicting or multi-target references remain quarantined.',
    );
    const view = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    lifecycles.set(view, b);
    return view;
  } catch (error) {
    if (b.status !== 'EXPIRED' && b.status !== 'UNKNOWN')
      event(b, 'UNKNOWN', 'Comparison acknowledgment uncertain; no replay.');
    throw error;
  }
}
export type ExternalProposalView = Awaited<
  ReturnType<typeof reviewExternalProposalLifecycle>
>;
function binding(view: ExternalProposalView) {
  const b = lifecycles.get(view);
  if (!b)
    throw Error(
      'Exact retained lifecycle required; copies confer no authority',
    );
  current(b);
  return b;
}
export function externalProposalState(view: ExternalProposalView) {
  const b = binding(view);
  return freezePrototype({
    status: b.status,
    synthetic_now_ms: b.observed,
    review_expires_at_ms: b.expires,
    events: [...b.events],
    replay: false as const,
    replacement: null,
    operational_ready: false as const,
  });
}
export interface ExternalProposalConfirmation {
  confirmed: boolean;
  reviewed_lifecycle_sha256: string;
}
function confirm(
  view: ExternalProposalView,
  input: ExternalProposalConfirmation,
) {
  const p = prototypeFields(input, ['confirmed', 'reviewed_lifecycle_sha256']);
  if (
    Object.keys(p).length !== 2 ||
    p.confirmed !== true ||
    p.reviewed_lifecycle_sha256 !== view.integrity.sha256
  )
    throw Error('Separate explicit exact lifecycle confirmation required');
  return JSON.stringify(p);
}
function stop(
  view: ExternalProposalView,
  input: ExternalProposalConfirmation,
  status: 'CANCELLED' | 'REVOKED',
) {
  const b = binding(view);
  confirm(view, input);
  if (!['REVIEWED', 'QUARANTINED', 'PENDING', 'PREPARED'].includes(b.status))
    throw Error('Terminal review cannot be renewed or replaced');
  event(
    b,
    status,
    'Explicit local review authority withdrawn; original comparisons and existing holds remain unchanged.',
  );
  return externalProposalState(view);
}
export function cancelExternalProposal(
  view: ExternalProposalView,
  input: ExternalProposalConfirmation,
) {
  return stop(view, input, 'CANCELLED');
}
export function revokeExternalProposal(
  view: ExternalProposalView,
  input: ExternalProposalConfirmation,
) {
  return stop(view, input, 'REVOKED');
}
/** Separately confirm delegation to ORIGINAL C11/C10 review-only handoff and original one-use holds. */
export async function prepareExternalProposalHandoff(
  view: ExternalProposalView,
  input: ExternalProposalConfirmation,
) {
  const b = binding(view),
    signature = confirm(view, input);
  if (
    b.status !== 'REVIEWED' ||
    view.reference_status !== 'EXACT_SOURCE_AND_WORKFLOW_REVIEW_ONLY' ||
    !b.comparison
  )
    throw Error('Only an unexpired exact reviewed proposal can delegate once');
  b.confirmation = { original: input, signature };
  event(
    b,
    'PENDING',
    'Original C11 preparation invoked once; no retry after uncertainty.',
  );
  const stable = () => {
    current(b);
    if (confirm(view, input) !== signature || b.status !== 'PENDING')
      throw Error(
        'Original delegation confirmation withdrawn, expired or revoked',
      );
  };
  try {
    const original = await prepareSyncReviewHandoff(b.comparison, {
      confirmed: true,
      reviewed_comparison_sha256: b.comparison.integrity.sha256,
    });
    stable();
    b.packet = original;
    const body = {
      mode: 'LOCAL_EXTERNAL_PROPOSAL_ORIGINAL_HANDOFF' as const,
      lifecycle_sha256: view.integrity.sha256,
      original_handoff: original,
      imported: false as const,
      synchronized: false as const,
      operational_ready: false as const,
      delivery: 'NOT_SENT' as const,
    };
    const sha256 = await documentHash(body);
    stable();
    event(
      b,
      'PREPARED',
      'Original immutable review-only handoff retained; execution remains blocked.',
    );
    return freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
  } catch (error) {
    if ((b.status as ExternalProposalStatus) === 'PENDING')
      event(
        b,
        'UNKNOWN',
        'Delegation acknowledgment uncertain; original C11/C10 hold is not reset.',
      );
    throw error;
  }
}
export type ExternalProposalHandoff = Awaited<
  ReturnType<typeof prepareExternalProposalHandoff>
>;
export async function inspectExternalProposalLifecycle(
  view: ExternalProposalView,
) {
  const unknown = {
    status: 'UNKNOWN' as const,
    replay: false,
    replacement: null,
    operational_ready: false,
  };
  try {
    const b = binding(view);
    if (b.packet && b.status === 'PREPARED') {
      const state = await inspectSyncReviewHandoff(b.packet);
      current(b);
      if (state.status !== 'CURRENT_REVIEW_ONLY') {
        event(b, 'UNKNOWN', 'Original retained handoff unavailable.');
        return unknown;
      }
    }
    return externalProposalState(view);
  } catch {
    return unknown;
  }
}
export function selectExternalProposalJob(view: ExternalProposalView) {
  const b = binding(view);
  if (!b.comparison) throw Error('Original exact comparison unavailable');
  return selectSyncAdmissionJob(b.comparison);
}
