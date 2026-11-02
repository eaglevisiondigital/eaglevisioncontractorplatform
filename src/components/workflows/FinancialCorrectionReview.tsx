import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { costCategories } from '../../domain/jobs/financials';
import {
  formatMinor,
  minorText,
  parseMinor,
} from '../../domain/estimating/calculation';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  readFinancialCorrectionSources,
  openFinancialCorrectionException,
  prepareFinancialCorrection,
  reconcileFinancialCorrection,
  type FinancialCorrectionSources,
  type FinancialCorrectionDetail,
  type FinancialCorrectionPacket,
  type FinancialCorrectionProposal,
} from '../../lib/workflows/financial-correction-review';
import './financial-correction-review.css';

export function FinancialCorrectionReview({
  sources,
  enabled = false,
  onSelectJob,
}: {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}) {
  let signature = 'OFF',
    check: (() => void) | null = null;
  if (enabled)
    try {
      const capture = captureOperatingSources(sources, sources.gate);
      signature = JSON.stringify({
        targets: capture.entries.map((e) => ({
          target: e.target,
          source: sources.estimates.readSyntheticPrototypeSources(e.target),
          release: e.release.read('staff'),
        })),
        members: sources.operations.syntheticMemberships(
          capture.organization_id,
        ),
        property: sources.property.read(capture.organization_id),
      });
      check = capture.check;
    } catch {
      signature = 'UNAVAILABLE';
    }
  const [binding, bind] = useState({
    sources,
    enabled,
    signature,
    check,
    generation: 0,
  });
  let changed = false;
  try {
    binding.check?.();
  } catch {
    changed = true;
  }
  if (
    changed ||
    binding.sources !== sources ||
    binding.enabled !== enabled ||
    binding.signature !== signature
  ) {
    bind({
      sources,
      enabled,
      signature,
      check,
      generation: binding.generation + 1,
    });
    return null;
  }
  return enabled && signature !== 'UNAVAILABLE' ? (
    <CorrectionForm
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="financial-correction"
      aria-label="Financial correction review"
    >
      <h2>Financial correction review</h2>
      <p>
        {enabled
          ? 'Current financial source evidence is unavailable. Previous evidence is withheld.'
          : 'Financial correction review is off. Confirm the local company source first.'}
      </p>
    </section>
  );
}
function CorrectionForm({
  sources,
  onSelectJob,
}: {
  sources: OperatingSources;
  onSelectJob?: (jobId: string) => void;
}) {
  const id = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    generation = useRef(0),
    admission = useRef<{ enabled: boolean; confirmed: boolean } | null>(null);
  const [review, setReview] = useState<FinancialCorrectionSources | null>(null),
    [detail, setDetail] = useState<FinancialCorrectionDetail | null>(null),
    [packet, setPacket] = useState<FinancialCorrectionPacket | null>(null),
    [values, setValues] = useState<Record<string, string>>({}),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [held, setHeld] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  useEffect(
    () => () => {
      generation.current++;
      if (admission.current) admission.current.confirmed = false;
    },
    [sources],
  );
  useEffect(() => {
    if (detail) heading.current?.focus();
  }, [detail]);
  function withdraw() {
    generation.current++;
    if (busy) {
      if (admission.current) admission.current.confirmed = false;
      setHeld(true);
      setBusy(false);
      setError('Outcome UNKNOWN after withdrawal. No replay or replacement.');
    }
    setConfirmed(false);
    setPacket(null);
    setStatus('');
  }
  async function load() {
    if (!loaded || busy || held) return;
    const token = ++generation.current,
      gate = { enabled: true, confirmed: true };
    admission.current = gate;
    setBusy(true);
    setError('');
    setReview(null);
    setDetail(null);
    try {
      const next = await readFinancialCorrectionSources(
        sources,
        { as_of: new Date().toISOString(), input_revision: 1 },
        gate,
      );
      if (token !== generation.current || !gate.confirmed) return;
      openFinancialCorrectionException(next, next.baseline.queue[0].id);
      setReview(next);
      setStatus(
        'Saved forecasts and exact financial exceptions loaded. No records changed.',
      );
    } catch {
      if (token === generation.current) {
        setHeld(true);
        setError('Financial source review is UNKNOWN. No automatic retry.');
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function open(exceptionId: string) {
    if (!review || busy || held) return;
    try {
      withdraw();
      const next = openFinancialCorrectionException(review, exceptionId);
      setDetail(next);
      setReason('');
      setValues(
        Object.fromEntries(
          costCategories.map((c) => [
            c,
            minorText(next.before.remaining[c], next.currency),
          ]),
        ),
      );
    } catch {
      setHeld(true);
      setDetail(null);
      setError('Exact source is UNKNOWN. Prior evidence is withheld.');
    }
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (!detail || !confirmed || held || busy) return;
    let input: FinancialCorrectionProposal;
    try {
      input = {
        remaining: Object.fromEntries(
          costCategories.map((c) => [
            c,
            parseMinor(values[c], detail.currency),
          ]),
        ) as FinancialCorrectionProposal['remaining'],
        reason,
        confirmed: true,
        excludes_unpaid_commitments: true,
        source_sha256: detail.source_sha256,
        input_revision: 1,
      };
    } catch {
      setError(
        'Enter nonnegative category amounts with the displayed currency precision.',
      );
      return;
    }
    const token = ++generation.current;
    setHeld(true);
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const next = await prepareFinancialCorrection(detail, input);
      if (token !== generation.current) return;
      if (
        (await reconcileFinancialCorrection(next)).status !==
        'CURRENT_UNSAVED_REVIEW_ONLY'
      )
        throw Error('UNKNOWN');
      if (token !== generation.current) return;
      setPacket(next);
      setStatus(
        'Immutable proposal prepared. Forecasts, costs, invoice status and financial records remain unchanged.',
      );
    } catch {
      if (token === generation.current)
        setError(
          'Proposal outcome UNKNOWN. This exact exception remains held; no retry or replacement.',
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!packet || busy) return;
    const token = ++generation.current;
    setBusy(true);
    const result = await reconcileFinancialCorrection(packet);
    if (token !== generation.current) return;
    setStatus(
      result.status === 'CURRENT_UNSAVED_REVIEW_ONLY'
        ? 'Exact retained proposal is current — unsaved review only.'
        : 'UNKNOWN — retained proposal is no longer current. It cannot be replayed or replaced.',
    );
    setBusy(false);
  }
  function navigate() {
    if (!review || !detail) return;
    try {
      const current = openFinancialCorrectionException(
        review,
        detail.exception.id,
      );
      onSelectJob?.(current.target.job_id!);
      openFinancialCorrectionException(review, detail.exception.id);
    } catch {
      setDetail(null);
      setPacket(null);
      setHeld(true);
      setError('Current exact job navigation is unavailable.');
    }
  }
  const money = (n: number | null) =>
    n === null ? 'UNKNOWN' : formatMinor(n, detail!.currency);
  return (
    <section
      className="financial-correction"
      aria-label="Financial correction review"
    >
      <header>
        <p className="correction-eyebrow">
          Financial review · {sources.company.name}
        </p>
        <h2>Review a proposed correction</h2>
        <p>
          Inspect the saved source, then compare an explicit remaining-cost
          proposal. Nothing is saved, resolved or paid.
        </p>
      </header>
      {!review && (
        <div className="correction-card">
          <label className="correction-check">
            <input
              type="checkbox"
              checked={loaded}
              disabled={busy || held}
              onChange={(e) => setLoaded(e.target.checked)}
            />
            I confirm this company’s current local financial sources.
          </label>
          <button
            type="button"
            disabled={!loaded || busy || held}
            onClick={() => void load()}
          >
            {busy
              ? 'Loading source evidence…'
              : 'Load saved financial exceptions'}
          </button>
        </div>
      )}
      {busy && <p role="status">Checking current source evidence…</p>}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {review && (
        <div className="correction-layout">
          <div className="correction-card">
            <h3>Exact-source exceptions</h3>
            <p>
              {review.baseline.queue.length} available review items; not
              complete company accounting.
            </p>
            <ul className="correction-queue">
              {review.baseline.queue.map((row) => {
                const job = review.baseline.portfolio.jobs.find(
                  (j) => j.target.job_id === row.job_id,
                )!;
                return (
                  <li key={row.id}>
                    <p>
                      <strong>{job.name}</strong>
                      <br />
                      {job.customer_name} · {job.property_label}
                    </p>
                    <span className="correction-tag">{row.status}</span>
                    <h4>{row.title}</h4>
                    <button
                      type="button"
                      disabled={busy || held}
                      onClick={() => open(row.id)}
                      aria-label={`Inspect ${row.title} for ${job.name}`}
                    >
                      Inspect source
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {detail && (
            <div className="correction-card">
              <h3 ref={heading} tabIndex={-1}>
                Inspected exception: {detail.exception.title}
              </h3>
              <p>
                {detail.job_name} · {detail.customer_name} ·{' '}
                {detail.property_label}
              </p>
              <p>{detail.exception.observation}</p>
              <p>{detail.exception.suggested_review}</p>
              <dl>
                <dt>Exact job</dt>
                <dd>{detail.target.job_id}</dd>
                <dt>Original issued estimate / version</dt>
                <dd>
                  {detail.target.estimate_id} / {detail.target.version_id} (v
                  {detail.exception.source.issued_version_number})
                </dd>
                <dt>Saved job revision</dt>
                <dd>{detail.exception.source.job_revision}</dd>
                <dt>Source scope hash</dt>
                <dd>{detail.exception.source.scope_sha256}</dd>
                <dt>Invoice readiness</dt>
                <dd>{detail.before.invoice_status} — no issuance authority</dd>
              </dl>
              <button type="button" onClick={navigate}>
                Open exact source job
              </button>
              <form onSubmit={(e) => void prepare(e)}>
                <fieldset disabled={busy || held}>
                  <legend>
                    Unsaved remaining-cost proposal · {detail.currency}
                  </legend>
                  <p>
                    Replace only the additional remaining forecast. Exclude
                    existing unpaid commitments; actual costs and commitments
                    stay unchanged.
                  </p>
                  <div className="correction-inputs">
                    {costCategories.map((c) => (
                      <label key={c} htmlFor={`${id}-${c}`}>
                        {c}
                        <input
                          id={`${id}-${c}`}
                          inputMode="decimal"
                          value={values[c] ?? ''}
                          onChange={(e) => {
                            withdraw();
                            setValues((v) => ({ ...v, [c]: e.target.value }));
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <label htmlFor={`${id}-reason`}>
                    Staff explanation
                    <textarea
                      id={`${id}-reason`}
                      maxLength={2000}
                      value={reason}
                      onChange={(e) => {
                        withdraw();
                        setReason(e.target.value);
                      }}
                      required
                    />
                  </label>
                  <label className="correction-check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I inspected this exact exception and saved version. These
                    are proposed remaining costs excluding unpaid commitments,
                    not verified corrections.
                  </label>
                  <button type="submit" disabled={!confirmed || !reason.trim()}>
                    Prepare immutable proposal comparison
                  </button>
                </fieldset>
              </form>
              {held && !packet && !busy && (
                <p>
                  This exception is held after an attempted preparation. No
                  replay or replacement is available.
                </p>
              )}
              {packet && (
                <article
                  className="correction-packet"
                  aria-label="Immutable financial proposal"
                >
                  <h3>Immutable Financial Proposal — Staff Review Only</h3>
                  <p>
                    Not saved, approved, resolved or executed. Missing evidence
                    remains UNKNOWN.
                  </p>
                  <div
                    role="region"
                    aria-label="Saved versus proposed remaining costs"
                    tabIndex={0}
                    className="correction-scroll"
                  >
                    <table>
                      <caption>
                        Saved source → unsaved proposal · {packet.currency}
                      </caption>
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Saved</th>
                          <th>Proposed</th>
                          <th>Difference</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packet.comparison.categories.map((c) => (
                          <tr key={c.category}>
                            <th>{c.category}</th>
                            <td>{money(c.before_minor)}</td>
                            <td>{money(c.proposed_minor)}</td>
                            <td>{money(c.delta_minor)}</td>
                            <td>
                              {c.changed ? 'Changed proposal' : 'Unchanged'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="correction-comparison">
                    <div>
                      <h4>Saved evidence</h4>
                      <p>Coverage: {packet.before.cost_coverage}</p>
                      <p>
                        Cost to complete:{' '}
                        {money(
                          packet.before.costs?.costToCompleteMinor ?? null,
                        )}
                      </p>
                      <p>
                        Projected contribution:{' '}
                        {money(
                          packet.before.margin?.projectedContributionMinor ??
                            null,
                        )}
                      </p>
                    </div>
                    <div>
                      <h4>Unsaved proposal</h4>
                      <p>Coverage: {packet.after.cost_coverage}</p>
                      <p>
                        Cost to complete:{' '}
                        {money(packet.after.costs?.costToCompleteMinor ?? null)}
                      </p>
                      <p>
                        Projected contribution:{' '}
                        {money(
                          packet.after.margin?.projectedContributionMinor ??
                            null,
                        )}
                      </p>
                    </div>
                  </div>
                  <p>
                    Cost-to-complete difference:{' '}
                    {money(packet.comparison.cost_to_complete_delta_minor)}
                  </p>
                  <p>
                    Unchanged: recorded costs, net unpaid commitments, issued
                    scope, saved revision, invoice readiness and all financial
                    records.
                  </p>
                  <ul>
                    {packet.after.missing_evidence.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <p>{packet.reason}</p>
                  <details>
                    <summary>Exact proposal evidence</summary>
                    <dl>
                      <dt>Packet</dt>
                      <dd>{packet.id}</dd>
                      <dt>Integrity</dt>
                      <dd>{packet.sha256}</dd>
                      <dt>Original offer / receipt</dt>
                      <dd>
                        {packet.original_offer_id} /{' '}
                        {packet.original_receipt_id}
                      </dd>
                      <dt>Responsible synthetic reviewer</dt>
                      <dd>{packet.reviewer_id}</dd>
                      <dt>Custody</dt>
                      <dd>Session only; no refresh or crash durability.</dd>
                    </dl>
                  </details>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reconcile()}
                  >
                    Reconcile exact retained proposal
                  </button>
                </article>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
