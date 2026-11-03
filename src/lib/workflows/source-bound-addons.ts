import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  assertAddonReviewDetailCurrentNow,
  openAddonOriginalControl,
  selectAddonReviewJob,
  type AddonReviewDetail,
} from './addon-review-desk';
import type {
  AdvancedHandoffInput,
  AdvancedRequirements,
} from './advanced-handoffs';
import {
  readExternalProposalSource,
  externalProposalReferences,
  reviewExternalProposalLifecycle,
  externalProposalState,
  prepareExternalProposalHandoff,
  cancelExternalProposal,
  revokeExternalProposal,
  inspectExternalProposalLifecycle,
  type ExternalProposalClock,
  type ExternalProposalConfirmation,
  type ExternalProposalView,
  type ExternalProposalHandoff,
} from './external-proposal-lifecycle';

function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error(
      'Source-bound advanced review is OFF without explicit local admission',
    );
}
export interface SourceBoundReviewConfirmation {
  confirmed: boolean;
  reviewed_source_sha256: string;
  external_reference: string;
  review_expires_at_ms: number;
}
function confirmation(input: SourceBoundReviewConfirmation) {
  const p = prototypeFields(input, [
    'confirmed',
    'reviewed_source_sha256',
    'external_reference',
    'review_expires_at_ms',
  ]);
  if (
    Object.keys(p).length !== 4 ||
    p.confirmed !== true ||
    typeof p.reviewed_source_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(p.reviewed_source_sha256) ||
    typeof p.external_reference !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(p.external_reference) ||
    typeof p.review_expires_at_ms !== 'number' ||
    !Number.isSafeInteger(p.review_expires_at_ms)
  )
    throw Error(
      'Explicit exact pinned-source and fixed expiry confirmation required',
    );
  return {
    confirmed: true,
    reviewed_source_sha256: p.reviewed_source_sha256,
    external_reference: p.external_reference,
    review_expires_at_ms: p.review_expires_at_ms,
  };
}
interface Binding {
  sources: OperatingSources;
  selection: AddonReviewDetail;
  gate: JourneyAdmission;
  capture: ReturnType<typeof captureOperatingSources>;
  source: AdvancedRequirements;
  references: ReturnType<typeof externalProposalReferences>;
  held: boolean;
  review_input?: SourceBoundReviewConfirmation;
  review_signature?: string;
  view?: ExternalProposalView;
  packet?: ExternalProposalHandoff;
  pending: boolean;
}
const bindings = new WeakMap<object, Binding>();
function current(b: Binding) {
  if (b.held)
    throw Error(
      'UNKNOWN pinned source permits exact read-only reconciliation; no replacement',
    );
  try {
    admit(b.gate);
    b.capture.check();
    assertAddonReviewDetailCurrentNow(b.selection);
    if (openAddonOriginalControl(b.selection) !== b.sources)
      throw Error('Original source root required');
    if (
      JSON.stringify(externalProposalReferences(b.source)) !==
      JSON.stringify(b.references)
    )
      throw Error('Pinned original references changed');
    if (
      b.review_input &&
      JSON.stringify(confirmation(b.review_input)) !== b.review_signature
    )
      throw Error('Original source or deadline confirmation changed');
  } catch (error) {
    b.held = true;
    throw error;
  }
}
/** Read-only admission of an already inspected C13 selection; no repeated target selection or attempt. */
export async function readSourceBoundAddons(
  sources: OperatingSources,
  selection: AddonReviewDetail,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  assertAddonReviewDetailCurrentNow(selection);
  if (openAddonOriginalControl(selection) !== sources)
    throw Error('Same original inspected source root required');
  const capture = captureOperatingSources(sources, gate),
    entry = capture.entries.find(
      (e) => e.target.job_id === selection.reference.job_id,
    );
  if (!entry) throw Error('Exact inspected job required');
  const input: AdvancedHandoffInput = {
    job_id: selection.reference.job_id,
    kind: selection.reference.kind,
    note: 'Read-only inspection of the existing exact source; no external proposal or action.',
    review_on: entry.day,
    manual_priority: 'normal',
    edition: selection.edition.human_selected_review_context,
  };
  const source = await readExternalProposalSource(sources, input, gate),
    references = externalProposalReferences(source),
    b: Binding = {
      sources,
      selection,
      gate,
      capture,
      source,
      references,
      held: false,
      pending: false,
    };
  current(b);
  const s = source.source,
    r = selection.reference;
  if (
    s.organization_id !== r.organization_id ||
    s.customer_id !== r.customer_id ||
    s.location_id !== r.location_id ||
    s.job_id !== r.job_id ||
    s.estimate_id !== r.estimate_id ||
    s.issued_version_id !== r.issued_version_id ||
    s.saved_lock_revision !== r.saved_lock_revision ||
    s.source_sha256 !== r.source_sha256 ||
    source.kind !== r.kind ||
    source.review_context.edition !==
      selection.edition.human_selected_review_context ||
    s.report_id !== selection.report.report_id ||
    s.published_version !== selection.report.published_version ||
    JSON.stringify(references) !== JSON.stringify(selection.source_references)
  )
    throw Error(
      'Exact inspected tenant/customer/property/job/issued/revision/report/mode/edition pin required',
    );
  const body = {
    mode: 'LOCAL_SOURCE_BOUND_ADVANCED_REVIEW' as const,
    source: selection.reference,
    company: selection.company,
    job_label: selection.job_label,
    customer_label: selection.customer_label,
    property_label: selection.property_label,
    edition: selection.edition,
    report: selection.report,
    references,
    requirements: source.gaps,
    catalog_links: source.catalog_links,
    scope: source.scope,
    operational_ready: false as const,
    authority: 'ORIGINAL_LIFECYCLE_REVIEW_ONLY' as const,
  };
  const sha256 = await documentHash(body);
  current(b);
  const read = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  bindings.set(read, b);
  return read;
}
export type SourceBoundAddonRead = Awaited<
  ReturnType<typeof readSourceBoundAddons>
