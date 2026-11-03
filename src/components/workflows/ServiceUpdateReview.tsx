import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DailyWorkbenchProps } from '../../lib/workflows/daily-workbench-contract';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import {
  serviceUpdateReviewEnabled,
  readServiceUpdateReview,
  assertServiceUpdateCurrent,
  filterServiceUpdateEvidence,
  inspectServiceUpdateReport,
  serviceUpdateOriginalProps,
  continueServiceUpdateReview,
  type ServiceUpdateRead,
  type ServiceUpdateLiveCallback,
} from '../../lib/workflows/service-update-review';
import { ServicePassportPath } from './ServicePassportPath';
import './service-update-review.css';
export function ServiceUpdateReview(props: DailyWorkbenchProps) {
  const allowed = serviceUpdateReviewEnabled(props.enabled ?? false),
    live = useRef<ServiceUpdateLiveCallback>({
      current: props.onContinue,
      generation: 0,
    });
  useLayoutEffect(() => {
    const slot = live.current;
    slot.current = props.onContinue;
    slot.generation++;
    return () => {
      slot.current = undefined;
      slot.generation++;
    };
  }, [props.onContinue]);
  const [bound, setBound] = useState({
    sources: props.sources,
    hint: props.selectedJobId,
    allowed,
    generation: 0,
  });
  if (
    bound.sources !== props.sources ||
    bound.hint !== props.selectedJobId ||
    bound.allowed !== allowed
  ) {
    setBound({
      sources: props.sources,
      hint: props.selectedJobId,
      allowed,
      generation: bound.generation + 1,
    });
    return null;
  }
  return allowed ? (
    <Review key={bound.generation} {...props} live={live} />
  ) : (
    <section
      className="service-update-review"
      aria-label="Service update review"
    >
      <h2>Service update review</h2>
      <p>
        Service update review is off. Explicit development HTTP loopback
        admission is required.
      </p>
    </section>
  );
}
function Review({
  sources,
  selectedJobId,
  onSelectJob,
  onContinue,
  live,
}: DailyWorkbenchProps & { live: { current: ServiceUpdateLiveCallback } }) {
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ active: true, pending: false, sequence: 0 }),
    heading = useRef<HTMLHeadingElement>(null);
  const [admission] = useState(() => {
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      capture.check();
      const job = selectedJobId ?? capture.entries[0].target.job_id!;
      if (
        typeof job !== 'string' ||
        !job ||
        capture.entries.filter((e) => e.target.job_id === job).length !== 1
      )
        throw Error('Exact hint unavailable');
      let held = false;
      return {
        capture,
        job,
        check() {
          if (held) throw Error('UNKNOWN source selection');
          try {
            capture.check();
          } catch (error) {
            held = true;
            throw error;
          }
        },
      };
    } catch {
      return null;
    }
  });
  const [job, setJob] = useState(admission?.job ?? ''),
    [confirmed, setConfirmed] = useState(false),
    [view, setView] = useState<ServiceUpdateRead>(),
    [report, setReport] =
      useState<Awaited<ReturnType<typeof inspectServiceUpdateReport>>>(),
    [pane, setPane] = useState<'summary' | 'path'>('summary'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [filters, setFilters] = useState({ query: '', phase: '', association: '' });
  useLayoutEffect(() => {
    const l = life.current,
      g = gate.current;
    l.active = true;
    g.enabled = true;
    return () => {
      l.active = false;
      l.sequence++;
      g.enabled = false;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [view, report, pane]);
  async function run(action: () => Promise<void>) {
    const l = life.current;
    if (l.pending) return;
    l.pending = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      if (l.active)
        setError(
          'UNKNOWN or navigation cancelled. No delivery or physical completion is verified; uncertain outcomes cannot retry.',
        );
    } finally {
      if (l.active) {
        l.pending = false;
        setBusy(false);
      }
    }
  }
  async function read() {
    const id = ++life.current.sequence;
    const input = { job_id: job, staff_context_confirmed: confirmed };
    await run(async () => {
      const value = await readServiceUpdateReview(sources, input, gate.current);
      assertServiceUpdateCurrent(value);
      if (life.current.active && id === life.current.sequence) setView(value);
    });
  }
  async function inspect(
    reference: ServiceUpdateRead['evidence'][number]['reference'],
  ) {
    if (!view) return;
    await run(async () => {
      const value = await inspectServiceUpdateReport(view, reference);
      if (life.current.active) setReport(value);
    });
  }
  async function next() {
    const slot = live.current,
      callback = slot.current;
    if (!view || !report || !callback) return;
    await run(async () => {
      await continueServiceUpdateReview(view, report, callback, slot);
    });
  }
  let current = Boolean(admission),
    evidence: ReturnType<typeof filterServiceUpdateEvidence> = [],
    original: ReturnType<typeof serviceUpdateOriginalProps> | undefined;
  try {
    if (view) {
      assertServiceUpdateCurrent(view);
      evidence = filterServiceUpdateEvidence(view, filters);
      original = serviceUpdateOriginalProps(view);
    } else admission?.check();
  } catch {
    current = false;
  }
  return (
    <section
      className="service-update-review"
      aria-label="Service update review"
      aria-busy={busy}
    >
      <h2>Service update review</h2>
      <p>
        Review a safe service summary and exact published evidence. Staff review
        only · NOT SENT · physical completion UNKNOWN.
      </p>
      {busy && <p role="status">Loading exact service summary evidence…</p>}
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — current source or selected job unavailable. No fallback or restored-context retry.'}
        </p>
      )}
      {current && (
        <>
          <div className="service-update-review-ui">
            {view && (
              <nav aria-label="Service summary views">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPane('summary')}
                >
                  Return to service summary
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPane('path')}
                >
                  Open retained service Passport path
                </button>
              </nav>
            )}
            <div hidden={pane !== 'summary'}>
              <h3 ref={heading} tabIndex={-1}>
                {view
                  ? 'Safe staff service summary'
                  : 'Select exact service context'}
              </h3>
              {!view && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void read();
                  }}
                >
                  <label>
                    Service summary job
                    <select
                      value={job}
                      disabled={busy}
                      onChange={(e) => setJob(e.target.value)}
                    >
                      {admission?.capture.entries.map((e) => (
                        <option
                          key={e.target.job_id}
                          value={e.target.job_id ?? ''}
                        >
                          {e.target.job_id} · property {e.target.location_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="confirmation">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I confirm this staff-selected summary context.
                  </label>
                  <button disabled={busy || !confirmed} type="submit">
                    Review service summary
                  </button>
                </form>
              )}
              {view && (
                <>
                  <p>{view.summary}</p>
                  <p>{view.scope_description}</p>
                  <dl>
                    <dt>Property / exact job</dt>
                    <dd>
                      {view.property_label} / {view.job_id}
                    </dd>
                    <dt>Issued version</dt>
                    <dd>
                      {view.issued_version_id} / version{' '}
                      {view.issued_version_number}
                    </dd>
                    <dt>Request / job relationship</dt>
                    <dd>
                      {view.request_id} / {view.relationship}. This is
                      separately confirmed staff context.
                    </dd>
                  </dl>
                  <p>
                    {view.evidence.length} available published versions.
                    Complete history UNKNOWN; documentation and checkmarks never
                    verify work.
                  </p>
                  <label>
                    Search published service evidence
                    <input
                      maxLength={100}
                      value={filters.query}
                      onChange={(e) =>
                        setFilters({ ...filters, query: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Published evidence phase
                    <select
                      value={filters.phase}
                      onChange={(e) =>
                        setFilters({ ...filters, phase: e.target.value })
                      }
                    >
                      <option value="">All recorded phases</option>
                      {['before', 'during', 'after'].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Recorded report job association
                    <select
                      value={filters.association}
                      onChange={(e) =>
                        setFilters({ ...filters, association: e.target.value })
                      }
                    >
                      <option value="">All associations</option>
                      <option value="EXACT_RECORDED_JOB_LINK">
                        Exact recorded report/job link
                      </option>
                      <option value="UNKNOWN">UNKNOWN</option>
                    </select>
                  </label>
                  <p>{evidence.length} matching available versions</p>
                  {!evidence.length && (
                    <p>
                      No matching published evidence. Adjust literal filters; no
                      source is substituted.
                    </p>
                  )}
                  {evidence.map((e) => (
                    <article
                      key={`${e.reference.report_id}:${e.reference.published_version}`}
                    >
                      <h4>{e.summary}</h4>
                      <p>
                        {e.visited_on} · {e.phase} · association {e.association}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void inspect(e.reference)}
                      >
                        Inspect service report {e.reference.report_id} version{' '}
                        {e.reference.published_version}
                      </button>
                    </article>
                  ))}
                  {report && (
                    <article aria-label="Exact published service report">
                      <h4>
                        {report.reference.report_id} · published version{' '}
                        {report.reference.published_version}
                      </h4>
                      <p>{report.summary}</p>
                      {report.observations.map((o) => (
                        <div
                          key={`${o.reference.source_index}:${o.reference.finding_id}`}
                        >
                          <h5>Finding {o.reference.finding_id}</h5>
                          <p>
                            {o.category} · {o.location} · {o.severity}
                          </p>
                          <p>{o.observation}</p>
                          <p>Recommendation: {o.recommendation}</p>
                          <p>
                            Exact report {o.reference.report_id} / version{' '}
                            {o.reference.published_version} / source position{' '}
                            {o.reference.source_index}
                          </p>
                        </div>
                      ))}
                      {typeof onContinue === 'function' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void next()}
                        >
                          Continue to maintenance review
                        </button>
                      )}
                    </article>
                  )}
                  <h4>Missing verified evidence</h4>
                  <ul>
                    {view.requirements.map((r) => (
                      <li key={r.kind}>
                        {r.kind}: {r.status} — {r.required}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
          {view && original && (
            <div
              hidden={pane !== 'path'}
              aria-label="Retained original service path"
            >
              <ServicePassportPath
                sources={original.sources}
                selectedJobId={original.selectedJobId}
                onSelectJob={onSelectJob}
                enabled
              />
            </div>
          )}
        </>
      )}
      <footer>
        Local safe staff review only. No update transaction, sender, customer
        acceptance, physical verification or financial authority. Original
        controls retain their own confirmations and holds.
      </footer>
    </section>
  );
}
