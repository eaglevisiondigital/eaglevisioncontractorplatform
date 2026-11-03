import { documentHash } from '../../domain/release/preview';
import {
  freezePrototype,
  prototypeFields,
  type Immutable,
} from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { LocalJourney, JourneyAdmission } from './journey-runtime';

export type SavedRevisionKind =
  'field' | 'finance' | 'customer' | 'maintenance' | 'priorities';
export interface SavedRevisionIdentity {
  organization_id: string;
  actor_id: string;
  customer_id: string;
  location_id: string;
  estimate_id: string;
  version_id: string;
  job_id: string;
}
export interface SavedRevisionSnapshot<T> {
  readonly kind: SavedRevisionKind;
  readonly identity: Readonly<SavedRevisionIdentity>;
  readonly evidence: Immutable<T>;
  readonly sha256: string;
  readonly meaning: 'SAVED_SOURCE_READ_ONLY';
  readonly operational_ready: false;
}
interface Binding {
  sources: OperatingSources;
  gate: JourneyAdmission;
  entry: LocalJourney;
  capture: ReturnType<typeof captureOperatingSources>;
  immutable: string;
  access: string;
}
const snapshots = new WeakMap<object, Binding>();
function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Explicit local saved-source review required');
}
/** Reject executable/cyclic/sparse evidence before copying or hashing it. This is
 * a bounded presentation projection, never an estimate/property/business engine. */
function ownCopy(value: unknown): unknown {
  let remaining = 50000;
  const seen = new Set<object>();
  function copy(v: unknown, depth: number): unknown {
    if (--remaining < 0 || depth > 30)
      throw Error('Bounded source evidence required');
    if (
      v === undefined ||
      v === null ||
      typeof v === 'string' ||
      typeof v === 'boolean'
    )
      return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (
      !v ||
      typeof v !== 'object' ||
      seen.has(v) ||
      ![null, Object.prototype, Array.prototype].includes(
        Object.getPrototypeOf(v),
      )
    )
      throw Error('Plain source evidence required');
    const descriptors = Object.getOwnPropertyDescriptors(v),
      keys = Reflect.ownKeys(v);
    if (
      keys.some(
        (k) => typeof k !== 'string' || !Object.hasOwn(descriptors[k], 'value'),
      )
    )
      throw Error('Own-data evidence required');
    seen.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      if (
        keys.length !== v.length + 1 ||
        Array.from({ length: v.length }, (_, i) => descriptors[String(i)]).some(
          (d) => !d,
        )
      )
        throw Error('Dense evidence required');
      result = Array.from({ length: v.length }, (_, i) =>
        copy(descriptors[String(i)].value, depth + 1),
      );
    } else
      result = Object.fromEntries(
        (keys as string[]).map((k) => [
          k,
          copy(descriptors[k].value, depth + 1),
        ]),
      );
    seen.delete(v);
    return result;
  }
  return copy(value, 0);
}
function identity(entry: LocalJourney): SavedRevisionIdentity {
  const keys = [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ];
  const t = prototypeFields(entry.target, keys);
  if (
    Object.keys(t).length !== keys.length ||
    keys.some((k) => typeof t[k] !== 'string' || !(t[k] as string).length)
  )
    throw Error('Exact original source identity required');
  return t as unknown as SavedRevisionIdentity;
}
function access(sources: OperatingSources, t: SavedRevisionIdentity) {
  const own = sources.operations
    .syntheticMemberships(t.organization_id)
    .filter((m) => m.user_id === t.actor_id);
  if (
    own.length !== 1 ||
    !own[0].active ||
    !['owner', 'admin'].includes(own[0].role)
  )
    throw Error('Current eligible synthetic staff required');
  return JSON.stringify([own[0].role, own[0].staff_type]);
}
function immutable(entry: LocalJourney) {
  return JSON.stringify(
    ownCopy({ target: identity(entry), issued: entry.issued }),
  );
}
function original<T>(snapshot: SavedRevisionSnapshot<T>) {
  const b = snapshots.get(snapshot);
  if (!b) throw Error('Original immutable saved-source snapshot required');
  return b;
}
/** A known saved revision may stale old mutable evidence. Fresh access is checked
 * WITHOUT reviving the old capture or clearing any original action/UNKNOWN hold. */
export function assertSavedRevisionAccess<T>(
  snapshot: SavedRevisionSnapshot<T>,
) {
  const b = original(snapshot);
  admit(b.gate);
  const fresh = captureOperatingSources(b.sources, b.gate);
  const matches = fresh.entries.filter(
    (e) => e.target.job_id === snapshot.identity.job_id,
  );
  if (
    matches.length !== 1 ||
    matches[0] !== b.entry ||
    immutable(matches[0]) !== b.immutable ||
    access(b.sources, snapshot.identity) !== b.access
  )
    throw Error('Saved revision identity or access changed');
  fresh.check();
}
export function assertSavedRevisionCurrent<T>(
  snapshot: SavedRevisionSnapshot<T>,
) {
  const b = original(snapshot);
  admit(b.gate);
  b.capture.check();
  if (
    immutable(b.entry) !== b.immutable ||
    access(b.sources, snapshot.identity) !== b.access
  )
    throw Error('Immutable source or staff changed');
  b.capture.check();
}
/** Trusted application-owned projector must use original read APIs and return a
 * strict domain allowlist. This helper grants no command, callback or write port. */
