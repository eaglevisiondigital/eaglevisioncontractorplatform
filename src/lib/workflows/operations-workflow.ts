import { PropertyRepository } from '../property';
import { fieldWorkOrderBinding, type WorkOrder } from '../field-work-orders';
import {
  reviewOperationsExperiments,
  reconcileOperationsExperiment,
  type OperationsExperimentInput,
} from '../operations-experiments';
import {
  prepareStormNetworkReview,
  reconcileStormNetworkReview,
  type StormNetworkInput,
} from '../program/storm-network-review';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrent,
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
  type PrototypeSource,
  type PrototypeTarget,
  type PrototypeAdmission,
} from '../program/prototype-source';
import { documentHash } from '../../domain/release/preview';

export interface OperationsWorkflowInput {
  operations: OperationsExperimentInput;
  incident: StormNetworkInput;
}
function admit(gate: PrototypeAdmission) {
  const value = prototypeFields(gate, ['enabled', 'confirmed']);
  if (value.enabled !== true || value.confirmed !== true)
    throw Error(
      'Operations workflow is OFF without explicit current confirmation',
    );
}
function targetInput(input: PrototypeTarget) {
  const names = [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ];
  const value = prototypeFields(input, names);
  if (
    Object.keys(value).length !== names.length ||
    names.some(
      (name) =>
        typeof value[name] !== 'string' ||
        !value[name] ||
        (value[name] as string).length > 200,
    )
  )
    throw Error('Exact non-null existing Operations target required');
  return value as unknown as PrototypeTarget & { job_id: string };
}
/** Descriptor-only input fingerprint, not a business record or engine parser. */
function dataSignature(input: unknown) {
  let nodes = 0;
  const ownData = (value: unknown, depth: number): unknown => {
    if (++nodes > 20000 || depth > 16)
      throw Error('Bounded Operations input required');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.length > 10000) throw Error('Bounded primitive data required');
      return value;
    }
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (!value || typeof value !== 'object')
      throw Error('Primitive own-data input required');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (
        Object.getPrototypeOf(value) !== Array.prototype ||
        value.length > 512 ||
        Reflect.ownKeys(value).length !== value.length + 1
      )
        throw Error('Bounded plain data array required');
      return Array.from({ length: value.length }, (_, index) => {
        const row = descriptors[index];
        if (!row || !Object.hasOwn(row, 'value'))
          throw Error('Input accessors unavailable');
        return ownData(row.value, depth + 1);
      });
    }
    if (![null, Object.prototype].includes(Object.getPrototypeOf(value)))
      throw Error('Plain data input required');
    const keys = Reflect.ownKeys(value);
    if (
      keys.some(
        (key) =>
          typeof key !== 'string' ||
          !Object.hasOwn(descriptors[key as string], 'value'),
      )
    )
      throw Error('Input accessors or symbols unavailable');
    return Object.fromEntries(
      keys.map((key) => [
        key,
        ownData(descriptors[key as string].value, depth + 1),
      ]),
    );
  };
  const encoded = JSON.stringify(ownData(input, 0));
  if (encoded.length > 1000000)
    throw Error('Bounded Operations input required');
  return encoded;
}
function pinInput(input: OperationsWorkflowInput) {
  const fields = prototypeFields(input, ['operations', 'incident']);
  if (Object.keys(fields).length !== 2)
    throw Error('Exact Operations and incident inputs required');
  const signature = dataSignature(fields);
  return {
    operations: fields.operations as OperationsExperimentInput,
    incident: fields.incident as StormNetworkInput,
    signature,
  };
}
function assertTargetReferences(
  repo: PropertyRepository,
  target: PrototypeTarget & { job_id: string },
  input: OperationsExperimentInput,
) {
  const fields = prototypeFields(input, [
    'day',
    'timezone',
    'booking',
    'other_windows',
    'proposed_hours',
    'route',
    'capture',
  ]);
  const check = (value: unknown, names: string[]) => {
    const row = prototypeFields(value, names),
      display = fieldWorkOrderBinding(
        repo,
        target.organization_id,
        target.actor_id,
        row.order as WorkOrder,
      ),
      order = JSON.parse(display) as WorkOrder;
    if (
      order.source.organization_id !== target.organization_id ||
      order.source.job_id !== target.job_id ||
      order.source.estimate_id !== target.estimate_id ||
      order.source.issued_version_id !== target.version_id ||
      order.customer.id !== target.customer_id ||
      order.baseline_property?.id !== target.location_id
    )
      throw Error('Operations work order differs from exact target');
    if (
      row.visit_id !== null &&
      !order.visits.some(
        (visit) =>
          visit.id === row.visit_id &&
          visit.customer_id === target.customer_id &&
          visit.location_id === target.location_id,
      )
    )
      throw Error('Exact target property visit required');
  };
  check(fields.booking, ['order', 'worker_id', 'visit_id', 'start', 'end']);
  check(fields.capture, ['order', 'visit_id', 'note']);
  // The descriptor-only fingerprint has already checked these arrays and rows.
  for (const row of fields.route as unknown[])
    check(row, ['order', 'visit_id']);
  for (const row of fields.other_windows as unknown[])
    check(row, ['order', 'worker_id', 'visit_id', 'start', 'end']);
}
function propertyFence(repo: PropertyRepository, target: PrototypeTarget) {
  repo.operations.syntheticProperty(
    target.organization_id,
    target.customer_id,
    target.location_id,
  );
  const state = repo.read(target.organization_id);
  return JSON.stringify({
    plans: state.plans,
    visits: state.visits,
    reports: state.reports,
    assignments: repo.estimates.syntheticJobAssignments(
      target.organization_id,
      target.actor_id,
    ),
    memberships: repo.operations.syntheticMemberships(target.organization_id),
  });
}
const bindings = new WeakMap<
  object,
  {
    repo: PropertyRepository;
    target: PrototypeTarget & { job_id: string };
    originalTarget: PrototypeTarget;
    input: OperationsWorkflowInput;
    gate: PrototypeAdmission;
    targetSignature: string;
    inputSignature: string;
    source: PrototypeSource;
    operations: Awaited<ReturnType<typeof reviewOperationsExperiments>>;
    incident: Awaited<ReturnType<typeof prepareStormNetworkReview>>;
    propertyFence: string;
  }
