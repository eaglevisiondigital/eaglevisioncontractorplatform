import { useEffect, useRef, useState } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { advancedHandoffKinds } from '../../lib/workflows/advanced-handoffs';
import { tradeEditions } from '../../lib/program/trade-editions';
import { addonReviewModes } from '../../lib/workflows/addon-review-desk';
import {
  readAddonTaskContinuity,
  assertAddonTaskContinuityCurrent,
  openAddonTaskControls,
  resumeAddonTaskControls,
  returnAddonTaskContext,
  selectAddonTaskJob,
  type AddonTaskInput,
  type AddonTaskRead,
} from '../../lib/workflows/addon-task-continuity';
import { SourceBoundAddons } from './SourceBoundAddons';
import './addon-task-continuity.css';
export interface AddonTaskContinuityProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string) => void;
}
export function AddonTaskContinuity({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: AddonTaskContinuityProps) {
  const allowed =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  let check: (() => void) | null = null;
  if (allowed)
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      if (
        selectedJobId !== undefined &&
        (typeof selectedJobId !== 'string' ||
          !selectedJobId ||
          selectedJobId.length > 200 ||
          capture.entries.filter((e) => e.target.job_id === selectedJobId)
            .length !== 1)
      )
        throw Error('Exact selected job hint unavailable');
      check = capture.check;
    } catch {
      /* Denied source/hint never falls back. */
    }
  const [bound, setBound] = useState({
    sources,
    selectedJobId,
    allowed,
    check,
    generation: 0,
  });
  let stale = false;
  try {
    bound.check?.();
  } catch {
    stale = true;
  }
  if (
    bound.sources !== sources ||
    bound.selectedJobId !== selectedJobId ||
    bound.allowed !== allowed ||
    stale ||
    Boolean(bound.check) !== Boolean(check)
  ) {
    setBound({
      sources,
      selectedJobId,
      allowed,
      check,
      generation: bound.generation + 1,
    });
    return null;
  }
  return allowed && check ? (
    <Task
      key={bound.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="addon-task-continuity"
      aria-label="Advanced task continuity"
    >
      <h2>Advanced task continuity</h2>
      <p>
        {allowed
          ? 'UNKNOWN — current source or selected job is unavailable. Previous controls are withheld; no fallback.'
          : 'Advanced task continuity is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
function Task({
  sources,
  selectedJobId,
  onSelectJob,
}: AddonTaskContinuityProps) {
  const [input, setInput] = useState<AddonTaskInput>({
      job_id: selectedJobId ?? sources.entries[0].target.job_id!,
      kind: 'offline',
      edition: 'property_services',
    }),
    [task, setTask] = useState<AddonTaskRead>(),
    [controls, setControls] =
      useState<ReturnType<typeof openAddonTaskControls>>(),
    [atContext, setAtContext] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [held, setHeld] = useState(false);
  const gate = useRef({ enabled: true, confirmed: true }),
    active = useRef(true),
    sequence = useRef({ value: 0 }),
    pending = useRef(false),
    original = useRef<AddonTaskInput | undefined>(undefined),
    contextHeading = useRef<HTMLHeadingElement>(null),
    controlHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const g = gate.current,
      s = sequence.current;
    active.current = true;
    g.enabled = true;
    return () => {
      active.current = false;
      g.enabled = false;
      s.value++;
    };
  }, []);
  useEffect(() => {
    if (atContext) contextHeading.current?.focus();
    else controlHeading.current?.focus();
  }, [atContext, task]);
  function change(value: AddonTaskInput) {
    if (original.current) original.current.job_id = '\u0000changed';
    sequence.current.value++;
    setInput(value);
    setError('');
  }
  async function inspect() {
    if (pending.current || held || task) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const selected = { ...input },
      id = ++sequence.current.value;
    original.current = selected;
    try {
      const value = await readAddonTaskContinuity(
        sources,
        selected,
        gate.current,
      );
      assertAddonTaskContinuityCurrent(value);
      const props = openAddonTaskControls(value);
      if (active.current && id === sequence.current.value) {
        setTask(value);
        setControls(props);
        setAtContext(false);
      }
    } catch {
      if (active.current && id === sequence.current.value) {
        setHeld(true);
        setError(
          'UNKNOWN — exact job, mode, edition or source access is unavailable. No review attempt or fallback.',
        );
      }
    } finally {
      if (active.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  function back() {
    if (!task || busy) return;
    try {
      const retained = returnAddonTaskContext(task);
      if (
        retained.job_id !== input.job_id ||
        retained.kind !== input.kind ||
        retained.edition !== input.edition
      )
        throw Error('Exact return context changed');
      setAtContext(true);
    } catch {
      setHeld(true);
      setError('UNKNOWN — the exact retained task context is unavailable.');
    }
  }
  function resume() {
    if (!task || busy) return;
    try {
      if (resumeAddonTaskControls(task) !== controls)
        throw Error('Original control identity changed');
      setAtContext(false);
    } catch {
      setHeld(true);
      setError(
        'UNKNOWN — original controls cannot be replaced or resumed from a changed source.',
      );
    }
  }
  function navigate(jobId: string) {
    if (!task) return;
    try {
      const exact = selectAddonTaskJob(task);
      if (jobId !== exact) throw Error('Foreign task target');
      onSelectJob?.(exact);
    } catch {
      setHeld(true);
      setError('UNKNOWN — exact same-job navigation is unavailable.');
    }
  }
  let current = !held;
  try {
    if (task) assertAddonTaskContinuityCurrent(task);
  } catch {
    current = false;
  }
  return (
    <section
      className="addon-task-continuity"
      aria-label="Advanced task continuity"
      aria-busy={busy}
    >
      <header>
        <div>
          <h2>Advanced task continuity</h2>
          <p>
            Select one source, continue in its unchanged original review, and
            return locally without re-entering evidence.
          </p>
        </div>
        <span className="addon-task-continuity-pill">
          Original controls · local return
        </span>
      </header>
      {busy && <p role="status">Inspecting the exact advanced task source…</p>}
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — source or current access changed. Previous controls are withheld; original reservations remain intact.'}
        </p>
      )}
      {current && (
        <>
          {atContext && (
            <>
              <h3 ref={contextHeading} tabIndex={-1}>
                Advanced task source context
              </h3>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void inspect();
                }}
              >
                <label>
                  Task source job
                  <select
                    value={input.job_id}
                    disabled={busy || Boolean(task)}
                    onChange={(event) =>
                      change({ ...input, job_id: event.target.value })
                    }
                  >
                    {sources.entries.map((entry) => (
                      <option
                        value={entry.target.job_id!}
                        key={entry.target.job_id}
                      >
                        Job {entry.target.job_id} · property{' '}
                        {entry.target.location_id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Task source mode
                  <select
                    value={input.kind}
                    disabled={busy || Boolean(task)}
                    onChange={(event) =>
                      change({
                        ...input,
                        kind: event.target.value as AddonTaskInput['kind'],
                      })
                    }
                  >
                    {advancedHandoffKinds.map((kind) => (
                      <option value={kind} key={kind}>
                        {addonReviewModes[kind]}
                      </option>
                    ))}
                  </select>
                </label>
                {input.kind === 'trade' && (
                  <label>
                    Task source edition
                    <select
                      value={input.edition}
                      disabled={busy || Boolean(task)}
                      onChange={(event) =>
                        change({
                          ...input,
                          edition: event.target
                            .value as AddonTaskInput['edition'],
                        })
                      }
                    >
                      {tradeEditions.map((edition) => (
                        <option value={edition} key={edition}>
                          {edition}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!task ? (
                  <button type="submit" disabled={busy}>
                    Inspect advanced task source
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={resume}>
                    Resume retained advanced review
                  </button>
                )}
              </form>
              {task && (
                <article>
                  <h4>{task.job_label}</h4>
                  <dl>
                    <dt>Retained job / mode / edition</dt>
                    <dd>
                      {task.return_context.job_id} / {task.return_context.kind}{' '}
                      / {task.return_context.edition}
                    </dd>
                    <dt>Original immutable issued version</dt>
                    <dd>{task.return_context.issued_version_id}</dd>
                    <dt>Source SHA-256</dt>
                    <dd>{task.return_context.source_sha256}</dd>
                  </dl>
                  <p>
                    The same original control remains retained below. Its
                    evidence, entered label/deadline, confirmations and result
                    are preserved. Local return does not infer or change its
                    REVIEWED, UNKNOWN, expired, cancelled or revoked state.
                  </p>
                </article>
              )}
            </>
          )}
          {task && controls && (
            <div
              hidden={atContext}
              className="addon-task-continuity-original"
              aria-label="Retained original advanced task review"
            >
              <nav aria-label="Advanced task return">
                <button type="button" className="secondary" onClick={back}>
                  Return to advanced task context
                </button>
              </nav>
              <h3 ref={controlHeading} tabIndex={-1}>
                Retained original advanced review · {task.job_label}
              </h3>
              <SourceBoundAddons
                sources={controls.sources}
                selection={controls.selection}
                enabled
                onSelectJob={onSelectJob ? navigate : undefined}
              />
            </div>
          )}
        </>
      )}
      <footer>
        Visibility-only local return keeps the original review mounted. No new
        review engine, attempt store, reservation, provider, import/sync,
        booking, call/message, order/payment, physical verification or hosted
        capability. Host navigation may unmount this local presentation;
        original holds still cannot reset.
      </footer>
    </section>
  );
}
