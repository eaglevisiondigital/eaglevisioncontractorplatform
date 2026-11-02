import type { CustomerPortalPreviewModel } from '../../lib/customer-preview';
import { sampleCompanies } from '../platform';
import { documentHash } from '../release/preview';
import type { PropertyPassportAdmission } from './passport';
import { reportUuid, type ReportBoundary } from './report-page';
import {
  createPropertyPassportTimeline,
  readPropertyPassportTimelineEvidence,
  type PassportTimelineEvent,
  type PassportTimelineReference,
  type PropertyPassportTimeline,
} from './passport-timeline';

type Immutable<T> = T extends object
  ? { readonly [K in keyof T]: Immutable<T[K]> }
  : T;
export type ProofOfWorkSelection = {
  timeline_sha256: string;
  sources: readonly PassportTimelineReference[];
  confirmed: boolean;
};
export type ProofOfWorkPackReference = Immutable<{
  pack_id: string;
  sha256: string;
  timeline_sha256: string;
  sources: PassportTimelineReference[];
}>;
export type ProofOfWorkPack = Immutable<{
  snapshot: ReportBoundary & {
    format: 'synthetic-proof-of-work-documentation-pack-v1';
    synthetic_only: true;
    contractor: PropertyPassportTimeline['snapshot']['contractor'];
    property_label: string;
    timeline_sha256: string;
    coverage: 'explicitly-selected-currently-authorized-documentation';
    history_completeness: 'UNKNOWN';
    events: PassportTimelineEvent[];
    media: {
      status: 'UNAVAILABLE';
      reason: 'authorized-projection-has-no-media';
      items: never[];
    };
    physical_completion: 'UNVERIFIED';
    customer_acceptance: 'UNVERIFIED';
    warranty: 'UNVERIFIED';
    delivery: 'NOT_SENT';
  };
  reference: ProofOfWorkPackReference;
  integrity: { algorithm: 'SHA-256'; sha256: string };
}>;
export type ProofOfWorkPackStatus = Immutable<{
  status: 'CURRENT' | 'STALE' | 'UNKNOWN';
  authority: 'DOCUMENTATION_ONLY';
}>;
const unknown = { status: 'UNKNOWN', authority: 'DOCUMENTATION_ONLY' } as const;
// Ephemeral provenance for this process's deeply frozen prepared references only.
// This is not a business archive, transferable capability or durable custody.
const preparedBindings = new WeakMap<
  object,
  { model: CustomerPortalPreviewModel; canonical: string }
