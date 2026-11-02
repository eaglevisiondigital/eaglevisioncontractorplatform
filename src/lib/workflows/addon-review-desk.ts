import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import { tradeEditions, type TradeEdition } from '../program/trade-editions';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readOperatingSelection,
  assertOperatingSelectionCurrentNow,
  type OperatingSelectionView,
} from './operating-selection';
import {
  advancedHandoffKinds,
  type AdvancedHandoffInput,
  type AdvancedRequirements,
} from './advanced-handoffs';
import {
  readExternalProposalSource,
  externalProposalReferences,
} from './external-proposal-lifecycle';

export const addonReviewModes = {
  offline: 'Offline field operations',
  voice: 'Voice-to-Estimate',
  receptionist: 'Receptionist requirements',
  storm_network: 'Storm and Contractor Network',
  accounting: 'Accounting requirements',
  procurement: 'Procurement requirements',
  trade: 'Trade edition context',
} as const;
export interface AddonReviewInput {
  query: string;
  job_id: string;
  kind: AdvancedHandoffInput['kind'];
  edition: TradeEdition;
}
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error('Advanced review desk is OFF without explicit local admission');
}
function pin(input: AddonReviewInput) {
  const p = prototypeFields(input, ['query', 'job_id', 'kind', 'edition']);
  if (
    Object.keys(p).length !== 4 ||
    typeof p.query !== 'string' ||
    p.query.length > 100 ||
    typeof p.job_id !== 'string' ||
    p.job_id.length > 200 ||
    !advancedHandoffKinds.includes(p.kind as AdvancedHandoffInput['kind']) ||
    !tradeEditions.includes(p.edition as TradeEdition)
  )
    throw Error(
      'Exact bounded literal query, job, original mode and explicit edition required',
    );
  return {
    query: p.query,
    job_id: p.job_id,
    kind: p.kind,
    edition: p.edition,
  } as AddonReviewInput;
}
export interface AddonSourceReference {
  organization_id: string;
  customer_id: string;
  location_id: string;
  job_id: string;
  estimate_id: string;
  issued_version_id: string;
  saved_lock_revision: number;
  source_sha256: string;
  kind: AdvancedHandoffInput['kind'];
}
const sourceKeys = [
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'estimate_id',
  'issued_version_id',
  'saved_lock_revision',
  'source_sha256',
  'kind',
] as const;
function sourcePin(reference: AddonSourceReference) {
  const p = prototypeFields(reference, sourceKeys);
  if (
    Object.keys(p).length !== sourceKeys.length ||
    sourceKeys.some((k) =>
      k === 'saved_lock_revision'
        ? typeof p[k] !== 'number' ||
          !Number.isSafeInteger(p[k]) ||
          Number(p[k]) < 0
        : typeof p[k] !== 'string' ||
          !(p[k] as string).length ||
          (p[k] as string).length > 200,
    ) ||
    !advancedHandoffKinds.includes(p.kind as AdvancedHandoffInput['kind'])
  )
    throw Error('Exact own-data advanced source reference required');
  return JSON.stringify(Object.fromEntries(sourceKeys.map((k) => [k, p[k]])));
}
interface Binding {
  sources: OperatingSources;
  gate: JourneyAdmission;
  input: AddonReviewInput;
  signature: string;
  capture: ReturnType<typeof captureOperatingSources>;
  selection: OperatingSelectionView;
  requirements: Map<string, AdvancedRequirements>;
  held: boolean;
}
const views = new WeakMap<object, Binding>();
function current(b: Binding) {
  if (b.held)
    throw Error('UNKNOWN advanced evidence permits exact read only; no replay');
  try {
    admit(b.gate);
    if (JSON.stringify(pin(b.input)) !== b.signature)
      throw Error('Original advanced filters changed');
    b.capture.check();
    assertOperatingSelectionCurrentNow(b.selection);
    for (const requirement of b.requirements.values())
      externalProposalReferences(requirement);
  } catch (error) {
    b.held = true;
    throw error;
  }
}
/** Existing exact-source readers only. Reading never starts an engine/lifecycle attempt. */
export async function readAddonReviewDesk(
  sources: OperatingSources,
  input: AddonReviewInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const selected = pin(input),
    capture = captureOperatingSources(sources, gate);
  const selection = await readOperatingSelection(
    sources,
    { query: '', page: 0, page_size: 10 },
    gate,
  );
  const b: Binding = {
    sources,
    gate,
    input,
    signature: JSON.stringify(selected),
    capture,
    selection,
    requirements: new Map(),
    held: false,
  };
  current(b);
  if (selection.available !== selection.rows.length)
    throw Error('Finite exact prepared job coverage required');
  if (
    selected.job_id &&
    !selection.rows.some((r) => r.job_id === selected.job_id)
  )
    throw Error('Exact admitted advanced job required');
  const all = [];
  for (const row of selection.rows) {
    const entry = capture.entries.find((e) => e.target.job_id === row.job_id)!;
    const context: AdvancedHandoffInput = {
      job_id: row.job_id,
      kind: selected.kind,
      note: 'Read-only inspection of the existing exact source; no external proposal or action.',
      review_on: entry.day,
      manual_priority: 'normal',
      edition: selected.edition,
    };
    const source = await readExternalProposalSource(sources, context, gate);
    current(b);
    const refs = externalProposalReferences(source);
    b.requirements.set(row.job_id, source);
    const reference: AddonSourceReference = {
      organization_id: source.source.organization_id,
      customer_id: source.source.customer_id,
      location_id: source.source.location_id,
      job_id: source.source.job_id,
      estimate_id: source.source.estimate_id,
      issued_version_id: source.source.issued_version_id,
      saved_lock_revision: source.source.saved_lock_revision,
      source_sha256: source.source.source_sha256,
      kind: source.kind,
    };
    if (
      reference.organization_id !== row.organization_id ||
      reference.customer_id !== row.customer_id ||
      reference.location_id !== row.location_id ||
      reference.issued_version_id !== row.issued_version_id ||
      source.source.report_id !== entry.report_id ||
      source.source.published_version !== entry.published_version
    )
      throw Error('Original exact advanced source continuity required');
    all.push({
      reference,
      customer_label: row.customer_label,
      property_label: row.property_label,
      job_label: row.job_label,
      scope_summary: row.scope_summary,
      issued_version_number: source.source.issued_version_number,
      report_id: source.source.report_id,
      published_version: source.source.published_version,
      workflow: refs.workflow,
      requirements: source.gaps,
      included_scope: source.scope,
      recorded_time_ids: sources.estimates
        .readSyntheticPrototypeSources(entry.target)
        .workforce.entries.map((time) => time.id),
      catalog_state: source.catalog_links.state,
      original_engine_attempt: source.prior_attempt,
      original_lifecycle_hold:
        'NOT_OBSERVABLE_FROM_SOURCE_READ_USE_ORIGINAL_CONTROL' as const,
      read_context:
        'RECORDED_SCHEDULE_DATE_NOT_INCIDENT_OR_AVAILABILITY' as const,
    });
  }
  const query = selected.query.toLocaleLowerCase('en-US'),
    rows = all.filter(
      (r) =>
        (!selected.job_id || r.reference.job_id === selected.job_id) &&
        (!query ||
          [
            r.customer_label,
            r.property_label,
            r.job_label,
            r.scope_summary,
            r.report_id,
            ...Object.values(r.reference).map(String),
            ...Object.values(r.workflow).map(String),
            ...r.requirements,
            ...r.included_scope.flatMap((line) => [
              line.line_id,
              line.description,
              line.catalog_item_id ?? '',
            ]),
            ...r.recorded_time_ids,
          ].some((v) => v.toLocaleLowerCase('en-US').includes(query))),
    );
  const body = {
    mode: 'LOCAL_ADDON_REVIEW_DESK' as const,
    company: {
      id: sources.company.id,
      name: sources.company.name,
      industry: sources.company.industry,
    },
    filters: selected,
    available_jobs: all.length,
    matching_jobs: rows.length,
    available_modes: advancedHandoffKinds.length,
    job_options: all.map((r) => ({
      job_id: r.reference.job_id,
      label: r.job_label,
      property_label: r.property_label,
    })),
    rows,
    coverage: 'PREPARED_ADMITTED_SOURCES_NOT_COMPLETE_COMPANY_HISTORY' as const,
    operational_ready: false as const,
    authority: 'SOURCE_INSPECTION_ONLY_ORIGINAL_CONTROLS_UNCHANGED' as const,
  };
  const sha256 = await documentHash(body);
  current(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  views.set(view, b);
  return view;
}
export type AddonReviewView = Awaited<ReturnType<typeof readAddonReviewDesk>>;
export function assertAddonReviewCurrentNow(view: AddonReviewView) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained advanced desk required');
  current(b);
}
export interface AddonRecordReference {
  organization_id: string;
  customer_id: string;
  location_id: string;
  job_id: string;
  issued_version_id: string;
  source_sha256: string;
  kind:
    | 'issued'
    | 'report'
    | 'plan'
    | 'scheduled_visit'
    | 'published_visit'
    | 'time'
    | 'material';
  id: string;
  version: number | null;
}
const recordKeys = [
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'issued_version_id',
  'source_sha256',
  'kind',
  'id',
  'version',
] as const;
function recordPin(ref: AddonRecordReference) {
  const p = prototypeFields(ref, recordKeys);
  if (
    Object.keys(p).length !== recordKeys.length ||
    recordKeys.some((k) =>
      k === 'version'
        ? p[k] !== null &&
          (typeof p[k] !== 'number' ||
            !Number.isSafeInteger(p[k]) ||
            Number(p[k]) < 0)
        : typeof p[k] !== 'string' ||
          !(p[k] as string).length ||
          (p[k] as string).length > 200,
    ) ||
    ![
      'issued',
      'report',
      'plan',
      'scheduled_visit',
      'published_visit',
      'time',
      'material',
    ].includes(p.kind as string)
  )
    throw Error('Exact own-data recorded reference required');
  return JSON.stringify(Object.fromEntries(recordKeys.map((k) => [k, p[k]])));
}
interface DetailBinding {
  parent: Binding;
  source: AdvancedRequirements;
}
const details = new WeakMap<object, DetailBinding>();
function detailCurrent(b: DetailBinding) {
  current(b.parent);
  try {
    externalProposalReferences(b.source);
  } catch (error) {
    b.parent.held = true;
    throw error;
  }
}
export async function inspectAddonReviewSource(
  view: AddonReviewView,
  reference: AddonSourceReference,
) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained advanced desk required');
  current(b);
  const signature = sourcePin(reference),
    row = view.rows.find((r) => sourcePin(r.reference) === signature);
  if (!row) throw Error('Exact visible advanced source required');
  try {
    const source = b.requirements.get(row.reference.job_id)!,
      binding = { parent: b, source };
    detailCurrent(binding);
    const refs = externalProposalReferences(source),
      entry = b.capture.entries.find(
        (e) => e.target.job_id === source.source.job_id,
      )!,
      canonical = b.sources.estimates.readSyntheticPrototypeSources(
        entry.target,
      );
    const included = new Set(source.scope.map((l) => l.line_id));
    const materials = canonical.bundle.version.payload.lines
      .filter((l) => included.has(l.id) && l.kind === 'material')
      .map((l) => ({
        line_id: l.id,
        description: l.description,
        quantity_milli: l.quantity_milli,
        unit: l.unit,
        catalog_item_id: l.catalog_item_id,
      }));
    if (
      new Set(materials.map((l) => l.line_id)).size !== materials.length ||
      canonical.workforce.entries.some(
        (t) => t.job_id !== source.source.job_id,
      ) ||
      new Set(canonical.workforce.entries.map((t) => t.id)).size !==
        canonical.workforce.entries.length
    )
      throw Error('Unique exact recorded material/time identity required');
    const time = canonical.workforce.entries.map((t) => ({
      id: t.id,
      job_id: t.job_id,
      kind: t.kind,
      started_at: t.started_at,
      ended_at: t.ended_at,
      submitted: t.submitted,
    }));
    const context = {
      organization_id: source.source.organization_id,
      customer_id: source.source.customer_id,
      location_id: source.source.location_id,
      job_id: source.source.job_id,
      issued_version_id: source.source.issued_version_id,
      source_sha256: source.source.source_sha256,
    };
    const references: AddonRecordReference[] = [
      {
        ...context,
        kind: 'issued',
        id: source.source.issued_version_id,
        version: source.source.issued_version_number,
      },
      {
        ...context,
        kind: 'report',
        id: source.source.report_id,
        version: source.source.published_version,
      },
      {
        ...context,
        kind: 'plan',
        id: refs.workflow.plan_id!,
        version: refs.workflow.plan_revision,
      },
      {
        ...context,
        kind: 'scheduled_visit',
        id: refs.workflow.scheduled_visit_id!,
        version: refs.workflow.scheduled_visit_revision,
      },
      {
        ...context,
        kind: 'published_visit',
        id: refs.workflow.published_visit_id!,
        version: refs.workflow.published_visit_revision,
      },
      ...time.map((t) => ({
        ...context,
        kind: 'time' as const,
        id: t.id,
        version: null,
      })),
      ...materials.map((l) => ({
        ...context,
        kind: 'material' as const,
        id: l.line_id,
        version: null,
      })),
    ];
    references.forEach(recordPin);
    const body = {
      mode: 'LOCAL_ADDON_EXACT_SOURCE_INSPECTION' as const,
      reference: row.reference,
      company: view.company,
      job_label: row.job_label,
      customer_label: row.customer_label,
      property_label: row.property_label,
      requirements: source.gaps,
      source_references: refs,
      report: {
        report_id: source.source.report_id,
        published_version: source.source.published_version,
      },
      scope: source.scope,
      materials,
      time,
      references,
      catalog_links: source.catalog_links,
      original_engine_attempt: source.prior_attempt,
      original_lifecycle_hold: row.original_lifecycle_hold,
      edition: {
        company_industry: source.company.industry,
        human_selected_review_context: source.review_context.edition,
        company_changed: false as const,
      },
      missing_evidence: {
        provider: 'UNKNOWN',
        authenticated_sync: 'UNKNOWN',
        voice_recognition: 'NONE',
        supplier_bids: 'UNKNOWN',
        accounting_mapping: 'UNKNOWN',
        storm_incident: 'UNKNOWN',
        network_vetting: 'UNKNOWN',
        availability: 'UNKNOWN',
        physical_completion: 'UNKNOWN',
      },
      return_selection: view.filters,
      operational_ready: false as const,
      authority: 'STAFF_READ_ONLY_NOT_CUSTOMER_PROJECTION' as const,
    };
    const sha256 = await documentHash(body);
    detailCurrent(binding);
    if (sourcePin(reference) !== signature)
      throw Error('Original advanced source reference changed');
    const detail = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    details.set(detail, binding);
    return detail;
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export type AddonReviewDetail = Awaited<
  ReturnType<typeof inspectAddonReviewSource>
>;
export function assertAddonReviewDetailCurrentNow(detail: AddonReviewDetail) {
  const b = details.get(detail);
  if (!b) throw Error('Exact retained advanced inspection required');
  detailCurrent(b);
}
export async function inspectAddonReviewReference(
  detail: AddonReviewDetail,
  reference: AddonRecordReference,
) {
  assertAddonReviewDetailCurrentNow(detail);
  const b = details.get(detail)!,
    signature = recordPin(reference),
    record = detail.references.find((r) => recordPin(r) === signature);
  if (!record) throw Error('Exact visible recorded identity required');
  try {
    const body = {
      mode: 'LOCAL_ADDON_RECORDED_REFERENCE' as const,
      reference: record,
      meaning: 'EXACT_SOURCE_REFERENCE_NOT_VERIFICATION_OR_AUTHORITY' as const,
    };
    const sha256 = await documentHash(body);
    detailCurrent(b);
    if (recordPin(reference) !== signature)
      throw Error('Original recorded reference changed');
    return freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
  } catch (error) {
    b.parent.held = true;
    throw error;
  }
}
/** Same original source root. The unchanged C12 component owns every proposal and hold. */
export function openAddonOriginalControl(detail: AddonReviewDetail) {
  assertAddonReviewDetailCurrentNow(detail);
  return details.get(detail)!.parent.sources;
}
export function selectAddonReviewJob(detail: AddonReviewDetail) {
  assertAddonReviewDetailCurrentNow(detail);
  return detail.reference.job_id;
}
export function inspectAddonReviewDesk(view: AddonReviewView) {
  try {
    assertAddonReviewCurrentNow(view);
    return {
      status: 'CURRENT_SOURCE_INSPECTION_ONLY' as const,
      replay: false,
      replacement: null,
      operational_ready: false,
    };
  } catch {
    return {
      status: 'UNKNOWN' as const,
      replay: false,
      replacement: null,
      operational_ready: false,
    };
  }
}
