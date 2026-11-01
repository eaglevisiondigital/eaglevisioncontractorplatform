import { Temporal } from '@js-temporal/polyfill';
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
    customer_id: string;
    location_id: string;
    scope: SellingScope;
    scope_hash: string;
  } | null;
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
/** Primitive admission for this new boundary; calculations/projections remain authoritative. */
function admitScope(scope: ReturnType<typeof customerPreview>) {
  const stringFields = (value: object, keys: string[]) =>
    keys.every((k) => text((value as Record<string, unknown>)[k]));
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
    !scope.attachments.every((a) =>
      stringFields(a, ['display_name', 'content_type']),
    ) ||
    !scope.schedule.every(
      (s) =>
        text(s.label) &&
        dateOrNull(s.due_on) &&
        Number.isSafeInteger(s.amount_minor) &&
        s.amount_minor >= 0,
    )
  )
    throw Error('Primitive selling scope required');
  return scope;
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
      customer_id: target.customer_id,
      location_id: target.location_id,
      scope,
      scope_hash: hash,
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
      blockers: [
        'UNKNOWN: exact evidence is missing, denied, conflicting or changed. Reload the same references for read-only inspection; do not replay or replace them.',
      ],
    };
  }
}
