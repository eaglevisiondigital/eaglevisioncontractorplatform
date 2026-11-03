import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { prototypeFields } from '../../lib/program/prototype-source';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import type { DailyWorkbenchProps } from '../../lib/workflows/daily-workbench-contract';
import type { FollowUpReadinessInput } from '../../lib/workflows/follow-up-readiness';
import {
  readMaintenanceAgenda,
  assertMaintenanceAgendaNow,
  filterMaintenanceAgenda,
  inspectMaintenanceAgendaOccurrence,
  continueMaintenanceAgenda,
  reconcileMaintenanceAgenda,
  type MaintenanceAgendaView,
  type MaintenanceAgendaFilter,
} from '../../lib/workflows/maintenance-agenda';
import { RetainedMaintenanceDesk } from './RetainedMaintenanceDesk';
import './maintenance-agenda.css';
export function MaintenanceAgenda(props: DailyWorkbenchProps) {
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
      /* Prior evidence withheld. */
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
    <section className="maintenance-agenda" aria-label="Maintenance agenda">
      <h2>Maintenance agenda</h2>
      <p>
        {admitted
          ? 'Current authorized maintenance sources unavailable. Previous context withheld.'
          : 'Maintenance agenda is off. No sending or renewal authority.'}
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
  const day = sources.entries[0].day,
    end = Temporal.PlainDate.from(day).add({ days: 28 }).toString();
  const [confirmed, setConfirmed] = useState(false),
    [view, setView] = useState<MaintenanceAgendaView | null>(null),
    [purpose, setPurpose] = useState<FollowUpReadinessInput['purpose']>(
      'recurring_maintenance',
    ),
    [channel, setChannel] = useState<'email' | 'sms'>('email'),
    [from, setFrom] = useState(day),
    [through, setThrough] = useState(end),
    [filter, setFilter] = useState<MaintenanceAgendaFilter>({
      query: '',
      kind: 'all',
      channel_state: 'all',
      from: day,
      through: end,
      job_id: selectedJobId ?? '',
      scope: 'all',
    }),
    [selected, setSelected] = useState<Awaited<
      ReturnType<typeof inspectMaintenanceAgendaOccurrence>
    > | null>(null),
    [tab, setTab] = useState<'agenda' | 'evidence' | 'controls'>('agenda'),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [message, setMessage] = useState(
      'Review upcoming recurrence and renewal requirements from exact recorded sources.',
    );
  const gate = useRef({ enabled: true, confirmed: false }),
    live = useRef(true),
    pending = useRef(false),
    generation = useRef(0),
    callbacks = useRef({ onContinue, onSelectJob }),
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
      assertMaintenanceAgendaNow(current);
    } catch {
      current = null;
    }
  const hintValid =
    !selectedJobId ||
    sources.entries.some((e) => e.target.job_id === selectedJobId);
  let matching: ReturnType<typeof filterMaintenanceAgenda> | null = null,
    filterError = '';
  if (current)
    try {
      matching = filterMaintenanceAgenda(current, filter);
    } catch {
      filterError =
        'Choose valid dates and an exact authorized maintenance scope.';
    }
  const fail = () => {
    setUnknown(true);
    setMessage(
      'Maintenance agenda UNKNOWN. Exact read-only reconciliation only; no replay, replacement or sending.',
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
  async function choose(key: string) {
    if (!current || unknown) return;
    const exact = current;
    await run(async () => {
      const result = await inspectMaintenanceAgendaOccurrence(exact, key);
      if (live.current) {
        setSelected(result);
        setTab('evidence');
        setMessage(
          'Exact occurrence and original plan revision retained. Current consent remains unverified.',
        );
      }
    });
  }
  return (
    <section
      className="maintenance-agenda"
      aria-label="Maintenance agenda"
      aria-busy={busy}
    >
      <header>
        <p className="ma-eyebrow">GROWTH · UPCOMING SOURCE REVIEW</p>
        <h2>Maintenance agenda</h2>
        <p>
          Recurring work planning, exact evidence and renewal requirements in
          one review path.
        </p>
      </header>
      <p className="ma-boundary">
        Staff planning only. Historical contact permission is not current
        purpose consent. Suppression, enrollment and renewal terms remain
        unverified; no sending, renewal agreement or billing authority.
      </p>
      {!view && !unknown && (
        <div className="ma-card">
          <div className="ma-grid">
            <label>
              Agenda source window from
              <input
                type="date"
                value={from}
                disabled={busy}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Agenda source window through
              <input
                type="date"
                value={through}
                disabled={busy}
                onChange={(e) => setThrough(e.target.value)}
              />
            </label>
            <label>
              Agenda requested purpose
              <select
                value={purpose}
                disabled={busy}
                onChange={(e) => setPurpose(e.target.value as typeof purpose)}
              >
                <option value="recurring_maintenance">
                  Recurring maintenance
                </option>
                <option value="service_follow_up">Service follow-up</option>
                <option value="marketing">Marketing review</option>
              </select>
            </label>
            <label>
              Agenda contact evidence channel
              <select
                value={channel}
                disabled={busy}
                onChange={(e) => setChannel(e.target.value as typeof channel)}
              >
                <option value="email">Email evidence</option>
                <option value="sms">SMS evidence</option>
              </select>
            </label>
          </div>
          <label className="ma-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => {
                gate.current.confirmed = e.target.checked;
                setConfirmed(e.target.checked);
              }}
            />
            I confirm this is local maintenance planning with no permission to
            send.
          </label>
          {!hintValid && (
            <p>No exact authorized job selected. No fallback selection.</p>
          )}
          <button
            disabled={busy || !confirmed || !hintValid}
            onClick={() =>
              void run(async () => {
                const input: FollowUpReadinessInput = {
                  window: {
                    from,
                    through,
                    as_of: day + 'T12:00:00.000Z',
                    channel,
                  },
                  lead_days: 14,
                  overdue_days: 7,
                  query: '',
                  kind: 'all',
                  readiness: 'all',
                  job_id: selectedJobId ?? '',
                  customer_id: '',
                  location_id: '',
                  purpose,
                  channel_state: 'all',
                };
                const result = await readMaintenanceAgenda(
                  sources,
                  input,
                  gate.current,
                );
                if (live.current) {
                  setView(result);
                  setFilter({ ...filter, from, through });
                  setMessage(
                    'Captured recurring source queue loaded. No message or renewal action has been prepared.',
                  );
                }
              })
            }
          >
            Load upcoming maintenance agenda
          </button>
        </div>
      )}
      <p role={unknown || (view && !current) ? 'alert' : 'status'}>
        {busy
          ? 'Checking exact maintenance, consent and source evidence…'
          : view && !current
            ? 'Exact maintenance source changed. Details withheld; reconcile read only.'
            : message}
      </p>
      {view && (
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await reconcileMaintenanceAgenda(view);
              if (live.current) {
                if (result.status === 'UNKNOWN') fail();
                else
                  setMessage(
                    'Exact read-only source CAPTURED_NOT_ATOMIC. No sending or automatic continuation.',
                  );
              }
            })
          }
        >
          Reconcile maintenance agenda read only
        </button>
      )}
      {current && !unknown && (
        <>
          <nav className="ma-tabs" aria-label="Maintenance agenda views">
            <button
              aria-pressed={tab === 'agenda'}
              onClick={() => setTab('agenda')}
            >
              Upcoming review queue
            </button>
            <button
              aria-pressed={tab === 'evidence'}
              disabled={!selected}
              onClick={() => setTab('evidence')}
            >
              Source and renewal requirements
            </button>
            <button
              aria-pressed={tab === 'controls'}
              disabled={!selected}
              onClick={() => setTab('controls')}
            >
              Original maintenance controls
            </button>
          </nav>
          <div hidden={tab !== 'agenda'}>
            <div className="ma-filters">
              <label>
                Search upcoming maintenance
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
                Maintenance agenda job
                <select
                  value={filter.job_id}
                  disabled={Boolean(selectedJobId)}
                  onChange={(e) =>
                    setFilter({ ...filter, job_id: e.target.value })
                  }
                >
                  <option value="">All authorized jobs</option>
                  {sources.entries.map((e) => (
                    <option key={e.target.job_id} value={e.target.job_id!}>
                      Job {e.target.job_id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due on or after
                <input
                  type="date"
                  value={filter.from}
                  onChange={(e) =>
                    setFilter({ ...filter, from: e.target.value })
                  }
                />
              </label>
              <label>
                Due on or before
                <input
                  type="date"
                  value={filter.through}
                  onChange={(e) =>
                    setFilter({ ...filter, through: e.target.value })
                  }
                />
              </label>
              <label>
                Recorded occurrence kind
                <select
                  value={filter.kind}
                  onChange={(e) =>
                    setFilter({
                      ...filter,
                      kind: e.target.value as MaintenanceAgendaFilter['kind'],
                    })
                  }
                >
                  <option value="all">All recorded kinds</option>
                  <option value="inspection_occurrence">Plan occurrence</option>
                  <option value="staff_follow_up">Staff follow-up</option>
                </select>
              </label>
              <label>
                Planning review scope
                <select
                  value={filter.scope}
                  onChange={(e) =>
                    setFilter({
                      ...filter,
                      scope: e.target.value as MaintenanceAgendaFilter['scope'],
                    })
                  }
                >
                  <option value="all">All source review requirements</option>
                  <option value="planning_eligible">
                    Staff planning eligible only
                  </option>
                  <option value="needs_review">
                    Additional planning review
                  </option>
                </select>
              </label>
              <button
                onClick={() =>
                  setFilter({
                    query: '',
                    kind: 'all',
                    channel_state: 'all',
                    from: current.window.from,
                    through: current.window.through,
                    job_id: selectedJobId ?? '',
                    scope: 'all',
                  })
                }
              >
                Reset maintenance agenda filters
              </button>
            </div>
            {filterError && <p role="alert">{filterError}</p>}
            {matching && (
              <>
                <p role="status">
                  {matching.matching} matching of {matching.captured} captured
                  occurrences. Access-limited coverage; complete history
                  UNKNOWN.
                </p>
                <div className="ma-grid">
                  {matching.rows.map((row) => (
                    <article className="ma-card" key={row.key}>
                      <p className="ma-eyebrow">
                        {row.recorded_due_on} · {row.kind.replaceAll('_', ' ')}
                      </p>
                      <h3>{row.context.property_label}</h3>
                      <p>
                        {row.context.customer_label} · {row.context.job_title}
                      </p>
                      <p>
                        {row.plan_name} · plan revision{' '}
                        {row.plan_reference.revision}
                      </p>
                      <p>
                        Planning status {row.planning_status} · staff planning
                        eligible {String(row.staff_planning_eligible)}.
                      </p>
                      <p>
                        Current channel authority{' '}
                        {row.current_channel_authority}; suppression{' '}
                        {row.suppression}; renewal terms UNKNOWN.
                      </p>
                      <button
                        disabled={busy}
                        onClick={() => void choose(row.key)}
                      >
                        Review upcoming occurrence {row.recorded_due_on} for job{' '}
                        {row.context.job_id}
                      </button>
                    </article>
                  ))}
                </div>
                {!matching.rows.length && (
                  <p>
                    No available occurrences match these filters. Missing
                    records never prove completed work, current consent or no
                    future maintenance.
                  </p>
                )}
              </>
            )}
          </div>
          {selected && (
            <>
              <h3 tabIndex={-1} ref={heading}>
                Exact maintenance occurrence
              </h3>
              <p className="ma-context">
                Job {selected.row.context.job_id} · property{' '}
                {selected.row.context.location_id} · customer{' '}
                {selected.row.context.customer_id} · issued{' '}
                {selected.row.context.issued_version_id}
              </p>
              <div hidden={tab !== 'evidence'}>
                <article className="ma-card">
                  <h4>
                    {selected.row.plan_name} · {selected.row.recorded_due_on}
                  </h4>
                  <p>Exact occurrence {selected.row.key}</p>
                  <p>
                    Plan {selected.row.plan_reference.id} revision{' '}
                    {selected.row.plan_reference.revision} · date basis{' '}
                    {selected.row.date_basis}
                  </p>
                  <p>
                    Historical channel {selected.row.historical_channel_state}.
                    Current channel authority{' '}
                    {selected.current_channel_authority}; purpose consent{' '}
                    {selected.purpose_consent}; suppression{' '}
                    {selected.suppression}; enrollment {selected.enrollment}.
                  </p>
                  <h4>Renewal review requirements</h4>
                  <p>
                    Renewal terms UNKNOWN. No verified recurring agreement,
                    customer renewal authorization, current purpose consent or
                    atomic consent-at-send evidence is available. This
                    occurrence is a planning source, never an executed renewal
                    opportunity.
                  </p>
                  <p>
                    Send authority BLOCKED; recipient and provider request
                    absent. Captured observations are not operational sending
                    evidence.
                  </p>
                  <button onClick={() => setTab('controls')}>
                    Open retained original maintenance controls
                  </button>
                </article>
              </div>
              <div hidden={tab !== 'controls'}>
                <RetainedMaintenanceDesk
                  key={selected.row.context.job_id}
                  sources={sources}
                  enabled
                  selectedJobId={selected.row.context.job_id}
                  onSelectJob={onSelectJob}
                />
                <p>
                  Original controls receive the exact job only. Purpose,
                  channel, window and occurrence remain separate explicit
                  original selections.
                </p>
              </div>
              {onContinue && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const callback = onContinue,
                        epoch = generation.current;
                      await continueMaintenanceAgenda(
                        current,
                        selected.row.key,
                        callback,
                        () =>
                          live.current &&
                          callbacks.current.onContinue === callback &&
                          generation.current === epoch,
                      );
                    })
                  }
                >
                  Continue exact job to daily priorities
                </button>
              )}
              <button onClick={() => setTab('agenda')}>
                Return to upcoming review queue
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
