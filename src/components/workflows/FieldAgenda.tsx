import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { prototypeFields } from '../../lib/program/prototype-source';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import type { DailyWorkbenchProps } from '../../lib/workflows/daily-workbench-contract';
import {
  readFieldAgenda,
  assertFieldAgendaNow,
  filterFieldAgenda,
  inspectFieldAgendaJob,
  continueFieldAgenda,
  reconcileFieldAgenda,
  type FieldAgendaView,
  type FieldAgendaFilter,
} from '../../lib/workflows/field-agenda';
import { FieldWorkspace } from './FieldWorkspace';
import './field-agenda.css';

export function FieldAgenda(props: DailyWorkbenchProps) {
  const admitted =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  let check: (() => void) | null = null;
  if (admitted)
    try {
      const root = prototypeFields(props.sources, [
        'company',
        'operations',
        'estimates',
        'property',
        'entries',
        'gate',
      ]);
      check = captureOperatingSources(
        props.sources,
        root.gate as Parameters<typeof captureOperatingSources>[1],
      ).check;
    } catch {
      /* Withhold invalid sources. */
    }
  const [binding, setBinding] = useState({
    sources: props.sources,
    selectedJobId: props.selectedJobId,
    admitted,
    check,
    epoch: 0,
  });
  let stale = false;
  if (binding.sources === props.sources && binding.check)
    try {
      binding.check();
    } catch {
      stale = true;
    }
  if (
    binding.sources !== props.sources ||
    binding.selectedJobId !== props.selectedJobId ||
    binding.admitted !== admitted ||
    Boolean(binding.check) !== Boolean(check) ||
    stale
  ) {
    setBinding({
      sources: props.sources,
      selectedJobId: props.selectedJobId,
      admitted,
      check,
      epoch: binding.epoch + 1,
    });
    return null;
  }
  return admitted && check ? (
    <Agenda key={binding.epoch} {...props} />
  ) : (
    <section className="field-agenda" aria-label="Field agenda">
      <h2>Field agenda</h2>
      <p>
        {admitted
          ? 'Current authorized field sources unavailable. Previous context withheld.'
          : 'Field agenda is off. No dispatch or task-state authority.'}
      </p>
    </section>
  );
}
function Agenda({
  sources,
  selectedJobId,
  onSelectJob,
  onContinue,
}: DailyWorkbenchProps) {
  const [confirmed, setConfirmed] = useState(false),
    [view, setView] = useState<FieldAgendaView | null>(null),
    [filter, setFilter] = useState<FieldAgendaFilter>({
      query: '',
      day: sources.entries[0].day,
      period: 'week',
      worker_id: '',
      status: 'all',
    }),
    [selected, setSelected] = useState(''),
    [tab, setTab] = useState<'agenda' | 'controls'>('agenda'),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [message, setMessage] = useState(
      'Review recorded work orders by day, crew and inspection status.',
    );
  const gate = useRef({ enabled: true, confirmed: false }),
    live = useRef(true),
    pending = useRef(false),
    callbacks = useRef({ onContinue, onSelectJob }),
    generation = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const epoch = generation;
    epoch.current++;
    callbacks.current = { onContinue, onSelectJob };
    return () => {
      epoch.current++;
      callbacks.current = { onContinue: undefined, onSelectJob: undefined };
    };
  }, [onContinue, onSelectJob]);
  useEffect(() => {
    live.current = true;
    const own = gate.current;
    return () => {
      live.current = false;
      own.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (selected) heading.current?.focus();
  }, [selected, tab]);
  let current = view;
  if (current)
    try {
      assertFieldAgendaNow(current);
    } catch {
      current = null;
    }
  const hintValid =
    !selectedJobId ||
    sources.entries.some((e) => e.target.job_id === selectedJobId);
  let filtered: ReturnType<typeof filterFieldAgenda> | null = null,
    filterError = '';
  if (current)
    try {
      filtered = filterFieldAgenda(current, filter);
    } catch {
      filterError = 'Choose valid date, crew and recorded-status filters.';
    }
  const fail = () => {
    setUnknown(true);
    setMessage(
      'Field agenda UNKNOWN. Exact read-only reconciliation only; no replacement or replay.',
    );
  };
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await action();
    } catch {
      if (live.current) fail();
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function choose(jobId: string) {
    if (!current || unknown) return;
    const exact = current;
    await run(async () => {
      await inspectFieldAgendaJob(exact, jobId);
      if (live.current) {
        setSelected(jobId);
        setTab('controls');
        setMessage(
          'Exact job retained. Original controls still require their own confirmations.',
        );
      }
    });
  }
  const workers = current
    ? [
        ...new Map(
          current.rows.flatMap((r) =>
            r.crew.map((w) => [w.worker_id, w] as const),
          ),
        ).values(),
      ]
    : [];
  return (
    <section
      className="field-agenda"
      aria-label="Field agenda"
      aria-busy={busy}
    >
      <header>
        <p className="fa-eyebrow">FIELD · RECORDED AGENDA</p>
        <h2>Field agenda</h2>
        <p>
          One source-bound view of the available jobs, crew and inspection
          records.
        </p>
      </header>
      <p className="fa-boundary">
        Local review only. Recorded inspection status is not work status.
        Date-only co-occurrence requires review; actual availability, timed
        conflicts and physical completion remain UNKNOWN or UNVERIFIED.
      </p>
      {!view && !unknown && (
        <div className="fa-card">
          <label className="fa-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => {
                gate.current.confirmed = e.target.checked;
                setConfirmed(e.target.checked);
              }}
            />
            I confirm this is a local recorded field agenda review.
          </label>
          {!hintValid && (
            <p>No exact authorized job selected. No fallback selection.</p>
          )}
          <button
            disabled={!confirmed || busy || !hintValid}
            onClick={() =>
              void run(async () => {
                const result = await readFieldAgenda(sources, gate.current);
                if (live.current) {
                  setView(result);
                  if (selectedJobId) {
                    await inspectFieldAgendaJob(result, selectedJobId);
                    if (live.current) {
                      setSelected(selectedJobId);
                      setTab('controls');
                    }
                  }
                  setMessage(
                    'Recorded agenda loaded. Available records do not establish complete schedule coverage.',
                  );
                }
              })
            }
          >
            Load recorded field agenda
          </button>
        </div>
      )}
      <p role={unknown || (view && !current) ? 'alert' : 'status'}>
        {busy
          ? 'Checking exact field agenda sources…'
          : view && !current
            ? 'Exact field source changed. Details withheld; reconcile read only.'
            : message}
      </p>
      {view && (
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await reconcileFieldAgenda(view);
              if (live.current) {
                if (result.status === 'UNKNOWN') fail();
                else
                  setMessage(
                    'Exact read-only evidence current. No task, schedule or navigation replay.',
                  );
              }
            })
          }
        >
          Reconcile field agenda read only
        </button>
      )}
      {current && !unknown && (
        <>
          <nav className="fa-tabs" aria-label="Daily field views">
            <button
              aria-pressed={tab === 'agenda'}
              onClick={() => setTab('agenda')}
            >
              Recorded agenda
            </button>
            <button
              aria-pressed={tab === 'controls'}
              disabled={!selected}
              onClick={() => setTab('controls')}
            >
              Retained job controls
            </button>
          </nav>
          <div hidden={tab !== 'agenda'}>
            <div className="fa-filters">
              <label>
                Search recorded field jobs
                <input
                  type="search"
                  value={filter.query}
                  maxLength={200}
                  onChange={(e) =>
                    setFilter({ ...filter, query: e.target.value })
                  }
                />
              </label>
              <label>
                Agenda start date
                <input
                  type="date"
                  value={filter.day}
                  onChange={(e) =>
                    setFilter({ ...filter, day: e.target.value })
                  }
                />
              </label>
              <label>
                Agenda period
                <select
                  value={filter.period}
                  onChange={(e) =>
                    setFilter({
                      ...filter,
                      period: e.target.value as FieldAgendaFilter['period'],
                    })
                  }
                >
                  <option value="day">Selected day</option>
                  <option value="week">Seven days</option>
                  <option value="all">All available dates</option>
                </select>
              </label>
              <label>
                Recorded technician
                <select
                  value={filter.worker_id}
                  onChange={(e) =>
                    setFilter({ ...filter, worker_id: e.target.value })
                  }
                >
                  <option value="">All recorded technicians</option>
                  {workers.map((w) => (
                    <option key={w.worker_id} value={w.worker_id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Recorded inspection status
                <select
                  value={filter.status}
                  onChange={(e) =>
                    setFilter({ ...filter, status: e.target.value })
                  }
                >
                  <option value="all">All recorded statuses</option>
                  {[
                    ...new Set(
                      current.rows.flatMap((r) => r.reported_statuses),
                    ),
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() =>
                  setFilter({
                    query: '',
                    day: current.rows[0].day,
                    period: 'week',
                    worker_id: '',
                    status: 'all',
                  })
                }
              >
                Reset field filters
              </button>
            </div>
            {filterError && <p role="alert">{filterError}</p>}
            {filtered && (
              <>
                <p role="status">
                  {filtered.matching_jobs} matching of {filtered.available_jobs}{' '}
                  available jobs. Coverage is limited to available exact
                  records.
                </p>
                <p>
                  {filtered.signals.length} date-only crew review signals ·
                  timed conflicts UNKNOWN · actual availability UNKNOWN.
                </p>
                <div className="fa-grid">
                  {filtered.rows.map((row) => (
                    <article className="fa-card" key={row.key}>
                      <p className="fa-eyebrow">
                        {row.day} · {row.timezone}
                      </p>
                      <h3>{row.job.title}</h3>
                      <p>
                        {row.job.customer_label} · {row.job.property_label}
                      </p>
                      <p>
                        Job {row.source.job_id} · revision{' '}
                        {row.source.job_revision}
                      </p>
                      <p>
                        Issued version {row.source.issued_version_number} ·{' '}
                        {row.source.issued_version_id}
                      </p>
                      <p>
                        Recorded inspection status:{' '}
                        {row.reported_statuses.join(', ') || 'No visit record'}.
                      </p>
                      <p>
                        Recorded crew:{' '}
                        {row.crew.map((w) => w.label).join(', ') || 'UNKNOWN'}.
                      </p>
                      <p>
                        {row.reports.length} available published source versions
                        · physical completion UNVERIFIED.
                      </p>
                      <button
                        disabled={busy}
                        onClick={() => void choose(row.source.job_id)}
                      >
                        Review recorded field job {row.source.job_id}
                      </button>
                    </article>
                  ))}
                </div>
                {!filtered.rows.length && (
                  <p>
                    No available jobs match these filters. Missing records never
                    prove no work or completed repairs.
                  </p>
                )}
              </>
            )}
          </div>
          <div hidden={tab !== 'controls'}>
            <h3 ref={heading} tabIndex={-1}>
              Exact retained field job
            </h3>
            {selected && (
              <>
                <p>
                  Job {selected}. Retained original work-order controls; no new
                  task states.
                </p>
                <FieldWorkspace
                  key={selected}
                  sources={sources}
                  enabled
                  selectedJobId={selected}
                  onSelectJob={onSelectJob}
                />
                {onContinue && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const callback = onContinue,
                          epoch = generation.current;
                        await continueFieldAgenda(
                          current,
                          selected,
                          callback,
                          () =>
                            live.current &&
                            callbacks.current.onContinue === callback &&
                            generation.current === epoch,
                        );
                      })
                    }
                  >
                    Continue exact job to cost review
                  </button>
                )}
                <button onClick={() => setTab('agenda')}>
                  Return to recorded agenda
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