>();
type Binding = NonNullable<ReturnType<typeof bindings.get>>;
function checkNow(binding: Binding) {
  admit(binding.gate);
  if (
    JSON.stringify(targetInput(binding.originalTarget)) !==
      binding.targetSignature ||
    pinInput(binding.input).signature !== binding.inputSignature
  )
    throw Error('Operations selection changed');
  assertPrototypeSourceCurrentNow(binding.source);
  assertTargetReferences(
    binding.repo,
    binding.target,
    binding.input.operations,
  );
  if (propertyFence(binding.repo, binding.target) !== binding.propertyFence)
    throw Error('Operations source relationships changed');
}
/** Compose the two existing engines over the same exact sources; no writer or UI. */
export async function readOperationsWorkflow(
  repo: PropertyRepository,
  target: PrototypeTarget,
  input: OperationsWorkflowInput,
  gate: PrototypeAdmission = {},
) {
  admit(gate);
  if (!(repo instanceof PropertyRepository))
    throw Error('Actual shared PropertyRepository required');
  const selected = targetInput(target),
    request = pinInput(input),
    targetSignature = JSON.stringify(selected);
  const checkInput = () => {
    admit(gate);
    if (
      JSON.stringify(targetInput(target)) !== targetSignature ||
      pinInput(input).signature !== request.signature
    )
      throw Error('Operations selection changed');
  };
  const source = await readPrototypeSource(repo.estimates, selected, gate);
  checkInput();
  assertTargetReferences(repo, selected, request.operations);
  const fence = propertyFence(repo, selected);
  const operations = await reviewOperationsExperiments(
    repo,
    selected.organization_id,
    selected.actor_id,
    request.operations,
    gate,
  );
  checkInput();
  const incident = await prepareStormNetworkReview(
    repo.estimates,
    target,
    request.incident,
    gate,
  );
  checkInput();
  if (
    incident.source.content_sha256 !== source.sha256 ||
    incident.source.job_id !== selected.job_id
  )
    throw Error('Incident and Operations source binding differs');
  const body = {
    mode: 'LOCAL_SYNTHETIC_OPERATIONS_COMPOSITION' as const,
    source: {
      organization_id: selected.organization_id,
      customer_id: selected.customer_id,
      location_id: selected.location_id,
      estimate_id: selected.estimate_id,
      issued_version_id: selected.version_id,
      job_id: selected.job_id,
      source_sha256: source.sha256,
    },
    operations,
    incident,
    linkage: {
      property_and_job: 'EXACT_EXISTING_SOURCE_REFERENCES' as const,
      contractor_network:
        'SOURCE_REFERENCE_ONLY_NOT_ENDORSEMENT_OR_ACCESS' as const,
      actual_availability: 'UNKNOWN' as const,
      workforce_currentness: 'CAPTURED_NOT_ATOMIC' as const,
      capacity_authority: 'UNVERIFIED' as const,
      offline_custody: 'SESSION_ONLY_NOT_DURABLE' as const,
      physical_completion: 'UNVERIFIED' as const,
    },
    authority: {
      book: false,
      schedule: false,
      dispatch: false,
      save: false,
      sync: false,
      replay: false,
      share: false,
      endorse: false,
      financial: false,
      communicate: false,
      hosted: false,
    },
  };
  const sha256 = await documentHash(body);
  checkInput();
  if (
    (await reconcileOperationsExperiment(operations)).state !==
      'CURRENT_REVIEW_ONLY' ||
    (await reconcileStormNetworkReview(incident)).state !==
      'CURRENT_REVIEW_ONLY'
  )
    throw Error('Current composed evidence UNKNOWN');
  checkInput();
  await assertPrototypeSourceCurrent(source);
  checkInput();
  const binding = {
    repo,
    target: selected,
    originalTarget: target,
    input,
    gate,
    targetSignature,
    inputSignature: request.signature,
    source,
    operations,
    incident,
    propertyFence: fence,
  };
  checkNow(binding);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256', sha256 },
  });
  bindings.set(view, binding);
  return view;
}
export type OperationsWorkflowView = Awaited<
  ReturnType<typeof readOperationsWorkflow>
>;
/** Exact read-only reconciliation; UNKNOWN never creates new IDs or resumes either engine. */
export async function reconcileOperationsWorkflow(
  view: OperationsWorkflowView,
) {
  const binding = bindings.get(view),
    base = { replacement: null, replay: 'FORBIDDEN' as const };
  if (!binding) return freezePrototype({ ...base, status: 'UNKNOWN' as const });
  try {
    checkNow(binding);
    const operations = await reconcileOperationsExperiment(binding.operations);
    const incident = await reconcileStormNetworkReview(binding.incident);
    if (
      operations.state !== 'CURRENT_REVIEW_ONLY' ||
      incident.state !== 'CURRENT_REVIEW_ONLY'
    )
      return freezePrototype({ ...base, status: 'UNKNOWN' as const });
    await assertPrototypeSourceCurrent(binding.source);
    checkNow(binding);
    return freezePrototype({
      ...base,
      status: 'CURRENT_TARGET_REVIEW_ONLY' as const,
    });
  } catch {
    return freezePrototype({ ...base, status: 'UNKNOWN' as const });
  }
}