>();
const digest = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function record(value: unknown, names: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error('Invalid primitive evidence reference');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== names.length ||
    !names.every(
      (name) => descriptors[name] && Object.hasOwn(descriptors[name], 'value'),
    )
  )
    throw Error('Invalid primitive evidence reference');
  return Object.fromEntries(
    names.map((name) => [name, descriptors[name].value]),
  ) as Record<string, unknown>;
}
function list(value: unknown): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 20 ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    throw Error('Select one to twenty exact sources');
  return Array.from({ length: value.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !Object.hasOwn(d, 'value'))
      throw Error('Invalid source selection');
    return d.value;
  });
}
function pinSource(value: unknown): PassportTimelineReference {
  const r = record(value, ['kind', 'source', 'source_sha256']);
  if (
    !digest(r.source_sha256) ||
    !['inspection-documentation', 'issued-job-scope'].includes(r.kind as string)
  )
    throw Error('Invalid source digest or kind');
  const report = r.kind === 'inspection-documentation';
  const s = record(
    r.source,
    report
      ? [
          'organization_id',
          'customer_id',
          'location_id',
          'kind',
          'report_id',
          'published_version',
        ]
      : [
          'organization_id',
          'customer_id',
          'location_id',
          'kind',
          'job_id',
          'estimate_id',
          'issued_version_id',
          'issued_version_number',
          'issued_source_sha256',
        ],
  );
  if (
    !sampleCompanies.some((c) => c.id === s.organization_id) ||
    ![s.customer_id, s.location_id].every(reportUuid) ||
    s.kind !== (report ? 'report' : 'job-documentation')
  )
    throw Error('Invalid source identity');
  const ids = report
    ? [s.report_id]
    : [s.job_id, s.estimate_id, s.issued_version_id];
  const version = report ? s.published_version : s.issued_version_number;
  if (
    !ids.every(reportUuid) ||
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    (!report && !digest(s.issued_source_sha256))
  )
    throw Error('Invalid exact version');
  return {
    kind: r.kind,
    source: s,
    source_sha256: r.source_sha256,
  } as PassportTimelineReference;
}
function pinSelection(value: unknown): ProofOfWorkSelection {
  const r = record(value, ['timeline_sha256', 'sources', 'confirmed']);
  if (!digest(r.timeline_sha256) || r.confirmed !== true)
    throw Error('Confirm the current selected documentation');
  const sources = list(r.sources)
    .map(pinSource)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (
    new Set(sources.map((r) => JSON.stringify([r.kind, r.source]))).size !==
    sources.length
  )
    throw Error('Duplicate source selection');
  return { timeline_sha256: r.timeline_sha256, sources, confirmed: true };
}
function pinBoundary(value: unknown): ReportBoundary {
  const r = record(value, ['organization_id', 'customer_id', 'location_id']);
  if (
    !sampleCompanies.some((c) => c.id === r.organization_id) ||
    ![r.customer_id, r.location_id].every(reportUuid)
  )
    throw Error('Invalid exact property');
  return r as unknown as ReportBoundary;
}
function admit(
  model: CustomerPortalPreviewModel,
  admission: PropertyPassportAdmission,
) {
  const a = record(admission, ['enabled']);
  if (
    a.enabled !== true ||
    model.repo.operations.sample !== true ||
    model.repo.estimates.sample !== true ||
    !sampleCompanies.some((c) => c.id === model.company.id)
  )
    throw Error('Synthetic Proof of Work pack disabled');
}
function freeze<T>(value: T): Immutable<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}
export function proofOfWorkSourceReference(
  event: PassportTimelineEvent,
): PassportTimelineReference {
  return pinSource({
    kind: event.kind,
    source: event.reference,
    source_sha256: event.source_sha256,
  });
}
function selected(
  timeline: PropertyPassportTimeline,
  selection: ProofOfWorkSelection,
) {
  if (timeline.integrity.sha256 !== selection.timeline_sha256)
    throw Error('Selected timeline is stale');
  return selection.sources.map((r) => {
    const matches = timeline.snapshot.events.filter(
      (e) =>
        JSON.stringify(proofOfWorkSourceReference(e)) === JSON.stringify(r),
    );
    if (matches.length !== 1) throw Error('Selected exact source unavailable');
    return matches[0];
  });
}
function snapshot(
  timeline: PropertyPassportTimeline,
  events: PassportTimelineEvent[],
): ProofOfWorkPack['snapshot'] {
  const s = timeline.snapshot;
  // The existing allowlisted timeline is the only body producer. No media lookup,
  // private path, estimate input, workforce data or outer source serialization.
  return structuredClone({
    format: 'synthetic-proof-of-work-documentation-pack-v1',
    synthetic_only: true,
    organization_id: s.organization_id,
    customer_id: s.customer_id,
    location_id: s.location_id,
    contractor: s.contractor,
    property_label: s.property_label,
    timeline_sha256: timeline.integrity.sha256,
    coverage: 'explicitly-selected-currently-authorized-documentation',
    history_completeness: 'UNKNOWN',
    events,
    media: {
      status: 'UNAVAILABLE',
      reason: 'authorized-projection-has-no-media',
      items: [],
    },
    physical_completion: 'UNVERIFIED',
    customer_acceptance: 'UNVERIFIED',
    warranty: 'UNVERIFIED',
    delivery: 'NOT_SENT',
  });
}
/** Explicit local human preparation. Detached return value only; no archive,
 * completion store, download, customer URL, publication or financial command. */
