import { useState } from 'react';
import type { PropertyReportPage } from '../../domain/property/report-page';
import type {
  InspectionComparison as Comparison,
  ReportReference,
} from '../../domain/property/inspection-comparison';

export function InspectionComparison({
  reports,
  initialIds,
  compare,
  onReport,
  onReview,
}: {
  reports: PropertyReportPage['reports'];
  initialIds: [string, string];
  compare(first: ReportReference, second: ReportReference): Comparison;
  onReport(id: string): void;
  onReview(id: string): void;
}) {
  const [ids, setIds] = useState(initialIds);
  const [result, setResult] = useState<Comparison | null>(null);
  const [error, setError] = useState('');
  const ordered = [...reports].sort(
    (a, b) =>
      a.snapshot.visited_on.localeCompare(b.snapshot.visited_on) ||
      a.id.localeCompare(b.id),
  );
  const sides = result?.same_date
    ? ['First selected report', 'Second selected report']
    : ['Earlier inspection', 'Later inspection'];
  function run() {
    setResult(null);
    setError('');
    try {
      const refs = ids.map((id) => reports.find((r) => r.id === id));
      if (!refs[0] || !refs[1]) throw Error();
      setResult(compare(refs[0], refs[1]));
    } catch {
      setError(
        'Comparison unavailable. Select two distinct published reports for this property. No comparison evidence is displayed.',
      );
    }
  }
  function source(id: string, version: number, label: string) {
    return (
      <button
        className="secondary"
        data-report-id={id}
        data-report-version={version}
        onClick={() => onReport(id)}
      >
        {label} · v{version}
      </button>
    );
  }
  return (
    <section aria-label="Published inspection comparison">
      <h2>Compare inspections</h2>
      <p>
        Choose two exact published reports for this property. Differences
        describe what was recorded; they do not establish improvement,
        deterioration or completed repairs.
      </p>
      <p className="notice">
        A missing concern is not proof of repair. Similar wording alone never
        establishes the same issue. Repair status remains undetermined.
      </p>
      {reports.length < 2 ? (
        <p role="status">
          At least two published reports are needed for this property. No
          comparison is available yet.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <div className="inspection-pair">
            {['First published inspection', 'Second published inspection'].map(
              (label, index) => (
                <label key={label}>
                  {label}
                  <select
                    required
                    value={ids[index]}
                    onChange={(e) => {
                      setIds(
                        index === 0
                          ? [e.target.value, ids[1]]
                          : [ids[0], e.target.value],
                      );
                      setResult(null);
                      setError('');
                    }}
                  >
                    <option value="">Select a published report</option>
                    {ordered.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.snapshot.visited_on} · v{r.version} · {r.id}
                      </option>
                    ))}
                  </select>
                </label>
              ),
            )}
          </div>
          <button type="submit">Compare selected inspections</button>
          {!result && !error && (
            <p role="status">
              Select reports, then compare. Earlier and later are ordered by
              inspection date.
            </p>
          )}
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p role="status">
            Two exact published reports compared. {result.findings.length}{' '}
            finding rows ·{' '}
            {result.checklist.filter((c) => c.result_differs).length} checklist
            label/result differences.
          </p>
          {result.same_date && (
            <p className="notice">
              Both reports have the same inspection date. Selection order is
              retained; publication versions do not prove separate visits or
              chronology.
            </p>
          )}
          <div className="inspection-pair comparison-heading">
            {result.sides.map(({ report: r, frequency }, index) => (
              <section
                className={'comparison-side comparison-side--' + index}
                aria-label={sides[index]}
                key={r.id}
              >
                <p className="eyebrow">{sides[index]}</p>
                <h3>
                  <time dateTime={r.snapshot.visited_on}>
                    {r.snapshot.visited_on}
                  </time>
                </h3>
                <p>
                  {frequency === 'unknown'
                    ? 'Inspection frequency unavailable'
                    : frequency === 'once'
                      ? 'One-time check-in'
                      : frequency + ' check-in'}{' '}
                  · {r.snapshot.phase}
                </p>
                <p>
                  Report ID: <span className="evidence-id">{r.id}</span>
                </p>
                <p>Exact published version: {r.version}</p>
                <p>
                  Published{' '}
                  <time dateTime={r.published_at}>{r.published_at}</time>
                </p>
                <p>{r.snapshot.summary}</p>
                {source(
                  r.id,
                  r.version,
                  'View ' + sides[index].toLowerCase() + ' report',
                )}
              </section>
            ))}
          </div>
          <h3>Checklist evidence</h3>
          <p>
            Published checklists contain labels and results, without stable item
            IDs. Exact unique labels can show different reported results; they
            cannot confirm the same physical task.
          </p>
          {!result.checklist.length && (
            <p>No checklist observations were published in either report.</p>
          )}
          {result.checklist.map((c) => (
            <article className="finding-card" key={c.key}>
              <h4>{c.label}</h4>
              <p className="badge">
                {c.result_differs === null
                  ? 'Cannot reliably align checklist entries'
                  : c.result_differs
                    ? 'Reported checklist result differs'
                    : 'Same reported checklist result'}
              </p>
              <div className="inspection-pair">
                {[c.earlier, c.later].map((v, index) => (
                  <div
                    role="group"
                    className={'comparison-side comparison-side--' + index}
                    aria-label={sides[index] + ' checklist evidence'}
                    key={index}
                  >
                    <strong>{sides[index]}</strong>
                    {v ? (
                      <>
                        <p>
                          {v.completed
                            ? 'Reported completed'
                            : 'Reported not completed'}
                          : {v.label}
                        </p>
                        <p>
                          Published checklist position {v.source_index + 1} ·
                          Report{' '}
                          <span className="evidence-id">{v.report_id}</span> · v
                          {v.report_version}
                        </p>
                        {source(
                          v.report_id,
                          v.report_version,
                          'View checklist source',
                        )}
                      </>
                    ) : (
                      <p>No aligned checklist entry reported.</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="muted">{c.uncertainty}</p>
            </article>
          ))}
          <h3>Findings & recommendations</h3>
          {!result.findings.length && (
            <p>
              No concerns were documented in either selected report. This does
              not certify the property is free of damage.
            </p>
          )}
          {result.findings.map((f) => (
            <article className="finding-card comparison-finding" key={f.key}>
              <h4>
                {f.category} · {f.location}
              </h4>
              <p className="badge">
                {f.presence === 'both'
                  ? 'Reported on both · identifier-based match'
                  : f.presence === 'later_only'
                    ? 'Newly observed in this selection · onset unconfirmed'
                    : f.presence === 'earlier_only'
                      ? 'Reported only on earlier selection'
                      : 'Unmatched selected observation'}
              </p>
              <div className="inspection-pair">
                {[f.earlier, f.later].map((o, index) => (
                  <div
                    role="group"
                    className={'comparison-side comparison-side--' + index}
                    aria-label={sides[index] + ' finding evidence'}
                    key={index}
                  >
                    <strong>{sides[index]}</strong>
                    {o ? (
                      <>
                        <p>
                          Finding ID:{' '}
                          <span className="evidence-id">{o.finding.id}</span>
                        </p>
                        <p>Reported severity: {o.finding.severity}</p>
                        <p>
                          <strong>Observation:</strong> {o.finding.description}
                        </p>
                        <p>
                          <strong>Recommendation:</strong>{' '}
                          {o.finding.recommendation}
                        </p>
                        {source(
                          o.report_id,
                          o.report_version,
                          'View finding source',
                        )}
                      </>
                    ) : (
                      <p>
                        No supported matching observation on this report.
                        Condition unknown.
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {f.differences && (
                <ul aria-label="Reported differences">
                  <li>
                    Reported severity:{' '}
                    {f.differences.severity ? 'differs' : 'same'}
                  </li>
                  <li>
                    Observation wording:{' '}
                    {f.differences.observation ? 'differs' : 'same'}
                  </li>
                  <li>
                    Recommendation wording:{' '}
                    {f.differences.recommendation ? 'differs' : 'same'}
                  </li>
                </ul>
              )}
              <p className="muted">
                Repair status: Undetermined from inspection evidence.
              </p>
              <ul aria-label="Evidence limitations">
                {f.uncertainties.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
              {f.repair_scopes.length ? (
                f.repair_scopes.map((v) => (
                  <button
                    className="secondary"
                    data-version-id={v.version_id}
                    key={v.version_id}
                    onClick={() => onReview(v.version_id)}
                  >
                    Review exact linked repair scope · Version{' '}
                    {v.version_number}
                  </button>
                ))
              ) : (
                <p className="muted">
                  No exact linked issued repair scope is available for these
                  source findings.
                </p>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
