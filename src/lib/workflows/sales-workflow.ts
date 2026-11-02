import type { Phase3Repository } from '../phase3';
import { documentHash, ReleasePreview } from '../../domain/release/preview';
import {
  captureSalesApprovedScopeReference,
  readSalesApprovalHandoff,
  type SalesApprovalHandoff,
  type SalesHandoffTarget,
} from '../sales-approval-handoff';
import {
  contractPreparationChecks,
  prepareSalesContractReview,
  verifySalesContractPreparation,
  type ContractPreparationCheck,
  type SalesContractPreparation,
} from '../sales-contract-preparation';
import {
  freezePrototype,
  prototypeFields,
  type Immutable,
  type PrototypeAdmission,
} from '../program/prototype-source';

export interface SalesWorkflowTarget extends SalesHandoffTarget {
  intake_request_id: string;
}
export interface SalesWorkflowReview extends PrototypeAdmission {
  reviewed_source_hash: string;
  association_confirmed: boolean;
  checks: Record<ContractPreparationCheck, boolean>;
}
interface SalesWorkflowEvidence {
  lead: {
    id: string;
    organization_id: string;
    customer_id: string;
    location_id: string;
    summary: string;
    service_category: string;
    status: string;
    updated_at: string;
  };
  source: NonNullable<SalesApprovalHandoff['source']>;
  offer: NonNullable<SalesApprovalHandoff['offer']>;
  receipt: NonNullable<SalesApprovalHandoff['receipt']>;
  association: 'explicit-staff-selected-existing-records';
  recorded_estimate_lead_link: 'UNAVAILABLE';
  genuine_customer_approval: 'UNVERIFIED';
  contract_execution: 'BLOCKED';
}
export interface SalesWorkflowRead {
  mode: 'local-synthetic-workflow-review';
  status: 'current' | 'blocked' | 'unknown';
  evidence: Immutable<SalesWorkflowEvidence> | null;
  source_hash: string | null;
  reason: string;
  contract_execution: 'BLOCKED';
}
export type SalesWorkflowPreparation = Immutable<{
  mode: 'local-synthetic-workflow-review';
  lead: SalesWorkflowEvidence['lead'];
  association: SalesWorkflowEvidence['association'];
  recorded_estimate_lead_link: 'UNAVAILABLE';
  reviewed_source_hash: string;
  preparation: SalesContractPreparation;
  integrity: { algorithm: 'SHA-256'; sha256: string };
  contract_execution: 'BLOCKED';
}>;
const preparedSnapshots = new WeakSet<object>();
const keys = [
  'organization_id',
  'actor_id',
  'estimate_id',
  'version_id',
  'customer_id',
  'location_id',
  'offer_id',
  'receipt_id',
  'intake_request_id',
] as const;
function target(value: SalesWorkflowTarget): SalesWorkflowTarget {
  const data = prototypeFields(value, keys);
  if (
    keys.some(
      (key) =>
        typeof data[key] !== 'string' ||
        !data[key] ||
        (data[key] as string).length > 200,
    )
  )
    throw Error('Exact primitive workflow identities required');
  return data as unknown as SalesWorkflowTarget;
}
function admitted(value: PrototypeAdmission) {
  const data = prototypeFields(value, ['enabled', 'confirmed']);
  if (data.enabled !== true || data.confirmed !== true)
    throw Error('Explicit local review admission required');
}
function handoffTarget(t: SalesWorkflowTarget): SalesHandoffTarget {
  const { intake_request_id: _lead, ...existing } = t;
  void _lead;
  return existing;
}
function checkpoint(
  repo: Phase3Repository,
  release: ReleasePreview,
  t: SalesWorkflowTarget,
) {
  if (
    repo.sample !== true ||
    repo.operations.sample !== true ||
    !(release instanceof ReleasePreview) ||
    release.organizationId !== t.organization_id
  )
    throw Error('Existing local synthetic sources required');
  const { bundle } = repo.readSyntheticPrototypeSources({
    organization_id: t.organization_id,
    actor_id: t.actor_id,
    customer_id: t.customer_id,
    location_id: t.location_id,
    estimate_id: t.estimate_id,
    version_id: t.version_id,
    job_id: null,
  });
  const row = repo.operations.syntheticIntakeRequest(
    t.organization_id,
    t.customer_id,
    t.location_id,
    t.intake_request_id,
  );
  if (
    row.service_location_id !== t.location_id ||
    row.customer_id !== t.customer_id ||
    row.organization_id !== t.organization_id ||
    row.id !== t.intake_request_id
  )
    throw Error('Exact recorded lead property required');
  if (JSON.stringify(bundle.version) !== JSON.stringify(release.version))
    throw Error('Exact immutable offer version required');
  const lead = {
    id: row.id,
    organization_id: row.organization_id,
    customer_id: row.customer_id,
    location_id: row.service_location_id,
    summary: row.summary,
    service_category: row.service_category,
    status: row.status,
    updated_at: row.updated_at,
  };
  return {
    lead,
    fingerprint: JSON.stringify({
      lead,
      bundle,
      release: release.read('staff'),
    }),
  };
}
const unknown = (): SalesWorkflowRead => ({
  mode: 'local-synthetic-workflow-review',
  status: 'unknown',
  evidence: null,
  source_hash: null,
  reason:
    'UNKNOWN — exact source is missing, changed or denied. Read the same identities only.',
  contract_execution: 'BLOCKED',
});
/** Read composition only: the lead selection is never invented estimate provenance. */
export async function readSalesWorkflow(
  repo: Phase3Repository,
  release: ReleasePreview,
  selected: SalesWorkflowTarget,
  gate: PrototypeAdmission = {},
): Promise<SalesWorkflowRead> {
  try {
    admitted(gate);
    const t = target(selected),
      before = checkpoint(repo, release, t);
    const handoff = await readSalesApprovalHandoff(
      repo,
      release,
      handoffTarget(t),
    );
    admitted(gate);
    if (!handoff.source || !handoff.offer || !handoff.receipt) return unknown();
    const evidence: SalesWorkflowEvidence = {
      lead: before.lead,
      source: handoff.source,
      offer: handoff.offer,
      receipt: handoff.receipt,
      association: 'explicit-staff-selected-existing-records',
      recorded_estimate_lead_link: 'UNAVAILABLE',
      genuine_customer_approval: 'UNVERIFIED',
      contract_execution: 'BLOCKED',
    };
    const source_hash = await documentHash(evidence);
    admitted(gate);
    if (checkpoint(repo, release, t).fingerprint !== before.fingerprint)
      return unknown();
    return freezePrototype({
      mode: 'local-synthetic-workflow-review' as const,
      status:
        handoff.status === 'scope_matched'
          ? ('current' as const)
          : ('blocked' as const),
      evidence,
      source_hash,
      reason:
        handoff.status === 'scope_matched'
          ? 'Exact lead, property, issued scope and accepted LOCAL-TEST receipt match. Contract execution remains blocked.'
          : 'Exact sources are available but the current accepted-test scope requirements are not met.',
      contract_execution: 'BLOCKED' as const,
    });
  } catch {
    return unknown();
  }
}
function review(value: SalesWorkflowReview) {
  const data = prototypeFields(value, [
    'enabled',
    'confirmed',
    'reviewed_source_hash',
    'association_confirmed',
    'checks',
  ]);
  admitted({
    enabled: data.enabled === true,
    confirmed: data.confirmed === true,
  });
  if (
    data.association_confirmed !== true ||
    typeof data.reviewed_source_hash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(data.reviewed_source_hash)
  )
    throw Error(
      'Exact reviewed source and explicit association confirmation required',
    );
  const checks = prototypeFields(
    data.checks,
    Object.keys(contractPreparationChecks),
  );
  if (
    Object.keys(contractPreparationChecks).some((key) => checks[key] !== true)
  )
    throw Error('All existing contract preparation reviews required');
  return {
    enabled: true,
    confirmed: true,
    association_confirmed: true,
    reviewed_source_hash: data.reviewed_source_hash,
    checks: { scope: true, preference: true, terms: true, boundaries: true },
  };
}
/** Explicit review composes the existing accepted-scope and preparation engine only. */
export async function prepareSalesWorkflowContract(
  repo: Phase3Repository,
  release: ReleasePreview,
  selected: SalesWorkflowTarget,
  input: SalesWorkflowReview,
): Promise<SalesWorkflowPreparation> {
  const t = target(selected),
    pinned = review(input),
    before = checkpoint(repo, release, t);
  const stable = () => {
    if (
      JSON.stringify(review(input)) !== JSON.stringify(pinned) ||
      checkpoint(repo, release, t).fingerprint !== before.fingerprint
    )
      throw Error('Workflow review changed; UNKNOWN is exact read only');
  };
  const view = await readSalesWorkflow(repo, release, t, {
    enabled: true,
    confirmed: true,
  });
  stable();
  if (
    view.status !== 'current' ||
    !view.evidence ||
    view.source_hash !== pinned.reviewed_source_hash
  )
    throw Error('Current exact reviewed workflow required');
  const existing = handoffTarget(t);
  const reference = await captureSalesApprovedScopeReference(
    repo,
    release,
    existing,
    true,
    view.evidence.source.scope_hash,
  );
  stable();
  const preparation = await prepareSalesContractReview(
    repo,
    release,
    existing,
    reference,
    {
      enabled: true,
      confirmed: true,
      reviewed_reference_hash: reference.integrity.sha256,
      reviewed_scope_hash: reference.source.scope_hash,
      checks: { scope: true, preference: true, terms: true, boundaries: true },
    },
  );
  stable();
  const content = {
    mode: 'local-synthetic-workflow-review' as const,
    lead: view.evidence.lead,
    association: view.evidence.association,
    recorded_estimate_lead_link: 'UNAVAILABLE' as const,
    reviewed_source_hash: view.source_hash!,
    preparation,
    contract_execution: 'BLOCKED' as const,
  };
  const sha256 = await documentHash(content);
  stable(); // Final synchronous existing-source checkpoint; no await or callback follows.
  const snapshot = freezePrototype({
    ...content,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  preparedSnapshots.add(snapshot);
  return snapshot;
}
/** No replay, replacement source or new preparation: inspect the same retained evidence. */
export async function verifySalesWorkflowReview(
  repo: Phase3Repository,
  release: ReleasePreview,
  selected: SalesWorkflowTarget,
  retained: SalesWorkflowPreparation,
): Promise<'current' | 'stale' | 'unknown'> {
  try {
    if (!preparedSnapshots.has(retained)) return 'unknown';
    const t = target(selected),
      before = checkpoint(repo, release, t);
    if (
      retained.lead.id !== t.intake_request_id ||
      retained.lead.customer_id !== t.customer_id ||
      retained.lead.location_id !== t.location_id ||
      retained.lead.organization_id !== t.organization_id
    )
      return 'unknown';
    const { integrity, ...content } = retained;
    if ((await documentHash(content)) !== integrity.sha256) return 'unknown';
    const existing = await verifySalesContractPreparation(
      repo,
      release,
      handoffTarget(t),
      retained.preparation,
    );
    if (checkpoint(repo, release, t).fingerprint !== before.fingerprint)
      return 'unknown';
    if (existing.status === 'unknown') return 'unknown';
    if (JSON.stringify(retained.lead) !== JSON.stringify(before.lead))
      return 'stale';
    return existing.status;
  } catch {
    return 'unknown';
  }
}
