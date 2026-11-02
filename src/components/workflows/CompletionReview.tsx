import { useEffect, useRef, useState } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import {
  completionReviewChecks,
  openCompletionSource,
  prepareCompletionReview,
  readCompletionReview,
  reconcileCompletionReview,
  type CompletionReviewConfirmation,
  type CompletionReviewPacket,
  type CompletionReviewView,
} from '../../lib/workflows/completion-review';
import './completion-review.css';
export interface CompletionReviewProps {
  sources: LocalJourney;
  enabled?: boolean;
}
export function CompletionReview(props: CompletionReviewProps) {
  const signature = JSON.stringify({
    target: props.sources.target,
    report: props.sources.report_id,
    version: props.sources.published_version,
    enabled: props.enabled,
  });
  const [binding, bind] = useState({
    sources: props.sources,
    model: props.sources.customerModel,
    signature,
    generation: 0,
  });
  if (
    binding.sources !== props.sources ||
    binding.model !== props.sources.customerModel ||
    binding.signature !== signature
  ) {
    bind({
      sources: props.sources,
      model: props.sources.customerModel,
      signature,
      generation: binding.generation + 1,
    });
    return null;
  }
  return props.enabled === true ? (
    <Review key={binding.generation} sources={props.sources} />
  ) : null;
}
function Review({ sources }: { sources: LocalJourney }) {
  const [view, setView] = useState<CompletionReviewView>(),
    [packet, setPacket] = useState<CompletionReviewPacket>(),
    [detail, setDetail] = useState<CompletionReviewView['report']>(),
    [busy, setBusy] = useState(false),
    [checks, setChecks] = useState<
      Partial<CompletionReviewConfirmation['checks']>
    >({}),
    [confirmed, setConfirmed] = useState(false),
    [attempted, setAttempted] = useState(false),
    [held, setHeld] = useState(false),
    [status, setStatus] = useState<string>(),
    [error, setError] = useState<string>();
  const life = useRef({ active: true }),
    gate = useRef({ enabled: true, confirmed: true }),
    confirmation = useRef<CompletionReviewConfirmation | undefined>(undefined),
    attempt = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const l = life.current,
      g = gate.current;
    l.active = true;
    g.enabled = true;
    return () => {
      l.active = false;
      g.enabled = false;
      if (confirmation.current) confirmation.current.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (detail) heading.current?.focus();
  }, [detail]);
  async function load() {
    if (busy || attempt.current) return;
    setBusy(true);
    setView(undefined);
    setDetail(undefined);
    setError(undefined);
    setConfirmed(false);
    setChecks({});
    try {
      const value = await readCompletionReview(
        sources,
        {
          report_id: sources.report_id,
          published_version: sources.published_version,
        },
        gate.current,
      );
      if (life.current.active) setView(value);
    } catch {
      if (life.current.active)
        setError(
          'UNKNOWN — exact published report, issued job or property is unavailable. No replacement source was selected.',
        );
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  async function open() {
    if (!view || busy) return;
    setBusy(true);
    setDetail(undefined);
    try {
      const value = await openCompletionSource(view);
      if (life.current.active) setDetail(value);
    } catch {
      if (life.current.active) {
        setView(undefined);
        setHeld(true);
        setError(
          'UNKNOWN — exact source changed or access is unavailable. No different report was opened.',
        );
      }
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  const all = Object.keys(completionReviewChecks).every(
    (k) => checks[k as keyof typeof completionReviewChecks] === true,
  );
  async function prepare() {
    if (!view || busy || attempt.current || held || !confirmed || !all) return;
    attempt.current = true;
    setAttempted(true);
    setBusy(true);
    const input: CompletionReviewConfirmation = {
      confirmed: true,
      checks: { scope: true, documentation: true, limitations: true },
    };
    confirmation.current = input;
    try {
      const value = await prepareCompletionReview(view, input);
      if (!life.current.active) return;
      setPacket(value);
      setStatus('CURRENT_REVIEW_ONLY');
      setConfirmed(false);
    } catch {
      if (life.current.active) {
        setHeld(true);
        setView(undefined);
        setError(
          'UNKNOWN — this preparation is held. No replay, replacement, delivery or customer response is allowed.',
        );
      }
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  async function inspect() {
    if (!packet || busy) return;
    setBusy(true);
    const value = await reconcileCompletionReview(packet);
    if (!life.current.active) return;
    setStatus(value.status);
    setBusy(false);
    if (value.status === 'UNKNOWN') {
      setHeld(true);
      setView(undefined);
      setDetail(undefined);
    }
  }
  return (
    <section
      className="completion-review"
      aria-label="Customer completion evidence review"
    >
      <div className="completion-review-heading">
        <span className="eyebrow">Property Passport · evidence review</span>
        <h2>Customer completion evidence review</h2>
        <p>
          Compare the exact issued scope with published documentation. Recorded
          evidence does not verify physical completion, customer acceptance or
          warranty.
        </p>
      </div>
      <button
        type="button"
        disabled={busy || attempted}
        onClick={() => void load()}
      >
        Review scope and completion documentation
      </button>
      {busy && <p role="status">Reading exact customer-safe evidence…</p>}
      {error && <p role="alert">{error}</p>}
      {view && (
        <>
          <p>
            <strong>{view.contractor.name}</strong> · {view.property.label}
          </p>
          <div className="completion-review-grid">
            <section aria-label="Original issued job scope">
              <h3>Original issued scope</h3>
              <p>{view.job.name}</p>
              <p>{view.job.description}</p>
              <dl>
                <dt>Job</dt>
                <dd>{view.job.reference.job_id}</dd>
                <dt>Issued version</dt>
                <dd>
                  {view.job.reference.issued_version_number} ·{' '}
                  {view.job.reference.issued_version_id}
                </dd>
              </dl>
              <ul>
                {view.job.lines.map((line) => (
                  <li key={line.id}>
                    <strong>{line.description}</strong>
                    <p>
                      {line.quantity_milli / 1000} {line.unit} · finding
                      correspondence not established.
                    </p>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Recorded published documentation">
              <h3>Recorded documentation</h3>
              <p>
                {view.report.visited_on} · recorded phase: {view.report.phase}
              </p>
              <p>{view.report.summary}</p>
              <dl>
                <dt>Report / published version</dt>
                <dd>
                  {view.report.reference.report_id} /{' '}
                  {view.report.reference.published_version}
                </dd>
                <dt>Published at</dt>
                <dd>{view.report.published_at}</dd>
                <dt>Recorded checklist marks</dt>
                <dd>
                  {view.coverage.checklist_recorded_checked} of{' '}
                  {view.coverage.checklist_recorded} marked in the report
                </dd>
              </dl>
              <button type="button" disabled={busy} onClick={() => void open()}>
                Open exact completion evidence source
              </button>
            </section>
          </div>
          <section
            className="completion-review-gaps"
            aria-label="Evidence limits"
          >
            <h3>What remains unverified</h3>
            <ul>
              <li>
                Physical completion, customer acceptance and warranty remain
                UNVERIFIED.
              </li>
              <li>
                Scope-line to finding relationships are not recorded; similar
                wording is not a match.
              </li>
              <li>
                Media is UNAVAILABLE. Available history completeness is UNKNOWN.
              </li>
              <li>
                An absent concern does not prove repair; checked report items
                are recorded observations.
              </li>
            </ul>
          </section>
          <fieldset disabled={busy || attempted || held}>
            <legend>Documentation review checklist</legend>
            {(
              Object.entries(completionReviewChecks) as [
                keyof typeof completionReviewChecks,
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
                disabled={!all}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Prepare an immutable documentation review summary. No completion
              certification or customer action.
            </label>
          </fieldset>
          <button
            type="button"
            disabled={busy || attempted || held || !all || !confirmed}
            onClick={() => void prepare()}
          >
            Prepare completion documentation summary
          </button>
        </>
      )}
      {detail && (
        <section
          className="completion-review-detail"
          aria-label="Exact completion evidence source"
        >
          <h3 tabIndex={-1} ref={heading}>
            Exact completion evidence source
          </h3>
          <p>
            Report {detail.reference.report_id} · published version{' '}
            {detail.reference.published_version}
          </p>
          <p>{detail.summary}</p>
          <h4>Recorded checklist</h4>
          <ul>
            {detail.checklist.map((item) => (
              <li key={item.reference.source_index}>
                {item.label} ·{' '}
                {item.recorded_completed
                  ? 'Recorded checked'
                  : 'Recorded unchecked'}{' '}
                · source position {item.reference.source_index + 1}
              </li>
            ))}
          </ul>
          <h4>Observations and recommendations</h4>
          {detail.observations.map((o) => (
            <article key={o.reference.source_index}>
              <p>
                Finding {o.reference.finding_id} · {o.severity} · {o.location}
              </p>
              <p>
                <strong>Observation:</strong> {o.observation}
              </p>
              <p>
                <strong>Recommendation:</strong> {o.recommendation}
              </p>
            </article>
          ))}
        </section>
      )}
      {packet && (
        <section
          className="completion-review-packet"
          aria-label="Immutable completion documentation summary"
        >
          <h3>Immutable completion documentation summary</h3>
          <p role="status">{status} · Documentation only · NOT SENT</p>
          {status !== 'UNKNOWN' && (
            <dl>
              <dt>Existing Proof of Work pack</dt>
              <dd>{packet.proof_of_work.reference.pack_id}</dd>
              <dt>Exact published report/version</dt>
              <dd>
                {packet.review.report.reference.report_id} /{' '}
                {packet.review.report.reference.published_version}
              </dd>
              <dt>Review SHA-256</dt>
              <dd>{packet.integrity.sha256}</dd>
            </dl>
          )}
          <p>
            Physical completion, customer acceptance and warranty: UNVERIFIED.
          </p>
          <button type="button" disabled={busy} onClick={() => void inspect()}>
            Inspect retained completion review
          </button>
        </section>
      )}
      <p className="completion-review-boundary">
        Local synthetic customer-safe preview. No login, delivery, download,
        response, acceptance or financial action. Same-tab evidence is lost on
        refresh.
      </p>
    </section>
  );
}
