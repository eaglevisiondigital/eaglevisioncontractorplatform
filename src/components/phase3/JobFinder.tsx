import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Job } from '../../domain/jobs/financials';
import type { Phase3Repository } from '../../lib/phase3';
import type { Operations } from '../../lib/operations';
import { Field } from './fields';

const pageSize = 5;
function ownedRows(org: string, rows: readonly Job[]) {
  return (
    Array.isArray(rows) &&
    rows.every(
      (row) =>
        row &&
        row.organization_id === org &&
        typeof row.id === 'string' &&
        !!row.id &&
        typeof row.name === 'string' &&
        Number.isSafeInteger(row.lock_revision) &&
        row.lock_revision >= 0,
    ) &&
    new Set(rows.map((row) => row.id)).size === rows.length
  );
}

export function JobFinder({
  repo,
  operations,
  org,
  jobs,
  selectedJobId,
  onSelect,
}: {
  repo: Phase3Repository;
  operations: Operations;
  org: string;
  jobs: readonly Job[];
  selectedJobId: string;
  onSelect: (id: string) => void;
}) {
  const context = useMemo(
    () => ({ repo, operations, org, jobs, onSelect }),
    [repo, operations, org, jobs, onSelect],
  );
  const live = useRef<typeof context | undefined>(undefined);
  const running = useRef<typeof context | undefined>(undefined);
  const [filter, setFilter] = useState<{
    context: typeof context;
    query: string;
    page: number;
  }>();
  const [activity, setActivity] = useState<typeof context>();
  const [status, setStatus] = useState<{
    context: typeof context;
    text: string;
    unavailable?: boolean;
  }>();
  useLayoutEffect(() => {
    live.current = context;
    return () => {
      if (live.current === context) live.current = undefined;
    };
  }, [context]);
  const query = filter?.context === context ? filter.query : '';
  const valid =
    ownedRows(org, jobs) &&
    !(status?.context === context && status.unavailable);
  const term = query.trim().toLocaleLowerCase();
  const matches = valid
    ? jobs.filter((row) =>
        [row.name, row.id].some((value) =>
          value.toLocaleLowerCase().includes(term),
        ),
      )
    : [];
  const lastPage = Math.max(0, Math.ceil(matches.length / pageSize) - 1);
  const page = Math.min(
    filter?.context === context ? filter.page : 0,
    lastPage,
  );
  const visible = matches.slice(page * pageSize, (page + 1) * pageSize);
  const busy = activity === context;

  async function open(row: Job) {
    if (running.current === context) return;
    running.current = context;
    setActivity(context);
    setStatus(undefined);
    const active = () => live.current === context;
    try {
      if (!ownedRows(org, jobs) || !jobs.includes(row))
        throw Error('Unavailable');
      const expected = structuredClone(row);
      const signature = JSON.stringify(expected);
      const same = (value: Job | undefined) =>
        !!value && JSON.stringify(value) === signature;
      const allowed = async () => {
        const [access, modules] = await Promise.all([
          operations.companyAccess(org),
          operations.listModules(org),
        ]);
        return (
          access.estimates &&
          modules.some(
            (module) => module.module === 'estimates' && module.enabled,
          )
        );
      };
      if (!(await allowed()) || !active()) throw Error('Unavailable');
      const fresh = await repo.jobs(org);
      if (
        !ownedRows(org, fresh) ||
        !same(fresh.find((job) => job.id === expected.id)) ||
        !active()
      )
        throw Error('Unavailable');
      if (!(await allowed()) || !active()) throw Error('Unavailable');
      if (
        !ownedRows(org, jobs) ||
        !ownedRows(org, fresh) ||
        !same(jobs.find((job) => job.id === expected.id)) ||
        !same(fresh.find((job) => job.id === expected.id))
      )
        throw Error('Unavailable');
      onSelect(expected.id);
      setStatus({ context, text: 'Job selected. Review its details below.' });
    } catch {
      if (active())
        setStatus({
          context,
          unavailable: true,
          text: 'This job is unavailable or has changed. Refresh job costs before opening it.',
        });
    } finally {
      if (running.current === context) running.current = undefined;
      if (active()) setActivity(undefined);
    }
  }

  return (
    <details>
      <summary>Find a job</summary>
      <section aria-label="Loaded job finder">
        <p>
          Search the jobs already loaded for this company. These records may be
          a limited subset. Filtering does not change the selected job or save
          an entered forecast. Save your work before opening another job.
        </p>
        <Field label="Search loaded jobs by name or ID">
          <input
            type="search"
            value={query}
            onChange={(event) =>
              setFilter({ context, query: event.target.value, page: 0 })
            }
          />
        </Field>
        {!valid ? (
          <p role="status">Job list unavailable. Refresh job costs.</p>
        ) : (
          <>
            <p role="status">
              {matches.length} matching of {jobs.length} loaded jobs
              {matches.length ? ` · Page ${page + 1} of ${lastPage + 1}` : ''}
            </p>
            {visible.length ? (
              <ul aria-label="Matching loaded jobs">
                {visible.map((row) => (
                  <li key={row.id} style={{ overflowWrap: 'anywhere' }}>
                    <strong>{row.name}</strong> · {row.id}
                    {row.id === selectedJobId && <span> · Selected job</span>}
                    <div>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        aria-label={`Open job ${row.name} (${row.id})`}
                        onClick={() => void open(row)}
                      >
                        Open job
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No loaded jobs match this search.</p>
            )}
            <div className="filters" aria-label="Loaded jobs pages">
              <button
                type="button"
                className="secondary"
                disabled={page === 0}
                onClick={() => setFilter({ context, query, page: page - 1 })}
              >
                Previous jobs
              </button>
              <button
                type="button"
                className="secondary"
                disabled={page === lastPage}
                onClick={() => setFilter({ context, query, page: page + 1 })}
              >
                Next jobs
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!query && page === 0}
                onClick={() => setFilter({ context, query: '', page: 0 })}
              >
                Clear job search
              </button>
            </div>
          </>
        )}
        {status?.context === context && <p role="status">{status.text}</p>}
      </section>
    </details>
  );
}