export async function prepareProofOfWorkPack(
  model: CustomerPortalPreviewModel,
  boundary: ReportBoundary,
  selection: ProofOfWorkSelection,
  admission: PropertyPassportAdmission = {},
): Promise<ProofOfWorkPack> {
  admit(model, admission);
  const target = pinBoundary(boundary),
    pinned = pinSelection(selection);
  const guard = () => {
    admit(model, admission);
    if (JSON.stringify(pinSelection(selection)) !== JSON.stringify(pinned))
      throw Error('Selection or confirmation changed');
  };
  const timeline = await createPropertyPassportTimeline(
    model,
    target,
    admission,
  );
  guard();
  const body = snapshot(timeline, selected(timeline, pinned));
  const sha256 = await documentHash(body);
  guard();
  const final = await createPropertyPassportTimeline(model, target, admission);
  guard();
  if (final.integrity.sha256 !== timeline.integrity.sha256)
    throw Error('Exact evidence changed during preparation');
  const reference = {
    pack_id: `synthetic-proof-${sha256}`,
    sha256,
    timeline_sha256: pinned.timeline_sha256,
    sources: pinned.sources,
  };
  const pack = freeze({
    snapshot: body,
    reference,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  preparedBindings.set(pack.reference, {
    model,
    canonical: JSON.stringify(pack.reference),
  });
  return pack;
}
function pinPack(
  value: unknown,
  model: CustomerPortalPreviewModel,
): ProofOfWorkPackReference {
  if (!value || typeof value !== 'object')
    throw Error('Unknown prepared reference');
  const binding = preparedBindings.get(value);
  if (!binding || binding.model !== model)
    throw Error('Unknown prepared reference');
  const p = record(value, ['pack_id', 'sha256', 'timeline_sha256', 'sources']);
  if (!digest(p.sha256) || p.pack_id !== `synthetic-proof-${p.sha256}`)
    throw Error('Invalid pack identity');
  const s = pinSelection({
    timeline_sha256: p.timeline_sha256,
    sources: p.sources,
    confirmed: true,
  });
  const pinned = {
    pack_id: p.pack_id,
    sha256: p.sha256,
    timeline_sha256: s.timeline_sha256,
    sources: s.sources,
  } as ProofOfWorkPackReference;
  if (JSON.stringify(pinned) !== binding.canonical)
    throw Error('Prepared reference changed');
  return pinned;
}
/** Verify the exact retained content binding against current authorized sources.
 * STALE requires proven source drift; absence/denial/ambiguity remains UNKNOWN. */
export async function verifyProofOfWorkPack(
  model: CustomerPortalPreviewModel,
  reference: ProofOfWorkPackReference,
  admission: PropertyPassportAdmission = {},
): Promise<ProofOfWorkPackStatus> {
  try {
    admit(model, admission);
    const p = pinPack(reference, model),
      source = p.sources[0].source;
    const target = {
      organization_id: source.organization_id,
      customer_id: source.customer_id,
      location_id: source.location_id,
    };
    const timeline = await createPropertyPassportTimeline(
      model,
      target,
      admission,
    );
    admit(model, admission);
    if (timeline.integrity.sha256 !== p.timeline_sha256)
      return freeze({ status: 'STALE', authority: 'DOCUMENTATION_ONLY' });
    const body = snapshot(
      timeline,
      selected(timeline, { ...p, confirmed: true }),
    );
    const sha = await documentHash(body);
    admit(model, admission);
    const final = await createPropertyPassportTimeline(
      model,
      target,
      admission,
    );
    admit(model, admission);
    if (timeline.integrity.sha256 !== final.integrity.sha256)
      return freeze(unknown);
    return freeze({
      status: sha === p.sha256 ? 'CURRENT' : 'UNKNOWN',
      authority: 'DOCUMENTATION_ONLY',
    });
  } catch {
    return freeze(unknown);
  }
}
/** Source navigation never trusts a retained hash as permission or chooses latest. */
export async function readProofOfWorkPackSource(
  model: CustomerPortalPreviewModel,
  pack: ProofOfWorkPackReference,
  source: PassportTimelineReference,
  admission: PropertyPassportAdmission = {},
) {
  try {
    admit(model, admission);
    const p = pinPack(pack, model),
      s = pinSource(source);
    if (!p.sources.some((r) => JSON.stringify(r) === JSON.stringify(s)))
      throw Error('Source is not selected');
    if (
      (await verifyProofOfWorkPack(model, pack, admission)).status !== 'CURRENT'
    )
      throw Error('Pack is not current');
    admit(model, admission);
    const evidence = await readPropertyPassportTimelineEvidence(
      model,
      s,
      admission,
    );
    admit(model, admission);
    // Read-only recheck after source wait; never revive a stale pack.
    if (
      (await verifyProofOfWorkPack(model, pack, admission)).status !== 'CURRENT'
    )
      throw Error('Pack changed');
    admit(model, admission);
    return evidence;
  } catch {
    return freeze({ status: 'UNKNOWN', evidence: null } as const);
  }
}
