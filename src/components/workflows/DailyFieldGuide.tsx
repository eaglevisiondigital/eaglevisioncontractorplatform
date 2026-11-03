import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import type { OperatingJobSection } from '../../lib/workflows/operating-navigation';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  readDailyFieldGuide,
  assertDailyFieldGuideNow,
  inspectDailyFieldStep,
  inspectDailyFieldReport,
  reconcileDailyFieldGuide,
  openDailyFieldControls,
  navigateDailyFieldJob,
  type DailyFieldGuideView,
  type DailyFieldStep,
} from '../../lib/workflows/daily-field-guide';
import { FieldTaskContinuity } from './FieldTaskContinuity';
import './daily-field-guide.css';

export interface DailyFieldGuideProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}
export function DailyFieldGuide(props: DailyFieldGuideProps) {
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
      /* Withhold previous company/task data. */
    }
  const [binding, setBinding] = useState({
    sources,
    selectedJobId,
    admitted,
    check,
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
    binding.selectedJobId !== selectedJobId ||
    binding.admitted !== admitted ||
    Boolean(binding.check) !== Boolean(check) ||
    changed
  ) {
    setBinding({
      sources,
      selectedJobId,
      admitted,
      check,
      epoch: binding.epoch + 1,
    });
    return null;
  }
  return admitted && check ? (
    <Guide key={binding.epoch} {...props} />
  ) : (
    <section className="daily-field-guide" aria-label="Daily field guide">
      <h2>Daily field guide</h2>
      <p>
        {admitted
          ? 'Current authorized daily sources unavailable. Previous details withheld.'
          : 'Daily field guide is off. No task, dispatch or completion transition enabled.'}
      </p>
    </section>
  );
}
function Guide({ sources, selectedJobId, onSelectJob }: DailyFieldGuideProps) {
  const [job, setJob] = useState(selectedJobId ?? ''),
    [worker, setWorker] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [attempted, setAttempted] = useState(false),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [view, setView] = useState<DailyFieldGuideView | null>(null),
    [step, setStep] = useState<Awaited<
      ReturnType<typeof inspectDailyFieldStep>
    > | null>(null),
    [report, setReport] = useState<Awaited<
      ReturnType<typeof inspectDailyFieldReport>
    > | null>(null),
    [controlsMounted, setControlsMounted] = useState(false),
    [inControls, setInControls] = useState(false),
    [message, setMessage] = useState(
      'Choose an exact recorded job and inspect its daily evidence.',
    );
  const gate = useRef({ enabled: true, confirmed: false }),
    live = useRef(true),
    currentCallback = useRef(onSelectJob),
    pending = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    currentCallback.current = onSelectJob;
    return () => {
      currentCallback.current = undefined;
    };
  }, [onSelectJob]);
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
  }, [view, step, report, inControls]);
  const entry = sources.entries.find((e) => e.target.job_id === job);
  let current = view;
  if (current)
    try {
      assertDailyFieldGuideNow(current);
    } catch {
      current = null;
    }
  const fail = () => {
    setUnknown(true);
    setInControls(false);
    setMessage(
      'Daily field evidence UNKNOWN. Original holds remain; exact read-only reconciliation only. No retry, replacement or completion inference.',
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
    if (!entry || !confirmed || attempted || unknown) return;
    setAttempted(true);
    await run(async () => {
      const result = await readDailyFieldGuide(
        sources,
        { job_id: job, worker_id: worker },
        gate.current,
      );
      if (live.current) {
        setView(result);
        setMessage(
          'Recorded sources loaded. Review steps describe evidence, never operational task progress.',
        );
      }
    });
  }
  async function inspect(key: DailyFieldStep) {
    if (!current || unknown) return;
    const exact = current;
    await run(async () => {
      const result = await inspectDailyFieldStep(exact, key);
      if (live.current) {
        setStep(result);
        setReport(null);
        setMessage(
          'Inspected this exact evidence step; no work status changed.',
        );
      }
    });
  }
  async function originalControls() {
    if (!current || unknown) return;
    const exact = current;
    await run(async () => {
      await openDailyFieldControls(exact);
      if (live.current) {
        setControlsMounted(true);
        setInControls(true);
        setMessage(
          'Original proposal controls retain their own confirmations, revisions and UNKNOWN holds.',
        );
      }
    });
  }
  async function back() {
    if (!current || unknown) return;
    const exact = current;
    await run(async () => {
      await openDailyFieldControls(exact);
      if (live.current) {
        setInControls(false);
        setMessage(
          'Returned to the same daily evidence. Original controls stay mounted without replay.',
        );
      }
    });
  }
  return (
    <section
      className="daily-field-guide"
      aria-label="Daily field guide"
      aria-busy={busy}
    >
      <header>
        <p className="dfg-eyebrow">FIELD · DAILY EVIDENCE</p>
        <h2>Daily field guide</h2>
        <p>
          Issued scope → recorded crew → daily visits → exact documentation →
          original task review.
        </p>
      </header>
      <p className="dfg-boundary">
        Review states describe available records only. Availability UNKNOWN;
        physical completion UNVERIFIED. No dispatch, assignment, time recording
        or task completion is enabled.
      </p>
      {!view && !attempted && (
        <div className="dfg-card">
          <div className="dfg-grid">
            <label>
              Daily guide job
              <select
                value={job}
                disabled={busy || Boolean(selectedJobId)}
                onChange={(e) => {
                  setJob(e.target.value);
                  setWorker('');
                }}
              >
                <option value="">Choose an exact recorded job</option>
                {sources.entries.map((e) => (
                  <option key={e.target.job_id} value={e.target.job_id!}>
                    Job {e.target.job_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Daily guide technician
              <select
                value={worker}
                disabled={busy || !entry}
                onChange={(e) => setWorker(e.target.value)}
              >
                <option value="">All recorded crew for this job</option>
                {entry && (
                  <option value={entry.worker_id}>
                    Recorded technician {entry.worker_id}
                  </option>
                )}
              </select>
            </label>
          </div>
          {!entry && (
            <p>No exact authorized job selected. No fallback selection.</p>
          )}
          <label className="dfg-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => {
                gate.current.confirmed = e.target.checked;
                setConfirmed(e.target.checked);
              }}
            />
            I confirm this is a read-only daily field source review.
          </label>
          <button
            disabled={!entry || !confirmed || busy}
            onClick={() => void load()}
          >
            Inspect daily field sources
          </button>
        </div>
      )}
      <p role={unknown || (view && !current) ? 'alert' : 'status'}>
        {busy
          ? 'Checking exact daily field evidence…'
          : view && !current
            ? 'Exact source changed. Previous detail withheld; reconcile read only.'
            : message}
      </p>
      {view && (
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await reconcileDailyFieldGuide(view);
              if (live.current) {
                if (result.status === 'UNKNOWN') fail();
                else
                  setMessage(
                    'Exact read-only status: CURRENT_REVIEW_ONLY. No task or proposal replay.',
                  );
              }
            })
          }
        >
          Reconcile daily field evidence read only
        </button>
      )}
      {current && !unknown && (
        <>
          <h3 tabIndex={-1} ref={heading}>
            {inControls
              ? 'Original daily task controls'
              : report
                ? 'Exact daily published report'
                : step
                  ? step.step.label
                  : 'Recorded daily work-order evidence'}
          </h3>
          <div className="dfg-card">
            <h4>{current.job.title}</h4>
            <p>
              {current.job.customer_label} · {current.job.property_label}
            </p>
            <dl className="dfg-grid">
              <div>
                <dt>Job / issued baseline</dt>
                <dd>
                  {current.source.job_id} / {current.source.issued_version_id} ·
                  version {current.source.issued_version_number}
                </dd>
              </div>
              <div>
                <dt>Recorded day / timezone</dt>
                <dd>
                  {current.day} / {current.timezone}
                </dd>
              </div>
              <div>
                <dt>Customer / property</dt>
                <dd>
                  {current.source.customer_id} / {current.source.location_id}
                </dd>
              </div>
              <div>
                <dt>Evidence integrity</dt>
                <dd>{current.integrity.sha256}</dd>
              </div>
            </dl>
          </div>
          <div hidden={inControls}>
            <ol className="dfg-steps">
              {current.steps.map((s) => (
                <li key={s.key}>
                  <strong>{s.label}</strong>
                  <span className="dfg-state">
                    {s.status.replaceAll('_', ' ')}
                  </span>
                  <p>{s.reason}</p>
                  <button disabled={busy} onClick={() => void inspect(s.key)}>
                    {s.label}
                  </button>
                </li>
              ))}
            </ol>
            {step && (
              <article
                className="dfg-card"
                aria-label="Inspected daily evidence"
              >
                <h4>{step.step.label}</h4>
                <p>
                  Local evidence inspection only · physical completion
                  UNVERIFIED
                </p>
                {step.scope.map((line) => (
                  <p key={line.id}>
                    {line.description} · quantity {line.quantity_milli / 1000}{' '}
                    {line.unit} · line {line.id}
                  </p>
                ))}
                {step.crew.map((member) => (
                  <p key={member.worker_id}>
                    {member.label} · technician {member.worker_id} ·
                    availability UNKNOWN
                  </p>
                ))}
                {step.visits.map((visit) => (
                  <p key={visit.visit_id}>
                    Recorded {visit.recorded_status} · {visit.day} · visit{' '}
                    {visit.visit_id} revision {visit.revision} · plan{' '}
                    {visit.plan_id} revision {visit.plan_revision}
                  </p>
                ))}
                {step.reports.map((r) => (
                  <p key={r.report_id + ':' + r.published_version}>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await inspectDailyFieldReport(
                            current,
                            r,
                          );
                          if (live.current) {
                            setReport(result);
                            setMessage(
                              'Exact immutable published report/version retained. Documentation does not verify repair.',
                            );
                          }
                        })
                      }
                    >
                      Open daily source report {r.report_id} version{' '}
                      {r.published_version}
                    </button>
                  </p>
                ))}
                {step.step.status === 'MISSING_EVIDENCE' && (
                  <p>
                    No available exact records for this step. History coverage
                    and completion remain UNKNOWN.
                  </p>
                )}
              </article>
            )}
            {report && (
              <article className="dfg-card" aria-label="Original daily report">
                <h4>
                  Published report {report.report.report_id} · version{' '}
                  {report.report.published_version}
                </h4>
                <p>
                  Visit {report.report.visit_id} · job {report.handoff.job_id}
                </p>
                <p>{report.report.snapshot.summary}</p>
                <p>
                  Physical completion UNVERIFIED; available documentation only.
                </p>
              </article>
            )}
            <div className="dfg-actions">
              <button disabled={busy} onClick={() => void originalControls()}>
                {controlsMounted
                  ? 'Resume original field task controls'
                  : 'Open original field task controls'}
              </button>
              {onSelectJob && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const callback = onSelectJob;
                      await navigateDailyFieldJob(current, (jobId, section) => {
                        if (
                          live.current &&
                          currentCallback.current === callback
                        )
                          callback(jobId, section);
                      });
                    })
                  }
                >
                  Open exact daily job review
                </button>
              )}
            </div>
          </div>
          {controlsMounted && (
            <div hidden={!inControls}>
              <button disabled={busy} onClick={() => void back()}>
                Return to daily field guide
              </button>
              <FieldTaskContinuity
                sources={sources}
                enabled
                selectedJobId={current.source.job_id}
                onSelectJob={
                  onSelectJob
                    ? (jobId, section?: OperatingJobSection) => {
                        if (
                          live.current &&
                          currentCallback.current === onSelectJob
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
