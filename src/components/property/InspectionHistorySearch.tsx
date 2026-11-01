import { useId } from 'react';
import {
  emptyHistoryFilters,
  type HistoryFilters,
  type searchInspectionHistory,
} from '../../domain/property/history-search';

export function InspectionHistorySearch({
  filters,
  onChange,
  result,
  error,
}: {
  filters: HistoryFilters;
  onChange(filters: HistoryFilters): void;
  result: ReturnType<typeof searchInspectionHistory> | null;
  error: string;
}) {
  const id = useId();
  const set = (key: keyof HistoryFilters, value: string) =>
    onChange({ ...filters, [key]: value });
  const options = result?.options;
  const labels: Record<keyof HistoryFilters, string> = {
    query: 'Search published reports',
    from: 'Inspection date from',
    to: 'Inspection date to',
    month: 'Service month',
    frequency: 'Check-in frequency',
    category: 'Concern category',
    severity: 'Reported severity',
    location: 'Reported location',
    recommendation: 'Search recommendations',
  };
  function select(
    key: keyof HistoryFilters,
    values: readonly string[],
    all: string,
  ) {
    const allValue = key === 'month' || key === 'frequency' ? 'all' : '';
    return (
      <label>
        {labels[key]}
        <select
          value={filters[key] || allValue}
          onChange={(e) =>
            set(key, e.target.value === allValue ? '' : e.target.value)
          }
        >
          <option value={allValue}>{all}</option>
          {values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div
      className="history-search"
      role="search"
      aria-label="Search published inspection history"
    >
      <label>
        Search published reports
        <input
          type="search"
          value={filters.query}
          maxLength={200}
          placeholder="Search observations, checklist and recommendations"
          aria-describedby={id}
          onChange={(e) => set('query', e.target.value)}
        />
      </label>
      <p id={id} className="muted">
        Text searches the published report. Concern filters must match the same
        finding. Dates refer to inspection dates, including both endpoints.
      </p>
      <details className="history-search-filters">
        <summary>Filter inspection evidence</summary>
        <div className="history-search-grid">
          {(['from', 'to'] as const).map((key) => (
            <label key={key}>
              {labels[key]}
              <input
                type="date"
                value={filters[key]}
                aria-invalid={!!error}
                aria-describedby={error ? id + '-error' : undefined}
                onChange={(e) => set(key, e.target.value)}
              />
            </label>
          ))}
          {select('month', options?.months ?? [], 'All service visits')}
          {select('frequency', options?.frequencies ?? [], 'All check-ins')}
          {select(
            'category',
            options?.categories ?? [],
            'All reported categories',
          )}
          {select(
            'severity',
            options?.severities ?? [],
            'All reported severities',
          )}
          {select(
            'location',
            options?.locations ?? [],
            'All reported locations',
          )}
          <label>
            Search recommendations
            <input
              type="search"
              maxLength={200}
              value={filters.recommendation}
              placeholder="Published recommendation text"
              onChange={(e) => set('recommendation', e.target.value)}
            />
          </label>
        </div>
      </details>
      <div
        className="history-search-actions"
        role="group"
        aria-label="Active history filters"
      >
        {(Object.keys(filters) as (keyof HistoryFilters)[])
          .filter((k) => filters[k])
          .map((k) => (
            <button
              className="secondary"
              key={k}
              onClick={() => set(k, '')}
              aria-label={'Clear ' + labels[k] + ': ' + filters[k]}
            >
              {labels[k]}: {filters[k]} <span aria-hidden="true">×</span>
            </button>
          ))}
        {Object.values(filters).some(Boolean) && (
          <button
            className="secondary"
            onClick={() => onChange({ ...emptyHistoryFilters })}
          >
            Reset history search
          </button>
        )}
      </div>
      {error && (
        <p role="alert" id={id + '-error'}>
          {error} No results are displayed until the filters are corrected.
        </p>
      )}
      <p className="muted">
        Search covers only the published reports available to you for this
        property. Missing or access-limited reports may exist. Omitted findings
        do not prove repair or resolution.
      </p>
    </div>
  );
}
