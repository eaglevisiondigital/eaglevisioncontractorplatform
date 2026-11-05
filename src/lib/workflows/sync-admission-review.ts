import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  assertAdvancedRequirementsCurrentNow,
  assertAdvancedHandoffCurrentNow,
  readAdvancedHandoffRequirements,
  prepareAdvancedHandoff,
  reconcileAdvancedHandoff,
  type AdvancedHandoffInput,
  type AdvancedRequirements,
  type AdvancedHandoff,
} from './advanced-handoffs';

const referenceKeys = [
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'estimate_id',
  'issued_version_id',
  'source_sha256',
  'saved_lock_revision',
] as const;
export interface SyncSourceReference {
  organization_id: string | null;
  customer_id: string | null;
  location_id: string | null;
  job_id: string | null;
  estimate_id: string | null;
  issued_version_id: string | null;
  source_sha256: string | null;
  saved_lock_revision: number | null;
}
export interface SyncReferenceProposal {
  external_reference: string;
  source: SyncSourceReference;
}
interface SourceBinding {
  sources: OperatingSources;
  requirements: AdvancedRequirements;
  held: boolean;
}
const sourcesByView = new WeakMap<object, SourceBinding>();
function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error(
      'Sync admission review is OFF without explicit local admission',
    );
}
function current(b: SourceBinding) {
  if (b.held) throw Error('UNKNOWN source permits exact read only');
  try {
    assertAdvancedRequirementsCurrentNow(b.requirements);
  } catch (e) {
    b.held = true;
    throw e;
  }
}
/** Existing requirements reader only; this does not read any network or external document. */
export async function readSyncAdmissionSource(
  sources: OperatingSources,
  input: AdvancedHandoffInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const requirements = await readAdvancedHandoffRequirements(
    sources,
    input,
    gate,
  );
  assertAdvancedRequirementsCurrentNow(requirements);
  sourcesByView.set(requirements, { sources, requirements, held: false });
  return requirements;
}
export function syncSourceReference(
  view: AdvancedRequirements,
): SyncSourceReference {
  const b = sourcesByView.get(view);
  if (!b) throw Error('Exact original source requirements required');
  current(b);
  const s = view.source;
  return {
    organization_id: s.organization_id,
    customer_id: s.customer_id,
    location_id: s.location_id,
    job_id: s.job_id,
    estimate_id: s.estimate_id,
    issued_version_id: s.issued_version_id,
    source_sha256: s.source_sha256,
    saved_lock_revision: s.saved_lock_revision,
  };
}
function pin(input: SyncReferenceProposal) {
  const p = prototypeFields(input, ['external_reference', 'source']),
    s = prototypeFields(p.source, referenceKeys);
  if (
    Object.keys(p).length !== 2 ||
    Object.keys(s).length !== referenceKeys.length ||
    typeof p.external_reference !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(p.external_reference)
  )
    throw Error('Bounded reference label and exact own source fields required');
  for (const key of referenceKeys) {
    const value = s[key];
    if (key === 'saved_lock_revision') {
      if (
        value !== null &&
        (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
      )
        throw Error('Exact saved revision or explicit missing value required');
    } else if (
      value !== null &&
      (typeof value !== 'string' || !value || value.length > 200)
    )
      throw Error(
        'Exact primitive source identity or explicit missing value required',
      );
  }
  return {
    external_reference: p.external_reference,
    source: s as unknown as SyncSourceReference,
  };
}
interface ReviewBinding {
  source: SourceBinding;
  original: SyncReferenceProposal;
  signature: string;
  held: boolean;
}
const reviews = new WeakMap<object, ReviewBinding>();
// Ephemeral identity claims for this disposable review, never a business/synchronization store.
const referenceClaims = new WeakMap<object, Map<string, string>>();
function reviewCurrent(b: ReviewBinding) {
  if (b.held) throw Error('UNKNOWN comparison is exact read only');
  try {
    current(b.source);
    if (JSON.stringify(pin(b.original)) !== b.signature)
      throw Error('Original reference proposal changed');
  } catch (e) {
    b.held = true;
    throw e;
  }
}
/** External text supplies a proposal only. Exact matches still grant no import/sync/execution authority. */
export async function reviewSyncAdmission(
  view: AdvancedRequirements,
  input: SyncReferenceProposal,
) {
  const b = sourcesByView.get(view);
  if (!b) throw Error('Exact original source requirements required');
  current(b);
  const proposed = pin(input);
  // A digest/reference is untrusted input. Reject executable descriptor forms
  // before claiming a label; discard the clone and keep original live checks.
  structuredClone(input);
  const expected = syncSourceReference(view),
    signature = JSON.stringify(proposed),
    binding: ReviewBinding = {
      source: b,
      original: input,
      signature,
      held: false,
    };
  const differences = referenceKeys.map((field) => ({
    field,
    expected: expected[field],
    proposed: proposed.source[field],
    status:
      proposed.source[field] === null
        ? ('MISSING' as const)
        : proposed.source[field] === expected[field]
          ? ('MATCH' as const)
          : ('CONFLICT' as const),
  }));
  const exact = differences.every((d) => d.status === 'MATCH'),
    target = JSON.stringify(expected),
    claimKey = JSON.stringify([view.kind, proposed.external_reference]);
  let claims = referenceClaims.get(b.sources.estimates);
  if (!claims) {
    claims = new Map();
    referenceClaims.set(b.sources.estimates, claims);
  }
  const old = claims.get(claimKey),
    ambiguous = old !== undefined && old !== target;
  // Reserve exact reference identity before awaiting, so racing jobs cannot both claim the same label.
  if (exact && !ambiguous && !old) claims.set(claimKey, target);
  const body = {
    mode: 'LOCAL_SYNC_REFERENCE_ADMISSION_REVIEW' as const,
    kind: view.kind,
    external_reference: proposed.external_reference,
    source: expected,
    requirements_sha256: view.integrity.sha256,
    differences,
    reference_status: ambiguous
      ? ('QUARANTINED_MULTI_TARGET_REFERENCE' as const)
      : exact
        ? ('EXACT_REFERENCE_REVIEW_ONLY' as const)
        : ('QUARANTINED_MISSING_OR_CONFLICTING_REFERENCE' as const),
    exact_reference: exact && !ambiguous,
    source_requirements: view.gaps,
    catalog_links: { ...view.catalog_links },
    authority: {
      import: false,
      sync: false,
      save: false,
      dispatch: false,
      send: false,
      call: false,
      order: false,
      export: false,
      contract: false,
      payment: false,
      hosted: false,
    },
    external_content: 'UNTRUSTED_HUMAN_PROPOSAL' as const,
    atomic_network_admission: 'NOT_IMPLEMENTED' as const,
    persistence: 'SAME_TAB_REVIEW_ONLY' as const,
    operational_ready: false as const,
  };
  const sha256 = await documentHash(body);
  reviewCurrent(binding);
  // Recheck a concurrent label claim, never allow a new target to displace the first exact claim.
  if (exact && !ambiguous && claims.get(claimKey) !== target)
    throw Error('Reference identity changed during review');
  const result = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  reviews.set(result, binding);
  return result;
}
export type SyncAdmissionReview = Awaited<
  ReturnType<typeof reviewSyncAdmission>
>;
export function assertSyncAdmissionCurrentNow(view: SyncAdmissionReview) {
  const b = reviews.get(view);
  if (!b) throw Error('Exact retained reference comparison required');
  reviewCurrent(b);
}
export function selectSyncAdmissionJob(view: SyncAdmissionReview) {
  assertSyncAdmissionCurrentNow(view);
  return view.source.job_id!;
}
export interface SyncPreparationConfirmation {
  confirmed: boolean;
  reviewed_comparison_sha256: string;
}
function confirm(input: SyncPreparationConfirmation) {
  const p = prototypeFields(input, ['confirmed', 'reviewed_comparison_sha256']);
  if (
    Object.keys(p).length !== 2 ||
    p.confirmed !== true ||
    typeof p.reviewed_comparison_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(p.reviewed_comparison_sha256)
  )
    throw Error('Explicit exact comparison confirmation required');
  return {
    confirmed: p.confirmed,
    reviewed_comparison_sha256: p.reviewed_comparison_sha256,
  };
}
const attempts = new WeakMap<object, Set<string>>();
interface PreparedBinding {
  review: ReviewBinding;
  original: SyncPreparationConfirmation;
  signature: string;
  canonical: AdvancedHandoff;
  held: boolean;
}
const prepared = new WeakMap<object, PreparedBinding>();
/** Optional separately confirmed delegation to the existing one-use C10 handoff; no new parser or writer. */
export async function prepareSyncReviewHandoff(
  view: SyncAdmissionReview,
  input: SyncPreparationConfirmation,
) {
  const b = reviews.get(view);
  if (!b) throw Error('Exact retained comparison required');
  reviewCurrent(b);
  const c = confirm(input),
    signature = JSON.stringify(c);
  if (
    !view.exact_reference ||
    c.reviewed_comparison_sha256 !== view.integrity.sha256
  )
    throw Error(
      'Only the exact matching reviewed comparison may prepare an existing review handoff',
    );
  const key = JSON.stringify([
    view.source.organization_id,
    view.source.job_id,
    view.kind,
  ]);
  let held = attempts.get(b.source.sources.estimates);
  if (!held) {
    held = new Set();
    attempts.set(b.source.sources.estimates, held);
  }
  if (held.has(key))
    throw Error('Prior/UNKNOWN preparation is exact read only; no replay');
  held.add(key);
  const stable = () => {
    reviewCurrent(b);
    if (JSON.stringify(confirm(input)) !== signature)
      throw Error('Original confirmation changed');
  };
  const canonical = await prepareAdvancedHandoff(b.source.requirements, {
    confirmed: true,
    reviewed_requirements_sha256: b.source.requirements.integrity.sha256,
  });
  stable();
  assertAdvancedHandoffCurrentNow(canonical);
  const body = {
    mode: 'IMMUTABLE_SYNC_REVIEW_HANDOFF' as const,
    comparison: view,
    existing_handoff: canonical,
    operational_ready: false as const,
    imported: false as const,
    synchronized: false as const,
    delivery: 'NOT_SENT' as const,
  };
  const sha256 = await documentHash(body);
  stable();
  assertAdvancedHandoffCurrentNow(canonical);
  const packet = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  prepared.set(packet, {
    review: b,
    original: input,
    signature,
    canonical,
    held: false,
  });
  return packet;
}
export type SyncReviewHandoff = Awaited<
  ReturnType<typeof prepareSyncReviewHandoff>
>;
export async function inspectSyncReviewHandoff(packet: SyncReviewHandoff) {
  const b = prepared.get(packet),
    unknown = { status: 'UNKNOWN' as const, replay: false, replacement: null };
  if (!b || b.held) return unknown;
  try {
    reviewCurrent(b.review);
    if (JSON.stringify(confirm(b.original)) !== b.signature)
      throw Error('Confirmation changed');
    const { integrity, ...body } = packet;
    if ((await documentHash(body)) !== integrity.sha256)
      throw Error('Integrity mismatch');
    const result = await reconcileAdvancedHandoff(b.canonical);
    reviewCurrent(b.review);
    if (
      JSON.stringify(confirm(b.original)) !== b.signature ||
      result.status !== 'CURRENT_REVIEW_ONLY'
    )
      throw Error('Original existing handoff unavailable');
    return {
      status: 'CURRENT_REVIEW_ONLY' as const,
      replay: false,
      replacement: null,
    };
  } catch {
    b.held = true;
    return unknown;
  }
}
