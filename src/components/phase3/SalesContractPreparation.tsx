import { useRef, useState } from 'react';
import type { Phase3Repository } from '../../lib/phase3';
import type { ReleasePreview } from '../../domain/release/preview';
import type {
  SalesApprovedScopeReference,
  SalesHandoffTarget,
} from '../../lib/sales-approval-handoff';
import {
  contractPreparationChecks,
  prepareSalesContractReview,
  verifySalesContractPreparation,
  type ContractPreparationCheck,
  type ContractPreparationRead,
  type SalesContractPreparation,
} from '../../lib/sales-contract-preparation';
import { formatMinor } from '../../domain/estimating/calculation';

/** Unwired unless an explicitly local composition opts in; the parent reference is not a contract. */
export function SalesContractPreparationPreview(props: {
  repo: Phase3Repository;
  release: ReleasePreview;
  target: SalesHandoffTarget;
  reference: SalesApprovedScopeReference;
  enabled?: boolean;
}) {
  const targetKey = JSON.stringify(props.target);
  const [binding, setBinding] = useState({
    repo: props.repo,
    release: props.release,
    target: props.target,
    reference: props.reference,
    targetKey,
    generation: 0,
  });
  if (
    binding.repo !== props.repo ||
    binding.release !== props.release ||
    binding.target !== props.target ||
    binding.reference !== props.reference ||
    binding.targetKey !== targetKey
  ) {
    setBinding({
      repo: props.repo,
      release: props.release,
      target: props.target,
      reference: props.reference,
      targetKey,
      generation: binding.generation + 1,
    });
    return null;
  }
  return props.enabled === true && props.repo.operations.sample ? (
    <PreparationReview key={binding.generation} {...props} />
  ) : null;
}
function PreparationReview({
  repo,
  release,
  target,
  reference,
}: {
  repo: Phase3Repository;
  release: ReleasePreview;
  target: SalesHandoffTarget;
  reference: SalesApprovedScopeReference;
}) {
  const attempted = useRef(false);
  const [state, setState] = useState<{
    checks: Partial<Record<ContractPreparationCheck, boolean>>;
    confirmed: boolean;
    busy: boolean;
    held: boolean;
    packet?: SalesContractPreparation;
    read?: ContractPreparationRead;
    error?: string;
  }>({ checks: {}, confirmed: false, busy: false, held: false });
  const active = state;
  function patch(fields: Partial<typeof state>) {
    setState((previous) => ({ ...previous, ...fields }));
  }
  const complete = (
    Object.keys(contractPreparationChecks) as ContractPreparationCheck[]
  ).every((k) => active.checks[k] === true);
  async function prepare() {
    if (
      !complete ||
      !active.confirmed ||
      active.busy ||
      active.held ||
      active.packet
    )
      return;
    if (attempted.current) return;
    attempted.current = true;
    patch({ busy: true, error: undefined });
    try {
      const packet = await prepareSalesContractReview(
        repo,
        release,
        target,
        reference,
        {
          enabled: true,
          confirmed: true,
          reviewed_reference_hash: reference.integrity.sha256,
          reviewed_scope_hash: reference.source.scope_hash,
          checks: {
            scope: active.checks.scope === true,
            preference: active.checks.preference === true,
            terms: active.checks.terms === true,
            boundaries: active.checks.boundaries === true,
          },
        },
      );
      patch({ busy: false, packet, confirmed: false });
    } catch {
      patch({
        busy: false,
        held: true,
        confirmed: false,
        error:
          'UNKNOWN — preparation denied or source changed. This review is held; no retry, replacement, contract or signature was created.',
      });
    }
  }
  async function verify() {
    if (!active.packet || active.busy) return;
    patch({ busy: true });
    const read = await verifySalesContractPreparation(
      repo,
      release,
      target,
      active.packet,
    );
    patch({
      busy: false,
      read,
      held: active.held || read.status !== 'current',
    });
  }
  const packet = active.packet,
    scope = packet?.reference.source.scope;
  return (
    <section
      className="sales-contract-preparation"
      aria-label="Contract preparation review"
    >
      <h4>Prepare a contract review checklist</h4>
      <p>
        Staff preparation only · accepted LOCAL-TEST preference. No legal
        approval, signing or delivery. This same-tab snapshot is lost on
        refresh.
      </p>
      <fieldset disabled={active.busy || active.held || !!packet}>
        <legend>Review this exact retained scope</legend>
        {(
          Object.entries(contractPreparationChecks) as [
            ContractPreparationCheck,
            string,
          ][]
        ).map(([key, label]) => (
          <label className="sales-scope-confirmation" key={key}>
            <input
              type="checkbox"
              checked={active.checks[key] === true}
              onChange={(e) =>
                patch({
                  checks: { ...active.checks, [key]: e.target.checked },
                  confirmed: false,
                })
              }
            />
            {label}
          </label>
        ))}
        <label className="sales-scope-confirmation">
          <input
            type="checkbox"
            checked={active.confirmed}
            disabled={!complete}
            onChange={(e) => patch({ confirmed: e.target.checked })}
          />
          I confirm the checklist against this saved issued version; prepare a
          review-only snapshot.
        </label>
      </fieldset>
      <button
        type="button"
        disabled={
          !complete ||
          !active.confirmed ||
          active.busy ||
          active.held ||
          !!packet
        }
        onClick={() => void prepare()}
      >
        {active.busy && !packet
          ? 'Checking original sources…'
          : 'Prepare staff contract review'}
      </button>
      {active.error && <p role="alert">{active.error}</p>}
      {packet && (
        <section aria-label="Prepared contract review snapshot">
          <h5>Contract Preparation — Staff Review Only</h5>
          <p role="status">Prepared checklist · Contract execution: BLOCKED</p>
          {active.read?.status !== 'unknown' && (
            <>
              <p>
                {scope?.company.name} · {scope?.customer.display_name}
              </p>
              <p>
                {scope?.location?.address_line1} · {scope?.location?.city},{' '}
                {scope?.location?.region}
              </p>
              <dl>
                <dt>Issued estimate / saved version</dt>
                <dd>
                  {packet.reference.source.estimate_number} · version{' '}
                  {packet.reference.source.version_number} · revision{' '}
                  {packet.reference.source.lock_revision}
                </dd>
                <dt>Canonical issued total</dt>
                <dd>
                  {scope && formatMinor(scope.total_minor, scope.currency)}
                </dd>
                <dt>Prepared at</dt>
                <dd>{packet.prepared_at}</dd>
                <dt>Original receipt</dt>
                <dd>{packet.reference.receipt.id}</dd>
                <dt>Issued scope hash</dt>
                <dd>{packet.reference.source.scope_hash}</dd>
                <dt>Preparation integrity hash</dt>
                <dd>{packet.integrity.sha256}</dd>
              </dl>
              <details>
                <summary>Reviewed scope, terms and dates</summary>
                <p>{scope?.project.description}</p>
                <ul>
                  {scope?.lines.map((line, index) => (
                    <li key={index}>
                      {line.description} · {line.quantity_milli / 1000}{' '}
                      {line.unit.replaceAll('_', ' ')} ·{' '}
                      {formatMinor(line.amount_minor, scope.currency)}
                    </li>
                  ))}
                </ul>
                <p className="sales-handoff-text">
                  {scope?.terms || 'No estimate terms recorded.'}
                </p>
                <p>
                  Proposed project dates:{' '}
                  {scope?.project.start_on ?? 'Not recorded'} →{' '}
                  {scope?.project.end_on ?? 'Not recorded'}. These are not
                  contract commitments.
                </p>
              </details>
            </>
          )}
          <h5>Still required before any legal workflow</h5>
          <ul>
            <li>
              Approved jurisdiction-specific contract template and legal
              reference: UNVERIFIED.
            </li>
            <li>
              Genuine customer identity, signing consent and signature evidence:
              UNVERIFIED.
            </li>
            <li>
              Customer delivery and durable operational custody: UNVERIFIED.
            </li>
          </ul>
          <button
            type="button"
            disabled={active.busy}
            onClick={() => void verify()}
          >
            Verify exact preparation sources
          </button>
          <p aria-live="polite">
            {active.read?.reason ??
              'Retained preparation snapshot. Read the exact sources again to check current eligibility; no new preparation is performed.'}
          </p>
          <p>
            Later edits never change this snapshot. STALE or UNKNOWN cannot
            authorize execution or select a replacement.
          </p>
        </section>
      )}
    </section>
  );
}
