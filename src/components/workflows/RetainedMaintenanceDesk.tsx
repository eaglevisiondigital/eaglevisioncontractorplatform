import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import type { OperatingJobSection } from '../../lib/workflows/operating-navigation';
import type { FollowUpReadinessInput } from '../../lib/workflows/follow-up-readiness';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  readRetainedMaintenanceDesk,
  assertRetainedMaintenanceDeskNow,
  filterRetainedMaintenanceDesk,
  reconcileRetainedMaintenanceDesk,
  selectRetainedMaintenanceCase,
  assertRetainedMaintenanceCaseNow,
  openRetainedMaintenanceSection,
  navigateRetainedMaintenanceCase,
  type RetainedMaintenanceDeskView,
  type RetainedMaintenanceCase,
  type RetainedMaintenanceSection,
} from '../../lib/workflows/retained-maintenance-desk';
import { MaintenanceReviewPath } from './MaintenanceReviewPath';
import './retained-maintenance-desk.css';

export interface RetainedMaintenanceDeskProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}
export function RetainedMaintenanceDesk(props: RetainedMaintenanceDeskProps) {
  const { sources, enabled = false, selectedJobId } = props;
  const admitted =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  let check: (() => void) | null = null;
  if (admitted)
    try {
      const root = prototypeFields(sources, [
        'company',
        'operations',
        'estimates',
        'property',
        'entries',
        'gate',
      ]);
      check = captureOperatingSources(
        sources,
        root.gate as OperatingSources['gate'],
      ).check;
    } catch {
      /* Prior data withdrawn on denial. */
    }
  const [binding, setBinding] = useState({
    sources,
    admitted,
    check,
    selectedJobId,
    epoch: 0,
  });
  let changed = false;
  if (binding.sources === sources && binding.check)
    try {
      binding.check();
    } catch {
      changed = true;
    }
  if (
    binding.sources !== sources ||
    binding.admitted !== admitted ||
    binding.selectedJobId !== selectedJobId ||
    Boolean(binding.check) !== Boolean(check) ||
    changed
  ) {
    setBinding({
      sources,
      admitted,
      check,
      selectedJobId,
      epoch: binding.epoch + 1,
    });
    return null;
  }
  return admitted && check ? (
    <Desk key={binding.epoch} {...props} />
  ) : (
    <section
      className="retained-maintenance-desk"
      aria-label="Retained maintenance desk"
    >
      <h2>Retained maintenance desk</h2>
      <p>
        {admitted
          ? 'Current authorized maintenance context unavailable. Previous detail withheld.'
          : 'Retained maintenance desk is off. No sending or enrollment enabled.'}
      </p>
    </section>
  );
}
function Desk({
  sources,
  selectedJobId,
  onSelectJob,
}: RetainedMaintenanceDeskProps) {
  const day = sources.entries[0].day;
  const [job, setJob] = useState(selectedJobId ?? ''),
    [purpose, setPurpose] = useState<FollowUpReadinessInput['purpose']>(
      'recurring_maintenance',
    ),
    [channel, setChannel] = useState<'email' | 'sms'>('email'),
    [confirmed, setConfirmed] = useState(false),
    [attempted, setAttempted] = useState(false),
    [view, setView] = useState<RetainedMaintenanceDeskView | null>(null),
    [selected, setSelected] = useState<RetainedMaintenanceCase | null>(null),
    [section, setSection] = useState<RetainedMaintenanceSection>('queue'),
    [query, setQuery] = useState(''),
    [kind, setKind] = useState<
      'all' | 'inspection_occurrence' | 'staff_follow_up'
    >('all'),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [message, setMessage] = useState(
      'Inspect existing maintenance occurrences and retain one exact source case.',
    );
  const gate = useRef({ enabled: true, confirmed: false }),
    live = useRef(true),
    pending = useRef(false),
    heading = useRef<HTMLHeadingElement>(null),
    callback = useRef(onSelectJob),
    generation = useRef(0),
    token = useMemo(() => ({ callback: onSelectJob }), [onSelectJob]),
    activeToken = useRef<typeof token | undefined>(token);
  useLayoutEffect(() => {
    const epoch = generation;
    epoch.current++;
    callback.current = onSelectJob;
    activeToken.current = token;
    return () => {
      epoch.current++;
      callback.current = undefined;
      activeToken.current = undefined;
    };
  }, [onSelectJob, token]);
  useEffect(() => {
    live.current = true;
    const own = gate.current;
    return () => {
      live.current = false;
      own.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (view) heading.current?.focus();
  }, [view, selected, section]);
  let current = view,
    currentCase = selected;
  if (current)
    try {
      assertRetainedMaintenanceDeskNow(current);
    } catch {
      current = null;
    }
  if (currentCase)
    try {
      assertRetainedMaintenanceCaseNow(currentCase);
    } catch {
      currentCase = null;
    }
  let matching: ReturnType<typeof filterRetainedMaintenanceDesk> | null = null;
  if (current)
    try {
      matching = filterRetainedMaintenanceDesk(current, {
        query,
        kind,
        channel_state: 'all',
        from: current.window.from,
        through: current.window.through,
      });
    } catch {
      /* Invalid source stays withheld. */
    }
  const hintValid =
    !selectedJobId ||
    sources.entries.some((e) => e.target.job_id === selectedJobId);
  const fail = () => {
    setUnknown(true);
    setMessage(
      'Maintenance desk UNKNOWN. Exact read-only reconciliation only; original terminal holds remain, no replay or sending.',
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
  async function load() {
    if (!confirmed || attempted || unknown || !hintValid) return;
    setAttempted(true);
    await run(async () => {
      const input: FollowUpReadinessInput = {
        window: {
          from: day,
          through: Temporal.PlainDate.from(day).add({ days: 28 }).toString(),
          as_of: day + 'T12:00:00.000Z',
          channel,
        },
        lead_days: 14,
        overdue_days: 7,
        query: '',
        kind: 'all',
        readiness: 'all',
        job_id: job,
        customer_id: '',
        location_id: '',
        purpose,
        channel_state: 'all',
      };
      const result = await readRetainedMaintenanceDesk(
        sources,
        input,
        gate.current,
      );
      if (live.current) {
        setView(result);
        setMessage(
          'Available captured occurrences only. Historical contact evidence never permits sending.',
        );
      }
    });
  }
  async function choose(key: string) {
    if (!current || currentCase || unknown) return;
    const exact = current;
    await run(async () => {
      const result = await selectRetainedMaintenanceCase(exact, key);
      if (live.current) {
        setSelected(result);
        setSection('controls');
        setMessage(
          'Exact occurrence retained. Original same-job controls are directly available with separate purpose/channel/occurrence confirmations.',
        );
      }
    });
  }
  async function change(next: RetainedMaintenanceSection) {
    if (!currentCase || unknown) return;
    const exact = currentCase;
    await run(async () => {
      await openRetainedMaintenanceSection(exact, next);
      if (live.current) {
        setSection(next);
        setMessage(
          'Same occurrence, plan revision and original mounted controls retained; consent observations rechecked read only.',
        );
      }
    });
  }
  return (
    <section
      className="retained-maintenance-desk"
      aria-label="Retained maintenance desk"
      aria-busy={busy}
    >
      <header>
        <p className="rmd-eyebrow">GROWTH · RETAINED SOURCE CASE</p>
        <h2>Retained maintenance desk</h2>
        <p>
          One occurrence, its source context and original planning controls.
        </p>
      </header>
      <p className="rmd-boundary">
        Planning only. Current channel authority UNKNOWN; purpose consent,
        suppression and enrollment unverified. No sender, agreement, billing or
        financial authority.
      </p>
      {!attempted && (
        <div className="rmd-card">
          <div className="rmd-grid">
            <label>
              Maintenance desk job
              <select
                value={job}
                disabled={busy || Boolean(selectedJobId)}
                onChange={(e) => setJob(e.target.value)}
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
              Maintenance desk purpose
              <select
                value={purpose}
                disabled={busy}
                onChange={(e) => setPurpose(e.target.value as typeof purpose)}
              >
                <option value="recurring_maintenance">
                  Recurring maintenance
                </option>
                <option value="service_follow_up">Service follow-up</option>
                <option value="marketing">Marketing</option>
              </select>
            </label>
            <label>
              Maintenance desk channel
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
          {!hintValid && (
            <p>No exact authorized job selected. No fallback selection.</p>
          )}
          <label className="rmd-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => {
                gate.current.confirmed = e.target.checked;
                setConfirmed(e.target.checked);
              }}
            />
            I confirm this is a maintenance source review, with no permission to
            send.
          </label>
          <button
            disabled={!confirmed || !hintValid || busy}
            onClick={() => void load()}
          >
            Load retained maintenance desk
          </button>
        </div>
      )}
      <p role={unknown || (view && !current) ? 'alert' : 'status'}>
        {busy
          ? 'Checking exact maintenance and consent sources…'
          : view && !current
            ? 'Exact maintenance source changed. Prior detail withheld.'
            : message}
      </p>
      {view && (
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await reconcileRetainedMaintenanceDesk(view);
              if (live.current) {
                if (result.status === 'UNKNOWN') fail();
                else
                  setMessage(
                    'Exact read-only status CAPTURED_NOT_ATOMIC. No sending, replacement or preparation replay.',
                  );
              }
            })
          }
        >
          Reconcile maintenance desk read only
        </button>
      )}
      {current && !unknown && (
        <>
          {currentCase && (
            <nav aria-label="Exact maintenance record context">
              <ol className="rmd-breadcrumbs">
                {currentCase.breadcrumbs.map((b) => (
                  <li key={b.kind}>
                    <span>{b.kind}</span>
                    <strong>{b.label}</strong>
                    <small>{b.id}</small>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {currentCase && (
            <div className="rmd-toolbar" aria-label="Maintenance case views">
              <button
                aria-pressed={section === 'controls'}
                disabled={busy}
                onClick={() => void change('controls')}
              >
                Retained planning controls
              </button>
              <button
                aria-pressed={section === 'sources'}
                disabled={busy}
                onClick={() => void change('sources')}
              >
                Occurrence source and consent
              </button>
              <button
                aria-pressed={section === 'queue'}
                disabled={busy}
                onClick={() => void change('queue')}
              >
                Maintenance queue
              </button>
              {onSelectJob && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const selectedCallback = onSelectJob,
                        epoch = generation.current;
                      await navigateRetainedMaintenanceCase(
                        currentCase,
                        (jobId, destination) => {
                          if (
                            live.current &&
                            callback.current === selectedCallback &&
                            generation.current === epoch
                          )
                            selectedCallback(jobId, destination);
                        },
                      );
                    })
                  }
                >
                  Open exact maintenance job
                </button>
              )}
            </div>
          )}
          <h3 tabIndex={-1} ref={heading}>
            {currentCase && section === 'controls'
              ? 'Retained maintenance controls'
              : currentCase && section === 'sources'
                ? 'Exact occurrence and consent evidence'
                : 'Available retained maintenance queue'}
          </h3>
          <p>
            Captured {current.window.from}–{current.window.through} · as of{' '}
            {current.window.as_of} · requested purpose{' '}
            {current.requested_purpose} · channel {current.window.channel}.
            Counts are access-limited; send authority BLOCKED.
          </p>
          <div hidden={section !== 'queue'}>
            <div className="rmd-card">
              <div className="rmd-grid">
                <label>
                  Search maintenance desk
                  <input
                    type="search"
                    value={query}
                    maxLength={200}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label>
                  Maintenance desk occurrence kind
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as typeof kind)}
                  >
                    <option value="all">All recorded kinds</option>
                    <option value="inspection_occurrence">
                      Plan occurrence
                    </option>
                    <option value="staff_follow_up">Staff follow-up</option>
                  </select>
                </label>
              </div>
              <button
                onClick={() => {
                  setQuery('');
                  setKind('all');
                }}
              >
                Reset maintenance desk filters
              </button>
              <p role="status">
                {matching?.matching ?? 0} matching of {matching?.captured ?? 0}{' '}
                captured occurrences; complete history UNKNOWN.
              </p>
            </div>
            {matching?.rows.length ? (
              <div className="rmd-grid">
                {matching.rows.map((r) => (
                  <article className="rmd-card" key={r.key}>
                    <h4>{r.context.property_label}</h4>
                    <p>
                      {r.context.customer_label} · {r.context.job_title}
                    </p>
                    <p>
                      {r.plan_name} · {r.recorded_due_on} ·{' '}
                      {r.planning_status.replaceAll('_', ' ')}
                    </p>
                    <button
                      disabled={busy || Boolean(currentCase)}
                      onClick={() => void choose(r.key)}
                    >
                      Inspect retained occurrence {r.recorded_due_on}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p>
                No matching available occurrences. Missing records do not
                establish completed work or consent.
              </p>
            )}
            {currentCase && (
              <button disabled={busy} onClick={() => void change('controls')}>
                Return to retained maintenance controls
              </button>
            )}
          </div>
          {currentCase && (
            <>
              <div hidden={section !== 'controls'}>
                <p className="rmd-boundary">
                  Original controls receive this exact job only. Their purpose,
                  channel, window and occurrence selections remain separately
                  explicit; no automatic occurrence handoff is claimed.
                </p>
                <MaintenanceReviewPath
                  sources={sources}
                  enabled
                  selectedJobId={currentCase.row.context.job_id}
                  onSelectJob={
                    onSelectJob
                      ? (jobId, destination?: OperatingJobSection) => {
                          if (
                            live.current &&
                            callback.current === onSelectJob &&
                            activeToken.current === token
                          )
                            onSelectJob(jobId, destination);
                        }
                      : undefined
                  }
                />
              </div>
              <div hidden={section !== 'sources'}>
                <article className="rmd-card">
                  <h4>{currentCase.row.plan_name}</h4>
                  <dl className="rmd-grid">
                    <div>
                      <dt>Plan / revision</dt>
                      <dd>
                        {currentCase.row.plan_reference.id} /{' '}
                        {currentCase.row.plan_reference.revision}
                      </dd>
                    </div>
                    <div>
                      <dt>Exact due date / date basis</dt>
                      <dd>
                        {currentCase.row.recorded_due_on} /{' '}
                        {currentCase.row.date_basis}
                      </dd>
                    </div>
                    <div>
                      <dt>Issued baseline</dt>
                      <dd>{currentCase.row.context.issued_version_id}</dd>
                    </div>
                    <div>
                      <dt>Historical contact reference</dt>
                      <dd>
                        {currentCase.historical_contact_reference?.id ??
                          'UNKNOWN'}{' '}
                        · {currentCase.row.historical_channel_state}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    Current channel authority{' '}
                    {currentCase.current_channel_authority}. Purpose consent{' '}
                    {currentCase.purpose_consent}; suppression{' '}
                    {currentCase.suppression}; enrollment{' '}
                    {currentCase.enrollment}; renewal terms UNKNOWN.
                  </p>
                  <p>
                    Captured original control status{' '}
                    {currentCase.captured_original_control_status}.
                    Cancellation/revocation in original controls withdraws a
                    local review, never records customer consent.
                  </p>
                  <p>
                    Send authority BLOCKED; recipient and provider request
                    absent. Captured observations are not atomic consent-at-send
                    evidence.
                  </p>
                </article>
                <button disabled={busy} onClick={() => void change('controls')}>
                  Return to retained maintenance controls
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
