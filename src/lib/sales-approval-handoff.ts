import { Temporal } from '@js-temporal/polyfill';
import { estimateUnits } from '../domain/estimating/types';
import { customerPreview } from '../domain/estimating/customer-preview';
import { projectIssuedReview } from '../domain/customer/review';
import { documentHash, ReleasePreview } from '../domain/release/preview';
import type { Decision, SellingScope } from '../domain/release/types';
import type { Phase3Repository } from './phase3';

/** Exact caller-selected references only. Null means absent, never select latest. */
export interface SalesHandoffTarget {
  organization_id: string;
  actor_id: string;
  estimate_id: string;
  version_id: string;
  customer_id: string;
  location_id: string;
  offer_id: string | null;
  receipt_id: string | null;
}
export interface SalesApprovalHandoff {
  mode: 'local-synthetic-read-only';
  as_of: string;
  status: 'scope_matched' | 'blocked' | 'unknown';
  source: {
    organization_id: string;
    estimate_id: string;
    estimate_number: string;
    version_id: string;
    version_number: number;
    lock_revision: number;
    issued_at: string;
    customer_id: string;
    location_id: string;
    scope: SellingScope;
    scope_hash: string;
  } | null;
  offer: { id: string; created_at: string; expires_at: string } | null;
  receipt: {
    id: string;
    offer_id: string;
    decision: Decision['decision'];
    consent_version: 'internal-test-v1';
    recorded_at: string;
  } | null;
  blockers: string[];
  contract_execution: 'BLOCKED';
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const text = (v: unknown): v is string => typeof v === 'string';
const reference = (v: unknown): v is string =>
  text(v) && v.length > 0 && v.length <= 200;
const nullableText = (v: unknown) => v === null || text(v);
function timestamp(v: unknown): v is string {
  return (
    text(v) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString() === v
  );
}
function dateOrNull(value: unknown) {
  if (value === null) return true;
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    Temporal.PlainDate.from(value, { overflow: 'reject' });
    return true;
  } catch {
    return false;
  }
}
function staff(repo: Phase3Repository, target: SalesHandoffTarget) {
  if (!repo.operations.sample) throw Error('Local synthetic evidence only');
  const member = repo.operations
    .syntheticMemberships(target.organization_id)
    .find(
      (m) =>
        m.organization_id === target.organization_id &&
        m.user_id === target.actor_id &&
        m.active === true,
    );
  if (
    !member ||
    !(
      member.role === 'owner' ||
      member.role === 'admin' ||
      (member.role === 'staff' &&
        (member.staff_type === 'estimator' ||
          member.staff_type === 'office_manager'))
    )
  )
    throw Error('Current estimating staff required');
  repo.operations.syntheticProperty(
    target.organization_id,
    target.customer_id,
    target.location_id,
  );
}
/** Reconstruct every nested field; future internal fields never cross this boundary. */
function admitScope(scope: ReturnType<typeof customerPreview>) {
  const stringFields = (value: object, keys: string[]) =>
    keys.every((k) => text((value as Record<string, unknown>)[k]));
  const money = (v: unknown): v is number =>
    typeof v === 'number' &&
    Number.isSafeInteger(v) &&
    v >= 0 &&
    v <= 9_000_000_000_000;
  if (
    !stringFields(scope.company, [
      'name',
      'primary_color',
      'accent_color',
      'business_address',
      'contact_email',
      'contact_phone',
      'website',
    ]) ||
    !nullableText(scope.company.logo_document_id) ||
    !stringFields(scope.customer, ['id', 'display_name']) ||
    !nullableText(scope.customer.email) ||
    !nullableText(scope.customer.phone) ||
    !scope.location ||
    !stringFields(scope.location, [
      'id',
      'address_line1',
      'city',
      'region',
      'postal_code',
      'country_code',
    ]) ||
    !stringFields(scope.project, ['name', 'type', 'description']) ||
    !dateOrNull(scope.project.start_on) ||
    !dateOrNull(scope.project.end_on) ||
    !text(scope.currency) ||
    !/^[A-Z]{3}$/.test(scope.currency) ||
    !text(scope.expires_on) ||
    !dateOrNull(scope.expires_on) ||
    !text(scope.notes) ||
    !text(scope.terms) ||
    ![
      scope.subtotal_minor,
      scope.discount_minor,
      scope.tax_minor,
      scope.total_minor,
    ].every(money) ||
    !Array.isArray(scope.lines) ||
    scope.lines.length > 500 ||
    !scope.lines.every(
      (l) =>
        text(l.description) &&
        l.description.length <= 2000 &&
        typeof l.quantity_milli === 'number' &&
        Number.isSafeInteger(l.quantity_milli) &&
        l.quantity_milli > 0 &&
        estimateUnits.includes(l.unit) &&
        money(l.amount_minor),
    ) ||
    !Array.isArray(scope.attachments) ||
    scope.attachments.length > 500 ||
    !scope.attachments.every((a) =>
      stringFields(a, ['display_name', 'content_type']),
    ) ||
    !Array.isArray(scope.schedule) ||
    scope.schedule.length > 500 ||
    !scope.schedule.every(
      (s) => text(s.label) && dateOrNull(s.due_on) && money(s.amount_minor),
    )
  )
    throw Error('Primitive selling scope required');
  // Admission does not recalculate: canonical issued projections remain authoritative.
  return {
    company: {
      name: scope.company.name,
      primary_color: scope.company.primary_color,
      accent_color: scope.company.accent_color,
      business_address: scope.company.business_address,
      contact_email: scope.company.contact_email,
      contact_phone: scope.company.contact_phone,
      website: scope.company.website,
      logo_document_id: scope.company.logo_document_id,
    },
    customer: {
      id: scope.customer.id,
      display_name: scope.customer.display_name,
      email: scope.customer.email,
      phone: scope.customer.phone,
    },
    location: {
      id: scope.location.id,
      address_line1: scope.location.address_line1,
      city: scope.location.city,
      region: scope.location.region,
      postal_code: scope.location.postal_code,
      country_code: scope.location.country_code,
    },
    project: {
      name: scope.project.name,
      type: scope.project.type,
      description: scope.project.description,
      start_on: scope.project.start_on,
      end_on: scope.project.end_on,
    },
    currency: scope.currency,
    expires_on: scope.expires_on,
    notes: scope.notes,
    terms: scope.terms,
    lines: scope.lines.map((l) => ({
      description: l.description,
      quantity_milli: l.quantity_milli,
      unit: l.unit,
      amount_minor: l.amount_minor,
    })),
    subtotal_minor: scope.subtotal_minor,
    discount_minor: scope.discount_minor,
    tax_minor: scope.tax_minor,
    total_minor: scope.total_minor,
    schedule: scope.schedule.map((s) => ({
      label: s.label,
      amount_minor: s.amount_minor,
      due_on: s.due_on,
    })),
    attachments: scope.attachments.map((a) => ({
      display_name: a.display_name,
      content_type: a.content_type,
    })),
  };
}

