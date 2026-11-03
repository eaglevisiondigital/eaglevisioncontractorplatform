import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DailyWorkbenchProps } from '../../lib/workflows/daily-workbench-contract';
import type { CompletionReviewView } from '../../lib/workflows/completion-review';
import { PropertyReportHistory } from '../property/PropertyReportHistory';
import { SharedRecordSearch } from './SharedRecordSearch';
import {
  publishedServiceNavigationEnabled,
  readPublishedServiceHistory,
  refreshPublishedServiceHistory,
  assertPublishedServiceHistory,
  publishedServiceContext,
  filterPublishedServiceHistory,
  inspectPublishedServiceReport,
  inspectPublishedServiceFinding,
  publishedServiceReportPage,
  readPublishedServiceRequirements,
  continuePublishedServiceReview,
  type PublishedServiceHistory,
  type PublishedServiceReport,
  type PublishedServiceCallback,
} from '../../lib/workflows/published-service-navigation';
import './published-service-navigation.css';
export function PublishedServiceNavigator(props: DailyWorkbenchProps) {
  if (!publishedServiceNavigationEnabled(props.enabled))
    return (
      <section
        className="published-service-navigator"
        aria-label="Published service navigator"
      >
        <p role="status">Published service navigation is OFF.</p>
      </section>
    );
  return <BoundNavigator {...props} />;
}
function BoundNavigator(props: DailyWorkbenchProps) {
  const [context, setContext] = useState({
    sources: props.sources,
    job: props.selectedJobId,
    epoch: 0,
  });
  if (
    context.sources !== props.sources ||
    context.job !== props.selectedJobId
  ) {
    setContext({
      sources: props.sources,
      job: props.selectedJobId,
      epoch: context.epoch + 1,
    });
    return null;
  }
  return <Session key={context.epoch} {...props} />;
}
function Session({ sources, selectedJobId, onContinue }: DailyWorkbenchProps) {
  const [job, setJob] = useState(selectedJobId ?? ''),
    [history, setHistory] = useState<PublishedServiceHistory>(),
    [report, setReport] = useState<PublishedServiceReport>(),
    [finding, setFinding] =
      useState<PublishedServiceReport['report']['observations'][number]>(),
    [requirements, setRequirements] = useState<CompletionReviewView>(),
    [panel, setPanel] = useState<
      'history' | 'report' | 'finding' | 'requirements'
    >('history'),
    [query, setQuery] = useState(''),
    [phase, setPhase] = useState(''),
    [severity, setSeverity] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(
      'Read exact published history before selecting a report or finding.',
    );
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, serial: 0 }),
    lease = useRef<PublishedServiceCallback>({
      current: onContinue,
      generation: 0,
    }),
    heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const callback = lease.current;
    callback.current = onContinue;
    callback.generation++;
    return () => {
      callback.current = undefined;
      callback.generation++;
    };
  }, [onContinue]);
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current;
    g.enabled = true;
    l.alive = true;
    return () => {
      g.enabled = false;
      l.alive = false;
      l.serial++;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [history, report, finding, requirements, panel]);
  let access = true,
    matches: readonly PublishedServiceReport[] = [],
    context: ReturnType<typeof publishedServiceContext> | undefined,
    reportPage: ReturnType<typeof publishedServiceReportPage> = [];
  try {
    if (history) {
      assertPublishedServiceHistory(history);
      context = publishedServiceContext(history);
      matches = filterPublishedServiceHistory(history, {
        query,
        phase,
        severity,
      });
      if (report && panel === 'report')
        reportPage = publishedServiceReportPage(history, report.reference);
    }
  } catch {
    access = false;
  }
  async function run(action: (live: () => boolean) => Promise<void>) {
    const l = life.current;
    if (l.pending) return;
    l.pending = true;
    const serial = ++l.serial;
    setBusy(true);
    setError('');
    const live = () => l.alive && l.serial === serial;
    try {
      await action(live);
    } catch {
      if (live())
        setError(
          'UNKNOWN — exact published source, current access or callback changed. No fallback, completion, replay or replacement.',
        );
    } finally {
      l.pending = false;
      if (live()) setBusy(false);
    }
  }
  function openReport(next: PublishedServiceReport) {
    if (!history || busy) return;
    try {
      const exact = inspectPublishedServiceReport(history, next.reference);
      setReport(exact);
      setFinding(undefined);
      setRequirements(undefined);
      setPanel('report');
      setError('');
    } catch {
      setError(
        'Exact original report/version unavailable; no latest-version fallback.',
      );
    }
  }
  async function read(refresh: boolean) {
    await run(async (live) => {
      const next =
        refresh && history
          ? await refreshPublishedServiceHistory(history)
          : await readPublishedServiceHistory(sources, job, gate.current);
      assertPublishedServiceHistory(next);
      let retained: PublishedServiceReport | undefined;
      if (report) {
        const exact = next.reports.find(
          (r) =>
            r.reference.report_id === report.reference.report_id &&
            r.reference.published_version ===
              report.reference.published_version,
        );
        if (!exact) throw Error('Previously selected exact report missing');
        retained = inspectPublishedServiceReport(next, exact.reference);
      }
      if (!live()) return;
      setHistory(next);
      setReport(retained);
      setFinding(undefined);
      setRequirements(undefined);
      setPanel(retained ? 'report' : 'history');
      setMessage(
        refresh
          ? 'Available published history refreshed. The selected exact report is retained; choose another version explicitly.'
          : 'Published history loaded for this exact job. Available versions do not establish complete history.',
      );
    });
  }
  return (
    <section
      className="published-service-navigator"
      aria-label="Published service navigator"
      aria-busy={busy}
    >
      <header>
        <p className="psn-eyebrow">PUBLISHED HISTORY · STAFF REVIEW</p>
        <h2>Published service navigator</h2>
        <p>
          Open an exact report, finding or completion requirement without
          changing the published record.
        </p>
      </header>
      <p role="status">
        {busy ? 'Reading exact published service sources…' : message}
      </p>
      {(error || !access) && (
        <p role="alert">
          {error ||
            'UNKNOWN — current source or membership unavailable; retained evidence is withheld.'}
        </p>
      )}
      {access && (
        <>
          <h3 ref={heading} tabIndex={-1}>
            Published service source
          </h3>
          {!history && (
            <>
              {selectedJobId === undefined && (
                <SharedRecordSearch
                  sources={sources}
                  enabled
                  onSelectJob={(id) => setJob(id)}
                />
              )}
              <p>
                Exact retained job:{' '}
                {job || 'Select an authorized job using shared record search.'}
              </p>
              <button
                type="button"
                disabled={busy || !job}
                onClick={() => void read(false)}
              >
                Read exact published history
              </button>
            </>
          )}
          {history && context && (
            <>
              <dl className="psn-context">
                <div>
                  <dt>Property / exact job</dt>
                  <dd>
                    {history.property_label} / {context.job_id}
                  </dd>
                </div>
                <div>
                  <dt>Immutable issued version</dt>
                  <dd>{context.issued_version_id}</dd>
                </div>
                <div>
                  <dt>Request / recorded job relationship</dt>
                  <dd>
                    {history.request_id} / {history.request_job_link}
                  </dd>
                </div>
              </dl>
              <nav aria-label="Published service navigation">
                <button
                  type="button"
                  aria-current={panel === 'history' ? 'page' : undefined}
                  disabled={busy}
                  onClick={() => {
                    setPanel('history');
                    setError('');
                  }}
                >
                  Return to published history
                </button>
                {report && (
                  <button
                    type="button"
                    aria-current={panel === 'report' ? 'page' : undefined}
                    disabled={busy}
                    onClick={() => openReport(report)}
                  >
                    Return to selected published report
                  </button>
                )}
              </nav>
              <button
                type="button"
                disabled={busy}
                onClick={() => void read(true)}
              >
                Read latest available published history
              </button>
              {report && (
                <label>
                  Published report version
                  <select
                    value={
                      report.reference.report_id +
                      '/' +
                      report.reference.published_version
                    }
                    disabled={busy}
                    onChange={(e) => {
                      const exact = history.reports.find(
                        (r) =>
                          r.reference.report_id +
                            '/' +
                            r.reference.published_version ===
                          e.target.value,
                      );
                      if (exact) openReport(exact);
                    }}
                  >
                    {history.reports.map((r) => (
                      <option
                        key={r.reference.report_id}
                        value={
                          r.reference.report_id +
                          '/' +
                          r.reference.published_version
                        }
                      >
                        Version {r.reference.published_version} ·{' '}
                        {r.reference.report_id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {panel === 'history' && (
                <>
                  <div className="psn-filters">
                    <label>
                      Search published service history
                      <input
                        maxLength={100}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <label>
                      Published report phase
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
                    <label>
                      Recorded finding severity
                      <select
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value)}
                      >
                        <option value="">All recorded severities</option>
                        {['low', 'moderate', 'urgent'].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p>
                    {matches.length} matching of {history.reports.length}{' '}
                    available exact-job published versions. Complete history
                    UNKNOWN.
                  </p>
                  {!matches.length && (
                    <p>
                      No published reports match these literal filters. Missing
                      evidence does not establish completion.
                    </p>
                  )}
                  {matches.map((r) => (
                    <article key={r.reference.report_id}>
                      <h4>{r.report.summary}</h4>
                      <p>
                        {r.report.visited_on} · {r.report.phase} · report{' '}
                        {r.reference.report_id} / version{' '}
                        {r.reference.published_version}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openReport(r)}
                      >
                        Inspect published report version{' '}
                        {r.reference.published_version} ·{' '}
                        {r.reference.report_id}
                      </button>
                    </article>
                  ))}
                </>
              )}
              {report && panel !== 'history' && (
                <>
                  <p className="psn-reference">
                    Exact report {report.reference.report_id} / version{' '}
                    {report.reference.published_version} · visit{' '}
                    {report.visit_id} · plan {report.plan_id}
                  </p>
                  {panel === 'report' && (
                    <>
                      <p>
                        Checklist values are recorded documentation. They do not
                        verify physical completion, customer approval or
                        warranty.
                      </p>
                      <PropertyReportHistory reports={reportPage} />
                      <div className="psn-actions">
                        {report.report.observations.map((o) => (
                          <button
                            type="button"
                            key={o.reference.source_index}
                            disabled={busy}
                            onClick={() => {
                              try {
                                setFinding(
                                  inspectPublishedServiceFinding(
                                    history,
                                    o.reference,
                                  ),
                                );
                                setPanel('finding');
                                setError('');
                              } catch {
                                setError(
                                  'Exact published finding unavailable.',
                                );
                              }
                            }}
                          >
                            Inspect exact published finding{' '}
                            {o.reference.finding_id} · source{' '}
                            {o.reference.source_index}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {panel === 'finding' && finding && (
                    <article aria-label="Exact published finding">
                      <h4>
                        {finding.category} · {finding.location} ·{' '}
                        {finding.severity}
                      </h4>
                      <p>{finding.observation}</p>
                      <p>Recommendation: {finding.recommendation}</p>
                      <p>
                        Report {finding.reference.report_id} / version{' '}
                        {finding.reference.published_version} / finding{' '}
                        {finding.reference.finding_id} / source position{' '}
                        {finding.reference.source_index}
                      </p>
                    </article>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async (live) => {
                        const next = await readPublishedServiceRequirements(
                          history,
                          report.reference,
                        );
                        assertPublishedServiceHistory(history);
                        if (live()) {
                          setRequirements(next);
                          setPanel('requirements');
                        }
                      })
                    }
                  >
                    Review completion requirements
                  </button>
                  {panel === 'requirements' && requirements && (
                    <section aria-label="Exact completion requirements">
                      <h4>Completion requirements · UNKNOWN</h4>
                      <p>
                        Original read-only completion review for report{' '}
                        {requirements.report.reference.report_id} / version{' '}
                        {requirements.report.reference.published_version} and
                        issued job {requirements.job.reference.job_id}.
                      </p>
                      <details open>
                        <summary>Scope and quantities · UNKNOWN</summary>
                        <p>
                          Issued version{' '}
                          {requirements.job.reference.issued_version_id}.
                          Line-to-finding links:{' '}
                          {requirements.coverage.line_to_finding_links}.
                        </p>
                        <ul>
                          {requirements.job.lines.map((l) => (
                            <li key={l.id}>
                              {l.description} · {l.quantity_milli} milli{' '}
                              {l.unit} · documentation match{' '}
                              {l.documentation_match}
                            </li>
                          ))}
                        </ul>
                        <p>
                          Independent verification of each exact scope line and
                          quantity is still required.
                        </p>
                      </details>
                      <details>
                        <summary>Physical completion · UNKNOWN</summary>
                        <p>
                          Recorded phase {requirements.report.phase};{' '}
                          {requirements.coverage.checklist_recorded_checked} of{' '}
                          {requirements.coverage.checklist_recorded} checklist
                          values checked. Media {requirements.coverage.media}.
                          Physical verification{' '}
                          {requirements.interpretation.physical_completion};
                          after-phase/checkmarks do not establish completion.
                        </p>
                      </details>
                      <details>
                        <summary>Customer acceptance · UNKNOWN</summary>
                        <p>
                          Genuine acceptance of the exact completed scope is
                          required. Existing interpretation:{' '}
                          {requirements.interpretation.customer_acceptance}. No
                          customer approval is inferred.
                        </p>
                      </details>
                      <details>
                        <summary>Warranty · UNKNOWN</summary>
                        <p>
                          Reviewed applicable terms and verified scope
                          eligibility are required. Existing interpretation:{' '}
                          {requirements.interpretation.warranty}.
                        </p>
                      </details>
                    </section>
                  )}
                  {onContinue && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async (live) => {
                          const result = await continuePublishedServiceReview(
                            history,
                            report,
                            onContinue,
                            lease.current,
                          );
                          if (live()) setMessage(result.status);
                        })
                      }
                    >
                      Continue to existing maintenance review
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
      <footer>
        Customer-safe published documentation only. Physical completion,
        customer approval and warranty UNKNOWN. No preparation, publication,
        file export, customer response, message or operational action.
      </footer>
    </section>
  );
}