export async function readSavedRevision<T>(
  sources: OperatingSources,
  jobId: string,
  kind: SavedRevisionKind,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
  project: (entry: LocalJourney) => T | Promise<T>,
): Promise<SavedRevisionSnapshot<T>> {
  admit(gate); // OFF before sources, selector or projector access.
  if (
    typeof jobId !== 'string' ||
    !jobId ||
    jobId.length > 200 ||
    !['field', 'finance', 'customer', 'maintenance', 'priorities'].includes(
      kind,
    )
  )
    throw Error('Exact saved-source selector required');
  const capture = captureOperatingSources(sources, gate),
    matches = capture.entries.filter((e) => e.target.job_id === jobId);
  if (matches.length !== 1 || typeof project !== 'function')
    throw Error('Exact authorized job and read projection required');
  const entry = matches[0],
    t = identity(entry),
    pin = immutable(entry),
    role = access(sources, t);
  capture.check();
  const evidence = ownCopy(await project(entry)) as T;
  capture.check();
  admit(gate);
  const sha256 = await documentHash({ kind, identity: t, evidence });
  capture.check();
  admit(gate);
  if (immutable(entry) !== pin || access(sources, t) !== role)
    throw Error('Source changed while reading saved evidence');
  const snapshot = freezePrototype({
    kind,
    identity: t,
    evidence,
    sha256,
    meaning: 'SAVED_SOURCE_READ_ONLY' as const,
    operational_ready: false as const,
  }) as SavedRevisionSnapshot<T>;
  snapshots.set(snapshot, {
    sources,
    gate,
    entry,
    capture,
    immutable: pin,
    access: role,
  });
  assertSavedRevisionCurrent(snapshot);
  return snapshot;
}
export interface SavedRevisionComparison<T> {
  readonly before: SavedRevisionSnapshot<T>;
  readonly current: SavedRevisionSnapshot<T>;
  readonly changed: boolean;
  readonly meaning: 'OBSERVED_DIFFERENCES_ONLY';
}
const comparisons = new WeakMap<object, { used: boolean }>();
export function compareSavedRevisions<T>(
  before: SavedRevisionSnapshot<T>,
  current: SavedRevisionSnapshot<T>,
): SavedRevisionComparison<T> {
  const a = original(before),
    b = original(current);
  assertSavedRevisionAccess(before);
  assertSavedRevisionCurrent(current);
  if (
    a.sources !== b.sources ||
    a.entry !== b.entry ||
    a.immutable !== b.immutable ||
    a.access !== b.access ||
    before.kind !== current.kind ||
    JSON.stringify(before.identity) !== JSON.stringify(current.identity)
  )
    throw Error('Same canonical source and immutable identity required');
  const view = Object.freeze({
    before,
    current,
    changed: before.sha256 !== current.sha256,
    meaning: 'OBSERVED_DIFFERENCES_ONLY' as const,
  });
  comparisons.set(view, { used: false });
  return view;
}
/** Opaque same-view presentation CAS only; not a business record or durable store. */
export interface SavedRevisionSelection<T> {
  readonly meaning: 'LOCAL_SAVED_REVIEW_SELECTION';
  readonly __type?: T;
}
const selections = new WeakMap<
  object,
  { snapshot: SavedRevisionSnapshot<unknown>; generation: number }
>();
export function createSavedRevisionSelection<T>(
  snapshot: SavedRevisionSnapshot<T>,
): SavedRevisionSelection<T> {
  assertSavedRevisionCurrent(snapshot);
  const selection = Object.freeze({
    meaning: 'LOCAL_SAVED_REVIEW_SELECTION' as const,
  });
  selections.set(selection, { snapshot, generation: 0 });
  return selection;
}
export function readSavedRevisionSelection<T>(
  selection: SavedRevisionSelection<T>,
) {
  const b = selections.get(selection);
  if (!b) throw Error('Original local review selection required');
  assertSavedRevisionAccess(b.snapshot);
  return Object.freeze({
    snapshot: b.snapshot as SavedRevisionSnapshot<T>,
    generation: b.generation,
  });
}
export function adoptSavedRevision<T>(
  selection: SavedRevisionSelection<T>,
  comparison: SavedRevisionComparison<T>,
  expectedGeneration: number,
  confirmed: boolean,
) {
  const s = selections.get(selection),
    c = comparisons.get(comparison);
  if (
    confirmed !== true ||
    !s ||
    !c ||
    c.used ||
    !Number.isSafeInteger(expectedGeneration) ||
    s.generation !== expectedGeneration ||
    s.snapshot !== comparison.before
  )
    throw Error(
      'Explicit current selection confirmation required; duplicate/stale adoption denied',
    );
  assertSavedRevisionAccess(comparison.before);
  assertSavedRevisionCurrent(comparison.current);
  c.used = true;
  s.snapshot = comparison.current;
  s.generation++;
  return readSavedRevisionSelection(selection);
}
