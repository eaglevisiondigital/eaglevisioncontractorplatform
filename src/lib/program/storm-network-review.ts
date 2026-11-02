import type { Phase3Repository } from '../phase3';
import {
  maintenanceDate,
  maintenancePriorities,
  type MaintenancePriority,
} from '../../domain/property/maintenance';
import { documentHash } from '../../domain/release/preview';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrent,
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
  type PrototypeAdmission,
  type PrototypeSource,
  type PrototypeTarget,
} from './prototype-source';

export const incidentConditions = [
  'ACCESS_OBSTRUCTION_REPORTED',
  'WATER_ENTRY_REPORTED',
  'EXPOSED_COMPONENT_REPORTED',
  'CONDITION_NOT_YET_ASSESSED',
] as const;
export type IncidentCondition = (typeof incidentConditions)[number];
export interface StormNetworkInput {
  incident_label: string;
  reported_on: string | null;
  manual_priority: MaintenancePriority;
  conditions: IncidentCondition[];
  scope_line_ids: string[];
  sharing_purpose: 'INTERNAL_COORDINATION_REVIEW';
}
function text(value: unknown, maximum: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw Error('Bounded primitive incident input required');
  return value;
}
function rows(value: unknown) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > 16 ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    throw Error('At most sixteen exact review rows required');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Array.from({ length: value.length }, (_, index) => {
    const row = descriptors[index];
    if (!row || !Object.hasOwn(row, 'value'))
      throw Error('Incident row accessors unavailable');
    return row.value as unknown;
  });
}
function admission(gate: PrototypeAdmission) {
  const value = prototypeFields(gate, ['enabled', 'confirmed']);
  if (value.enabled !== true || value.confirmed !== true)
    throw Error(
      'Storm/network review is OFF without explicit current confirmation',
    );
}
const targetKeys = [
  'organization_id',
  'actor_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'version_id',
  'job_id',
] as const;
function targetSignature(target: PrototypeTarget) {
  const value = prototypeFields(target, targetKeys);
  if (Object.keys(value).length !== targetKeys.length)
    throw Error('Exact incident source target required');
  return JSON.stringify(
    targetKeys.map((key) =>
      key === 'job_id' && value[key] === null ? null : text(value[key], 200),
    ),
  );
}
function pin(input: StormNetworkInput) {
  const value = prototypeFields(input, [
    'incident_label',
    'reported_on',
    'manual_priority',
    'conditions',
    'scope_line_ids',
    'sharing_purpose',
  ]);
  if (Object.keys(value).length !== 6)
    throw Error('Exact incident review fields required');
  const label = text(value.incident_label, 160).trim();
  if (
    !maintenancePriorities.includes(
      value.manual_priority as MaintenancePriority,
    )
  )
    throw Error('Explicit existing manual maintenance priority required');
  const reported =
    value.reported_on === null ? null : text(value.reported_on, 10);
  if (reported !== null) maintenanceDate(reported);
  const conditions = rows(value.conditions).map((condition) => {
    if (!incidentConditions.includes(condition as IncidentCondition))
      throw Error('Explicit supported reported condition required');
    return condition as IncidentCondition;
  });
  if (!conditions.length || new Set(conditions).size !== conditions.length)
    throw Error('Unique explicit reported conditions required');
  const lines = rows(value.scope_line_ids).map((id) => text(id, 200));
  if (new Set(lines).size !== lines.length)
    throw Error('Duplicate exact source line unavailable');
  if (value.sharing_purpose !== 'INTERNAL_COORDINATION_REVIEW')
    throw Error('Only same-tenant internal sharing review is available');
  const data = {
    incident_label: label,
    reported_on: reported,
    manual_priority: value.manual_priority as MaintenancePriority,
    conditions,
    scope_line_ids: lines,
    sharing_purpose: value.sharing_purpose,
  };
  return { data, signature: JSON.stringify(data) };
}
const tasks: Record<IncidentCondition, { label: string; limitation: string }> =
  {
    ACCESS_OBSTRUCTION_REPORTED: {
      label: 'Review the reported access obstruction',
      limitation: 'Human report only; access and safety are not verified',
    },
    WATER_ENTRY_REPORTED: {
      label: 'Review the reported water entry',
      limitation:
        'Human report only; cause, extent and repair scope are unknown',
    },
    EXPOSED_COMPONENT_REPORTED: {
      label: 'Review the reported exposed component',
      limitation:
        'Human report only; condition and work authority are unverified',
    },
    CONDITION_NOT_YET_ASSESSED: {
      label: 'Request an internal assessment review',
      limitation: 'No physical-condition determination is available',
    },
  };
const retained = new WeakMap<
  object,
  {
    source: PrototypeSource;
    target: PrototypeTarget;
    input: StormNetworkInput;
    gate: PrototypeAdmission;
    targetSignature: string;
    inputSignature: string;
  }
>();