/** Unwired inspection of existing repositories; no commands, storage or downstream authority. */
export async function readSalesApprovalHandoff(
  repo: Phase3Repository,
  release: ReleasePreview,
  selected: SalesHandoffTarget,
): Promise<SalesApprovalHandoff> {
  const result: SalesApprovalHandoff = {
    mode: 'local-synthetic-read-only',
    as_of: new Date().toISOString(),
    status: 'unknown',
    source: null,
    receipt: null,
    offer: null,
    blockers: [],
    contract_execution: 'BLOCKED',
  };
  try {
    const target = structuredClone(selected);
    if (
      Object.keys(target).length !== 8 ||
      ![
        'organization_id',
        'actor_id',
        'estimate_id',
        'version_id',
        'customer_id',
        'location_id',
      ].every((k) => reference(target[k as keyof SalesHandoffTarget])) ||
      ![target.offer_id, target.receipt_id].every(
        (v) => v === null || reference(v),
      )
    )
      throw Error('Exact target required');
    staff(repo, target);
    if (
      !(release instanceof ReleasePreview) ||
      release.organizationId !== target.organization_id
    )
      throw Error('Existing local offer engine required');
    const read = () =>
      Promise.all([
        repo.get(target.organization_id, target.estimate_id, target.version_id),
        repo.get(target.organization_id, target.estimate_id),
      ]);
    const [source, current] = await read();
    staff(repo, target);
    const version = source.version;
    if (
      current.estimate.organization_id !== target.organization_id ||
      current.estimate.customer_id !== target.customer_id ||
      current.estimate.id !== target.estimate_id ||
      current.version.organization_id !== target.organization_id ||
      current.version.estimate_id !== target.estimate_id ||
      current.estimate.current_version_id !== current.version.id ||
      source.estimate.organization_id !== target.organization_id ||
      source.estimate.customer_id !== target.customer_id ||
      source.estimate.id !== target.estimate_id ||
      !reference(source.estimate.estimate_number) ||
      version.id !== target.version_id ||
      version.estimate_id !== target.estimate_id ||
      version.customer_snapshot.id !== target.customer_id ||
      version.location_snapshot?.id !== target.location_id ||
      !Number.isSafeInteger(version.lock_revision) ||
      version.lock_revision < 1 ||
      !Number.isSafeInteger(version.version_number) ||
      version.version_number < 1 ||
      !timestamp(version.issued_at) ||
      !same(release.version, version)
    )
      throw Error('Exact issued source required');
    projectIssuedReview(version, {
      organization_id: target.organization_id,
      customer_id: target.customer_id,
      location_id: target.location_id,
      version_ids: [target.version_id],
      company_name: '',
      primary_color: '',
      property_label: '',
      reports: false,
    });
    const scope: SellingScope = {
      ...admitScope(customerPreview(version)),
      internal_test: true,
    };
    const workspace = release.read('staff');
    if (workspace.internal_test !== true || workspace.actor !== 'staff')
      throw Error('Existing test evidence required');
    const offers = workspace.release_offers.filter(
      (o) => o.id === target.offer_id,
    );
    const offer = offers[0];
    if (
      offers.length > 1 ||
      workspace.release_offers.filter((o) => o.version_id === target.version_id)
        .length > 1 ||
      (offer &&
        (offer.organization_id !== target.organization_id ||
          offer.customer_id !== target.customer_id ||
          offer.version_id !== target.version_id ||
          !same(offer.snapshot, scope) ||
          !timestamp(offer.created_at) ||
          !timestamp(offer.expires_at) ||
          offer.created_at < version.issued_at ||
          offer.expires_at <= offer.created_at))
    )
      throw Error('Offer mismatch');
    const receipts = workspace.release_decisions.filter(
      (d) => d.id === target.receipt_id,
    );
    const receipt = receipts[0];
    if (
      receipts.length > 1 ||
      (receipt &&
        (!offer ||
          receipt.organization_id !== target.organization_id ||
          receipt.customer_id !== target.customer_id ||
          receipt.offer_id !== offer.id ||
          receipt.consent_version !== 'internal-test-v1' ||
          !timestamp(receipt.created_at) ||
          receipt.created_at < offer.created_at ||
          receipt.created_at >= offer.expires_at ||
          !['accepted', 'declined', 'changes_requested'].some(
            (d) => receipt.decision === d,
          ))) ||
      (offer &&
        workspace.release_decisions.filter((d) => d.offer_id === offer.id)
          .length > 1)
    )
      throw Error('Receipt mismatch');
    const hash = await documentHash(scope);
    const [freshSource, freshCurrent] = await read();
    staff(repo, target); // After the last await: revoke/hide before returning any scope.
    if (
      !same(source, freshSource) ||
      !same(current, freshCurrent) ||
      !same(release.version, version) ||
      !same(workspace, release.read('staff'))
    )
      throw Error('Evidence changed during read');
    result.as_of = new Date().toISOString();
    if (
      version.issued_at > result.as_of ||
      (offer && offer.created_at > result.as_of) ||
      (receipt && receipt.created_at > result.as_of)
    )
      throw Error('Future evidence unavailable');
    result.source = {
      organization_id: target.organization_id,
      estimate_id: target.estimate_id,
      estimate_number: source.estimate.estimate_number,
      version_id: target.version_id,
      version_number: version.version_number,
      lock_revision: version.lock_revision,
      issued_at: version.issued_at,
      customer_id: target.customer_id,
      location_id: target.location_id,
      scope,
      scope_hash: hash,
    };
    if (offer)
      result.offer = {
        id: offer.id,
        created_at: offer.created_at,
        expires_at: offer.expires_at,
      };
    if (receipt)
      result.receipt = {
        id: receipt.id,
        offer_id: receipt.offer_id,
        decision: receipt.decision,
        consent_version: 'internal-test-v1',
        recorded_at: receipt.created_at,
      };
    if (
      current.version.id !== version.id ||
      current.estimate.current_version_id !== version.id ||
      current.version.status !== 'issued' ||
      current.estimate.status !== 'issued'
    )
      result.blockers.push(
        'Stale source: this exact issued version is no longer the current issued estimate.',
      );
    if (
      version.payload.expires_on < result.as_of.slice(0, 10) ||
      (offer && offer.expires_at <= result.as_of)
    )
      result.blockers.push(
        'Expired scope or offer: retained preference does not renew it.',
      );
    if (!offer)
      result.blockers.push(
        'Missing exact offer evidence. No replacement offer is selected.',
      );
    if (!receipt)
      result.blockers.push(
        'UNKNOWN customer preference: missing exact receipt. Read only; do not replay or select a replacement.',
      );
    else if (receipt.decision === 'declined')
      result.blockers.push('Customer declined this exact offer.');
    else if (receipt.decision === 'changes_requested')
      result.blockers.push('Customer requested changes to this exact offer.');
    result.status = result.blockers.length ? 'blocked' : 'scope_matched';
    result.blockers.push(
      'Contract terms and jurisdiction/template review: UNVERIFIED.',
      'Genuine customer identity, signing consent and signature evidence: UNVERIFIED.',
      'Customer delivery and operational command custody: UNVERIFIED.',
    );
    return structuredClone(result);
  } catch {
    return {
      ...result,
      status: 'unknown',
      source: null,
      receipt: null,
      offer: null,
      blockers: [
        'UNKNOWN: exact evidence is missing, denied, conflicting or changed. Reload the same references for read-only inspection; do not replay or replace them.',
      ],
    };
  }
}

