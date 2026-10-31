import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { prepareP1 } from '../p1-readiness.ts';
export type P1Plan = ReturnType<typeof prepareP1>;
export type P1Company = P1Plan['companies'][number];
export const approvedP1Hash =
  '01b96075d2f04acef730114427bc595986a1f0ce2720ed7fd3c9e84e304e141a';
export const sha256 = (s: string | Buffer) =>
  createHash('sha256').update(s).digest('hex');
export const canonical = (value: unknown): string => {
  const sort = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(sort)
      : x && typeof x === 'object'
        ? Object.fromEntries(
            Object.entries(x)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, sort(v)]),
          )
        : x;
  return JSON.stringify(sort(value));
};
export const digest = (v: unknown) => sha256(canonical(v));
export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const verified = new WeakSet<object>();
export interface FrozenP1 {
  readonly operationHash: string;
  readonly target: string;
  readonly plan: P1Plan;
  readonly activationSql: string;
  readonly cleanupSql: string;
}
/** Reading bytes is offline; the reviewed hash is integrity, never activation permission. */
export function loadP1Package(
  directory: string,
  target: string,
  expectedHash = approvedP1Hash,
): FrozenP1 {
  const supplied = resolve(directory);
  if (lstatSync(supplied).isSymbolicLink())
    throw Error('Private package path/target invalid');
  const root = realpathSync(supplied);
  if (
    realpathSync(root) !== root ||
    lstatSync(root).isSymbolicLink() ||
    !/^[a-z]{20}$/.test(target)
  )
    throw Error('Private package path/target invalid');
  const read = (file: string) => {
    const p = join(root, file),
      stat = lstatSync(p);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2097152)
      throw Error('Package artifact invalid');
    return readFileSync(p);
  };
  const raw = read('operation.private.json');
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || sha256(raw) !== expectedHash)
    throw Error('Operation hash mismatch');
  const operation = JSON.parse(raw.toString());
  const names = [
    'p1-plan.private.json',
    'activate-features.proposed.sql',
    'deactivate-features.proposed.sql',
    'p2-separate-review.private.json',
  ];
  if (
    operation.targetProjectRef !== target ||
    operation.files.length !== 4 ||
    operation.maximumWindowSeconds !== 1800 ||
    operation.fixtureSteps !== 75 ||
    operation.assertionRpcProbes !== 69 ||
    operation.domainRows !== 57 ||
    operation.featureRows !== 3 ||
    operation.customerMappings !== 0 ||
    operation.reportLeases !== 0 ||
    operation.providers !== false ||
    operation.media !== false ||
    operation.deployment !== false
  )
    throw Error('Operation scope mismatch');
  const files = new Map<string, Buffer>();
  for (const name of names) {
    const entries = operation.files.filter(
      (e: { file: string }) => e.file === name,
    );
    const bytes = read(name);
    if (entries.length !== 1 || sha256(bytes) !== entries[0].sha256)
      throw Error('Artifact hash mismatch');
    files.set(name, bytes);
  }
  const plan: P1Plan = JSON.parse(files.get(names[0])!.toString());
  if (
    plan.runKey !== operation.runKey ||
    plan.companies.length !== 3 ||
    new Set(plan.companies.map((c) => c.organization_id)).size !== 3 ||
    plan.scenarios.length !== 72 ||
    plan.positiveSteps !== 75 ||
    plan.originalRowCount !== plan.originalRows.length ||
    digest(plan.originalRows) !== plan.originalRowsSha256
  )
    throw Error('Plan scope mismatch');
  for (const c of plan.companies) {
    if (
      !isUuid(c.organization_id) ||
      c.steps.length !== 25 ||
      c.probes.length !== 23 ||
      c.idempotency.perStepDigests.some(
        (s, i) => s.id !== c.steps[i].id || s.sha256 !== digest(c.steps[i]),
      )
    )
      throw Error('Step digest mismatch');
  }
  const freeze = (x: unknown) => {
    if (x && typeof x === 'object') {
      Object.freeze(x);
      for (const v of Object.values(x)) freeze(v);
    }
  };
  freeze(plan);
  const p = Object.freeze({
    operationHash: expectedHash,
    target,
    plan,
    activationSql: files.get(names[1])!.toString(),
    cleanupSql: files.get(names[2])!.toString(),
  });
  verified.add(p);
  return p;
}
export function requireFrozen(p: FrozenP1) {
  if (!verified.has(p)) throw Error('Verified frozen package required');
}
/** Resolve only earlier exact scoped UUID receipts, never arbitrary object paths. */
export function resolveReferences(
  value: unknown,
  receipts: ReadonlyMap<string, { id: string } | string>,
): unknown {
  if (Array.isArray(value))
    return value.map((v) => resolveReferences(v, receipts));
  if (value && typeof value === 'object') {
    if ('result' in value || 'field' in value) {
      const r = value as { result: string; field: string };
      if (
        Object.keys(value).sort().join(',') !== 'field,result' ||
        !['id', '$value'].includes(r.field)
      )
        throw Error('Invalid result reference');
      const receipt = receipts.get(r.result);
      const id =
        r.field === '$value'
          ? receipt
          : typeof receipt === 'object'
            ? receipt.id
            : null;
      if (!isUuid(id)) throw Error('Unresolved scoped result');
      return id;
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        resolveReferences(v, receipts),
      ]),
    );
  }
  return value;
}
