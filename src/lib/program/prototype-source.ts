import { Phase3Repository } from '../phase3';
import { calculateEstimate } from '../../domain/estimating/calculation';
import { jobFinancials } from '../../domain/jobs/financials';
import { documentHash } from '../../domain/release/preview';

/** Same selector as the authoritative existing-engine synchronous sample read. */
export type PrototypeTarget = import('../phase3').SyntheticPrototypeReadTarget;
export interface PrototypeAdmission {
  enabled?: boolean;
  confirmed?: boolean;
}
export type Immutable<T> = T extends object
  ? { readonly [K in keyof T]: Immutable<T[K]> }
  : T;
export function freezePrototype<T>(value: T): Immutable<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezePrototype);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}
/** Strict own-data records only; caller getters/serializers are not evidence. */
export function prototypeFields(value: unknown, allowed: readonly string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(value))
  )
    throw Error('Plain local review input required');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== 'string' ||
        !allowed.includes(key) ||
        !Object.hasOwn(descriptors[key], 'value'),
    )
  )
    throw Error('Own primitive review fields required');
  return Object.fromEntries(
    Object.entries(descriptors).map(([key, d]) => [key, d.value]),
  ) as Record<string, unknown>;
}
function admission(value: PrototypeAdmission) {
  const p = prototypeFields(value, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error('Explicit enabled and confirmed local prototype only');
}
function target(value: PrototypeTarget): PrototypeTarget {
  const p = prototypeFields(value, [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ]);
  for (const key of [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
  ])
    if (
      typeof p[key] !== 'string' ||
      !p[key] ||
      (p[key] as string).length > 200
    )
      throw Error('Exact existing source identity required');
  if (
    p.job_id !== null &&
    (typeof p.job_id !== 'string' || !p.job_id || p.job_id.length > 200)
  )
    throw Error('Exact existing job or explicit null required');
  return p as unknown as PrototypeTarget;
}
function access(
  repo: Phase3Repository,
  t: PrototypeTarget,
  gate: PrototypeAdmission,
) {
  admission(gate);
  if (
    !(repo instanceof Phase3Repository) ||
    repo.sample !== true ||
    repo.operations.sample !== true
  )
    throw Error('Local synthetic repositories only');
  const members = repo.operations
    .syntheticMemberships(t.organization_id)
    .filter((m) => m.user_id === t.actor_id);
  if (
    members.length !== 1 ||
    members[0].active !== true ||
    !['owner', 'admin'].includes(members[0].role)
  )
    throw Error('Current synthetic owner/admin required');
  repo.operations.syntheticProperty(
    t.organization_id,
    t.customer_id,
    t.location_id,
  );
  return `${members[0].role}:${members[0].staff_type}`;
}
function capture(
  repo: Phase3Repository,
  t: PrototypeTarget,
  gate: PrototypeAdmission,
  role: string,
) {
  const check = () => {
    if (access(repo, t, gate) !== role) throw Error('Source access changed');
  };
  check();
  const { bundle, catalog, job, workforce } =
    repo.readSyntheticPrototypeSources(t);
  check();
  const { estimate, version } = bundle;
  if (
    estimate.organization_id !== t.organization_id ||
    estimate.id !== t.estimate_id ||
    estimate.customer_id !== t.customer_id ||
    estimate.status === 'archived' ||
    version.organization_id !== t.organization_id ||
    version.estimate_id !== t.estimate_id ||
    version.id !== t.version_id ||
    version.payload.customer_id !== t.customer_id ||
    version.payload.location_id !== t.location_id ||
    version.customer_snapshot.id !== t.customer_id ||
    (version.location_snapshot !== null &&
      version.location_snapshot.id !== t.location_id) ||
    !['draft', 'issued'].includes(version.status) ||
    JSON.stringify(
      calculateEstimate(
        version.payload,
        version.tax_policy_snapshot?.rate_bps ?? 0,
      ),
    ) !== JSON.stringify(version.calculation)
  )
    throw Error(
      'Exact canonical estimate/customer/property source unavailable',
    );
  if (
    catalog.some((c) => c.organization_id !== t.organization_id) ||
    new Set(catalog.map((c) => c.id)).size !== catalog.length
  )
    throw Error('Catalog source identity unavailable');
  if (workforce.workers.some((w) => w.organization_id !== t.organization_id))
    throw Error('Foreign workforce source denied');
  const financials = job ? jobFinancials(job) : null;
  const body = {
    mode: 'local-synthetic-review-only' as const,
    audience: 'current-synthetic-owner-admin' as const,
    property_snapshot:
      version.location_snapshot === null
        ? ('UNKNOWN' as const)
        : ('RECORDED' as const),
    target: { ...t },
    estimate: {
      id: estimate.id,
      current_version_id: estimate.current_version_id,
      version_id: version.id,
      version_number: version.version_number,
      lock_revision: version.lock_revision,
      status: version.status,
      project: {
        name: version.payload.project.name,
        type: version.payload.project.type,
        description: version.payload.project.description,
        start_on: version.payload.project.start_on,
        end_on: version.payload.project.end_on,
      },
      currency: version.calculation.currency,
      total_minor: version.calculation.total_minor,
      lines: version.payload.lines.map((line) => ({
        id: line.id,
        kind: line.kind,
        description: line.description,
        quantity_milli: line.quantity_milli,
        unit: line.unit,
        catalog_item_id: line.catalog_item_id,
        included:
          version.calculation.lines.find((x) => x.id === line.id)?.included ===
          true,
      })),
    },
    catalog: catalog
      .filter((c) => c.active)
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        kind: c.kind,
        unit: c.unit,
        vendor: c.vendor,
      })),
    job: job
      ? {
          id: job.id,
          lock_revision: job.lock_revision,
          issued_version_id: job.baseline.issued_version_id,
          currency: job.baseline.currency,
          financials,
          coverage: financials?.complete
            ? ('REPORTED_COMPLETE' as const)
            : ('PARTIAL' as const),
        }
      : null,
    workers: workforce.workers
      .filter((w) => w.active)
      .map((w) => ({ id: w.id, user_id: w.user_id })),
    time: workforce.entries
      .filter((e) => t.job_id !== null && e.job_id === t.job_id)
      .map((e) => ({
        id: e.id,
        worker_id: e.worker_id,
        job_id: e.job_id,
        kind: e.kind,
        started_at: e.started_at,
        ended_at: e.ended_at,
        submitted: e.submitted,
      })),
    authority: {
      save: false,
      issue: false,
      dispatch: false,
      communicate: false,
      financial: false,
      cross_tenant: false,
      hosted: false,
      genuine_authentication: 'UNVERIFIED' as const,
    },
    history_completeness: 'UNKNOWN' as const,
  };
  const fingerprint = JSON.stringify({
    bundle,
    catalog,
    job,
    workers: workforce.workers,
    entries: workforce.entries.filter(
      (e) => t.job_id !== null && e.job_id === t.job_id,
    ),
    reviews: workforce.reviews,
  });
  check();
  return { body, fingerprint };
}
export type PrototypeSource = Immutable<{
  snapshot: ReturnType<typeof capture>['body'];
  sha256: string;
}>;
const bindings = new WeakMap<
  object,
  {
    repo: Phase3Repository;
    target: PrototypeTarget;
    gate: PrototypeAdmission;
    role: string;
    fingerprint: string;
  }
