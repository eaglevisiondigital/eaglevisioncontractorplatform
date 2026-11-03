import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
  compareSavedRevisions,
  readSavedRevision,
  type SavedRevisionSnapshot,
  type SavedRevisionKind,
} from './saved-revision-runtime';
export const evidenceSchema = 'propel-local-saved-evidence-v1' as const;
export interface EvidenceRecipe<P> {
  readonly kind: SavedRevisionKind;
  readonly title: string;
  readonly read: (
    sources: OperatingSources,
    job: string,
    gate: JourneyAdmission,
  ) => Promise<SavedRevisionSnapshot<unknown>>;
  readonly project: (snapshot: SavedRevisionSnapshot<unknown>) => P;
  /** Exact bounded domain allowlist; return every and only accepted field. */
  readonly parse: (value: unknown, identity: EvidenceIdentity) => P;
  /** Synchronous ownership/history witness over the actual freshly read source. */
  readonly assertSource: (
    payload: P,
    current: SavedRevisionSnapshot<unknown>,
  ) => void;
}
export type EvidenceIdentity = Omit<
  SavedRevisionSnapshot<unknown>['identity'],
  'actor_id'
>;
export interface EvidenceEnvelope<P> {
  schema: typeof evidenceSchema;
  kind: SavedRevisionKind;
  identity: EvidenceIdentity;
  payload: P;
  sha256: string;
}
export interface SavedEvidenceFile<P> {
  readonly envelope: Readonly<EvidenceEnvelope<P>>;
  readonly text: string;
  readonly meaning: 'HISTORICAL_EVIDENCE_ONLY';
  readonly canonical_restore: false;
  readonly authority: false;
}
interface Binding<P> {
  snapshot: SavedRevisionSnapshot<unknown>;
  recipe: EvidenceRecipe<P>;
  sources: OperatingSources;
  job: string;
  gate: JourneyAdmission;
}
const files = new WeakMap<object, Binding<unknown>>();
export function evidenceFields(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const result = prototypeFields(value, [...keys]);
  if (Object.keys(result).length !== keys.length)
    throw Error('Exact evidence fields required');
  return result;
}
export function evidenceText(value: unknown, max = 2000): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    value.includes('\u0000')
  )
    throw Error('Bounded evidence text required');
  return value;
}
export function evidenceNumber(value: unknown, min = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < min)
    throw Error('Bounded evidence integer required');
  return Number(value);
}
export function evidenceList(value: unknown, max = 1000): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw Error('Bounded evidence list required');
  const d = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== value.length + 1 ||
    Array.from(
      { length: value.length },
      (_, i) => !Object.hasOwn(d[String(i)] ?? {}, 'value'),
    ).some(Boolean)
  )
    throw Error('Dense own evidence required');
  return Array.from({ length: value.length }, (_, i) => d[String(i)].value);
}
export function evidenceLiteral<const T extends string | boolean | null>(
  value: unknown,
  expected: T,
): T {
  if (value !== expected) throw Error('Exact evidence meaning required');
  return expected;
}
function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Local saved evidence is OFF');
}
function identity(snapshot: SavedRevisionSnapshot<unknown>): EvidenceIdentity {
  const {
    organization_id,
    customer_id,
    location_id,
    estimate_id,
    version_id,
    job_id,
  } = snapshot.identity;
  return {
    organization_id,
    customer_id,
    location_id,
    estimate_id,
    version_id,
    job_id,
  };
}
function exactIdentity(value: unknown): EvidenceIdentity {
  const keys = [
    'organization_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ] as const;
  const f = evidenceFields(value, keys);
  for (const key of keys)
    if (!evidenceText(f[key], 200)) throw Error('Exact source ID required');
  return f as unknown as EvidenceIdentity;
}
function data(value: unknown, depth = 0, budget = { n: 50000 }): unknown {
  if (--budget.n < 0 || depth > 30)
    throw Error('Bounded evidence tree required');
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value))
    return evidenceList(value, 10000).map((v) => data(v, depth + 1, budget));
  if (
    value &&
    typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    const keys = Reflect.ownKeys(value);
    if (keys.some((k) => typeof k !== 'string'))
      throw Error('Own data required');
    const f = evidenceFields(value, keys as string[]);
    return Object.fromEntries(
      (keys as string[]).map((k) => [k, data(f[k], depth + 1, budget)]),
    );
  }
  throw Error('Plain evidence data required');
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export async function decodeSavedEvidence<P>(
  text: string,
  recipe: EvidenceRecipe<P>,
): Promise<EvidenceEnvelope<P>> {
  if (
    typeof text !== 'string' ||
    new TextEncoder().encode(text).length > 1048576
  )
    throw Error('Exact bounded evidence file required');
  const raw: unknown = JSON.parse(text);
  if (JSON.stringify(raw) !== text)
    throw Error('Unmodified canonical evidence file required');
  const f = evidenceFields(raw, [
    'schema',
    'kind',
    'identity',
    'payload',
    'sha256',
  ]);
  if (
    f.schema !== evidenceSchema ||
    f.kind !== recipe.kind ||
    typeof f.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(f.sha256)
  )
    throw Error('Exact evidence schema/kind/integrity required');
  const safe = data(f.payload),
    payload = recipe.parse(safe, exactIdentity(f.identity));
  if (!same(payload, safe))
    throw Error('Strict complete domain allowlist required');
  const body = {
    schema: evidenceSchema,
    kind: recipe.kind,
    identity: exactIdentity(f.identity),
    payload,
  };
  if ((await documentHash(body)) !== f.sha256)
    throw Error('Evidence content integrity mismatch');
  return freezePrototype({ ...body, sha256: f.sha256 }) as EvidenceEnvelope<P>;
}
function bind<P>(
  envelope: EvidenceEnvelope<P>,
  text: string,
  b: Binding<P>,
): SavedEvidenceFile<P> {
  const file = Object.freeze({
    envelope,
    text,
    meaning: 'HISTORICAL_EVIDENCE_ONLY' as const,
    canonical_restore: false as const,
    authority: false as const,
  });
  files.set(file, b as Binding<unknown>);
  return file;
}
function sourceWitness<P>(
  recipe: EvidenceRecipe<P>,
  payload: P,
  current: SavedRevisionSnapshot<unknown>,
) {
  const result = (
    recipe.assertSource as (p: P, s: SavedRevisionSnapshot<unknown>) => unknown
  )(payload, current);
  if (result !== undefined) {
    void Promise.resolve(result).catch(() => undefined);
    throw Error('Synchronous canonical source witness required');
  }
  assertSavedRevisionCurrent(current);
}
function recipeCopy<P>(recipe: EvidenceRecipe<P>): EvidenceRecipe<P> {
  const r = evidenceFields(recipe, [
    'kind',
    'title',
    'read',
    'project',
    'parse',
  ]);
  if (
    !['field', 'finance', 'customer', 'maintenance', 'priorities'].includes(
      r.kind as string,
    ) ||
    !evidenceText(r.title, 100) ||
    ['read', 'project', 'parse', 'assertSource'].some(
      (k) => typeof r[k] !== 'function',
    )
  )
    throw Error('Trusted exact evidence recipe required');
  return Object.freeze({ ...r }) as unknown as EvidenceRecipe<P>;
}
async function boundRead<P>(
  sources: OperatingSources,
  job: string,
  recipe: EvidenceRecipe<P>,
  gate: JourneyAdmission,
) {
  const expected = await readSavedRevision(
    sources,
    job,
    recipe.kind,
    gate,
    () => ({ meaning: 'FILE_SOURCE_CONTEXT' }),
  );
  const snapshot = await recipe.read(sources, job, gate);
  assertSavedRevisionCurrent(expected);
  compareSavedRevisions(expected, snapshot);
  return snapshot;
}
/** Prepares downloadable bytes, NOT a durable filesystem acknowledgment. */
export async function prepareSavedEvidence<P>(
  sources: OperatingSources,
  job: string,
  recipe: EvidenceRecipe<P>,
  gate: JourneyAdmission,
): Promise<SavedEvidenceFile<P>> {
  admit(gate);
  recipe = recipeCopy(recipe);
  const snapshot = await boundRead(sources, job, recipe, gate);
  assertSavedRevisionCurrent(snapshot);
  if (snapshot.kind !== recipe.kind) throw Error('Exact source kind required');
  const safe = data(recipe.project(snapshot)),
    payload = recipe.parse(safe, identity(snapshot));
  if (!same(safe, payload))
    throw Error('Strict complete domain projection required');
  sourceWitness(recipe, payload, snapshot);
  const body = {
    schema: evidenceSchema,
    kind: recipe.kind,
    identity: identity(snapshot),
    payload,
  };
  const sha256 = await documentHash(body);
  assertSavedRevisionCurrent(snapshot);
  admit(gate);
  const text = JSON.stringify({ ...body, sha256 });
  const envelope = await decodeSavedEvidence(text, recipe);
  assertSavedRevisionCurrent(snapshot);
  admit(gate);
  sourceWitness(recipe, envelope.payload, snapshot);
  return bind(envelope, text, { snapshot, recipe, sources, job, gate });
}
/** File ownership comes from fresh canonical access, never a file's asserted IDs/hash. */
export async function openSavedEvidence<P>(
  sources: OperatingSources,
  job: string,
  recipe: EvidenceRecipe<P>,
  text: string,
  gate: JourneyAdmission,
): Promise<SavedEvidenceFile<P>> {
  admit(gate);
  recipe = recipeCopy(recipe);
  const snapshot = await boundRead(sources, job, recipe, gate);
  assertSavedRevisionCurrent(snapshot);
  const envelope = await decodeSavedEvidence(text, recipe);
  assertSavedRevisionCurrent(snapshot);
  admit(gate);
  if (
    snapshot.kind !== recipe.kind ||
    !same(identity(snapshot), envelope.identity)
  )
    throw Error('Exact authorized source ownership required');
  sourceWitness(recipe, envelope.payload, snapshot);
  return bind(envelope, text, { snapshot, recipe, sources, job, gate });
}
export function assertSavedEvidenceAccess<P>(file: SavedEvidenceFile<P>) {
  const b = files.get(file);
  if (!b) throw Error('Original opened evidence required');
  admit(b.gate);
  assertSavedRevisionCurrent(b.snapshot);
}
export async function reconcileSavedEvidence<P>(file: SavedEvidenceFile<P>) {
  const b = files.get(file) as Binding<P> | undefined;
  if (!b) throw Error('Original opened evidence required');
  admit(b.gate);
  assertSavedRevisionAccess(b.snapshot);
  const current = await b.recipe.read(b.sources, b.job, b.gate);
  compareSavedRevisions(b.snapshot, current);
  const payload = b.recipe.parse(
    data(b.recipe.project(current)),
    identity(current),
  );
  sourceWitness(b.recipe, file.envelope.payload, current);
  sourceWitness(b.recipe, payload, current);
  assertSavedRevisionCurrent(current);
  assertSavedRevisionAccess(b.snapshot);
  b.snapshot = current; // Read observation only; immutable file and original command holds unchanged.
  return Object.freeze({
    status: same(payload, file.envelope.payload)
      ? ('CURRENT_MATCH' as const)
      : ('STALE_SAVED_EVIDENCE' as const),
    meaning: 'EXACT_READ_ONLY_RECONCILIATION' as const,
    canonical_restore: false as const,
    authority: false as const,
  });
}
