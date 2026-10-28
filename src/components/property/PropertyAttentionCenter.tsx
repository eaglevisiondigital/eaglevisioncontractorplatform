import { useState } from 'react';
import type {
  AttentionItem,
  PropertyAttention,
} from '../../domain/property/attention';

type Filter =
  | 'all'
  | 'new'
  | 'recurring'
  | 'changed'
  | 'maintenance'
  | 'estimates'
  | 'uncertain';
const matches = (item: AttentionItem, filter: Filter) =>
  filter === 'all' ||
  (filter === 'new' && item.newly_reported) ||
  (filter === 'recurring' && item.recurring) ||
  (filter === 'changed' && item.changes.length > 0) ||
  (filter === 'maintenance' && item.repeated_recommendations.length > 0) ||
  (filter === 'estimates' && item.repair_scopes.length > 0) ||
  (filter === 'uncertain' && item.uncertainties.length > 0);

/** Read-only summary. Every navigation target is retained from the exact safe source evidence. */
export function PropertyAttentionCenter({
  attention,
  onReport,
  onReview,
}: {
  attention: PropertyAttention;
  onReport(reportId: string): void;
  onReview(versionId: string): void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const items = attention.items.filter((item) => matches(item, filter));
  return (
    <section aria-label="Property attention center">
      <h2>Property attention center</h2>
      <p>
        What your contractor recorded in the available published inspections.
        This summary does not establish the property's current condition or
        authorize work.
      </p>
      <div
        className="portal-summary attention-summary"
        role="group"
        aria-label="Attention summary"
      >
        <p>
          <strong>
            {attention.items.filter((x) => x.newly_reported).length}
          </strong>{' '}
          newly reported in this history
        </p>
        <p>
          <strong>{attention.items.filter((x) => x.recurring).length}</strong>{' '}
          possible recurring concerns
        </p>
        <p>
          <strong>
            {attention.items.filter((x) => x.changes.length).length}
          </strong>{' '}
          reported changes
        </p>
      </div>
      <p className="notice">
        A concern missing from a later report is not proof of repair. Repair
        status remains undetermined. Similar wording alone never joins findings.
      </p>
      {attention.items.length > 0 && (
        <label>
          Attention view
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="all">All attention items</option>
            <option value="new">Newly reported</option>
            <option value="recurring">Possible recurring concerns</option>
            <option value="changed">Reported changes</option>
            <option value="maintenance">Repeated recommendations</option>
            <option value="estimates">Linked repair estimates</option>
            <option value="uncertain">Needs clarification</option>
          </select>
        </label>
      )}
      <p role="status">
        {items.length} attention item{items.length === 1 ? '' : 's'} shown ·{' '}
        {attention.reports_available} published report
        {attention.reports_available === 1 ? '' : 's'} available
      </p>
      {!attention.reports_available ? (
        <p>
          No published inspections are available for this property. There is no
          evidence to summarize yet.
        </p>
      ) : !attention.items.length ? (
        <p>
          No concerns were documented in these published reports. This does not
          certify that the property is free of damage.
        </p>
      ) : (
        !items.length && (
          <p>
            No attention items match this view. Choose another attention view.
          </p>
        )
      )}
      {items.map((item) => (
        <article className="finding-card attention-card" key={item.id}>
          <div className="attention-labels">
            <span
              className={
                'badge attention-severity attention-severity--' + item.severity
              }
            >
              Last reported severity: {item.severity}
            </span>
            {item.newly_reported && (
              <span className="badge">Newly reported in available history</span>
            )}
            {item.recurring && (
              <span className="badge">
                Possible recurrence · {item.inspection_dates} inspection dates
              </span>
            )}
          </div>
          <h3>
            {item.category} · {item.location}
          </h3>
          <p>
            First reported{' '}
            <time dateTime={item.first_reported}>{item.first_reported}</time> ·
            Last reported{' '}
            <time dateTime={item.last_reported}>{item.last_reported}</time>
          </p>
          <p className="muted">
            Repair status: Undetermined from inspection evidence.
          </p>
          {item.changes.length > 0 && (
            <div className="attention-evidence">
              <h4>Reported condition changes</h4>
              <ul>
                {item.changes.map((c) => (
                  <li key={c.from + c.to}>
                    {c.from} → {c.to}:{' '}
                    {[
                      c.severity && 'reported severity changed',
                      c.observation && 'observation wording changed',
                      c.recommendation && 'recommendation changed',
                    ]
                      .filter(Boolean)
                      .join('; ')}
                    . These are differences in the reports, not a repair or
                    completion determination.
                  </li>
                ))}
              </ul>
            </div>
          )}
          {item.repeated_recommendations.length > 0 && (
            <div className="attention-evidence">
              <h4>Repeated maintenance recommendations</h4>
              {item.repeated_recommendations.map((r) => (
                <p key={r.text}>
                  {r.text} · Repeated on {r.inspection_dates} inspection dates.
                  This is a recommendation, not evidence of work performed.
                </p>
              ))}
            </div>
          )}
          {item.uncertainties.length > 0 && (
            <div className="attention-uncertainty">
              <h4>What remains uncertain</h4>
              <ul>
                {item.uncertainties.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          )}
          <details>
            <summary>
              Source inspection evidence ({item.observations.length})
            </summary>
            {item.observations.map((o) => (
              <div
                className="attention-source"
                key={o.report_id + o.finding.id}
              >
                <h4>
                  <time dateTime={o.visited_on}>{o.visited_on}</time> ·
                  Published report v{o.report_version}
                </h4>
                <p>
                  <strong>Observation:</strong> {o.finding.description}
                </p>
                <p>Reported severity: {o.finding.severity}</p>
                <p>
                  <strong>Recommendation:</strong> {o.finding.recommendation}
                </p>
                <button
                  className="secondary"
                  data-report-id={o.report_id}
                  data-report-version={o.report_version}
                  onClick={() => onReport(o.report_id)}
                >
                  View source report · {o.visited_on} · v{o.report_version}
                </button>
              </div>
            ))}
          </details>
          {item.repair_scopes.length > 0 ? (
            <div className="p3-actions">
              {item.repair_scopes.map((r) => (
                <button
                  className="secondary"
                  key={r.version_id}
                  data-version-id={r.version_id}
                  onClick={() => onReview(r.version_id)}
                >
                  Review linked issued scope · Version {r.version_number}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">
              No linked issued repair estimate is present in the available
              evidence.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
