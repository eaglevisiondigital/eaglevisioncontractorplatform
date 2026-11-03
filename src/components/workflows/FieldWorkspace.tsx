import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import type { OperatingJobSection } from '../../lib/workflows/operating-navigation';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  readFieldWorkspace,
  assertFieldWorkspaceNow,
  openFieldWorkspaceSection,
  openFieldWorkspaceReport,
  reconcileFieldWorkspace,
  navigateFieldWorkspace,
  type FieldWorkspaceView,
  type FieldWorkspaceSection,
} from '../../lib/workflows/field-workspace';
import { FieldTaskContinuity } from './FieldTaskContinuity';
import './field-workspace.css';

export interface FieldWorkspaceProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}
export function FieldWorkspace(props: FieldWorkspaceProps) {
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
      /* Prior context is withheld. */
    }
  const [binding, setBinding] = useState({
    sources,
    admitted,
    selectedJobId,
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
    binding.admitted !== admitted ||
    binding.selectedJobId !== selectedJobId ||
    Boolean(binding.check) !== Boolean(check) ||
    changed
  ) {
    setBinding({
      sources,
      admitted,
      selectedJobId,
      check,
      epoch: binding.epoch + 1,
    });
    return null;
  }
  return admitted && check ? (
    <Workspace key={binding.epoch} {...props} />
  ) : (
    <section className="field-workspace" aria-label="Field workspace">
      <h2>Field workspace</h2>
      <p>
        {admitted
          ? 'Current authorized field sources unavailable. Previous context withheld.'
          : 'Field workspace is off. No dispatch, task state or completion authority.'}
      </p>
    </section>
  );
}
function Workspace({
  sources,
  selectedJobId,
  onSelectJob,
}: FieldWorkspaceProps) {
  const [job, setJob] = useState(selectedJobId ?? ''),
    [confirmed, setConfirmed] = useState(false),
    [attempted, setAttempted] = useState(false),
    [view, setView] = useState<FieldWorkspaceView | null>(null),
    [section, setSection] = useState<FieldWorkspaceSection>('controls'),
    [report, setReport] = useState<Awaited<
      ReturnType<typeof openFieldWorkspaceReport>
    > | null>(null),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [message, setMessage] = useState(
      'Open one exact job; original task controls and source context stay together.',
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
  }, [view, section, report]);
  const entry = sources.entries.find((e) => e.target.job_id === job);
  let current = view;
  if (current)
    try {
      assertFieldWorkspaceNow(current);
    } catch {
      current = null;
    }
  const fail = () => {
    setUnknown(true);
    setMessage(
      'Field workspace UNKNOWN. Original holds remain; exact read-only reconciliation only, no replacement or replay.',
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
      const result = await readFieldWorkspace(
        sources,
        { job_id: job, worker_id: '' },
        gate.current,
      );
      if (live.current) {
        setView(result);
        setMessage(
          'Exact context retained. Original task controls require their own explicit confirmations.',
        );
      }
    });
  }
  async function changeSection(next: FieldWorkspaceSection) {
    if (!current || unknown) return;
    const exact = current;
    await run(async () => {
      await openFieldWorkspaceSection(exact, next);
      if (live.current) {
        setSection(next);
        setReport(null);
        setMessage(
          'Same exact job, source versions and original control instance retained.',
        );
      }
    });
  }
  return (
    <section
      className="field-workspace"
      aria-label="Field workspace"
      aria-busy={busy}
    >
      <header>
        <p className="fw-eyebrow">FIELD · RETAINED WORKSPACE</p>
        <h2>Field workspace</h2>
        <p>Exact context and original work-order controls in one place.</p>
      </header>
      <p className="fw-boundary">
        Local synthetic review only. Recorded assignment and inspection status
        do not prove availability, time worked or physical completion. No
        dispatch or operational writer is connected.
      </p>
      {!attempted && (
        <div className="fw-card">
          <label>
            Field workspace job
            <select
              value={job}
              disabled={busy || Boolean(selectedJobId)}
              onChange={(e) => setJob(e.target.value)}
            >
              <option value="">Choose an exact recorded job</option>
              {sources.entries.map((e) => (
                <option key={e.target.job_id} value={e.target.job_id!}>
                  Job {e.target.job_id}
                </option>
              ))}
            </select>
          </label>
          {!entry && (
            <p>No exact authorized job selected. No fallback selection.</p>
          )}
          <label className="fw-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => {
                gate.current.confirmed = e.target.checked;
                setConfirmed(e.target.checked);
              }}
            />
            I confirm this is a local field source review.
          </label>
          <button
            disabled={!entry || !confirmed || busy}
            onClick={() => void load()}
          >
            Open retained field workspace
          </button>
        </div>
      )}
      <p role={unknown || (view && !current) ? 'alert' : 'status'}>
        {busy
          ? 'Checking exact field workspace sources…'
          : view && !current
            ? 'Exact field context changed. Details withheld; reconcile read only.'
            : message}
      </p>
      {view && (
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await reconcileFieldWorkspace(view);
              if (live.current) {
                if (result.status === 'UNKNOWN') fail();
                else
                  setMessage(
                    'Exact read-only status CURRENT_REVIEW_ONLY. No original action replay.',
                  );
              }
            })
          }
        >
          Reconcile field workspace read only
        </button>
      )}
      {current && !unknown && (
        <>
          <nav aria-label="Exact field record context">
            <ol className="fw-breadcrumbs">
              {current.breadcrumbs.map((crumb) => (
                <li key={crumb.kind}>
                  <span>{crumb.kind.replaceAll('_', ' ')}</span>
                  <strong>{crumb.label}</strong>
                  <small>{crumb.id}</small>
                </li>
              ))}
            </ol>
          </nav>
          <div className="fw-toolbar" aria-label="Field workspace views">
            <button
              aria-pressed={section === 'controls'}
              disabled={busy}
              onClick={() => void changeSection('controls')}
            >
              Work-order controls
            </button>
            <button
              aria-pressed={section === 'sources'}
              disabled={busy}
              onClick={() => void changeSection('sources')}
            >
              Field source evidence
            </button>
            <button
              aria-pressed={section === 'readiness'}
              disabled={busy}
              onClick={() => void changeSection('readiness')}
            >
              Operational readiness gaps
            </button>
            {onSelectJob && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const selected = onSelectJob,
                      epoch = generation.current;
                    await navigateFieldWorkspace(
                      current,
                      (jobId, destination) => {
                        if (
                          live.current &&
                          callback.current === selected &&
                          generation.current === epoch
                        )
                          selected(jobId, destination);
                      },
                    );
                  })
                }
              >
                Open exact field job
              </button>
            )}
          </div>
          <h3 tabIndex={-1} ref={heading}>
            {section === 'controls'
              ? 'Retained work-order controls'
              : section === 'sources'
                ? 'Exact field source evidence'
                : 'Field operational readiness requirements'}
          </h3>
          <p>
            {current.day} · {current.timezone} · job revision{' '}
            {current.source.job_revision} · operational ready: false.
          </p>
          <div hidden={section !== 'controls'}>
            <FieldTaskContinuity
              sources={sources}
              enabled
              selectedJobId={current.source.job_id}
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
            <div className="fw-grid">
              <article className="fw-card">
                <h4>Immutable issued work scope</h4>
                {current.scope.map((line) => (
                  <p key={line.id}>
                    {line.description} · {line.quantity_milli / 1000}{' '}
                    {line.unit} · line {line.id}
                  </p>
                ))}
              </article>
              <article className="fw-card">
                <h4>Recorded crew and visit evidence</h4>
                {current.crew.map((worker) => (
                  <p key={worker.worker_id}>
                    {worker.label} · technician {worker.worker_id} · actual
                    availability UNKNOWN
                  </p>
                ))}
                {current.visits.map((visit) => (
                  <p key={visit.visit_id}>
                    {visit.recorded_status} record · {visit.day} · visit{' '}
                    {visit.visit_id} revision {visit.revision} · plan{' '}
                    {visit.plan_id} revision {visit.plan_revision}
                  </p>
                ))}
              </article>
            </div>
            <article className="fw-card">
              <h4>Available published source versions</h4>
              {current.reports.length ? (
                current.reports.map((r) => (
                  <p key={r.report_id + ':' + r.published_version}>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await openFieldWorkspaceReport(
                            current,
                            r.report_id,
                            r.published_version,
                          );
                          if (live.current) {
                            setReport(result);
                            setMessage(
                              'Exact original published report/version; documentation never verifies physical completion.',
                            );
                          }
                        })
                      }
                    >
                      Inspect field report {r.report_id} version{' '}
                      {r.published_version}
                    </button>
                  </p>
                ))
              ) : (
                <p>No available exact job-linked reports. Coverage UNKNOWN.</p>
              )}
              {report && (
                <div aria-label="Exact field published report">
                  <h4>
                    Published report {report.report.report_id} · version{' '}
                    {report.report.published_version}
                  </h4>
                  <p>{report.report.snapshot.summary}</p>
                  <p>
                    Visit {report.report.visit_id} · job {report.handoff.job_id}
                    . Physical completion UNVERIFIED.
                  </p>
                </div>
              )}
            </article>
            <button
              disabled={busy}
              onClick={() => void changeSection('controls')}
            >
              Return to retained work-order controls
            </button>
          </div>
          <div hidden={section !== 'readiness'}>
            <div className="fw-grid">
              {current.requirements.map((r) => (
                <article className="fw-card" key={r.key}>
                  <h4>{r.key.replaceAll('_', ' ')}</h4>
                  <p>
                    <strong>{r.status}</strong>
                  </p>
                  <p>{r.detail}</p>
                </article>
              ))}
            </div>
            <p>
              Same-tab references and local test evidence do not satisfy
              hosted/recovery/Auth/MFA/NMI/P1/customer14/4B or production
              acceptance.
            </p>
            <button
              disabled={busy}
              onClick={() => void changeSection('controls')}
            >
              Return to retained work-order controls
            </button>
          </div>
        </>
      )}
    </section>
  );
}