>;
function binding(read: SourceBoundAddonRead) {
  const b = bindings.get(read);
  if (!b) throw Error('Exact retained pinned source required');
  current(b);
  return b;
}
export function assertSourceBoundAddonsCurrentNow(read: SourceBoundAddonRead) {
  binding(read);
}
/** Explicit action only; original C12 comparison owns its pre-await reservation. */
export async function reviewSourceBoundAddons(
  read: SourceBoundAddonRead,
  input: SourceBoundReviewConfirmation,
  clock: ExternalProposalClock,
) {
  const b = binding(read),
    p = confirmation(input);
  if (p.reviewed_source_sha256 !== read.integrity.sha256)
    throw Error('Exact reviewed pinned-source hash required');
  if (b.view || b.pending)
    throw Error('Original lifecycle is exact read only; no second review');
  b.review_input = input;
  b.review_signature = JSON.stringify(p);
  b.pending = true;
  try {
    const view = await reviewExternalProposalLifecycle(
      b.source,
      {
        proposal: {
          external_reference: p.external_reference,
          source: { ...b.references.source },
        },
        workflow: { ...b.references.workflow },
        review_expires_at_ms: p.review_expires_at_ms,
      },
      clock,
    );
    b.view = view;
    current(b);
    externalProposalState(view);
    return view;
  } catch (error) {
    b.held = true;
    throw error;
  } finally {
    b.pending = false;
  }
}
export function sourceBoundAddonsState(read: SourceBoundAddonRead) {
  const b = binding(read);
  if (!b.view)
    return {
      status: 'PINNED_NOT_REVIEWED' as const,
      replay: false,
      replacement: null,
      operational_ready: false,
    };
  return externalProposalState(b.view);
}
function originalView(read: SourceBoundAddonRead) {
  const b = binding(read);
  if (!b.view) throw Error('Original retained lifecycle required');
  return { b, view: b.view };
}
/** Returns the original immutable C12 packet; no second handoff engine or reservation. */
export async function prepareSourceBoundAddons(
  read: SourceBoundAddonRead,
  input: ExternalProposalConfirmation,
) {
  const { b, view } = originalView(read);
  try {
    const packet = await prepareExternalProposalHandoff(view, input);
    b.packet = packet;
    current(b);
    externalProposalState(view);
    return packet;
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export function cancelSourceBoundAddons(
  read: SourceBoundAddonRead,
  input: ExternalProposalConfirmation,
) {
  const { b, view } = originalView(read);
  const state = cancelExternalProposal(view, input);
  current(b);
  return state;
}
export function revokeSourceBoundAddons(
  read: SourceBoundAddonRead,
  input: ExternalProposalConfirmation,
) {
  const { b, view } = originalView(read);
  const state = revokeExternalProposal(view, input);
  current(b);
  return state;
}
export async function inspectSourceBoundAddons(read: SourceBoundAddonRead) {
  const unknown = {
    status: 'UNKNOWN' as const,
    replay: false,
    replacement: null,
    operational_ready: false,
  };
  const b = bindings.get(read);
  if (!b || b.held) return unknown;
  try {
    current(b);
    if (!b.view) return sourceBoundAddonsState(read);
    const state = await inspectExternalProposalLifecycle(b.view);
    current(b);
    if (state.status === 'UNKNOWN') b.held = true;
    return state;
  } catch {
    b.held = true;
    return unknown;
  }
}
export function selectSourceBoundAddonJob(read: SourceBoundAddonRead) {
  const b = binding(read);
  return selectAddonReviewJob(b.selection);
}
