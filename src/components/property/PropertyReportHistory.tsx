import { useState, useSyncExternalStore } from 'react';
import type { PublishedReport } from '../../domain/property/inspections';
import type { PropertyReportPage } from '../../domain/property/report-page';
import { InspectionHistorySearch } from './InspectionHistorySearch';
import {
  searchInspectionHistory,
  emptyHistoryFilters,
  recordedFrequency,
  type HistoryFilters,
} from '../../domain/property/history-search';
import type { ReportBoundary } from '../../domain/property/report-page';
import type { PropertyReportSession } from '../../lib/property-report-session';

export function PropertyReportHistory({
  reports,
  cadences,
  relatedReviews = [],
  onReview,
  focusedReportId,
  onCompare,
  search,
}: {
  reports: PropertyReportPage['reports'];
  cadences?: Record<string, string>;
  relatedReviews?: {
    version_id: string;
    source_report_id: string | null;
    finding_id: string | null;
  }[];
  onReview?: (versionId: string) => void;
  focusedReportId?: string | null;
  onCompare?: (reportId: string) => void;
  search?: {
    context: ReportBoundary & { reports: boolean };
    sourceReports: PublishedReport[];
    filters: HistoryFilters;
    onChange(filters: HistoryFilters): void;
    onReport(id: string, version: number): void;
    onAttention(): void;
  };
}) {
  const [month, setMonth] = useState('all');
  const [cadence, setCadence] = useState('all');
  const months = [
    ...new Set(reports.map((r) => r.snapshot.visited_on.slice(0, 7))),
  ]
    .sort()
    .reverse();
  const activeMonth = months.includes(month) ? month : 'all';
  let searchResult: ReturnType<typeof searchInspectionHistory> | null = null;
  let searchError = '';
  if (search) {
    try {
      searchResult = searchInspectionHistory(
        search.sourceReports,
        search.context,
        emptyHistoryFilters,
        cadences,
      );
      searchResult = searchInspectionHistory(
        search.sourceReports,
        search.context,
        focusedReportId ? emptyHistoryFilters : search.filters,
        cadences,
      );
    } catch (e) {
      searchError =
        e instanceof Error ? e.message : 'History search is unavailable.';
    }
  }
  const visible = (
    search ? (searchError ? [] : (searchResult?.reports ?? [])) : reports
  )
    .filter(
      (r) =>
        !!search ||
        activeMonth === 'all' ||
        r.snapshot.visited_on.startsWith(activeMonth),
    )
    .filter(
      (r) => !!search || cadence === 'all' || cadences?.[r.id] === cadence,
    )
    .filter((r) => !focusedReportId || r.id === focusedReportId)
    .sort(
      (a, b) =>
        b.snapshot.visited_on.localeCompare(a.snapshot.visited_on) ||
        b.version - a.version ||
        b.published_at.localeCompare(a.published_at) ||
        b.id.localeCompare(a.id),
    );
  return (
    <section aria-label="Published inspection history">
      <h2>Inspection & maintenance history</h2>
      <p>
        Contractor-reviewed reports for this property. Each published version is
        retained.
      </p>
      {search && !focusedReportId && (
        <InspectionHistorySearch
          filters={search.filters}
          onChange={search.onChange}
          result={searchResult}
          error={searchError}
        />
      )}
      {!search && !!reports.length && (
        <label>
          Service month
          <select
            value={months.includes(month) ? month : 'all'}
            onChange={(e) => setMonth(e.target.value)}
          >
            <option value="all">All service visits</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}
      {!search && !!reports.length && cadences && (
        <label>
          Check-in frequency
          <select value={cadence} onChange={(e) => setCadence(e.target.value)}>
            <option value="all">All check-ins</option>
            <option value="weekly">Weekly check-ins</option>
            <option value="monthly">Monthly check-ins</option>
          </select>
        </label>
      )}
      <p role="status">
        {visible.length} published report{visible.length === 1 ? '' : 's'} shown
        {search && !focusedReportId && !searchError
          ? ' of ' +
            searchResult?.available +
            ' available · matching report versions'
          : ''}
      </p>
      {!visible.length && !searchError && (
        <p>No published reports for this selection.</p>
      )}
      {search && !focusedReportId && (
        <button className="secondary" onClick={search.onAttention}>
          Open property Attention Center
        </button>
      )}
      {visible.map((r) => (
        <article
          className="finding-card"
          key={r.id}
          data-report-id={r.id}
          data-report-version={r.version}
        >
          <span className="badge">
            {r.snapshot.visited_on} · {r.snapshot.phase} · Published report v
            {r.version}
          </span>
          {cadences && (
            <p className="muted">
              {search
                ? recordedFrequency(cadences[r.id]) + ' check-in'
                : cadences[r.id] === 'weekly'
                  ? 'Weekly check-in'
                  : cadences[r.id] === 'monthly'
                    ? 'Monthly check-in'
                    : 'Property check-in'}
            </p>
          )}
          <p>{r.snapshot.summary}</p>
          {search && (
            <p className="muted">
              Report {r.id} · Published version {r.version}
            </p>
          )}
          {search && !focusedReportId && (
            <button
              className="secondary"
              onClick={() => search.onReport(r.id, r.version)}
            >
              Open exact published report · v{r.version}
            </button>
          )}
          {onCompare && reports.length > 1 && (
            <button className="secondary" onClick={() => onCompare(r.id)}>
              Compare this inspection
            </button>
          )}
          <details>
            <summary>Inspection checklist</summary>
            <ul>
              {r.snapshot.checklist.map((c, i) => (
                <li key={i}>
                  {c.completed ? 'Completed' : 'Not completed'}: {c.label}
                </li>
              ))}
            </ul>
          </details>
          {r.snapshot.findings.map((f) => (
            <div key={f.id}>
              <h3>
                {f.category} · {f.location} · {f.severity}
              </h3>
              <p>{f.description}</p>
              <p>Recommended repair: {f.recommendation}</p>
              {onReview &&
                relatedReviews
                  .filter(
                    (v) => v.source_report_id === r.id && v.finding_id === f.id,
                  )
                  .map((v) => (
                    <button
                      className="secondary"
                      key={v.version_id}
                      onClick={() => onReview(v.version_id)}
                    >
                      Review related repair scope
                    </button>
                  ))}
              {onReview &&
                !relatedReviews.some(
                  (v) => v.source_report_id === r.id && v.finding_id === f.id,
                ) && (
                  <p className="muted">
                    No issued repair estimate has been shared for this finding.
                  </p>
                )}
            </div>
          ))}
          <p className="muted">
            Published{' '}
            <time dateTime={r.published_at}>{r.published_at.slice(0, 10)}</time>{' '}
            · Version {r.version}
          </p>
        </article>
      ))}
    </section>
  );
}
/** Ready to compose with a reviewed caller-bound session; intentionally not mounted on a connected route. */
export function PreparedCustomerReports({
  session,
}: {
  session: PropertyReportSession;
}) {
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  return (
    <section aria-label="Customer property reports">
      <p className="notice">
        Internal acceptance only · report access does not authorize estimates,
        approvals, invoices, payments or media.
      </p>
      {state.status === 'loading' ? (
        <p role="status">Verifying report access…</p>
      ) : state.status === 'ready' ? (
        <PropertyReportHistory reports={state.reports} />
      ) : (
        <p role="status">
          Reports are unavailable. A current authorized customer session and
          property access are required.
        </p>
      )}
      {state.status !== 'closed' && (
        <button
          disabled={state.status === 'loading'}
          onClick={() => void session.load()}
        >
          Refresh authorized reports
        </button>
      )}
      {state.status === 'ready' && state.hasMore && (
        <button onClick={() => void session.load(true)}>
          Load older reports
        </button>
      )}
    </section>
  );
}
