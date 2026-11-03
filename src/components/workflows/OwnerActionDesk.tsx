import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { prototypeFields } from '../../lib/program/prototype-source';
import { capacityDay } from '../../domain/field/crew-capacity';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import type { OperatingJobSection } from '../../lib/workflows/operating-navigation';
import {
  ownerActionDeskEnabled,
  readOwnerActionDesk,
  assertOwnerActionDeskReviewCurrent,
  filterOwnerActionDesk,
  openOwnerActionDeskTask,
  assertOwnerActionDeskTaskCurrent,
  returnOwnerActionDeskTask,
  navigateOwnerActionDeskTask,
  type OwnerActionDeskReview,
  type OwnerActionDeskFilter,
  type OwnerActionDeskTask,
} from '../../lib/workflows/owner-action-desk';
import './owner-action-desk.css';

type Props = {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
};
export function OwnerActionDesk({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: Props) {
  let available = false,
    handles: unknown[] = [];
  if (ownerActionDeskEnabled(enabled))
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      if (
        selectedJobId !== undefined &&
        !capture.entries.some((e) => e.target.job_id === selectedJobId)
      )
        throw Error('Unadmitted job hint');
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
    available,
    handles,
    generation: 0,
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
      available,
      handles,
      generation: binding.generation + 1,
    });
    return null;
  }
  return available ? (
    <Desk
      key={binding.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section className="owner-action-desk" aria-label="Owner action desk">
      <h2>Owner action desk</h2>
      <p>
        {enabled
          ? 'Exact company/job source unavailable. Prior suggestions are withheld.'
          : 'Owner action desk is off. Confirm local sources first.'}
      </p>
    </section>
  );
}
function Desk({ sources, selectedJobId, onSelectJob }: Props) {
  const id = useId(),
    epoch = useRef(0),
    admission = useRef({ enabled: true, confirmed: false }),
    held = useRef(false),
    pending = useRef(false),
    callback = useRef({ fn: onSelectJob, generation: 0 }),
    heading = useRef<HTMLHeadingElement>(null),
    attempted = useRef(new Set<string>()),
    opened = useRef(
      new Map<
        string,
        {
          task: OwnerActionDeskTask;
          lease: { fn: Props['onSelectJob']; generation: number };
        }
      >(),
    );
  const [confirmed, confirm] = useState(false),
    [readHeld, setReadHeld] = useState(false),
    [day, setDay] = useState(sources.entries[0].day),
    [timezone, setTimezone] = useState(sources.entries[0].timezone),
    [ordering, setOrdering] = useState<'EVIDENCE_FIRST' | 'RECORDED_DAY_FIRST'>(
      'EVIDENCE_FIRST',
    ),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<OwnerActionDeskReview | null>(null),
    [task, setTask] = useState<OwnerActionDeskTask | null>(null),
    [lease, setLease] = useState<{
      fn: Props['onSelectJob'];
      generation: number;
    } | null>(null),
    [showTask, setShowTask] = useState(false),
    [filter, setFilter] = useState<OwnerActionDeskFilter>({
      query: '',
      section: 'all',
      job_id: selectedJobId ?? null,
      band: 'all',
    }),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  useEffect(() => {
    const generation = epoch,
      gate = admission;
    return () => {
      generation.current++;
      gate.current.confirmed = false;
    };
  }, [sources]);
  useLayoutEffect(() => {
    callback.current = {
      fn: onSelectJob,
      generation: callback.current.generation + 1,
    };
    return () => {
      callback.current = {
        fn: undefined,
        generation: callback.current.generation + 1,
      };
    };
  }, [onSelectJob]);
  useEffect(() => {
    if (showTask) heading.current?.focus();
  }, [task, showTask]);
  let current = false,
    taskCurrent = false;
  if (review && confirmed)
    try {
      assertOwnerActionDeskReviewCurrent(review);
      current = true;
    } catch {
      current = false;
    }
  if (task && current)
    try {
      assertOwnerActionDeskTaskCurrent(task, selectedJobId);
      taskCurrent = true;
    } catch {
      taskCurrent = false;
    }
  let filtered: ReturnType<typeof filterOwnerActionDesk> | null = null;
  if (review && current)
    try {
      filtered = filterOwnerActionDesk(review, {
        ...filter,
        job_id: selectedJobId ?? filter.job_id,
      });
    } catch {
      filtered = null;
    }
  async function read(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || pending.current || held.current) return;
    try {
      capacityDay(day, timezone);
    } catch {
      setError('Choose a valid day and IANA timezone.');
      return;
    }
    held.current = true;
    setReadHeld(true);
    pending.current = true;
    const token = ++epoch.current,
      gate = { enabled: true, confirmed: true };
    admission.current.confirmed = false;
    admission.current = gate;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const next = await readOwnerActionDesk(
        sources,
        { review_on: day, timezone, ordering, input_revision: token },
        gate,
      );
      if (token !== epoch.current || !gate.confirmed) return;
      assertOwnerActionDeskReviewCurrent(next);
      setReview(next);
      setStatus(
        'Current original priorities read. Inspect a suggestion, then open its exact existing review.',
      );
    } catch {
      if (token === epoch.current)
        setError(
          'Owner briefing UNKNOWN. Exact read is held; no retry, replacement or renewed expiry.',
        );
    } finally {
      pending.current = false;
      if (token === epoch.current) setBusy(false);
    }
  }
  async function inspect(key: string) {
    if (!review || !current || pending.current) return;
    const previous = opened.current.get(key);
    if (previous) {
      try {
        assertOwnerActionDeskTaskCurrent(previous.task, selectedJobId);
        setTask(previous.task);
        setLease(previous.lease);
        setShowTask(true);
        setError('');
      } catch {
        setError('Retained suggestion UNKNOWN; no renewed inspection.');
      }
      return;
    }
    if (attempted.current.has(key)) {
      setError('Exact task inspection already held. No replay or replacement.');
      return;
    }
    attempted.current.add(key);
    pending.current = true;
    const token = ++epoch.current,
      navLease = { ...callback.current };
    setBusy(true);
    setTask(null);
    setShowTask(false);
    setError('');
    try {
      const next = await openOwnerActionDeskTask(review, key, selectedJobId);
      if (token !== epoch.current || !admission.current.confirmed) return;
      assertOwnerActionDeskTaskCurrent(next, selectedJobId);
      opened.current.set(key, { task: next, lease: navLease });
      setTask(next);
      setLease(navLease);
      setShowTask(true);
      setStatus(
        'Original facts, review reasons and exact destination inspected together.',
      );
    } catch {
      if (token === epoch.current)
        setError(
          'Exact task UNKNOWN. Original inspection hold remains; no retry, fallback or renewed deadline.',
        );
    } finally {
      pending.current = false;
      if (token === epoch.current) setBusy(false);
    }
  }
  function navigate() {
    if (!task || !lease) return;
    const result = navigateOwnerActionDeskTask(
      task,
      (job, section) => {
        if (
          !lease.fn ||
          callback.current.fn !== lease.fn ||
          callback.current.generation !== lease.generation
        )
          throw Error('Current host callback changed');
        lease.fn(job, section);
      },
      selectedJobId,
    );
    setStatus(result.status);
    if (result.status === 'UNKNOWN')
      setError('Navigation UNKNOWN; exact read-only return only, no replay.');
  }
  return (
    <section className="owner-action-desk" aria-label="Owner action desk">
      <p className="owner-action-desk-eyebrow">
        Daily owner review · {sources.company.name}
      </p>
      <h2>Owner action desk</h2>
      <p>
        Source-verified next reviews across your saved jobs. Original priority
        order and missing evidence stay visible; suggestions never authorize
        business actions.
      </p>
      <form onSubmit={(e) => void read(e)}>
        <div className="owner-action-desk-filters">
          <label htmlFor={`${id}-day`}>
            Operating review day
            <input
              id={`${id}-day`}
              type="date"
              value={day}
              disabled={readHeld}
              onChange={(e) => {
                setDay(e.target.value);
                confirm(false);
              }}
            />
          </label>
          <label htmlFor={`${id}-zone`}>
            Operating review timezone
            <input
              id={`${id}-zone`}
              value={timezone}
              disabled={readHeld}
              onChange={(e) => {
                setTimezone(e.target.value);
                confirm(false);
              }}
            />
          </label>
          <label htmlFor={`${id}-order`}>
            Review ordering
            <select
              id={`${id}-order`}
              value={ordering}
              disabled={readHeld}
              onChange={(e) => {
                setOrdering(e.target.value as typeof ordering);
                confirm(false);
              }}
            >
              <option value="EVIDENCE_FIRST">Evidence gaps first</option>
              <option value="RECORDED_DAY_FIRST">Recorded day first</option>
            </select>
          </label>
        </div>
        <label htmlFor={`${id}-confirm`}>
          <input
            id={`${id}-confirm`}
            type="checkbox"
            checked={confirmed}
            onChange={(e) => {
              epoch.current++;
              admission.current.confirmed = false;
              confirm(e.target.checked);
              setBusy(false);
            }}
          />{' '}
          I confirm the current company, review day and saved operating sources.
        </label>
        <button type="submit" disabled={!confirmed || busy || readHeld}>
          Read owner action desk
        </button>
      </form>
      {busy && <p role="status">Reading exact original operating evidence…</p>}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {review && !current && (
        <p role="alert">
          UNKNOWN — source, workflow, staff or confirmation changed. Previous
          suggestions and navigation are withheld.
        </p>
      )}
      {review && current && (
        <>
          <div hidden={showTask}>
            <p>
              {review.review_on} · {review.timezone}. Available evidence for{' '}
              {review.jobs.length} admitted jobs; not complete business
              coverage.
            </p>
            <div className="owner-action-desk-filters">
              <label htmlFor={`${id}-query`}>
                Search owner priorities
                <input
                  id={`${id}-query`}
                  value={filter.query}
                  maxLength={200}
                  onChange={(e) =>
                    setFilter({ ...filter, query: e.target.value })
                  }
                />
              </label>
              <label htmlFor={`${id}-section`}>
                Original review area
                <select
                  id={`${id}-section`}
                  value={filter.section}
                  onChange={(e) =>
                    setFilter({
                      ...filter,
                      section: e.target
                        .value as OwnerActionDeskFilter['section'],
                    })
                  }
                >
                  <option value="all">All original reviews</option>
                  <option value="sales">Issued scope</option>
                  <option value="field">Field and crew</option>
                  <option value="finance">Finance</option>
                  <option value="completion">Published documentation</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </label>
            </div>
            <p role="status">
              {filtered
                ? `${filtered.matching} matching of ${filtered.available} recorded priorities; ${filtered.exact_targets} exact destinations, ${filtered.unknown_targets} UNKNOWN destinations`
                : 'Exact filters UNKNOWN; no alternate task selected.'}
            </p>
            {filtered?.matching === 0 && (
              <p>
                No available source matches. This does not prove completion,
                resolution or complete coverage.
              </p>
            )}
            <ol className="owner-action-desk-list">
              {filtered?.tasks.map((row) => (
                <li key={row.key}>
                  <span className="owner-action-desk-badge">
                    Original rank {row.rank} · {row.review_band}
                  </span>
                  <h3>{row.context.job}</h3>
                  <p>
                    {row.context.customer} · {row.context.property}
                  </p>
                  <p>
                    <strong>Recorded fact:</strong> {row.recorded_fact}
                  </p>
                  <p>
                    <strong>Next human review:</strong>{' '}
                    {row.suggested_human_review}
                  </p>
                  <p>
                    {row.navigation.label} · {row.navigation.status}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Review next action: owner task ${row.key}`}
                    onClick={() => void inspect(row.key)}
                  >
                    Review next action
                  </button>
                </li>
              ))}
            </ol>
          </div>
          {task && !taskCurrent && (
            <p role="alert">
              UNKNOWN — original task expired or no longer matches. No new
              expiry, replay or alternate destination.
            </p>
          )}
          {task && taskCurrent && showTask && (
            <section
              className="owner-action-desk-detail"
              aria-label="Inspected owner next review"
            >
              <h3 ref={heading} tabIndex={-1}>
                Next review · {task.context.job}
              </h3>
              <nav aria-label="Retained owner task breadcrumbs">
                <span>
                  {task.context.customer} / {task.context.property} /{' '}
                  {task.context.job}
                </span>
              </nav>
              <p>
                Original rank {task.original_rank} · exact job{' '}
                {task.anchor.job_id}
              </p>
              <p>
                <strong>Recorded fact:</strong> {task.recorded_fact}
              </p>
              <p>
                <strong>Suggested human review:</strong> {task.next_review}
              </p>
              <h4>Why this review appears here</h4>
              <p>{task.why_this_order}</p>
              <ul>
                {task.order_reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
              <h4>Verified source and destination</h4>
              <dl>
                <dt>Source identity / version / saved revision</dt>
                <dd>
                  {task.anchor.source_kind} · {task.anchor.source_id} /{' '}
                  {task.anchor.source_version ?? 'No version field'} /{' '}
                  {task.anchor.source_revision ?? 'No revision field'}
                </dd>
                <dt>Issued scope version</dt>
                <dd>{task.anchor.target.version_id}</dd>
                <dt>Source SHA-256</dt>
                <dd>{task.anchor.source_sha256}</dd>
                <dt>Original inspection expiry</dt>
                <dd>{task.expires_at}</dd>
                <dt>Existing destination</dt>
                <dd>
                  {task.destination.label} · {task.destination.status}
                </dd>
              </dl>
              <ul>
                {task.verification.required_checks.map((check, i) => (
                  <li key={i}>
                    {check.code} · {check.status}
                  </li>
                ))}
              </ul>
              <h4>Evidence still missing</h4>
              <ul>
                {task.verification.gaps.map((gap, i) => (
                  <li key={i}>{gap.detail}</li>
                ))}
              </ul>
              <p>{task.meaning}</p>
              <button
                type="button"
                onClick={() => {
                  if (
                    returnOwnerActionDeskTask(task, selectedJobId).status ===
                    'UNKNOWN'
                  )
                    setError('Exact retained return UNKNOWN.');
                  else {
                    setShowTask(false);
                    setStatus(
                      'Returned to the same priorities and filters; original inspection expiry unchanged.',
                    );
                  }
                }}
              >
                Return to owner action desk
              </button>
              {onSelectJob &&
                task.destination.status === 'EXACT_LOCAL_REVIEW_TARGET' && (
                  <button type="button" onClick={navigate}>
                    Open original job review
                  </button>
                )}
            </section>
          )}
        </>
      )}
      <p className="owner-action-desk-muted">
        Read-only suggestions; no dispatch, message, contract, payment or
        workflow execution. Same-tab retention is not durable custody.
        Release1.0 NOT READY / NOT AUTHORIZED.
      </p>
    </section>
  );
}
