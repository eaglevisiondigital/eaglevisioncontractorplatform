import { prototypeFields } from '../program/prototype-source';
import type { SyncSourceReference } from './sync-admission-review';

export const offlineSourceFields = [
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'estimate_id',
  'issued_version_id',
  'source_sha256',
  'saved_lock_revision',
] as const;
export const offlineVisitFields = [
  'visit_id',
  'visit_revision',
  'plan_id',
  'plan_revision',
] as const;
export interface OfflineSourceProtocol {
  mode: 'OFFLINE_SOURCE_ADMISSION_V1';
  external_reference: string;
  source: Required<{
    [K in keyof SyncSourceReference]: NonNullable<SyncSourceReference[K]>;
  }>;
  visit: {
    visit_id: string;
    visit_revision: number;
    plan_id: string;
    plan_revision: number;
  };
}
/** Strict external proposal parser only. A reference or digest never authenticates its sender. */
export function parseOfflineSourceProtocol(
  value: unknown,
): OfflineSourceProtocol {
  const p = prototypeFields(value, [
      'mode',
      'external_reference',
      'source',
      'visit',
    ]),
    source = prototypeFields(p.source, offlineSourceFields),
    visit = prototypeFields(p.visit, offlineVisitFields);
  if (
    Object.keys(p).length !== 4 ||
    p.mode !== 'OFFLINE_SOURCE_ADMISSION_V1' ||
    typeof p.external_reference !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(p.external_reference) ||
    Object.keys(source).length !== 8 ||
    Object.keys(visit).length !== 4
  )
    throw Error('Exact finite offline source protocol required');
  for (const [key, val] of [
    ...Object.entries(source),
    ...Object.entries(visit),
  ]) {
    if (
      ['saved_lock_revision', 'visit_revision', 'plan_revision'].includes(key)
    ) {
      if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0)
        throw Error('Exact nonnegative saved native revision required');
    } else if (
      typeof val !== 'string' ||
      !val ||
      val !== val.trim() ||
      val.length > 200
    )
      throw Error('Exact non-null source identity required');
  }
  if (!/^[a-f0-9]{64}$/.test(String(source.source_sha256)))
    throw Error('Exact source digest required');
  // Discard the clone: executable proxies are not ordinary proposal data.
  // The original references and their live native guards remain authoritative.
  structuredClone(value);
  return {
    mode: 'OFFLINE_SOURCE_ADMISSION_V1',
    external_reference: p.external_reference,
    source: Object.fromEntries(
      offlineSourceFields.map((key) => [key, source[key]]),
    ) as unknown as OfflineSourceProtocol['source'],
    visit: Object.fromEntries(
      offlineVisitFields.map((key) => [key, visit[key]]),
    ) as unknown as OfflineSourceProtocol['visit'],
  };
}
