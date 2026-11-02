import { useEffect, useRef, useState } from 'react';
import type { CustomerPortalPreviewModel } from '../../lib/customer-preview';
import type { ProofOfWorkPack } from '../../domain/property/proof-of-work-pack';
import type { PrototypeTarget } from '../../lib/program/prototype-source';
import {
  readCustomerWorkflow,
  prepareCustomerWorkflowPack,
  verifyCustomerWorkflowPack,
  type CustomerWorkflowRead,
  type CustomerWorkflowPreparation,
  type CustomerWorkflowSelection,
} from '../../lib/workflows/customer-workflow';
import './customer-workflow.css';
export interface CustomerWorkflowProps {
  model: CustomerPortalPreviewModel;
  target: PrototypeTarget;
  selection: CustomerWorkflowSelection;
  enabled?: boolean;
}
/** Local rendering of the existing customer-safe projections; never a connected customer route. */
export function CustomerWorkflow(props: CustomerWorkflowProps) {
  const signature = JSON.stringify([props.target, props.selection]);
  const [binding, bind] = useState({
    model: props.model,
    signature,
    enabled: props.enabled,
    generation: 0,
  });
  if (
    binding.model !== props.model ||
    binding.signature !== signature ||
    binding.enabled !== props.enabled
  ) {
    bind({
      model: props.model,
      signature,
      enabled: props.enabled,
      generation: binding.generation + 1,
    });
    return null;
  }
  return props.enabled === true ? (
    <DocumentationReview key={binding.generation} {...props} />
  ) : null;
}
function DocumentationReview({
  model,
  target,
  selection,
}: CustomerWorkflowProps) {
  const [read, setRead] = useState<CustomerWorkflowRead>();
  const [busy, setBusy] = useState(false),
    [confirmed, confirm] = useState(false),
    [held, hold] = useState(false);
  const [pack, setPack] = useState<ProofOfWorkPack>(),
    [status, setStatus] = useState<string>(),
    [error, setError] = useState<string>();
  const [detail, setDetail] = useState<CustomerWorkflowRead>();
  const sourceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (detail) sourceHeading.current?.focus();
  }, [detail]);
  const life = useRef({ active: true }),
    attempted = useRef(false),
    review = useRef<CustomerWorkflowPreparation | undefined>(undefined);
  useEffect(() => {
    const l = life.current;
    l.active = true;
    return () => {
      l.active = false;
      if (review.current) review.current.enabled = false;
    };
  }, []);
  async function load() {
    if (busy) return;
    setBusy(true);
    setRead(undefined);
    setDetail(undefined);
    confirm(false);
    const result = await readCustomerWorkflow(model, target, selection, {
      enabled: true,
      confirmed: true,
    });
    if (!life.current.active) return;
    setRead(result);
    setBusy(false);
    if (result.status === 'UNKNOWN') {
      if (pack) setStatus('UNKNOWN');
      hold(true);
    }
  }
  async function openSource() {
    if (busy) return;
    setBusy(true);
    setDetail(undefined);
    const value = await readCustomerWorkflow(model, target, selection, {
      enabled: true,
      confirmed: true,
    });
    if (!life.current.active) return;
    setBusy(false);
    if (value.status === 'CURRENT') setDetail(value);
    else {
      setRead(undefined);
      setStatus('UNKNOWN');
      hold(true);
      setError(
        'UNKNOWN — exact published source is unavailable. No different report was selected.',
      );
    }
  }
  async function prepare() {
    if (
      busy ||
      held ||
      attempted.current ||
      !confirmed ||
      read?.status !== 'CURRENT' ||
      !read.source_hash
    )
      return;
    attempted.current = true;
    setBusy(true);
    setError(undefined);
    const input = {
      enabled: true,
      confirmed: true,
      reviewed_source_hash: read.source_hash,
    };
    review.current = input;
    try {
      const result = await prepareCustomerWorkflowPack(
        model,
        target,
        selection,
        input,
      );
      if (!life.current.active) return;
      setPack(result);
      setBusy(false);
      confirm(false);
    } catch {
      if (!life.current.active) return;
      setBusy(false);
      hold(true);
      setRead(undefined);
      setError(
        'UNKNOWN — preparation is held. Only exact read-only reconciliation is permitted; no replacement pack or delivery was attempted.',
      );
    }
  }
  async function verify() {
    if (busy || !pack) return;
    setBusy(true);
    const result = await verifyCustomerWorkflowPack(
      model,
      target,
      selection,
      pack,
      { enabled: true, confirmed: true },
    );
    if (!life.current.active) return;
    setStatus(result);
    setBusy(false);
    if (result !== 'CURRENT') {
      hold(true);
      if (result === 'UNKNOWN') {
        setRead(undefined);
        setDetail(undefined);
      }
    }
  }
  return (
    <section
      className="customer-workflow"
      aria-label="Property Passport completion documentation"
    >
      <header>
        <span className="eyebrow">Property history</span>
        <h2>Property Passport &amp; documentation review</h2>
        <p>
          Published documentation for this exact property. Physical completion,
          customer acceptance and warranty remain unverified.
        </p>
      </header>
      <button type="button" disabled={busy} onClick={() => void load()}>
        Review linked property documentation
      </button>
      {busy && <p role="status">Reading authorized published documentation…</p>}
      {error && <p role="alert">{error}</p>}
      {read?.status === 'UNKNOWN' && (
        <p role="alert">
          UNKNOWN — the exact property, job or published report is unavailable.
          No different source is substituted.
        </p>
      )}
      {read?.timeline && (
        <>
          <h3>{read.timeline.snapshot.contractor.name}</h3>
          <p>{read.timeline.snapshot.property_label}</p>
          <p>
            Available history only · coverage completeness: UNKNOWN. Media:
            UNAVAILABLE.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void openSource()}
          >
            Open exact published report
          </button>
          <ol className="customer-workflow-events">
            {read.timeline.snapshot.events.map((event) => (
              <li key={event.source_sha256}>
                {event.kind === 'inspection-documentation' ? (
                  <>
                    <h4>Published inspection · {event.date}</h4>
                    <p>{event.report.summary}</p>
                    <dl>
                      <dt>Exact report</dt>
                      <dd>{event.report.reference.report_id}</dd>
                      <dt>Published version</dt>
                      <dd>{event.report.reference.published_version}</dd>
                      <dt>Recorded phase</dt>
                      <dd>{event.report.phase}</dd>
                    </dl>
                    <details>
                      <summary>Observations and recommendations</summary>
                      {event.report.observations.map((finding) => (
                        <div key={finding.reference.finding_id}>
                          <p>
                            <strong>Observation:</strong> {finding.observation}
                          </p>
                          <p>
                            <strong>Recommendation:</strong>{' '}
                            {finding.recommendation}
                          </p>
                        </div>
                      ))}
                    </details>
                  </>
                ) : (
                  <>
                    <h4>Issued job scope · {event.date}</h4>
                    <p>{event.job.issued_source.scope.name}</p>
                    <p>{event.job.issued_source.scope.description}</p>
                    <dl>
                      <dt>Job</dt>
                      <dd>{event.job.reference.job_id}</dd>
                      <dt>Issued estimate version</dt>
                      <dd>{event.job.reference.issued_version_id}</dd>
                    </dl>
                  </>
                )}
              </li>
            ))}
          </ol>
          <label className="customer-workflow-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || held || !!pack}
              onChange={(e) => confirm(e.target.checked)}
            />
            I reviewed the exact linked report and issued job scope; prepare a
            documentation-only pack.
          </label>
          <button
            type="button"
            disabled={busy || held || !!pack || !confirmed}
            onClick={() => void prepare()}
          >
            Prepare linked documentation pack
          </button>
        </>
      )}
      {detail?.timeline && (
        <section aria-label="Exact linked published source">
          <h3 ref={sourceHeading} tabIndex={-1}>
            Exact linked published source
          </h3>
          <p>
            Report {selection.report_id} · published version{' '}
            {selection.published_version}
          </p>
          {detail.timeline.snapshot.events
            .filter(
              (e) =>
                e.kind === 'inspection-documentation' &&
                e.report.reference.report_id === selection.report_id &&
                e.report.reference.published_version ===
                  selection.published_version,
            )
            .map((e) =>
              e.kind === 'inspection-documentation' ? (
                <div key={e.source_sha256}>
                  <p>{e.report.summary}</p>
                  {e.report.observations.map((o) => (
                    <article key={o.reference.finding_id}>
                      <p>
                        Finding {o.reference.finding_id} · source position{' '}
                        {o.reference.source_index + 1}
                      </p>
                      <p>Observation: {o.observation}</p>
                      <p>Recommendation: {o.recommendation}</p>
                    </article>
                  ))}
                </div>
              ) : null,
            )}
        </section>
      )}
      {pack && (
        <section
          className="customer-workflow-pack"
          aria-label="Linked immutable documentation pack"
        >
          <h3>Linked immutable documentation pack</h3>
          <p>
            Documentation only · NOT SENT. Physical completion, acceptance and
            warranty: UNVERIFIED.
          </p>
          {status !== 'UNKNOWN' && (
            <dl>
              <dt>Pack</dt>
              <dd>{pack.reference.pack_id}</dd>
              <dt>Selected exact sources</dt>
              <dd>{pack.snapshot.events.length}</dd>
              <dt>SHA-256</dt>
              <dd>{pack.integrity.sha256}</dd>
            </dl>
          )}
          <button type="button" disabled={busy} onClick={() => void verify()}>
            Verify linked documentation pack
          </button>
          {status && (
            <p role={status === 'UNKNOWN' ? 'alert' : 'status'}>
              {status} — retained content remains unchanged; no work, payment or
              communication authority is granted.
            </p>
          )}
        </section>
      )}
      <p className="customer-workflow-boundary">
        Local synthetic preview only. No customer login, delivery, response,
        download or signature. Same-tab evidence is lost on refresh.
      </p>
    </section>
  );
}