type Frozen<T> = T extends object
  ? { readonly [K in keyof T]: Frozen<T[K]> }
  : T;
interface ApprovedScopeContent {
  schema: 'sales-approved-scope-reference-v1';
  mode: 'local-synthetic-read-only';
  reviewer_id: string;
  source: NonNullable<SalesApprovalHandoff['source']>;
  offer: NonNullable<SalesApprovalHandoff['offer']>;
  receipt: NonNullable<SalesApprovalHandoff['receipt']> & {
    decision: 'accepted';
  };
  contract_execution: 'BLOCKED';
}
/** A detached evidence reference, not an approval record, contract or custody receipt. */
export type SalesApprovedScopeReference = Frozen<
  ApprovedScopeContent & {
    integrity: { algorithm: 'SHA-256'; sha256: string };
  }
>;
export interface SalesScopeReferenceRead {
  status: 'current' | 'stale' | 'unknown';
  as_of: string;
  reference_hash: string | null;
  reason: string;
  contract_execution: 'BLOCKED';
}
function freeze<T>(value: T): Frozen<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => freeze(v));
    Object.freeze(value);
  }
  return value as Frozen<T>;
}
function contentFromHandoff(
  value: SalesApprovalHandoff,
  actor: string,
): ApprovedScopeContent {
  if (!value.source || !value.offer || value.receipt?.decision !== 'accepted')
    throw Error('Exact accepted test preference and issued scope required');
  return {
    schema: 'sales-approved-scope-reference-v1',
    mode: 'local-synthetic-read-only',
    reviewer_id: actor,
    source: structuredClone(value.source),
    offer: structuredClone(value.offer),
    receipt: { ...value.receipt, decision: 'accepted' },
    contract_execution: 'BLOCKED',
  };
}
/** Copy data descriptors only; ignore inherited serializers and never execute getters. */
function retainedData(value: unknown): unknown {
  let nodes = 0;
  const copy = (v: unknown, depth: number): unknown => {
    if (++nodes > 10000 || depth > 16)
      throw Error('Bounded reference required');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isSafeInteger(v)) return v;
    if (typeof v !== 'object' || !v || Object.getOwnPropertySymbols(v).length)
      throw Error('Primitive reference data required');
    const names = Object.getOwnPropertyNames(v);
    if (Array.isArray(v)) {
      if (v.length > 500 || names.length !== v.length + 1)
        throw Error('Exact array required');
      return Array.from({ length: v.length }, (_, i) => {
        const descriptor = Object.getOwnPropertyDescriptor(v, String(i));
        if (!descriptor || !('value' in descriptor))
          throw Error('Own array value required');
        return copy(descriptor.value, depth + 1);
      });
    }
    if (names.length > 30) throw Error('Exact reference required');
    const result: Record<string, unknown> = Object.create(null);
    for (const key of names) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!descriptor || !('value' in descriptor))
        throw Error('Own data required');
      result[key] = copy(descriptor.value, depth + 1);
    }
    return result;
  };
  return copy(value, 0);
}
/** Same primitive content regardless of property insertion order; never call toJSON. */
function identicalData(actual: unknown, expected: unknown): boolean {
  if (actual === null || expected === null || typeof expected !== 'object')
    return actual === expected;
  if (typeof actual !== 'object' || actual === null) return false;
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, i) => identicalData(actual[i], item))
    );
  if (Array.isArray(actual)) return false;
  const keys = Object.keys(expected);
  return (
    Object.keys(actual).length === keys.length &&
    keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(actual, key);
      return (
        !!descriptor &&
        'value' in descriptor &&
        identicalData(
          descriptor.value,
          (expected as Record<string, unknown>)[key],
        )
      );
    })
  );
}
/** Explicit same-session review-only capture over existing exact source readers. No writer. */
export async function captureSalesApprovedScopeReference(
  repo: Phase3Repository,
  release: ReleasePreview,
  selected: SalesHandoffTarget,
  confirmed: boolean,
  reviewedScopeHash: string,
): Promise<SalesApprovedScopeReference> {
  if (confirmed !== true)
    throw Error('Explicit review-only confirmation required');
  if (!text(reviewedScopeHash) || !/^[0-9a-f]{64}$/.test(reviewedScopeHash))
    throw Error('Exact reviewed scope hash required');
  const target = structuredClone(selected);
  const read = await readSalesApprovalHandoff(repo, release, target);
  if (
    read.status !== 'scope_matched' ||
    read.source?.scope_hash !== reviewedScopeHash
  )
    throw Error('Current exact accepted test preference required');
  const content = contentFromHandoff(read, target.actor_id);
  const sha256 = await documentHash(content);
  // Hashing yields: perform an independent full exact read after it, then no more awaits.
  const fresh = await readSalesApprovalHandoff(repo, release, target);
  staff(repo, target);
  if (
    fresh.status !== 'scope_matched' ||
    !identicalData(contentFromHandoff(fresh, target.actor_id), content)
  )
    throw Error('Evidence changed while retaining the reference');
  return freeze({ ...content, integrity: { algorithm: 'SHA-256', sha256 } });
}
/** Verify the exact retained content against current original sources; no replay/replacement. */
export async function verifySalesApprovedScopeReference(
  repo: Phase3Repository,
  release: ReleasePreview,
  selected: SalesHandoffTarget,
  retained: unknown,
): Promise<SalesScopeReferenceRead> {
  const unknown = (): SalesScopeReferenceRead => ({
    status: 'unknown',
    as_of: new Date().toISOString(),
    reference_hash: null,
    reason:
      'UNKNOWN — exact reference or source is denied, missing, altered or changed. Read the same references only; never replay or select a replacement.',
    contract_execution: 'BLOCKED',
  });
  try {
    const target = structuredClone(selected);
    const pinned = retainedData(retained);
    // Own-data-only comparison below ignores inherited serializers and rejects getters.
    const read = await readSalesApprovalHandoff(repo, release, target);
    if (read.status === 'unknown') return unknown();
    const content = contentFromHandoff(read, target.actor_id);
    const sha256 = await documentHash(content);
    const expected = {
      ...content,
      integrity: { algorithm: 'SHA-256', sha256 },
    };
    if (!identicalData(pinned, expected)) return unknown();
    // Do not treat a caller hash as authority. Current original evidence is read again.
    const fresh = await readSalesApprovalHandoff(repo, release, target);
    staff(repo, target);
    if (
      fresh.status === 'unknown' ||
      !identicalData(contentFromHandoff(fresh, target.actor_id), content)
    )
      return unknown();
    return {
      status: fresh.status === 'scope_matched' ? 'current' : 'stale',
      as_of: fresh.as_of,
      reference_hash: sha256,
      reason:
        fresh.status === 'scope_matched'
          ? 'Exact retained scope and accepted local test receipt match current original evidence. Contract approval, signing, delivery and custody remain unverified.'
          : 'STALE — original scope and receipt are retained, but current version or expiry blocks further use. No newer scope was substituted.',
      contract_execution: 'BLOCKED',
    };
  } catch {
    return unknown();
  }
}
