import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import {
  serviceRevisionReviewEnabled,
  readServiceRevisionReview,
  readServiceRevisionUpdates,
  assertServiceRevisionAccess,
  assertServiceRevisionCurrent,
  filterServiceRevisionReports,
  inspectServiceRevisionReport,
  inspectServiceRevisionComparison,
  createServiceRevisionSelection,
  readServiceRevisionSelection,
  adoptServiceRevisionReview,
  type ServiceRevisionRead,
  type ServiceRevisionSelection,
  type ServiceRevisionInspection,
} from '../../lib/workflows/service-revision-review';
import { SharedRecordSearch } from './SharedRecordSearch';
import './service-revision-review.css';
export function ServiceRevisionReview(props: SavedRevisionPanelProps) {
  const allowed = serviceRevisionReviewEnabled(props.enabled ?? false);
  const [context, setContext] = useState({
    sources: props.sources,
    hint: props.selectedJobId,
    allowed,
    serial: 0,
  });
  if (
    context.sources !== props.sources ||
    context.hint !== props.selectedJobId ||
    context.allowed !== allowed
  ) {
    setContext({
      sources: props.sources,
      hint: props.selectedJobId,
      allowed,
      serial: context.serial + 1,
    });
    return null;
  }
  return allowed ? (
    <Review key={context.serial} {...props} />
  ) : (
    <p role="status">Service revision review is off.</p>
  );
}
function Review({ sources, selectedJobId }: SavedRevisionPanelProps) {
  const [job, setJob] = useState(selectedJobId ?? ''),
    [selection, setSelection] = useState<ServiceRevisionSelection>(),
    [candidate, setCandidate] = useState<ServiceRevisionRead>(),
    [inspection, setInspection] = useState<ServiceRevisionInspection>(),
    [report, setReport] =
      useState<ReturnType<typeof inspectServiceRevisionReport>>(),
    [query, setQuery] = useState(''),
    [phase, setPhase] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ active: true, pending: false, serial: 0 }),
    heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current;
    g.enabled = true;
    l.active = true;
    return () => {
      g.enabled = false;
      l.active = false;
      l.serial++;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [selection, candidate, inspection, report, revision]);
  let selected: ReturnType<typeof readServiceRevisionSelection> | undefined,
    available: ReturnType<typeof filterServiceRevisionReports> = [],
    accessible = true,
    candidateStale = false;
  try {
    if (selection) {
      selected = readServiceRevisionSelection(selection);
      if (candidate) {
        assertServiceRevisionAccess(candidate);
        try {
          assertServiceRevisionCurrent(candidate);
        } catch {
          candidateStale = true;
        }
      }
      available = filterServiceRevisionReports(
        candidate ?? selected.snapshot,
        query,
        phase,
      );
    } else {
      const c = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      if (
        selectedJobId !== undefined &&
        c.entries.filter((e) => e.target.job_id === selectedJobId).length !== 1
      )
        throw Error('Exact selected job unavailable');
      c.check();
    }
  } catch {
    accessible = false;
  }
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
          'UNKNOWN — exact source, access or selection changed. No source is substituted and no original hold is reset.',
        );
    } finally {
      l.pending = false;
      if (l.active) setBusy(false);
    }
  }
  async function initial() {
    const serial = ++life.current.serial;
    await run(async () => {
      const view = await readServiceRevisionReview(sources, job, gate.current);
      assertServiceRevisionAccess(view);
      if (life.current.active && life.current.serial === serial)
        setSelection(createServiceRevisionSelection(view));
    });
  }
  async function updates() {
    if (!selection) return;
    const before = readServiceRevisionSelection(selection),
      serial = ++life.current.serial;
    setCandidate(undefined);
    setInspection(undefined);
    setConfirmed(false);
    setReport(undefined);
    await run(async () => {
      const next = await readServiceRevisionUpdates(before.snapshot);
      assertServiceRevisionAccess(next);
      if (life.current.active && serial === life.current.serial)
        setCandidate(next);
    });
  }
  function compare() {
    if (!selected || !candidate || busy) return;
    setConfirmed(false);
    setError('');
    try {
      setInspection(
        inspectServiceRevisionComparison(selected.snapshot, candidate),
      );
    } catch {
      setError(
        'No distinct newer published sibling is available for this exact visit and job, or the inspected source changed.',
      );
    }
  }
  function adopt() {
    if (!selected || !selection || !inspection || busy) return;
    try {
      const result = adoptServiceRevisionReview(
        selection,
        inspection,
        selected.generation,
        confirmed,
      );
      setReport(result.snapshot.evidence.selected);
      setCandidate(undefined);
      setInspection(undefined);
      setConfirmed(false);
      setRevision(result.generation);
      setError('');
    } catch {
      setError(
        'Adoption denied: explicit current inspection and selection generation required. No retry of an original action.',
      );
    }
  }
  function inspect(
    reference: ServiceRevisionRead['evidence']['reports'][number]['reference'],
  ) {
    if (!selected) return;
    try {
      setReport(
        inspectServiceRevisionReport(candidate ?? selected.snapshot, reference),
      );
    } catch {
      setError(
        'Exact published version unavailable. No latest or similar report fallback.',
      );
    }
  }
  return (
    <section
      className="service-revision-review"
      aria-label="Service revision review"
      aria-busy={busy}
    >
      <header>
        <div>
          <h2>Service revision review</h2>
          <p>
            Inspect saved published versions for one exact job. Adoption changes
            this local review selection only.
          </p>
        </div>
        <span>Read only · NOT SENT</span>
      </header>
      {busy && <p role="status">Reading exact published service evidence…</p>}
      {(error || !accessible) && (
        <p role="alert">
          {error ||
            'UNKNOWN — source or current access unavailable. No restored-context fallback.'}
        </p>
      )}
      {accessible && (
        <div className="service-revision-review-ui">
          <h3 ref={heading} tabIndex={-1}>
            Published service source and revision context
          </h3>
          {!selection && (
            <>
              {selectedJobId === undefined && (
                <SharedRecordSearch
                  sources={sources}
                  enabled
                  onSelectJob={(id) => setJob(id)}
                />
              )}
              <p>
                Exact service job:{' '}
                {job || 'Select an available job using shared record search.'}
              </p>
              <button
                type="button"
                disabled={busy || !job}
                onClick={() => void initial()}
              >
                Read published service source
              </button>
            </>
          )}
          {selected && (
            <>
              <dl>
                <dt>Property / exact job</dt>
                <dd>
                  {selected.snapshot.evidence.property_label} /{' '}
                  {selected.snapshot.identity.job_id}
                </dd>
                <dt>Issued source</dt>
                <dd>{selected.snapshot.identity.version_id}</dd>
                <dt>Request / job relationship</dt>
                <dd>
                  {selected.snapshot.evidence.request_id} /{' '}
                  {selected.snapshot.evidence.request_job_link}
                </dd>
                <dt>Selected published version / local generation</dt>
                <dd>
                  {selected.snapshot.evidence.selected.reference.report_id} /
                  version{' '}
                  {
                    selected.snapshot.evidence.selected.reference
                      .published_version
                  }{' '}
                  / generation {selected.generation}
                </dd>
              </dl>
              <p>
                {selected.snapshot.evidence.scope.name}:{' '}
                {selected.snapshot.evidence.scope.description}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void updates()}
              >
                Read saved service updates
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setReport(selected.snapshot.evidence.selected);
                  setError('');
                }}
              >
                Return to selected service version
              </button>
              {candidateStale && (
                <p role="status">
                  Saved candidate changed. Read saved service updates again
                  before inspection or adoption.
                </p>
              )}
              {candidate && (
                <aside aria-label="Saved published service candidate">
                  <p>
                    Inspected candidate:{' '}
                    {candidate.evidence.selected.reference.report_id} / version{' '}
                    {candidate.evidence.selected.reference.published_version}.
                    The selected version is unchanged until confirmed adoption.
                  </p>
                  <button
                    type="button"
                    disabled={busy || candidateStale}
                    onClick={compare}
                  >
                    Inspect published revision comparison
                  </button>
                </aside>
              )}
              {inspection && (
                <article aria-label="Published service revision comparison">
                  <h4>
                    Published versions{' '}
                    {inspection.before.reference.published_version} and{' '}
                    {inspection.current.reference.published_version}
                  </h4>
                  <p>Before: {inspection.before.report.summary}</p>
                  <p>Current candidate: {inspection.current.report.summary}</p>
                  <p>
                    Same visit: {inspection.before.visit_id}. Same-date versions
                    do not prove a change in physical condition.
                  </p>
                  {inspection.differences.checklist.map((r, i) => (
                    <p key={i}>
                      {r.label}: recorded result{' '}
                      {r.earlier?.completed === undefined
                        ? 'absent'
                        : String(r.earlier.completed)}{' '}
                      →{' '}
                      {r.later?.completed === undefined
                        ? 'absent'
                        : String(r.later.completed)}
                      . {r.uncertainty}
                    </p>
                  ))}
                  {inspection.differences.findings.map((f, i) => (
                    <p key={i}>
                      {f.category} / {f.location}: {f.presence}.{' '}
                      {f.uncertainties.join(' ')}
                    </p>
                  ))}
                  <label className="confirmation">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I reviewed both exact published versions.
                  </label>
                  <button
                    type="button"
                    disabled={busy || candidateStale || !confirmed}
                    onClick={adopt}
                  >
                    Adopt inspected published version
                  </button>
                </article>
              )}
              <label>
                Search published service versions
                <input
                  value={query}
                  maxLength={100}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                Published service phase
                <select
                  value={phase}
                  onChange={(e) => setPhase(e.target.value)}
                >
                  <option value="">All recorded phases</option>
                  {['before', 'during', 'after'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <p>
                {available.length} matching available published versions.
                Complete history UNKNOWN.
              </p>
              {!available.length && (
                <p>
                  No matching published versions. Adjust literal filters;
                  missing evidence does not establish completion.
                </p>
              )}
              {available.map((r) => (
                <article key={r.reference.report_id}>
                  <h4>{r.report.summary}</h4>
                  <p>
                    {r.reference.report_id} / version{' '}
                    {r.reference.published_version} / {r.report.visited_on} /{' '}
                    {r.report.phase}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => inspect(r.reference)}
                  >
                    Inspect service version {r.reference.published_version} ·{' '}
                    {r.reference.report_id}
                  </button>
                </article>
              ))}
              {report && (
                <article aria-label="Exact safe Passport service evidence">
                  <h4>
                    Exact published service version{' '}
                    {report.reference.published_version}
                  </h4>
                  <p>
                    {report.reference.report_id} / {report.sha256}
                  </p>
                  <p>{report.report.summary}</p>
                  {report.report.observations.map((o) => (
                    <div
                      key={`${o.reference.finding_id}:${o.reference.source_index}`}
                    >
                      <h5>Finding {o.reference.finding_id}</h5>
                      <p>
                        {o.category} / {o.location} / {o.severity}
                      </p>
                      <p>{o.observation}</p>
                      <p>Recommendation: {o.recommendation}</p>
                      <p>
                        Exact report {o.reference.report_id}, version{' '}
                        {o.reference.published_version}, source position{' '}
                        {o.reference.source_index}
                      </p>
                    </div>
                  ))}
                  <p>
                    Published documentation and recorded checklist results do
                    not verify physical completion, customer acceptance or
                    warranty.
                  </p>
                </article>
              )}
            </>
          )}
        </div>
      )}
      <footer>
        Customer-safe published evidence only. Physical completion, acceptance
        and warranty UNVERIFIED. No publication, customer response, delivery or
        new Proof-of-Work attempt. Original controls retain their own holds.
      </footer>
    </section>
  );
}
