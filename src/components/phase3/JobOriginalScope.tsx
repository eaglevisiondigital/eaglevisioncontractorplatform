import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Operations } from '../../lib/operations';
import type { Phase3Repository } from '../../lib/phase3';
import type { Job } from '../../domain/jobs/financials';
import { estimateUnits } from '../../domain/estimating/types';
import { exactForecastSource } from './job-forecast-conflicts';
import { Field } from './fields';

type ScopeReference = {
  kind: 'internal_original_job_scope_v1';
  organization_id: string;
  job_id: string;
  job_name: string;
  issued_version_id: string;
  observed_job_revision: number;
  lines: {
    id: string;
    kind: string;
    description: string;
    quantity_milli: number;
    unit: string;
  }[];
};
export function JobOriginalScope({
  repo,
  operations,
  org,
  job,
}: {
  repo: Phase3Repository;
  operations: Operations;
  org: string;
  job: Job;
}) {
  const context = useMemo(
    () => ({ repo, operations, org, job }),
    [repo, operations, org, job],
  );
  const live = useRef<typeof context | undefined>(undefined);
  const running = useRef<typeof context | undefined>(undefined);
  const [activity, setActivity] = useState<typeof context>();
  const [status, setStatus] = useState<{
    context: typeof context;
    text: string;
  }>();
  const [read, setRead] = useState<{
    context: typeof context;
    value: ScopeReference;
  }>();
  const [filter, setFilter] = useState<{
    source: ScopeReference;
    query: string;
    kind: string;
  }>();
  const searchInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    live.current = context;
    return () => {
      if (live.current === context) live.current = undefined;
    };
  }, [context]);
  const current = read?.context === context ? read.value : undefined;
  const busy = activity === context;
  const message = status?.context === context ? status.text : '';
  const query = current && filter?.source === current ? filter.query : '';
  const kind = current && filter?.source === current ? filter.kind : 'all';
  const term = query.trim().toLocaleLowerCase();
  const shown =
    current?.lines.filter(
      (line) =>
        (kind === 'all' || line.kind === kind) &&
        line.description.toLocaleLowerCase().includes(term),
    ) ?? [];

  async function load(download: boolean) {
    if (running.current === context) return;
    running.current = context;
    const active = () => live.current === context;
    setActivity(context);
    setStatus(undefined);
    setRead(undefined);
    try {
      const expected = structuredClone(job);
      const allowed = async () => {
        const [access, modules] = await Promise.all([
          operations.companyAccess(org),
          operations.listModules(org),
        ]);
        return (
          access.estimates &&
          modules.some((m) => m.module === 'estimates' && m.enabled)
        );
      };
      if (!(await allowed()) || !active()) throw Error('Unavailable');
      const rows = await repo.jobs(org);
      if (
        !Array.isArray(rows) ||
        rows.some((row) => row.organization_id !== org) ||
        new Set(rows.map((row) => row.id)).size !== rows.length
      )
        throw Error('Unavailable');
      const matches = rows.filter((row) => row.id === expected.id);
      if (matches.length !== 1 || !active()) throw Error('Unavailable');
      const latest = structuredClone(matches[0]);
      exactForecastSource(org, expected, latest);
      if (!(await allowed()) || !active()) throw Error('Unavailable');
      exactForecastSource(org, expected, job);
      exactForecastSource(org, expected, latest);
      if (
        typeof latest.name !== 'string' ||
        typeof latest.baseline.issued_version_id !== 'string' ||
        !latest.baseline.issued_version_id
      )
        throw Error('Unavailable');
      const lines = latest.baseline.lines;
      if (
        !Array.isArray(lines) ||
        new Set(lines.map((line) => line.id)).size !== lines.length ||
        lines.some(
          (line) =>
            typeof line.id !== 'string' ||
            !line.id ||
            typeof line.description !== 'string' ||
            !['material', 'product', 'labor', 'service', 'allowance'].includes(
              line.kind,
            ) ||
            !Number.isSafeInteger(line.quantity_milli) ||
            line.quantity_milli < 0 ||
            !estimateUnits.includes(line.unit),
        )
      )
        throw Error('Unavailable');
      const value: ScopeReference = {
        kind: 'internal_original_job_scope_v1',
        organization_id: org,
        job_id: latest.id,
        job_name: latest.name,
        issued_version_id: latest.baseline.issued_version_id,
        observed_job_revision: latest.lock_revision,
        lines: lines.map((line) => ({
          id: line.id,
          kind: line.kind,
          description: line.description,
          quantity_milli: line.quantity_milli,
          unit: line.unit,
        })),
      };
      if (!active()) return;
      setRead({ context, value });
      if (download) {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(value, null, 2) + '\n'], {
            type: 'application/json',
          }),
        );
        try {
          const link = document.createElement('a');
          link.href = url;
          link.download = 'original-job-scope.json';
          link.click();
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      setStatus({
        context,
        text: download
          ? 'Internal scope reference downloaded from the current original baseline.'
          : 'Original scope loaded. Costs and private notes are excluded.',
      });
    } catch {
      if (active()) {
        setRead(undefined);
        setStatus({
          context,
          text: 'Original job scope is unavailable or no longer matches this job. Refresh job costs before trying a new read.',
        });
      }
    } finally {
      if (running.current === context) running.current = undefined;
      if (active())
        setActivity((value) => (value === context ? undefined : value));
    }
  }
  return (
    <details>
      <summary>Original job scope</summary>
      <p>
        The original internally approved scope is retained separately from
        change proposals. This reference does not establish customer acceptance,
        work completion or payment.
      </p>
      <div className="filters">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void load(false)}
        >
          Load original scope
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void load(true)}
        >
          Download original scope reference
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {current && (
        <section aria-label="Original job scope reference">
          <h3>{current.job_name}</h3>
          <p style={{ overflowWrap: 'anywhere' }}>
            Job {current.job_id} · Original issued version{' '}
            {current.issued_version_id} · Observed job revision{' '}
            {current.observed_job_revision}
          </p>
          <div className="form-grid">
            <Field label="Find original scope lines">
              <input
                ref={searchInput}
                type="search"
                maxLength={100}
                value={query}
                onChange={(event) =>
                  setFilter({
                    source: current,
                    query: event.target.value,
                    kind,
                  })
                }
              />
            </Field>
            <Field label="Original scope kind">
              <select
                value={kind}
                onChange={(event) =>
                  setFilter({
                    source: current,
                    query,
                    kind: event.target.value,
                  })
                }
              >
                <option value="all">All kinds</option>
                {['material', 'product', 'labor', 'service', 'allowance'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </select>
            </Field>
          </div>
          <div className="filters">
            <button
              type="button"
              className="secondary"
              disabled={!query && kind === 'all'}
              onClick={() => {
                setFilter(undefined);
                searchInput.current?.focus();
              }}
            >
              Reset scope filters
            </button>
            <p role="status">
              {shown.length} of {current.lines.length} original scope lines
              shown
            </p>
          </div>
          {!current.lines.length ? (
            <p>No original included scope lines are recorded.</p>
          ) : shown.length ? (
            <div
              className="p3-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Scrollable original job scope"
            >
              <table className="p3-table">
                <thead>
                  <tr>
                    <th>Original line</th>
                    <th>Kind</th>
                    <th>Quantity</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((line) => (
                    <tr key={line.id}>
                      <th scope="row" style={{ textTransform: 'none' }}>
                        <span style={{ overflowWrap: 'anywhere' }}>
                          {line.description}
                        </span>
                        <small
                          className="block"
                          style={{ overflowWrap: 'anywhere' }}
                        >
                          {line.id}
                        </small>
                      </th>
                      <td>{line.kind}</td>
                      <td>{line.quantity_milli / 1000}</td>
                      <td>{line.unit.replaceAll('_', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No original scope lines match these filters.</p>
          )}
        </section>
      )}
    </details>
  );
}
