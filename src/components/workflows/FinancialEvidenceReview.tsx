import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { detached } from '../../domain/jobs/margin-analysis';
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
  readFinancialEvidenceSources,
  openFinancialEvidenceSource,
  prepareFinancialEvidenceReview,
  reconcileFinancialEvidenceReview,
  type FinancialEvidenceSources,
  type FinancialEvidenceDetail,
  type FinancialEvidencePacket,
  financialEvidenceEnabled,
  assertFinancialEvidenceCurrent,
} from '../../lib/workflows/financial-evidence-review';
import type { FinancialCorrectionProposal } from '../../lib/workflows/financial-correction-review';
import './financial-evidence-review.css';

/** Include the visible action words in the accessible name for speech input. */
export function FinancialEvidenceSourceButton({
  title,
  job,
  disabled,
  onInspect,
}: {
  title: string;
  job: string;
  disabled: boolean;
  onInspect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onInspect}
      aria-label={`Inspect source: ${title} for ${job}`}
    >
      Inspect source
    </button>
  );
}

export function FinancialEvidenceReview({
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
  if (financialEvidenceEnabled(enabled))
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      signature = JSON.stringify(
        detached({
          targets: capture.entries.map((e) => ({
            target: e.target,
            source: sources.estimates.readSyntheticPrototypeSources(e.target),
            release: e.release.read('staff'),
          })),
          members: sources.operations.syntheticMemberships(
            capture.organization_id,
          ),
          property: sources.property.read(capture.organization_id),
        }),
      );
      capture.check();
      check = () => {
        if (!financialEvidenceEnabled(enabled))
          throw Error('Local evidence review is off');
        capture.check();
      };
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
  return financialEvidenceEnabled(enabled) && signature !== 'UNAVAILABLE' ? (
    <EvidenceForm
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="financial-evidence"
      aria-label="Canonical financial evidence review"
    >
      <h2>Canonical financial evidence review</h2>
      <p>
        {enabled
          ? 'Current financial source evidence is unavailable. Previous evidence is withheld.'
          : 'Canonical financial evidence review is off. Confirm the local company source first.'}
      </p>
    </section>
  );
}
function EvidenceForm({
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
  const [review, setReview] = useState<FinancialEvidenceSources | null>(null),
    [detail, setDetail] = useState<FinancialEvidenceDetail | null>(null),
    [packet, setPacket] = useState<FinancialEvidencePacket | null>(null),
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
      const next = await readFinancialEvidenceSources(
        sources,
        { as_of: new Date().toISOString(), input_revision: 1 },
        gate,
      );
      if (token !== generation.current || !gate.confirmed) return;
      openFinancialEvidenceSource(next, next.correction.baseline.queue[0].id);
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
      const next = openFinancialEvidenceSource(review, exceptionId);
      setDetail(next);
      setReason('');
      setValues(
        Object.fromEntries(
          costCategories.map((c) => [
            c,
            minorText(
              next.correction.before.remaining[c],
              next.correction.currency,
            ),
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
            parseMinor(values[c], detail.correction.currency),
          ]),
        ) as FinancialCorrectionProposal['remaining'],
        reason,
        confirmed: true,
        excludes_unpaid_commitments: true,
        source_sha256: detail.correction.source_sha256,
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
      const next = await prepareFinancialEvidenceReview(detail, input);
      if (token !== generation.current) return;
      if (
        (await reconcileFinancialEvidenceReview(next)).status !==
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
    const result = await reconcileFinancialEvidenceReview(packet);
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
      const current = openFinancialEvidenceSource(
        review,
        detail.correction.exception.id,
      );
      onSelectJob?.(current.correction.target.job_id!);
      openFinancialEvidenceSource(review, detail.correction.exception.id);
    } catch {
      setDetail(null);
      setPacket(null);
      setHeld(true);
      setError('Current exact job navigation is unavailable.');
    }
  }
  let current = true;
  try {
    if (review) assertFinancialEvidenceCurrent(review);
    if (detail) assertFinancialEvidenceCurrent(detail);
    if (packet) assertFinancialEvidenceCurrent(packet);
  } catch {
    current = false;
  }
  if (!current)
    return (
      <section
        className="financial-evidence"
        aria-label="Canonical financial evidence review"
      >
        <h2>Canonical financial evidence review</h2>
        <p role="alert">
          Current evidence is UNKNOWN. Previous evidence is withheld; no replay
          or replacement.
        </p>
      </section>
    );
  const money = (n: number | null) =>
    n === null ? 'UNKNOWN' : formatMinor(n, detail!.correction.currency);
  return (
    <section
      className="financial-evidence"
      aria-label="Canonical financial evidence review"
    >
      <header>
        <p className="evidence-eyebrow">
          Financial review · {sources.company.name}
        </p>
        <h2>Review canonical financial evidence</h2>
        <p>
          Inspect exact invoice, payment-event and ledger evidence beside a
          saved forecast. Synthetic staff review only; nothing is saved,
          resolved or paid.
        </p>
      </header>
      {!review && (
        <div className="evidence-card">
          <label className="evidence-check">
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
              : 'Load canonical financial evidence'}
          </button>
        </div>
      )}
      {busy && <p role="status">Checking current source evidence…</p>}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {review && (
        <div className="evidence-layout">
          <div className="evidence-card">
            <h3>Exact-source exceptions</h3>
            <p>
              {review.correction.baseline.queue.length} available review items;
              not complete company accounting.
            </p>
            <ul className="evidence-queue">
              {review.correction.baseline.queue.map((row) => {
                const job = review.correction.baseline.portfolio.jobs.find(
                  (j) => j.target.job_id === row.job_id,
                )!;
                return (
                  <li key={row.id}>
                    <p>
                      <strong>{job.name}</strong>
                      <br />
                      {job.customer_name} · {job.property_label}
                    </p>
                    <span className="evidence-tag">{row.status}</span>
                    <h4>{row.title}</h4>
                    <FinancialEvidenceSourceButton
                      title={row.title}
                      job={job.name}
                      disabled={busy || held}
                      onInspect={() => open(row.id)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
          {detail && (
            <div className="evidence-card">
              <h3 ref={heading} tabIndex={-1}>
                Inspected financial source: {detail.correction.exception.title}
              </h3>
              <p>
                {detail.correction.job_name} · {detail.correction.customer_name}{' '}
                · {detail.correction.property_label}
              </p>
              <p>{detail.correction.exception.observation}</p>
              <p>{detail.correction.exception.suggested_review}</p>
              <dl>
                <dt>Exact job</dt>
                <dd>{detail.correction.target.job_id}</dd>
                <dt>Original issued estimate / version</dt>
                <dd>
                  {detail.correction.target.estimate_id} /{' '}
                  {detail.correction.target.version_id} (v
                  {detail.correction.exception.source.issued_version_number})
                </dd>
                <dt>Saved job revision</dt>
                <dd>{detail.correction.exception.source.job_revision}</dd>
                <dt>Source scope hash</dt>
                <dd>{detail.correction.exception.source.scope_sha256}</dd>
                <dt>Invoice readiness</dt>
                <dd>
                  {detail.correction.before.invoice_status} — no issuance
                  authority
                </dd>
              </dl>
              <button type="button" onClick={navigate}>
                Open exact source job
              </button>
              <CanonicalEvidence
                evidence={detail.evidence}
                label="Inspected source"
              />
              <form onSubmit={(e) => void prepare(e)}>
                <fieldset disabled={busy || held}>
                  <legend>
                    Unsaved remaining-cost proposal ·{' '}
                    {detail.correction.currency}
                  </legend>
                  <p>
                    Replace only the additional remaining forecast. Exclude
                    existing unpaid commitments; actual costs and commitments
                    stay unchanged.
                  </p>
                  <div className="evidence-inputs">
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
                  <label className="evidence-check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I inspected this exact exception, saved version and
                    canonical invoice, event and ledger evidence or its stated
                    missing coverage. These are proposed remaining costs
                    excluding unpaid commitments, not verified corrections.
                  </label>
                  <button type="submit" disabled={!confirmed || !reason.trim()}>
                    Prepare source-bound financial comparison
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
                  className="evidence-packet"
                  aria-label="Immutable financial proposal"
                >
                  <h3>Immutable Financial Evidence — Staff Review Only</h3>
                  <p>
                    Not saved, approved, resolved or executed. Missing evidence
                    remains UNKNOWN.
                  </p>
                  <div
                    role="region"
                    aria-label="Saved versus proposed remaining costs"
                    tabIndex={0}
                    className="evidence-scroll"
                  >
                    <table>
                      <caption>
                        Saved source → unsaved proposal ·{' '}
                        {packet.correction.currency}
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
                        {packet.correction.comparison.categories.map((c) => (
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
                  <div className="evidence-comparison">
                    <div>
                      <h4>Saved evidence</h4>
                      <p>Coverage: {packet.correction.before.cost_coverage}</p>
                      <p>
                        Cost to complete:{' '}
                        {money(
                          packet.correction.before.costs?.costToCompleteMinor ??
                            null,
                        )}
                      </p>
                      <p>
                        Projected contribution:{' '}
                        {money(
                          packet.correction.before.margin
                            ?.projectedContributionMinor ?? null,
                        )}
                      </p>
                    </div>
                    <div>
                      <h4>Unsaved proposal</h4>
                      <p>Coverage: {packet.correction.after.cost_coverage}</p>
                      <p>
                        Cost to complete:{' '}
                        {money(
                          packet.correction.after.costs?.costToCompleteMinor ??
                            null,
                        )}
                      </p>
                      <p>
                        Projected contribution:{' '}
                        {money(
                          packet.correction.after.margin
                            ?.projectedContributionMinor ?? null,
                        )}
                      </p>
                    </div>
                  </div>
                  <p>
                    Cost-to-complete difference:{' '}
                    {money(
                      packet.correction.comparison.cost_to_complete_delta_minor,
                    )}
                  </p>
                  <p>
                    Unchanged: recorded costs, net unpaid commitments, issued
                    scope, saved revision, invoice readiness and all financial
                    records.
                  </p>
                  <ul>
                    {packet.correction.after.missing_evidence.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <p>{packet.correction.reason}</p>
                  <p>
                    Canonical invoice, event and ledger evidence is identical
                    before and after.
                  </p>
                  <CanonicalEvidence
                    evidence={packet.canonical_after}
                    label="Immutable retained packet"
                  />
                  <details>
                    <summary>Exact proposal evidence</summary>
                    <dl>
                      <dt>Packet</dt>
                      <dd>{packet.id}</dd>
                      <dt>Integrity</dt>
                      <dd>{packet.sha256}</dd>
                      <dt>Original offer / receipt</dt>
                      <dd>
                        {packet.correction.original_offer_id} /{' '}
                        {packet.correction.original_receipt_id}
                      </dd>
                      <dt>Responsible synthetic reviewer</dt>
                      <dd>{packet.correction.reviewer_id}</dd>
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

function CanonicalEvidence({
  evidence,
  label,
}: {
  label: string;
  evidence: FinancialEvidenceDetail['evidence'];
}) {
  return (
    <article
      className="evidence-canonical"
      aria-label={`${label}: Canonical evidence for job ${evidence.target.job_id}`}
    >
      <h4>Canonical invoice, event and ledger evidence</h4>
      <p>Coverage: {evidence.coverage}. Synthetic reference only.</p>
      <p>
        Bank settlement: UNKNOWN · Void: UNKNOWN · Genuine provider evidence:
        UNVERIFIED
      </p>
      <ul>
        {evidence.missing_evidence.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      {!evidence.invoices.length && (
        <p>
          No exact linked canonical invoice is available for this job. Financial
          amounts remain UNKNOWN; unlinked records do not fill this gap.
        </p>
      )}
      {evidence.invoices.map((invoice) => (
        <div key={invoice.invoice_id}>
          <h4>Invoice {invoice.invoice_id}</h4>
          <p>
            Linkage: {invoice.linkage} · Verification: {invoice.verification}
          </p>
          <dl>
            <dt>Contract / original offer / issued version</dt>
            <dd>
              {invoice.contract_id} / {invoice.offer_id ?? 'UNKNOWN'} /{' '}
              {invoice.issued_version_id ?? 'UNKNOWN'}
            </dd>
            <dt>
              Canonical invoice balance (minor units, {evidence.currency})
            </dt>
            <dd>{invoice.summary?.balance_minor ?? 'UNKNOWN'}</dd>
            <dt>Canonical source integrity</dt>
            <dd>{invoice.source_sha256 ?? 'UNKNOWN'}</dd>
          </dl>
          <ul>
            {invoice.missing_evidence.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <div
            className="evidence-scroll"
            role="region"
            aria-label={`${label}: Canonical event and ledger evidence for invoice ${invoice.invoice_id}`}
            tabIndex={0}
          >
            <table>
              <caption>
                Exact recorded synthetic evidence · {evidence.currency} ·{' '}
                {evidence.target.job_id}
              </caption>
              <thead>
                <tr>
                  <th>Source identity</th>
                  <th>Kind / posting</th>
                  <th>Event relationship</th>
                  <th>Amount (minor units)</th>
                </tr>
              </thead>
              <tbody>
                {invoice.events.map((event) => (
                  <tr key={event.id}>
                    <th>{event.id}</th>
                    <td>{event.kind}</td>
                    <td>{event.adjusts_event_id ?? 'No adjusting event'}</td>
                    <td>{event.amount_minor}</td>
                  </tr>
                ))}
                {invoice.ledger.map((row) => (
                  <tr key={row.id}>
                    <th>{row.id}</th>
                    <td>
                      {row.debit_account} → {row.credit_account}
                    </td>
                    <td>{row.event_id ?? 'Original invoice posting'}</td>
                    <td>{row.amount_minor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {(evidence.unlinked_events.length > 0 ||
        evidence.unlinked_ledger.length > 0) && (
        <details>
          <summary>UNLINKED canonical source identities</summary>
          <p>
            These records cannot establish this job’s amounts or a payment
            outcome.
          </p>
          <ul>
            {evidence.unlinked_events.map((e) => (
              <li key={e.id}>
                Event {e.id} / invoice {e.invoice_id}
              </li>
            ))}
            {evidence.unlinked_ledger.map((e) => (
              <li key={e.id}>
                Ledger {e.id} / invoice {e.invoice_id} / event{' '}
                {e.event_id ?? 'UNKNOWN'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