>();

/** Narrow detached internal read projection over existing repositories. No route/store/writer. */
export async function readPrototypeSource(
  repo: Phase3Repository,
  input: PrototypeTarget,
  gate: PrototypeAdmission = {},
): Promise<PrototypeSource> {
  admission(gate); // OFF/withdrawn rejects before any repository read.
  const t = target(input);
  const role = access(repo, t, gate);
  const before = capture(repo, t, gate, role);
  const sha256 = await documentHash(before.body);
  access(repo, t, gate);
  const after = capture(repo, t, gate, role);
  if (before.fingerprint !== after.fingerprint)
    throw Error('Prototype source changed; reload exact evidence');
  const result = freezePrototype({ snapshot: before.body, sha256 });
  bindings.set(result, {
    repo,
    target: t,
    gate,
    role,
    fingerprint: before.fingerprint,
  });
  return result;
}
/** Exact read-only freshness check. Never captures a replacement or replays a command. */
export async function assertPrototypeSourceCurrent(source: PrototypeSource) {
  const binding = bindings.get(source);
  if (!binding) throw Error('Unknown prototype source; no imported authority');
  admission(binding.gate);
  if ((await documentHash(source.snapshot)) !== source.sha256)
    throw Error('Prototype integrity mismatch');
  const final = capture(
    binding.repo,
    binding.target,
    binding.gate,
    binding.role,
  );
  if (final.fingerprint !== binding.fingerprint)
    throw Error('Stale prototype source');
  if (access(binding.repo, binding.target, binding.gate) !== binding.role)
    throw Error('Source access changed');
}
