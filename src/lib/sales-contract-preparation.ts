import { documentHash, type ReleasePreview } from '../domain/release/preview';
import type { Contract, Signature } from '../domain/release/types';
import type { Phase3Repository } from './phase3';
import {
  captureSalesApprovedScopeReference,
  verifySalesApprovedScopeReference,
  type SalesApprovedScopeReference,
  type SalesHandoffTarget,
} from './sales-approval-handoff';

export const contractPreparationChecks = {
  scope:
    'I reviewed the exact issued scope, selected options and canonical totals.',
  preference:
    'I reviewed the accepted LOCAL-TEST preference and exact receipt.',
  terms:
    'I reviewed the recorded estimate terms and proposed dates; contract terms remain unverified.',
  boundaries:
    'This prepares a staff review snapshot only; no signing, delivery, work or payment authority.',
} as const;
export type ContractPreparationCheck = keyof typeof contractPreparationChecks;
export interface ContractPreparationReview {
  enabled: boolean;
  confirmed: boolean;
  reviewed_reference_hash: string;
  reviewed_scope_hash: string;
  checks: Record<ContractPreparationCheck, boolean>;
}
type Frozen<T> = T extends object
  ? { readonly [K in keyof T]: Frozen<T[K]> }
  : T;
interface PreparationContent {
  schema: 'sales-contract-preparation-v1';
  mode: 'local-synthetic-review-only';
  prepared_at: string;
  reviewer_id: string;
  reference: SalesApprovedScopeReference;
  checklist: Record<ContractPreparationCheck, true>;
  // Reuse existing preparation field names; never instantiate a Contract or Signature.
  missing_contract_evidence: Record<
    keyof Pick<Contract, 'legal_reference' | 'document_hash'>,
    'UNVERIFIED'
  >;
  missing_signature_evidence: Record<
    keyof Pick<
      Signature,
      | 'contract_id'
      | 'typed_name'
      | 'document_hash'
      | 'consent_version'
      | 'signed_at'
    >,
    'UNVERIFIED'
  >;
  genuine_identity: 'UNVERIFIED';
  delivery_and_custody: 'UNVERIFIED';
  contract_execution: 'BLOCKED';
}
export type SalesContractPreparation = Frozen<
  PreparationContent & {
    integrity: { algorithm: 'SHA-256'; sha256: string };
  }
>;
export interface ContractPreparationRead {
  status: 'current' | 'stale' | 'unknown';
  preparation_hash: string | null;
  reason: string;
  contract_execution: 'BLOCKED';
}

