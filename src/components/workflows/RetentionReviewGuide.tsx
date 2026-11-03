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
  readRetentionReviewGuide,
  assertRetentionReviewGuideNow,
  filterRetentionReviewGuide,
  inspectRetentionReviewItem,
  assertRetentionReviewItemNow,
  returnRetentionReviewGuide,
  reconcileRetentionReviewGuide,
  openRetentionReviewControls,
  navigateRetentionReviewJob,
  type RetentionReviewGuideView,
  type RetentionReviewFilter,
  type RetentionReviewItem,
} from '../../lib/workflows/retention-review-guide';
import { MaintenanceReviewPath } from './MaintenanceReviewPath';
import './retention-review-guide.css';

export interface RetentionReviewGuideProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}
export function RetentionReviewGuide(props: RetentionReviewGuideProps) {
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
      /* No previous company details on denial. */
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
    <Guide key={binding.epoch} {...props} />
  ) : (
    <section
      className="retention-review-guide"
      aria-label="Retention review guide"
    >
      <h2>Retention review guide</h2>
      <p>
        {admitted
          ? 'Current authorized retention sources unavailable. Previous planning withheld.'
          : 'Retention review guide is off. No enrollment, provider or communications enabled.'}
      </p>
    </section>
  );
}
function Guide({
  sources,
  selectedJobId,
  onSelectJob,
}: RetentionReviewGuideProps) {
  const day = sources.entries[0].day;
  const [job, setJob] = useState(selectedJobId ?? ''),
    [purpose, setPurpose] = useState<FollowUpReadinessInput['purpose']>(
      'recurring_maintenance',
    ),
    [channel, setChannel] = useState<'email' | 'sms'>('email'),
    [from, setFrom] = useState(day),
    [through, setThrough] = useState(
      Temporal.PlainDate.from(day).add({ days: 28 }).toString(),
    ),
    [confirmed, setConfirmed] = useState(false),
    [attempted, setAttempted] = useState(false),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [view, setView] = useState<RetentionReviewGuideView | null>(null),
    [filter, setFilter] = useState<RetentionReviewFilter>({
      query: '',
      kind: 'all',
      channel_state: 'all',
      from: day,
      through: Temporal.PlainDate.from(day).add({ days: 28 }).toString(),
    }),
    [detail, setDetail] = useState<RetentionReviewItem | null>(null),
    [inDetail, setInDetail] = useState(false),
    [controlsJob, setControlsJob] = useState<string | null>(null),
    [inControls, setInControls] = useState(false),
    [message, setMessage] = useState(
      'Inspect current local plan occurrences and historical contact evidence.',
    );
  const callbackToken = useMemo(
    () => ({ callback: onSelectJob }),
    [onSelectJob],
  );
  const gate = useRef({ enabled: true, confirmed: false }),
    live = useRef(true),
    currentCallback = useRef(onSelectJob),
    callbackGeneration = useRef(0),
    currentCallbackToken = useRef<typeof callbackToken | undefined>(
      callbackToken,
    ),
    pending = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const generation = callbackGeneration;
    generation.current++;
    currentCallback.current = onSelectJob;
    currentCallbackToken.current = callbackToken;
    return () => {
      generation.current++;
      currentCallback.current = undefined;
      currentCallbackToken.current = undefined;
    };
  }, [onSelectJob, callbackToken]);
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
  }, [view, detail, inDetail, inControls]);
  let current = view,
    currentDetail = detail;
  if (current)
    try {
      assertRetentionReviewGuideNow(current);
    } catch {
      current = null;
    }
  if (currentDetail)
    try {
      assertRetentionReviewItemNow(currentDetail);
    } catch {
      currentDetail = null;
    }
  let matching: ReturnType<typeof filterRetentionReviewGuide> | null = null,
    filterError = '';
  if (current)
    try {
      matching = filterRetentionReviewGuide(current, filter);
    } catch {
      filterError =
        'Choose a valid range inside the captured window and a search of 200 characters or fewer.';
    }
  const validHint =
    !selectedJobId ||
    sources.entries.some((e) => e.target.job_id === selectedJobId);
  const fail = () => {
    setUnknown(true);
    setInControls(false);
    setInDetail(false);
    setMessage(
      'Retention evidence UNKNOWN. Exact read-only reconciliation only; no retry, replacement, enrollment or sending.',
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
    if (!confirmed || attempted || unknown || !validHint) return;
    try {
      const days = Temporal.PlainDate.from(from, { overflow: 'reject' }).until(
        Temporal.PlainDate.from(through, { overflow: 'reject' }),
      ).days;
      if (days < 0 || days > 93) throw Error('Bounded date range required');
    } catch {
      setMessage('Choose valid review dates in order, at most 93 days apart.');
      return;
    }
    setAttempted(true);
    await run(async () => {
      const input: FollowUpReadinessInput = {
        window: { from, through, as_of: from + 'T12:00:00.000Z', channel },
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
      const result = await readRetentionReviewGuide(
        sources,
        input,
        gate.current,
      );
      if (live.current) {
        setView(result);
        setFilter({
          query: '',
          kind: 'all',
          channel_state: 'all',
          from: result.window.from,
          through: result.window.through,
        });
        setMessage(
          'Captured occurrence counts are access-limited. Historical contact evidence never establishes current sending permission.',
        );
      }
    });
  }
  async function inspect(key: string) {
    if (!current || unknown || controlsJob) return;
    const exact = current;
    await run(async () => {
      const result = await inspectRetentionReviewItem(exact, key);
      if (live.current) {
        setDetail(result);
        setInDetail(true);
        setMessage(
          'Exact occurrence, plan revision and separate consent gaps retained.',
        );
      }
    });
  }
  async function returnToGuide() {
    if (!currentDetail || unknown) return;
    const exact = currentDetail;
    await run(async () => {
      await returnRetentionReviewGuide(exact);
      if (live.current) {
        setInDetail(false);
        setInControls(false);
        setMessage(
          'Returned to the same captured queue, filters and inspected occurrence. No replay or consent change.',
        );
      }
    });
  }
  async function originalControls() {
    if (!currentDetail || unknown) return;
    const exact = currentDetail;
    await run(async () => {
      const jobId = await openRetentionReviewControls(exact);
      if (live.current) {
        setControlsJob(jobId);
        setInControls(true);
        setMessage(
          'Same job passed to original controls. Purpose, channel, window and occurrence require their own explicit original selections.',
        );
      }
    });
  }
  return (
    <section
      className="retention-review-guide"
      aria-label="Retention review guide"
      aria-busy={busy}
    >
      <header>
        <p className="rrg-eyebrow">GROWTH · RETENTION EVIDENCE</p>
        <h2>Retention review guide</h2>
        <p>
          Upcoming maintenance → exact occurrence → historical contact and
          missing requirements → original planning review.
        </p>
      </header>
      <p className="rrg-boundary">
        Requested purpose is review context, never consent. Current channel
        authority UNKNOWN; suppression, enrollment and renewal terms unverified.
        No sender, recipient, outbound worker or financial action.
      </p>
      {!attempted && (
        <div className="rrg-card">
          <div className="rrg-grid">
            <label>
              Retention guide job
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
              Retention requested purpose
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
              Retention evidence channel
              <select
                value={channel}
                disabled={busy}
                onChange={(e) => setChannel(e.target.value as typeof channel)}
              >
                <option value="email">Email evidence</option>
                <option value="sms">SMS evidence</option>
              </select>
            </label>
            <label>
              Retention window from
              <input
                type="date"
                value={from}
                disabled={busy}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Retention window through
              <input
                type="date"
                value={through}
                disabled={busy}
                onChange={(e) => setThrough(e.target.value)}
              />
            </label>
          </div>
          {!validHint && (
            <p>No exact authorized job selected. No fallback selection.</p>
          )}
          <label className="rrg-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => {
                gate.current.confirmed = e.target.checked;
                setConfirmed(e.target.checked);
              }}
            />
            I confirm this is a retention source review, with no permission to
            send.
          </label>
          <button
            disabled={!confirmed || busy || !validHint}
            onClick={() => void load()}
          >
            Inspect retention planning sources
          </button>
        </div>
      )}
      <p role={unknown || (view && !current) ? 'alert' : 'status'}>
        {busy
          ? 'Checking exact retention and contact evidence…'
          : view && !current
            ? 'Exact source changed. Previous detail withheld; reconcile read only.'
            : message}
      </p>
      {view && (
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await reconcileRetentionReviewGuide(view);
              if (live.current) {
                if (result.status === 'UNKNOWN') fail();
                else
                  setMessage(
                    'Exact read-only status: CAPTURED_NOT_ATOMIC. Send authority BLOCKED.',
                  );
              }
            })
          }
        >
          Reconcile retention evidence read only
        </button>
      )}
      {current && !unknown && (
        <>
          <h3 tabIndex={-1} ref={heading}>
            {inControls
              ? 'Original retention planning controls'
              : inDetail
                ? 'Exact retention occurrence review'
                : 'Captured maintenance and renewal queue'}
          </h3>
          <p>
            Captured {current.window.from}–{current.window.through} ·{' '}
            {current.requested_purpose} · {current.window.channel}. Available
            records only; complete history UNKNOWN. Send authority BLOCKED.
          </p>
          <div hidden={inControls || inDetail}>
            <div className="rrg-card">
              <div className="rrg-grid">
                <label>
                  Search captured retention evidence
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
                  Retention occurrence kind
                  <select
                    value={filter.kind}
                    onChange={(e) =>
                      setFilter({
                        ...filter,
                        kind: e.target.value as typeof filter.kind,
                      })
                    }
                  >
                    <option value="all">All recorded kinds</option>
                    <option value="inspection_occurrence">
                      Plan occurrence
                    </option>
                    <option value="staff_follow_up">Staff follow-up</option>
                  </select>
                </label>
                <label>
                  Historical channel evidence
                  <select
                    value={filter.channel_state}
                    onChange={(e) =>
                      setFilter({
                        ...filter,
                        channel_state: e.target
                          .value as typeof filter.channel_state,
                      })
                    }
                  >
                    <option value="all">All historical evidence</option>
                    <option value="RECORDED_ALLOWED">Recorded allowed</option>
                    <option value="RECORDED_DENIED">Recorded denied</option>
                    <option value="UNKNOWN">Unknown</option>
                  </select>
                </label>
                <label>
                  Filter retention from
                  <input
                    type="date"
                    value={filter.from}
                    min={current.window.from}
                    max={current.window.through}
                    onChange={(e) =>
                      setFilter({ ...filter, from: e.target.value })
                    }
                  />
                </label>
                <label>
                  Filter retention through
                  <input
                    type="date"
                    value={filter.through}
                    min={current.window.from}
                    max={current.window.through}
                    onChange={(e) =>
                      setFilter({ ...filter, through: e.target.value })
                    }
                  />
                </label>
              </div>
              <button
                onClick={() =>
                  setFilter({
                    query: '',
                    kind: 'all',
                    channel_state: 'all',
                    from: current.window.from,
                    through: current.window.through,
                  })
                }
              >
                Reset captured retention filters
              </button>
              {filterError ? (
                <p role="alert">{filterError}</p>
              ) : (
                <p role="status">
                  {matching?.matching ?? 0} matching of{' '}
                  {matching?.captured ?? 0} captured occurrences. Counts are
                  access-limited, never complete coverage.
                </p>
              )}
            </div>
            {matching?.rows.length ? (
              <div className="rrg-grid">
                {matching.rows.map((r) => (
                  <article className="rrg-card" key={r.key}>
                    <h4>{r.context.property_label}</h4>
                    <p>
                      {r.context.customer_label} · {r.context.job_title}
                    </p>
                    <p>
                      {r.plan_name} · {r.recorded_due_on} ·{' '}
                      {r.kind.replaceAll('_', ' ')}
                    </p>
                    <p>
                      Staff planning: {r.planning_status.replaceAll('_', ' ')}.
                      Historical channel: {r.historical_channel_state}. Current
                      authority UNKNOWN.
                    </p>
                    <button
                      disabled={busy || Boolean(controlsJob)}
                      onClick={() => void inspect(r.key)}
                    >
                      Inspect retention occurrence {r.recorded_due_on}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              !filterError && (
                <p>
                  No matching captured retention occurrences. Clear filters to
                  review available records; no missing work or consent is
                  inferred.
                </p>
              )
            )}
            {currentDetail && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await returnRetentionReviewGuide(currentDetail);
                    if (live.current) {
                      setInDetail(true);
                      setInControls(false);
                    }
                  })
                }
              >
                Resume retained retention occurrence
              </button>
            )}
            {controlsJob && (
              <p>
                Original controls remain retained for job {controlsJob}. A
                different occurrence requires a separate original selection; no
                replacement or replay is enabled here.
              </p>
            )}
          </div>
          {currentDetail && (
            <div hidden={!inDetail || inControls}>
              <article className="rrg-card">
                <h4>{currentDetail.row.plan_name}</h4>
                <dl className="rrg-grid">
                  <div>
                    <dt>Customer / property</dt>
                    <dd>
                      {currentDetail.row.context.customer_id} /{' '}
                      {currentDetail.row.context.location_id}
                    </dd>
                  </div>
                  <div>
                    <dt>Job / immutable issued baseline</dt>
                    <dd>
                      {currentDetail.row.context.job_id} /{' '}
                      {currentDetail.row.context.issued_version_id}
                    </dd>
                  </div>
                  <div>
                    <dt>Exact occurrence / due date</dt>
                    <dd>
                      {currentDetail.row.key} /{' '}
                      {currentDetail.row.recorded_due_on}
                    </dd>
                  </div>
                  <div>
                    <dt>Plan / revision</dt>
                    <dd>
                      {currentDetail.row.plan_reference.id} /{' '}
                      {currentDetail.row.plan_reference.revision}
                    </dd>
                  </div>
                  <div>
                    <dt>Requested purpose / channel</dt>
                    <dd>
                      {currentDetail.requested_purpose} /{' '}
                      {currentDetail.row.channel}
                    </dd>
                  </div>
                  <div>
                    <dt>Historical contact reference</dt>
                    <dd>
                      {currentDetail.historical_contact_reference?.id ??
                        'UNKNOWN'}{' '}
                      · {currentDetail.row.historical_channel_state}
                    </dd>
                  </div>
                </dl>
                <p>
                  Purpose consent {currentDetail.purpose_consent}; suppression{' '}
                  {currentDetail.suppression}; enrollment{' '}
                  {currentDetail.enrollment}; renewal terms UNKNOWN. Send
                  authority BLOCKED.
                </p>
                <p>
                  Captured original control status{' '}
                  {currentDetail.original_control_status}; no preparation or
                  sending occurs from inspection.
                </p>
              </article>
              <div className="rrg-actions">
                <button disabled={busy} onClick={() => void returnToGuide()}>
                  Return to retention queue
                </button>
                <button disabled={busy} onClick={() => void originalControls()}>
                  {controlsJob
                    ? 'Resume original retention planning controls'
                    : 'Open original retention planning controls'}
                </button>
                {onSelectJob && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const callback = onSelectJob,
                          generation = callbackGeneration.current;
                        await navigateRetentionReviewJob(
                          currentDetail,
                          (jobId, section) => {
                            if (
                              live.current &&
                              currentCallback.current === callback &&
                              callbackGeneration.current === generation
                            )
                              callback(jobId, section);
                          },
                        );
                      })
                    }
                  >
                    Open exact retention job review
                  </button>
                )}
              </div>
            </div>
          )}
          {controlsJob && (
            <div hidden={!inControls}>
              <p className="rrg-boundary">
                Same job only. Original controls require their own purpose,
                channel, window, occurrence and confirmations. The inspected
                guide occurrence is not an automatic handoff or sending
                authority.
              </p>
              <button disabled={busy} onClick={() => void returnToGuide()}>
                Return to retention queue
              </button>
              <MaintenanceReviewPath
                sources={sources}
                enabled
                selectedJobId={controlsJob}
                onSelectJob={
                  onSelectJob
                    ? (jobId, section?: OperatingJobSection) => {
                        if (
                          live.current &&
                          currentCallback.current === onSelectJob &&
                          currentCallbackToken.current === callbackToken
                        )
                          onSelectJob(jobId, section);
                      }
                    : undefined
                }
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
