import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { capacityDay } from '../../domain/field/crew-capacity';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  assertOperatingNavigationCurrent,
  filterOperatingNavigation,
  type OperatingNavigationReview,
  type OperatingNavigationFilter,
  type OperatingJobSection,
} from '../../lib/workflows/operating-navigation';
import {
  verifiedTaskHandoffEnabled,
  readVerifiedTaskHandoff,
  inspectVerifiedTaskHandoff,
  assertVerifiedTaskHandoffCurrent,
  navigateVerifiedTaskHandoff,
  reconcileVerifiedTaskHandoff,
  type VerifiedTaskHandoffSelection,
} from '../../lib/workflows/verified-task-handoff';
import './verified-task-handoff.css';

export function VerifiedTaskHandoff({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}) {
  let handles: unknown[] = [],
    available = false;
  if (verifiedTaskHandoffEnabled(enabled))
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      handles = [
        ...Object.values(
          prototypeFields(sources, [
            'company',
            'operations',
            'estimates',
            'property',
            'entries',
            'gate',
          ]),
        ),
        ...capture.entries.flatMap((e) => [e, e.target, e.release]),
      ];
      capture.check();
      available = true;
    } catch {
      available = false;
    }
  const [binding, bind] = useState({
    sources,
    enabled,
    selectedJobId,
    handles,
    available,
    revision: 0,
  });
  if (
    binding.sources !== sources ||
    binding.enabled !== enabled ||
    binding.selectedJobId !== selectedJobId ||
    binding.available !== available ||
    binding.handles.length !== handles.length ||
    binding.handles.some((v, i) => v !== handles[i])
  ) {
    bind({
      sources,
      enabled,
      selectedJobId,
      handles,
      available,
      revision: binding.revision + 1,
    });
    return null;
  }
  return available ? (
    <HandoffDesk
      key={binding.revision}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="verified-task-handoff"
      aria-label="Verified task handoff"
    >
      <h2>Verified task handoff</h2>
      <p>
        {enabled
          ? 'Current task source unavailable. Prior handoff is withheld.'
          : 'Verified task handoff is off. Confirm local company sources first.'}
      </p>
    </section>
  );
}
const clear: OperatingNavigationFilter = {
  query: '',
  section: 'all',
  job_id: null,
  band: 'all',
};
function HandoffDesk({
  sources,
  selectedJobId,
  onSelectJob,
}: {
  sources: OperatingSources;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}) {
  const id = useId(),
    epoch = useRef(0),
    gate = useRef({ enabled: true, confirmed: false }),
    heading = useRef<HTMLHeadingElement>(null);
  const [confirmed, confirm] = useState(false),
    [day, setDay] = useState(sources.entries[0].day),
    [timezone, setTimezone] = useState(sources.entries[0].timezone),
    [busy, setBusy] = useState(false),
    [held, setHeld] = useState(false),
    [review, setReview] = useState<OperatingNavigationReview | null>(null),
    [filter, setFilter] = useState<OperatingNavigationFilter>({
      ...clear,
      job_id: selectedJobId ?? null,
    }),
    [handoff, setHandoff] = useState<VerifiedTaskHandoffSelection | null>(null),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    const generation = epoch,
      admission = gate;
    return () => {
      generation.current++;
      admission.current.confirmed = false;
    };
  }, [sources]);
  useEffect(() => {
    if (handoff) heading.current?.focus();
  }, [handoff]);
  let current = false,
    handoffCurrent = false;
  if (review && confirmed)
    try {
      assertOperatingNavigationCurrent(review);
      current = true;
    } catch {
      current = false;
    }
  if (handoff && current)
    try {
      assertVerifiedTaskHandoffCurrent(handoff);
      handoffCurrent = true;
    } catch {
      handoffCurrent = false;
    }
  let filtered: ReturnType<typeof filterOperatingNavigation> | null = null;
  if (review && current)
    try {
      filtered = filterOperatingNavigation(review, filter);
    } catch {
      filtered = null;
    }
  async function read(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || held || busy) return;
    try {
      capacityDay(day, timezone);
    } catch {
      setError('Choose a valid day and IANA timezone.');
      return;
    }
    const token = ++epoch.current,
      admission = { enabled: true, confirmed: true };
    gate.current = admission;
    setHeld(true);
    setBusy(true);
    setError('');
    try {
      const next = await readVerifiedTaskHandoff(
        sources,
        {
          review_on: day,
          timezone,
          ordering: 'EVIDENCE_FIRST',
          input_revision: token,
        },
        admission,
      );
      if (token !== epoch.current || !admission.confirmed) return;
      assertOperatingNavigationCurrent(next);
      setReview(next);
      setStatus(
        'Original source-verified suggestions read. Inspect one exact source before handoff.',
      );
    } catch {
      if (token === epoch.current)
        setError(
          'Source read UNKNOWN. Original finite read hold remains; no replacement or replay.',
        );
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }
  async function inspect(key: string) {
    if (!review || !current || busy) return;
    const token = ++epoch.current;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const next = await inspectVerifiedTaskHandoff(review, key);
      if (token !== epoch.current) return;
      assertVerifiedTaskHandoffCurrent(next);
      setHandoff(next);
    } catch {
      if (token === epoch.current)
        setError(
          'Exact handoff UNKNOWN, expired or already inspected. No renewed expiry, alternate identity or replacement is created.',
        );
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!handoff || busy) return;
    const token = ++epoch.current;
    setBusy(true);
    const result = await reconcileVerifiedTaskHandoff(handoff);
    if (token !== epoch.current) return;
    setStatus(
      result.status === 'UNKNOWN'
        ? 'UNKNOWN — retained handoff is expired or no longer current. Read-only evidence only; no replay or replacement.'
        : 'Exact retained handoff is current inside its local review window. No business action is authorized.',
    );
    setBusy(false);
  }
  return (
    <section
      className="verified-task-handoff"
      aria-label="Verified task handoff"
    >
      <p className="handoff-eyebrow">Intelligence · {sources.company.name}</p>
      <h2>Verified task handoff</h2>
      <p>
        Retain one inspected suggestion and its exact local destination for a
        bounded review window. The original ranking, recommendation and blocked
        action authority remain unchanged.
      </p>
      <form onSubmit={(e) => void read(e)}>
        <fieldset disabled={busy || held}>
          <legend>Original daily source review</legend>
          <div className="handoff-controls">
            <label htmlFor={`${id}-day`}>
              Review day
              <input
                id={`${id}-day`}
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            <label htmlFor={`${id}-zone`}>
              Review timezone
              <input
                id={`${id}-zone`}
                value={timezone}
                maxLength={100}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </label>
          </div>
        </fieldset>
        <label className="handoff-confirm" htmlFor={`${id}-confirm`}>
          <input
            id={`${id}-confirm`}
            type="checkbox"
            checked={confirmed}
            onChange={(e) => {
              epoch.current++;
              gate.current.confirmed = false;
              confirm(e.target.checked);
              setBusy(false);
            }}
          />
          I confirm the current local company, sources and review day.
        </label>
        <button type="submit" disabled={!confirmed || busy || held}>
          Read verified task sources
        </button>
      </form>
      {busy && <p role="status">Checking original exact task source…</p>}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {review && !current && (
        <p role="alert">
          UNKNOWN — current source or access changed. Prior suggestions and
          handoff navigation are withheld.
        </p>
      )}
      {review && current && (
        <>
          <div className="handoff-controls">
            <label htmlFor={`${id}-search`}>
              Search verified handoff sources
              <input
                id={`${id}-search`}
                value={filter.query}
                maxLength={200}
                onChange={(e) =>
                  setFilter({ ...filter, query: e.target.value })
                }
              />
            </label>
            <label htmlFor={`${id}-section`}>
              Existing review section
              <select
                id={`${id}-section`}
                value={filter.section}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    section: e.target
                      .value as OperatingNavigationFilter['section'],
                  })
                }
              >
                <option value="all">All source sections</option>
                {(['sales', 'field', 'finance', 'completion'] as const).map(
                  (section) => (
                    <option key={section} value={section}>
                      {section === 'completion'
                        ? 'published documentation'
                        : section}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label htmlFor={`${id}-job`}>
              Exact handoff job
              <select
                id={`${id}-job`}
                value={filter.job_id ?? ''}
                onChange={(e) =>
                  setFilter({ ...filter, job_id: e.target.value || null })
                }
              >
                <option value="">All admitted jobs</option>
                {review.jobs.map((job) => (
                  <option key={job.target.job_id} value={job.target.job_id!}>
                    {job.context.job_title} · {job.target.job_id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p role="status">
            {filtered
              ? `${filtered.matching} matching of ${filtered.available} original suggestions`
              : 'Exact filter UNKNOWN. Choose an admitted job; no alternate source is selected.'}
          </p>
          <ul className="handoff-list">
            {filtered?.tasks.map((task) => (
              <li key={task.key}>
                <strong>
                  Original rank {task.rank} · {task.context.job}
                </strong>
                <p>Recorded fact: {task.recorded_fact}</p>
                <p>Recommended manual review: {task.suggested_human_review}</p>
                <p>
                  {task.source.kind} {task.source.id} · destination{' '}
                  {task.navigation.section ?? 'UNKNOWN'}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Inspect task handoff source: ${task.source.kind} for ${task.job_id}`}
                  onClick={() => void inspect(task.key)}
                >
                  Inspect task handoff source
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {handoff && (
        <div className="handoff-card">
          <h3 ref={heading} tabIndex={-1}>
            Retained exact task identity
          </h3>
          <dl>
            <dt>Selected suggestion key</dt>
            <dd>{handoff.selected.key}</dd>
            <dt>Exact job / issued version</dt>
            <dd>
              {handoff.selected.job_id} / {handoff.selected.issued_version_id}
            </dd>
            <dt>Source kind / ID / version / revision</dt>
            <dd>
              {handoff.selected.source_kind} / {handoff.selected.source_id} /{' '}
              {handoff.selected.source_version ?? 'Not versioned'} /{' '}
              {handoff.selected.source_revision ?? 'Not revisioned'}
            </dd>
            <dt>Retained local destination</dt>
            <dd>
              {handoff.selected.section ?? 'UNKNOWN'}{' '}
              {handoff.selected.section === 'completion'
                ? '(documentation only)'
                : ''}
            </dd>
            <dt>Inspected / expires</dt>
            <dd>
              {handoff.inspected_at} / {handoff.expires_at}
            </dd>
          </dl>
          <p>
            Local review window only. Currentness is checked on interaction and
            render; expiry cannot be renewed by another view or note. Genuine
            authentication, durable custody and all business authority remain
            unverified.
          </p>
          {!handoffCurrent ? (
            <p role="alert">
              UNKNOWN — expired, withdrawn or stale. Selected identity remains
              visible for read-only reference; original facts and task
              navigation are withheld.
            </p>
          ) : (
            <>
              <h4>Original recorded workflow facts</h4>
              <dl>
                {handoff.task.verification.facts.map((fact) => (
                  <div key={fact.code}>
                    <dt>
                      {fact.label} · {fact.status}
                    </dt>
                    <dd>{fact.value ?? 'UNKNOWN'}</dd>
                  </div>
                ))}
              </dl>
              <h4>Missing evidence and blocked actions</h4>
              <ul>
                {handoff.task.verification.gaps.map((gap) => (
                  <li key={gap.code}>
                    <strong>
                      {gap.code} · {gap.status}
                    </strong>
                    <p>{gap.detail}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="handoff-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => void reconcile()}
            >
              Recheck retained task handoff
            </button>
            <button
              type="button"
              disabled={
                busy ||
                !handoffCurrent ||
                !onSelectJob ||
                handoff.task.navigation.status !== 'EXACT_LOCAL_REVIEW_TARGET'
              }
              onClick={() => {
                if (onSelectJob) {
                  const result = navigateVerifiedTaskHandoff(
                    handoff,
                    onSelectJob,
                  );
                  setStatus(
                    result.status === 'UNKNOWN'
                      ? 'UNKNOWN — exact task handoff withheld.'
                      : 'Exact existing local task review requested; no business action executed.',
                  );
                }
              }}
            >
              Open retained task review
            </button>
          </div>
        </div>
      )}
      <p className="handoff-muted">
        Same-tab synthetic staff review only. No AI/provider, message, dispatch,
        financial/hosted mutation or automatic background action. Release1.0 NOT
        READY / NOT AUTHORIZED.
      </p>
    </section>
  );
}
