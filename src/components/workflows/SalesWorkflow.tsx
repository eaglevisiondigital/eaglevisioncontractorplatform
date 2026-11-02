import { useEffect, useRef, useState } from 'react';
import type { Phase3Repository } from '../../lib/phase3';
import type { ReleasePreview } from '../../domain/release/preview';
import { formatMinor } from '../../domain/estimating/calculation';
import {
  contractPreparationChecks,
  type ContractPreparationCheck,
} from '../../lib/sales-contract-preparation';
import {
  prepareSalesWorkflowContract,
  readSalesWorkflow,
  verifySalesWorkflowReview,
  type SalesWorkflowPreparation,
  type SalesWorkflowRead,
  type SalesWorkflowReview,
  type SalesWorkflowTarget,
} from '../../lib/workflows/sales-workflow';
import './sales-workflow.css';

export interface SalesWorkflowProps {
  repo: Phase3Repository;
  release: ReleasePreview;
  target: SalesWorkflowTarget;
  enabled?: boolean;
  onPrepared?: (packet: SalesWorkflowPreparation) => void;
}
/** New isolated local composition; never modifies the approved operational screens. */
export function SalesWorkflow(props: SalesWorkflowProps) {
  const targetKey = JSON.stringify(props.target);
  const [binding, bind] = useState({
    repo: props.repo,
    release: props.release,
    targetKey,
    enabled: props.enabled,
    generation: 0,
  });
  if (
    binding.repo !== props.repo ||
    binding.release !== props.release ||
    binding.targetKey !== targetKey ||
    binding.enabled !== props.enabled
  ) {
    bind({
      repo: props.repo,
      release: props.release,
      targetKey,
      enabled: props.enabled,
      generation: binding.generation + 1,
    });
    return null;
  }
  return props.enabled === true && props.repo.sample === true ? (
    <SalesReview key={binding.generation} {...props} />
  ) : null;
}
function SalesReview({
  repo,
  release,
  target,
  onPrepared,
}: SalesWorkflowProps) {
  const [view, setView] = useState<SalesWorkflowRead>();
  const [checks, setChecks] = useState<
    Partial<Record<ContractPreparationCheck, boolean>>
  >({});
  const [association, setAssociation] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState(false);
  const [packet, setPacket] = useState<SalesWorkflowPreparation>();
  const [verification, setVerification] = useState<string>();
  const [error, setError] = useState<string>();
  const lifetime = useRef({ active: true });
  const currentReview = useRef<SalesWorkflowReview | undefined>(undefined);
  const attempted = useRef(false);
  useEffect(() => {
    const life = lifetime.current;
    life.active = true;
    return () => {
      life.active = false;
      if (currentReview.current) currentReview.current.enabled = false;
    };
  }, []);
  async function read() {
    if (busy) return;
    setBusy(true);
    setView(undefined);
    setConfirmed(false);
    setError(undefined);
    const gate = { enabled: true, confirmed: true };
    const value = await readSalesWorkflow(repo, release, target, gate);
    if (!lifetime.current.active) return;
    setView(value);
    if (packet && value.status === 'unknown') {
      setVerification('UNKNOWN');
      setHeld(true);
    }
    setBusy(false);
  }
  async function prepare() {
    if (
      attempted.current ||
      busy ||
      held ||
      !confirmed ||
      !association ||
      view?.status !== 'current' ||
      !view.source_hash
    )
      return;
    if (
      Object.keys(contractPreparationChecks).some(
        (key) => checks[key as ContractPreparationCheck] !== true,
      )
    )
      return;
    attempted.current = true;
    setBusy(true);
    setError(undefined);
    const review: SalesWorkflowReview = {
      enabled: true,
      confirmed: true,
      association_confirmed: true,
      reviewed_source_hash: view.source_hash,
      checks: { scope: true, preference: true, terms: true, boundaries: true },
    };
    currentReview.current = review;
    try {
      const prepared = await prepareSalesWorkflowContract(
        repo,
        release,
        target,
        review,
      );
      if (!lifetime.current.active) return;
      setPacket(prepared);
      setConfirmed(false);
      setBusy(false);
      onPrepared?.(prepared);
    } catch {
      if (!lifetime.current.active) return;
      setHeld(true);
      setBusy(false);
      setView(undefined);
      setConfirmed(false);
      setError(
        'UNKNOWN — this preparation is held. Read the same sources only; no retry, replacement, contract or signature was created.',
      );
    }
  }
  async function verify() {
    if (!packet || busy) return;
    setBusy(true);
    const result = await verifySalesWorkflowReview(
      repo,
      release,
      target,
      packet,
    );
    if (!lifetime.current.active) return;
    setVerification(result.toUpperCase());
    setBusy(false);
    if (result !== 'current') {
      setHeld(true);
      setView(undefined);
    }
  }
  const evidence = view?.evidence,
    scope = evidence?.source.scope;
  const all = (
    Object.keys(contractPreparationChecks) as ContractPreparationCheck[]
  ).every((key) => checks[key] === true);
  return (
    <section
      className="sales-workflow"
      aria-label="Lead to contract preparation"
    >
      <header>
        <span className="eyebrow">Sales workflow</span>
        <h2>Lead to contract preparation</h2>
        <p>
          Local staff review · accepted test preference only. No signing,
          delivery, work or financial authority.
        </p>
      </header>
      <button type="button" disabled={busy} onClick={() => void read()}>
        Review exact lead and issued estimate
      </button>
      {busy && <p role="status">Checking exact existing sources…</p>}
      {error && <p role="alert">{error}</p>}
      {view && <p role="status">{view.reason}</p>}
      {evidence && scope && (
        <>
          <div className="sales-workflow-grid">
            <section aria-label="Originating lead">
              <h3>Originating lead</h3>
              <p>{evidence.lead.summary}</p>
              <dl>
                <dt>Request</dt>
                <dd>{evidence.lead.id}</dd>
                <dt>Recorded category</dt>
                <dd>{evidence.lead.service_category}</dd>
                <dt>Lead status</dt>
                <dd>{evidence.lead.status}</dd>
                <dt>Source updated</dt>
                <dd>{evidence.lead.updated_at}</dd>
              </dl>
            </section>
            <section aria-label="Exact estimate and property">
              <h3>Exact estimate and property</h3>
              <p>
                {scope.company.name} · {scope.customer.display_name}
              </p>
              <p>
                {scope.location?.address_line1}, {scope.location?.city}
              </p>
              <dl>
                <dt>Property</dt>
                <dd>{evidence.source.location_id}</dd>
                <dt>Estimate</dt>
                <dd>{evidence.source.estimate_number}</dd>
                <dt>Issued version</dt>
                <dd>
                  {evidence.source.version_number} ·{' '}
                  {evidence.source.version_id}
                </dd>
                <dt>Canonical total</dt>
                <dd>{formatMinor(scope.total_minor, scope.currency)}</dd>
                <dt>Accepted LOCAL-TEST receipt</dt>
                <dd>{evidence.receipt.id}</dd>
              </dl>
            </section>
          </div>
          <p>
            These are existing records for the same customer and property. The
            lead-to-estimate association is an explicit staff selection; a
            recorded estimate lead link is unavailable.
          </p>
          <details>
            <summary>Issued scope and recorded terms</summary>
            <p>{scope.project.description}</p>
            <ul>
              {scope.lines.map((line, i) => (
                <li key={i}>
                  {line.description} · {line.quantity_milli / 1000}{' '}
                  {line.unit.replaceAll('_', ' ')} ·{' '}
                  {formatMinor(line.amount_minor, scope.currency)}
                </li>
              ))}
            </ul>
            <p>{scope.notes}</p>
            <p>{scope.terms}</p>
          </details>
          <fieldset
            disabled={busy || held || !!packet || view?.status !== 'current'}
          >
            <legend>Confirm the exact source handoff</legend>
            <label>
              <input
                type="checkbox"
                checked={association}
                onChange={(e) => {
                  setAssociation(e.target.checked);
                  setConfirmed(false);
                }}
              />
              I selected this exact lead and estimate for the same customer and
              property.
            </label>
            {(
              Object.entries(contractPreparationChecks) as [
                ContractPreparationCheck,
                string,
              ][]
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={checks[key] === true}
                  onChange={(e) => {
                    setChecks({ ...checks, [key]: e.target.checked });
                    setConfirmed(false);
                  }}
                />
                {label}
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={!all || !association}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I confirm these exact sources; prepare the staff contract review
              snapshot.
            </label>
          </fieldset>
          <button
            type="button"
            disabled={
              busy ||
              held ||
              !!packet ||
              !confirmed ||
              !all ||
              !association ||
              view.status !== 'current'
            }
            onClick={() => void prepare()}
          >
            Prepare linked staff contract review
          </button>
        </>
      )}
      {packet && (
        <section
          className="sales-workflow-packet"
          aria-label="Linked staff contract review snapshot"
        >
          <h3>Linked staff contract review snapshot</h3>
          <p>
            Contract execution: BLOCKED · genuine approval, signing, delivery
            and custody: UNVERIFIED.
          </p>
          {verification !== 'UNKNOWN' && (
            <dl>
              <dt>Originating lead</dt>
              <dd>{packet.lead.id}</dd>
              <dt>Exact issued version</dt>
              <dd>{packet.preparation.reference.source.version_id}</dd>
              <dt>Exact accepted LOCAL-TEST receipt</dt>
              <dd>{packet.preparation.reference.receipt.id}</dd>
              <dt>Integrity SHA-256</dt>
              <dd>{packet.integrity.sha256}</dd>
            </dl>
          )}
          <button type="button" disabled={busy} onClick={() => void verify()}>
            Verify linked review sources
          </button>
          {verification && (
            <p role={verification === 'UNKNOWN' ? 'alert' : 'status'}>
              {verification} — retained contents are unchanged. No downstream
              authority is granted.
            </p>
          )}
        </section>
      )}
      <p className="sales-workflow-boundary">
        Same-tab evidence only; refresh loses it. This is not a contract,
        customer approval, signature, work order or invoice.
      </p>
    </section>
  );
}