/** Read-only local incident triage and minimal same-tenant sharing-content preview. */
export async function prepareStormNetworkReview(
  repo: Phase3Repository,
  target: PrototypeTarget,
  input: StormNetworkInput,
  gate: PrototypeAdmission = {},
) {
  admission(gate);
  const originalTarget = targetSignature(target),
    selected = pin(input);
  const checkInput = () => {
    admission(gate);
    if (
      targetSignature(target) !== originalTarget ||
      pin(input).signature !== selected.signature
    )
      throw Error('Incident source selection or human confirmation changed');
  };
  const source = await readPrototypeSource(repo, target, gate);
  checkInput();
  const snapshot = source.snapshot;
  const selectedLines = selected.data.scope_line_ids.map((id) => {
    const line = snapshot.estimate.lines.filter(
      (line) => line.id === id && line.included,
    );
    if (line.length !== 1)
      throw Error('Exact included source scope line required');
    return {
      line_id: id,
      kind: line[0].kind,
      description: line[0].description,
    };
  });
  const identity = {
    organization_id: snapshot.target.organization_id,
    customer_id: snapshot.target.customer_id,
    property_id: snapshot.target.location_id,
    estimate_id: snapshot.estimate.id,
    version_id: snapshot.estimate.version_id,
    version_number: snapshot.estimate.version_number,
    saved_lock_revision: snapshot.estimate.lock_revision,
    job_id: snapshot.job?.id ?? null,
    job_revision: snapshot.job?.lock_revision ?? null,
  };
  const body = {
    mode: 'LOCAL_SYNTHETIC_REVIEW_ONLY' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN' as const,
    source: { ...identity, content_sha256: source.sha256 },
    triage: {
      ...selected.data,
      priority_origin: 'EXPLICIT_HUMAN_SELECTION' as const,
      source_scope: selectedLines,
      review_tasks: selected.data.conditions.map((condition) => ({
        condition,
        ...tasks[condition],
        source_line_ids: selectedLines.map((line) => line.line_id),
        status: 'STAFF_REVIEW_PROPOSAL' as const,
      })),
      property_snapshot: snapshot.property_snapshot,
      scope_status: snapshot.estimate.status,
      job_association:
        snapshot.job === null
          ? ('NOT_SELECTED' as const)
          : ('EXACT_EXISTING_ISSUED_BASELINE' as const),
      physical_condition: 'UNVERIFIED' as const,
      completion: 'UNVERIFIED' as const,
      historical_coverage: 'UNKNOWN' as const,
    },
    sharing_preview: {
      audience: 'SAME_TENANT_INTERNAL_REVIEW_ONLY' as const,
      purpose: selected.data.sharing_purpose,
      recipient: null,
      content: {
        organization_id: identity.organization_id,
        property_id: identity.property_id,
        estimate_id: identity.estimate_id,
        version_id: identity.version_id,
        version_number: identity.version_number,
        saved_lock_revision: identity.saved_lock_revision,
        job_id: identity.job_id,
        job_revision: identity.job_revision,
        scope_line_ids: selectedLines.map((line) => line.line_id),
      },
      projection: 'STRICT_IDS_AND_REVISION_ALLOWLIST' as const,
      excluded: [
        'customer_identity',
        'addresses',
        'contacts',
        'workers',
        'notes',
        'costs',
        'margins',
        'amounts',
        'documents',
        'geography',
        'incident_details',
      ],
      delivery: 'BLOCKED' as const,
      partner_discovery: 'NOT_PERFORMED' as const,
      cross_tenant_access: 'BLOCKED' as const,
    },
    unverified: {
      weather_or_disaster: 'UNVERIFIED' as const,
      contractor_identity_and_vetting: 'UNVERIFIED' as const,
      safety_and_legal_acceptance: 'UNVERIFIED' as const,
      genuine_authentication: 'UNVERIFIED' as const,
      durable_custody: 'NOT_PROVIDED' as const,
    },
    authority: {
      save: false,
      dispatch: false,
      publish: false,
      share: false,
      discover: false,
      communicate: false,
      contract: false,
      financial: false,
      cross_tenant: false,
      hosted: false,
    },
  };
  const sha256 = await documentHash(body);
  checkInput();
  await assertPrototypeSourceCurrent(source);
  checkInput();
  assertPrototypeSourceCurrentNow(source);
  const result = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256', content_sha256: sha256 },
  });
  retained.set(result, {
    source,
    target,
    input,
    gate,
    targetSignature: originalTarget,
    inputSignature: selected.signature,
  });
  return result;
}
export type StormNetworkReview = Awaited<
  ReturnType<typeof prepareStormNetworkReview>
>;

/** Exact read-only check; never replaces a proposal or discovers another source. */
export async function reconcileStormNetworkReview(review: StormNetworkReview) {
  const binding = retained.get(review),
    base = { replacement: null, replay: 'FORBIDDEN' as const };
  if (!binding)
    return freezePrototype({
      ...base,
      state: 'UNKNOWN' as const,
      reason: 'EXACT_RETAINED_REVIEW_UNAVAILABLE' as const,
    });
  const checkInput = () => {
    admission(binding.gate);
    return (
      targetSignature(binding.target) === binding.targetSignature &&
      pin(binding.input).signature === binding.inputSignature
    );
  };
  try {
    if (!checkInput())
      return freezePrototype({
        ...base,
        state: 'STALE' as const,
        reason: 'HUMAN_SELECTION_CHANGED' as const,
      });
    await assertPrototypeSourceCurrent(binding.source);
    if (!checkInput())
      return freezePrototype({
        ...base,
        state: 'STALE' as const,
        reason: 'HUMAN_SELECTION_CHANGED' as const,
      });
    assertPrototypeSourceCurrentNow(binding.source);
    return freezePrototype({
      ...base,
      state: 'CURRENT_REVIEW_ONLY' as const,
      reason: 'EXACT_SOURCE_MATCH' as const,
    });
  } catch (error) {
    return freezePrototype({
      ...base,
      state:
        error instanceof Error && error.message === 'Stale prototype source'
          ? ('STALE' as const)
          : ('UNKNOWN' as const),
      reason: 'SOURCE_OR_CURRENT_ELIGIBILITY_UNAVAILABLE' as const,
    });
  }
}
