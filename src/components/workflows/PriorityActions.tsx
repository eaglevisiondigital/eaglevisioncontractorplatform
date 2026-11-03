import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DailyWorkbenchProps } from '../../lib/workflows/daily-workbench-contract';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import {
  priorityActionsEnabled,
  readPriorityActions,
  assertPriorityActionsCurrent,
  filterPriorityActions,
  inspectPriorityAction,
  priorityOriginalProps,
  priorityContinuationStep,
  continuePriorityAction,
  type PriorityActionsRead,
  type PriorityLiveCallback,
} from '../../lib/workflows/priority-actions';
import { OwnerActionDesk } from './OwnerActionDesk';
import { AddonTaskDesk } from './AddonTaskDesk';
import './priority-actions.css';
export function PriorityActions(props: DailyWorkbenchProps) {
  const allowed = priorityActionsEnabled(props.enabled ?? false),
    live = useRef<PriorityLiveCallback>({
      current: props.onContinue,
      generation: 0,
    });
  useLayoutEffect(() => {
    const slot = live.current;
    slot.current = props.onContinue;
    slot.generation++;
    return () => {
      slot.current = undefined;
      slot.generation++;
    };
  }, [props.onContinue]);
  const [bound, setBound] = useState({
    sources: props.sources,
    hint: props.selectedJobId,
    allowed,
    generation: 0,
  });
  if (
    bound.sources !== props.sources ||
    bound.hint !== props.selectedJobId ||
    bound.allowed !== allowed
  ) {
    setBound({
      sources: props.sources,
      hint: props.selectedJobId,
      allowed,
      generation: bound.generation + 1,
    });
    return null;
  }
  return allowed ? (
    <Actions key={bound.generation} {...props} live={live} />
  ) : (
    <section
      className="priority-actions"
      aria-label={
        props.view === 'advanced'
          ? 'Advanced task actions'
          : 'Daily priority actions'
      }
    >
      <h2>
        {props.view === 'advanced'
          ? 'Advanced task actions'
          : 'Daily priority actions'}
      </h2>
      <p>
        Priority actions are off. Explicit development HTTP loopback admission
        is required.
      </p>
    </section>
  );
}
function Actions({
  sources,
  selectedJobId,
  onSelectJob,
  onContinue,
  view = 'priorities',
  live,
}: DailyWorkbenchProps & { live: { current: PriorityLiveCallback } }) {
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ active: true, pending: false }),
    heading = useRef<HTMLHeadingElement>(null);
  const [admission] = useState(() => {
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      capture.check();
      if (
        selectedJobId !== undefined &&
        (typeof selectedJobId !== 'string' ||
          !selectedJobId ||
          capture.entries.filter((e) => e.target.job_id === selectedJobId)
            .length !== 1)
      )
        throw Error('Invalid exact job');
      let held = false;
      return {
        capture,
        check() {
          if (held) throw Error('UNKNOWN priority admission');
          try {
            capture.check();
          } catch (error) {
            held = true;
            throw error;
          }
        },
      };
    } catch {
      return null;
    }
  });
  const [job, setJob] = useState(
      selectedJobId ??
        (view === 'advanced'
          ? (admission?.capture.entries[0].target.job_id ?? '')
          : ''),
    ),
    [review, setReview] = useState<PriorityActionsRead>(),
    [task, setTask] =
      useState<Awaited<ReturnType<typeof inspectPriorityAction>>>(),
    [pane, setPane] = useState<'priorities' | 'owner' | 'advanced'>(
      'priorities',
    ),
    [ownerJobs, setOwnerJobs] = useState<string[]>([]),
    [addonJobs, setAddonJobs] = useState<string[]>([]),
    [activeJob, setActiveJob] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [filter, setFilter] = useState<Parameters<typeof filterPriorityActions>[1]>(
      {
        area: 'all',
        level: 'all',
        job_id: null as string | null,
        query: '',
        band: 'all',
      },
    );
  useLayoutEffect(() => {
    const l = life.current,
      g = gate.current;
    l.active = true;
    g.enabled = true;
    return () => {
      l.active = false;
      g.enabled = false;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [pane, review, task]);
  const [viewMode, setViewMode] = useState(view);
  if (viewMode !== view) {
    setViewMode(view);
    setPane(
      view === 'advanced' && addonJobs.length ? 'advanced' : 'priorities',
    );
  }
  async function run(fn: () => Promise<void>) {
    const l = life.current;
    if (l.pending) return;
    l.pending = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch {
      if (l.active)
        setError(
          'UNKNOWN or continuation cancelled. Original source holds and fixed deadlines cannot reset or renew.',
        );
    } finally {
      if (l.active) {
        l.pending = false;
        setBusy(false);
      }
    }
  }
  function openOriginal(
    kind: 'owner' | 'advanced',
    value: PriorityActionsRead,
    target: string,
  ) {
    priorityOriginalProps(value, target);
    setActiveJob(target);
    if (kind === 'owner')
      setOwnerJobs((ids) => (ids.includes(target) ? ids : [...ids, target]));
    else setAddonJobs((ids) => (ids.includes(target) ? ids : [...ids, target]));
    setPane(kind);
  }
  async function read() {
    await run(async () => {
      const value = await readPriorityActions(
        sources,
        { job_id: job || null },
        gate.current,
      );
      assertPriorityActionsCurrent(value);
      if (life.current.active) {
        setReview(value);
        if (view === 'advanced')
          openOriginal('advanced', value, job || value.jobs[0].target.job_id!);
      }
    });
  }
  async function inspect(key: string) {
    if (!review) return;
    await run(async () => {
      const value = await inspectPriorityAction(review, key);
      if (life.current.active) setTask(value);
    });
  }
  async function next() {
    const slot = live.current,
      cb = slot.current;
    if (!review || !task || !cb) return;
    await run(async () => {
      await continuePriorityAction(review, task, cb, slot);
    });
  }
  let current = Boolean(admission),
    rows: ReturnType<typeof filterPriorityActions> | undefined;
  try {
    if (review) {
      assertPriorityActionsCurrent(review);
      rows = filterPriorityActions(review, filter);
    } else admission?.check();
  } catch {
    current = false;
  }
  const label =
    view === 'advanced' ? 'Advanced task actions' : 'Daily priority actions';
  return (
    <section className="priority-actions" aria-label={label} aria-busy={busy}>
      <h2>{label}</h2>
      <p>
        Exact recorded daily priorities and original review controls. Model NONE
        · suggestions never authorize an action.
      </p>
      {busy && <p role="status">Loading exact daily priority sources…</p>}
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — current company/member/job source unavailable. No fallback, restored-context retry or renewed original hold.'}
        </p>
      )}
      {current && (
        <>
          <div className="priority-actions-ui">
            <h3 ref={heading} tabIndex={-1}>
              {pane === 'owner'
                ? 'Retained original owner review'
                : pane === 'advanced'
                  ? 'Retained original advanced task review'
                  : 'Source-verified daily review queue'}
            </h3>
            {review && (
              <nav aria-label="Daily priority views">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPane('priorities')}
                >
                  Return to daily priorities
                </button>
                {activeJob && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openOriginal('owner', review, activeJob)}
                    >
                      Open original owner review
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        openOriginal('advanced', review, activeJob)
                      }
                    >
                      Open original advanced review
                    </button>
                  </>
                )}
              </nav>
            )}
            <div hidden={pane !== 'priorities'}>
              {!review && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void read();
                  }}
                >
                  <label>
                    Priority review job
                    <select
                      value={job}
                      disabled={busy}
                      onChange={(e) => setJob(e.target.value)}
                    >
                      <option value="">All admitted source jobs</option>
                      {admission?.capture.entries.map((e) => (
                        <option
                          key={e.target.job_id}
                          value={e.target.job_id ?? ''}
                        >
                          {e.target.job_id} · {e.target.location_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" disabled={busy}>
                    {view === 'advanced'
                      ? 'Open advanced task controls'
                      : 'Review daily priority sources'}
                  </button>
                </form>
              )}
              {review && rows && (
                <>
                  <p>
                    {rows.available} available source cards ·{' '}
                    {review.jobs.length} admitted jobs. Complete history and
                    operational urgency UNKNOWN.
                  </p>
                  <label>
                    Search daily priorities
                    <input
                      maxLength={100}
                      value={filter.query}
                      onChange={(e) =>
                        setFilter({ ...filter, query: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Priority destination
                    <select
                      value={filter.area}
                      onChange={(e) =>
                        setFilter({
                          ...filter,
                          area: e.target.value as Parameters<
                            typeof filterPriorityActions
                          >[1]['area'],
                        })
                      }
                    >
                      {[
                        'all',
                        'field',
                        'finance',
                        'documentation',
                        'scope',
                      ].map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                  <p>
                    {rows.matching} matching source cards. Original rank is
                    retained.
                  </p>
                  {!rows.matching && (
                    <p>
                      No matching exact priority sources. No different source is
                      substituted.
                    </p>
                  )}
                  {rows.cards.map((card) => (
                    <article key={card.key}>
                      <h4>
                        {card.rank}. {card.context.job} · {card.source.kind}
                      </h4>
                      <p>{card.recorded_fact}</p>
                      <p>Next staff review: {card.suggested_human_review}</p>
                      <p>
                        {card.context.property} · job {card.job_id} · exact
                        source {card.source.id} · version{' '}
                        {card.source.version ?? 'not recorded'}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void inspect(card.key)}
                      >
                        Inspect priority source {card.source.kind}{' '}
                        {card.source.id}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          openOriginal('owner', review, card.job_id)
                        }
                      >
                        Open original owner review for {card.context.job}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          openOriginal('advanced', review, card.job_id)
                        }
                      >
                        Open original advanced review for {card.context.job}
                      </button>
                    </article>
                  ))}
                  {task && (
                    <article aria-label="Exact daily priority source">
                      <h4>
                        Inspected {task.source.kind} {task.source.id}
                      </h4>
                      <p>
                        Job {task.target.job_id} · issued version{' '}
                        {task.target.version_id} · source version{' '}
                        {task.source.version ?? 'not recorded'}
                      </p>
                      <p>{task.card.recorded_fact}</p>
                      <ul>
                        {task.card.missing_evidence.map((gap, i) => (
                          <li key={`${gap.code}:${i}`}>
                            {gap.code}: {gap.status} — {gap.detail}
                          </li>
                        ))}
                      </ul>
                      {typeof onContinue === 'function' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void next()}
                        >
                          Continue to {priorityContinuationStep(task)} review
                        </button>
                      )}
                    </article>
                  )}
                </>
              )}
            </div>
          </div>
          {review &&
            ownerJobs.map((target) => {
              const props = priorityOriginalProps(review, target);
              return (
                <div
                  key={target}
                  hidden={pane !== 'owner' || activeJob !== target}
                  aria-label={`Original owner controls ${target}`}
                >
                  <OwnerActionDesk
                    {...props}
                    onSelectJob={onSelectJob}
                    enabled
                  />
                </div>
              );
            })}
          {review &&
            addonJobs.map((target) => {
              const props = priorityOriginalProps(review, target);
              return (
                <div
                  key={target}
                  hidden={pane !== 'advanced' || activeJob !== target}
                  aria-label={`Original advanced controls ${target}`}
                >
                  <AddonTaskDesk {...props} onSelectJob={onSelectJob} enabled />
                </div>
              );
            })}
        </>
      )}
      <footer>
        Existing source engines and controls only. No model/provider call,
        duplicate ranking, new reservation, renewed deadline, import, sync,
        booking, send, dispatch or financial authority. Local tabs retain
        original controls; host navigation/reload can unmount them without
        clearing original holds.
      </footer>
    </section>
  );
}