function data(value: unknown, depth = 0, count = { n: 0 }): unknown {
  if (++count.n > 12000 || depth > 20) throw Error('Bounded data required');
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getOwnPropertySymbols(value).length
  )
    throw Error('Own primitive data required');
  const names = Object.getOwnPropertyNames(value);
  if (Array.isArray(value)) {
    if (value.length > 500 || names.length !== value.length + 1)
      throw Error('Exact array required');
    return Array.from({ length: value.length }, (_, i) => {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (!d || !('value' in d)) throw Error('Own value required');
      return data(d.value, depth + 1, count);
    });
  }
  if (names.length > 40) throw Error('Bounded object required');
  const out: Record<string, unknown> = Object.create(null);
  for (const name of names.sort()) {
    const d = Object.getOwnPropertyDescriptor(value, name);
    if (!d || !('value' in d)) throw Error('Own value required');
    out[name] = data(d.value, depth + 1, count);
  }
  return out;
}
function exactKeys(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k))
  );
}
function targetData(selected: SalesHandoffTarget): SalesHandoffTarget {
  const target = data(selected);
  if (
    !exactKeys(target, [
      'organization_id',
      'actor_id',
      'estimate_id',
      'version_id',
      'customer_id',
      'location_id',
      'offer_id',
      'receipt_id',
    ]) ||
    Object.values(target).some(
      (v) => typeof v !== 'string' || v.length < 1 || v.length > 200,
    )
  )
    throw Error('Exact primitive source references required');
  return target as unknown as SalesHandoffTarget;
}
function reviewData(review: ContractPreparationReview) {
  const r = data(review);
  const keys = Object.keys(contractPreparationChecks);
  if (
    !exactKeys(r, [
      'enabled',
      'confirmed',
      'reviewed_reference_hash',
      'reviewed_scope_hash',
      'checks',
    ]) ||
    r.enabled !== true ||
    r.confirmed !== true ||
    !exactKeys(r.checks, keys) ||
    Object.values(r.checks).some((v) => v !== true) ||
    ![r.reviewed_reference_hash, r.reviewed_scope_hash].every(
      (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v),
    )
  )
    throw Error(
      'Explicit complete primitive checklist and reviewed hashes required',
    );
  return r as unknown as ContractPreparationReview;
}
function unchangedReview(
  review: ContractPreparationReview,
  pinned: ContractPreparationReview,
) {
  if (JSON.stringify(data(reviewData(review))) !== JSON.stringify(data(pinned)))
    throw Error('Review confirmation changed during preparation');
}
function freeze<T>(value: T): Frozen<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as Frozen<T>;
}
function content(
  reference: SalesApprovedScopeReference,
  prepared_at: string,
): PreparationContent {
  return {
    schema: 'sales-contract-preparation-v1',
    mode: 'local-synthetic-review-only',
    prepared_at,
    reviewer_id: reference.reviewer_id,
    reference,
    checklist: { scope: true, preference: true, terms: true, boundaries: true },
    missing_contract_evidence: {
      legal_reference: 'UNVERIFIED',
      document_hash: 'UNVERIFIED',
    },
    missing_signature_evidence: {
      contract_id: 'UNVERIFIED',
      typed_name: 'UNVERIFIED',
      document_hash: 'UNVERIFIED',
      consent_version: 'UNVERIFIED',
      signed_at: 'UNVERIFIED',
    },
    genuine_identity: 'UNVERIFIED',
    delivery_and_custody: 'UNVERIFIED',
    contract_execution: 'BLOCKED',
  };
}
/** No command/store/contract: explicit current-source staff review creates a detached snapshot. */
export async function prepareSalesContractReview(
  repo: Phase3Repository,
  release: ReleasePreview,
  selected: SalesHandoffTarget,
  retained: unknown,
  review: ContractPreparationReview,
): Promise<SalesContractPreparation> {
  const pinned = reviewData(review),
    target = targetData(selected),
    reference = data(retained);
  const verified = await verifySalesApprovedScopeReference(
    repo,
    release,
    target,
    reference,
  );
  unchangedReview(review, pinned);
  if (
    verified.status !== 'current' ||
    verified.reference_hash !== pinned.reviewed_reference_hash
  )
    throw Error(
      'Current exact reviewed reference required; UNKNOWN is read only',
    );
  const current = await captureSalesApprovedScopeReference(
    repo,
    release,
    target,
    true,
    pinned.reviewed_scope_hash,
  );
  unchangedReview(review, pinned);
  if (current.integrity.sha256 !== pinned.reviewed_reference_hash)
    throw Error('Exact retained source changed');
  const snapshot = data(
    content(current, new Date().toISOString()),
  ) as unknown as PreparationContent;
  const sha256 = await documentHash(snapshot);
  unchangedReview(review, pinned);
  const final = await verifySalesApprovedScopeReference(
    repo,
    release,
    target,
    current,
  );
  unchangedReview(review, pinned); // No await or caller callbacks after the final current-source read.
  if (
    final.status !== 'current' ||
    final.reference_hash !== current.integrity.sha256
  )
    throw Error('Source no longer current; UNKNOWN is read only');
  return freeze({ ...snapshot, integrity: { algorithm: 'SHA-256', sha256 } });
}
/** Exact read-only reconciliation; never prepare again, replace a source, sign or deliver. */
export async function verifySalesContractPreparation(
  repo: Phase3Repository,
  release: ReleasePreview,
  selected: SalesHandoffTarget,
  retained: unknown,
): Promise<ContractPreparationRead> {
  const unknown: ContractPreparationRead = {
    status: 'unknown',
    preparation_hash: null,
    reason:
      'UNKNOWN — exact preparation or source is unavailable, altered or denied. Read the same references only.',
    contract_execution: 'BLOCKED',
  };
  try {
    const target = targetData(selected),
      packet = data(retained);
    if (
      !exactKeys(packet, [
        ...Object.keys(content({} as SalesApprovedScopeReference, '')),
        'integrity',
      ]) ||
      typeof packet.prepared_at !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(packet.prepared_at) ||
      !Number.isFinite(Date.parse(packet.prepared_at)) ||
      new Date(packet.prepared_at).toISOString() !== packet.prepared_at ||
      packet.prepared_at > new Date().toISOString()
    )
      return unknown;
    const checked = await verifySalesApprovedScopeReference(
      repo,
      release,
      target,
      packet.reference,
    );
    if (checked.status === 'unknown') return unknown;
    const expected = content(
      packet.reference as SalesApprovedScopeReference,
      packet.prepared_at,
    );
    const sha256 = await documentHash(data(expected));
    if (
      JSON.stringify(packet) !==
      JSON.stringify(
        data({ ...expected, integrity: { algorithm: 'SHA-256', sha256 } }),
      )
    )
      return unknown;
    const final = await verifySalesApprovedScopeReference(
      repo,
      release,
      target,
      packet.reference,
    );
    if (
      final.status === 'unknown' ||
      final.reference_hash !== checked.reference_hash
    )
      return unknown;
    return {
      status: final.status,
      preparation_hash: sha256,
      reason:
        final.status === 'current'
          ? 'Exact preparation and original source are current. Legal execution, identity, signing, delivery and custody remain BLOCKED / UNVERIFIED.'
          : 'STALE — retained preparation is unchanged, but current version or expiry blocks further use. No newer source was substituted.',
      contract_execution: 'BLOCKED',
    };
  } catch {
    return unknown;
  }
}
