import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  addonTaskDeskEnabled,
  readAddonTaskDeskJobs,
  assertAddonTaskDeskJobsCurrent,
  selectAddonTaskDeskJob,
  filterAddonTaskDeskJobs,
  readAddonTaskDesk,
  assertAddonTaskDeskCurrent,
  openAddonTaskDeskControls,
  resumeAddonTaskDeskControls,
  returnAddonTaskDeskContext,
  inspectAddonTaskDeskReference,
  addonTaskDeskBreadcrumbs,
  navigateAddonTaskDeskJob,
  advancedHandoffKinds,
  tradeEditions,
  addonReviewModes,
  type AddonTaskInput,
  type AddonTaskDeskJobs,
  type AddonTaskDeskRead,
  type AddonTaskDeskReference,
  type AddonTaskDeskCallback,
  type AddonTaskDeskLiveCallback,
} from '../../lib/workflows/addon-task-desk';
import { SourceBoundAddons } from './SourceBoundAddons';
import './addon-task-desk.css';
export interface AddonTaskDeskProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: AddonTaskDeskCallback;
}
type Pane = 'context' | 'source' | 'record' | 'review';
export function AddonTaskDesk({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: AddonTaskDeskProps) {
  const allowed = addonTaskDeskEnabled(enabled),
    live = useRef<AddonTaskDeskLiveCallback>({
      current: onSelectJob,
      generation: 0,
    });
  useLayoutEffect(() => {
    const slot = live.current;
    slot.current = onSelectJob;
    slot.generation++;
    return () => {
      slot.current = undefined;
      slot.generation++;
    };
  }, [onSelectJob]);
  const [bound, setBound] = useState({
    sources,
    selectedJobId,
    allowed,
    generation: 0,
  });
  if (
    bound.sources !== sources ||
    bound.selectedJobId !== selectedJobId ||
    bound.allowed !== allowed
  ) {
    setBound({
      sources,
      selectedJobId,
      allowed,
      generation: bound.generation + 1,
    });
    return null;
  }
  let admitted = allowed;
  if (allowed)
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
          selectedJobId.length > 200 ||
          capture.entries.filter((e) => e.target.job_id === selectedJobId)
            .length !== 1)
      )
        throw Error('Invalid selected job');
    } catch {
      admitted = false;
    }
  return admitted ? (
    <Desk
      key={bound.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      live={live}
      hasNavigation={typeof onSelectJob === 'function'}
    />
  ) : (
    <section className="addon-task-desk" aria-label="Add-on task desk">
      <h2>Add-on task desk</h2>
      <p>
        {allowed
          ? 'UNKNOWN — current source or selected job unavailable. Original holds remain intact; no fallback.'
          : 'Add-on task desk is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
function Desk({
  sources,
  selectedJobId,
  live,
  hasNavigation,
}: Omit<AddonTaskDeskProps, 'enabled' | 'onSelectJob'> & {
  live: { current: AddonTaskDeskLiveCallback };
  hasNavigation: boolean;
}) {
  const [jobs, setJobs] = useState<AddonTaskDeskJobs>(),
    [query, setQuery] = useState(''),
    [input, setInput] = useState<AddonTaskInput>({
      job_id: selectedJobId ?? sources.entries[0].target.job_id!,
      kind: 'offline',
      edition: 'property_services',
    }),
    [task, setTask] = useState<AddonTaskDeskRead>(),
    [controls, setControls] =
      useState<ReturnType<typeof openAddonTaskDeskControls>>(),
    [record, setRecord] = useState<AddonTaskDeskReference>(),
    [pane, setPane] = useState<Pane>('context'),
    [busy, setBusy] = useState(true),
    [held, setHeld] = useState(false),
    [error, setError] = useState(''),
    [navigationError, setNavigationError] = useState('');
  const life = useRef({ active: true, pending: false, sequence: 0 }),
    gate = useRef({ enabled: true, confirmed: true }),
    heading = useRef<HTMLHeadingElement>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const l = life.current,
      g = gate.current;
    l.active = true;
    g.enabled = true;
    return () => {
      l.active = false;
      l.sequence++;
      g.enabled = false;
    };
  }, []);
  useEffect(() => {
    const l = life.current,
      id = ++l.sequence;
    void readAddonTaskDeskJobs(sources, gate.current)
      .then((view) => {
        assertAddonTaskDeskJobsCurrent(view);
        const selected = selectAddonTaskDeskJob(view, selectedJobId);
        if (l.active && id === l.sequence) {
          setJobs(view);
          setInput((value) => ({ ...value, job_id: selected ?? '' }));
          setBusy(false);
        }
      })
      .catch(() => {
        if (l.active && id === l.sequence) {
          setHeld(true);
          setError(
            'UNKNOWN — exact current add-on source unavailable. No fallback.',
          );
          setBusy(false);
        }
      });
    return () => {
      l.sequence++;
    };
  }, [sources, selectedJobId]);
  useEffect(() => {
    if (pane === 'review') reviewHeading.current?.focus();
    else heading.current?.focus();
  }, [pane, task, record]);
  function fail() {
    setHeld(true);
    setError(
      'UNKNOWN — exact source, job/mode/edition or current access changed. Original holds cannot reset or renew.',
    );
  }
  async function open() {
    const l = life.current;
    if (!jobs || busy || l.pending || task || held) return;
    l.pending = true;
    setBusy(true);
    const id = ++l.sequence,
      selected = { ...input };
    try {
      assertAddonTaskDeskJobsCurrent(jobs);
      selectAddonTaskDeskJob(jobs, selected.job_id);
      const value = await readAddonTaskDesk(sources, selected, gate.current),
        props = openAddonTaskDeskControls(value);
      if (l.active && id === l.sequence) {
        setTask(value);
        setControls(props);
        setPane('review');
      }
    } catch {
      if (l.active && id === l.sequence) fail();
    } finally {
      if (l.active) {
        l.pending = false;
        setBusy(false);
      }
    }
  }
  function go(next: Pane) {
    if (!task || busy) return;
    try {
      assertAddonTaskDeskCurrent(task);
      addonTaskDeskBreadcrumbs(task, record);
      if (next === 'context') {
        const saved = returnAddonTaskDeskContext(task);
        if (
          saved.job_id !== input.job_id ||
          saved.kind !== input.kind ||
          saved.edition !== input.edition
        )
          throw Error('Context changed');
      }
      if (next === 'review' && resumeAddonTaskDeskControls(task) !== controls)
        throw Error('Original controls changed');
      setPane(next);
    } catch {
      fail();
    }
  }
  async function inspect(
    reference: Parameters<typeof inspectAddonTaskDeskReference>[1],
  ) {
    const l = life.current;
    if (!task || busy || l.pending) return;
    l.pending = true;
    setBusy(true);
    const id = ++l.sequence;
    try {
      const value = await inspectAddonTaskDeskReference(task, reference);
      if (l.active && id === l.sequence) {
        setRecord(value);
        setPane('record');
      }
    } catch {
      if (l.active && id === l.sequence) fail();
    } finally {
      if (l.active) {
        l.pending = false;
        setBusy(false);
      }
    }
  }
  async function navigate() {
    const l = life.current,
      slot = live.current,
      callback = slot.current;
    if (!task || !record || !callback || busy || l.pending) return;
    l.pending = true;
    setBusy(true);
    setNavigationError('');
    const id = ++l.sequence;
    try {
      await navigateAddonTaskDeskJob(task, record, callback, slot);
    } catch {
      if (l.active && id === l.sequence)
        setNavigationError(
          'Navigation cancelled or outcome UNKNOWN. Ambiguous results cannot retry or reselect the same job.',
        );
    } finally {
      if (l.active) {
        l.pending = false;
        setBusy(false);
      }
    }
  }
  let current = !held,
    rows: ReturnType<typeof filterAddonTaskDeskJobs> = [],
    crumbs: ReturnType<typeof addonTaskDeskBreadcrumbs> = [];
  try {
    if (jobs) {
      assertAddonTaskDeskJobsCurrent(jobs);
      rows = filterAddonTaskDeskJobs(jobs, { query, location_id: '' });
    }
    if (task) {
      assertAddonTaskDeskCurrent(task);
      crumbs = addonTaskDeskBreadcrumbs(task, record);
    }
  } catch {
    current = false;
  }
  return (
    <section
      className="addon-task-desk"
      aria-label="Add-on task desk"
      aria-busy={busy}
    >
      <header>
        <div>
          <h2>Add-on task desk</h2>
          <p>
            Open the existing review once and retain exact job, mode, edition
            and source breadcrumbs.
          </p>
        </div>
        <span>Original controls · local retained context</span>
      </header>
      {busy && <p role="status">Loading exact add-on task source…</p>}
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — retained source or access changed. Previous controls are withheld; original holds stay authoritative.'}
        </p>
      )}
      {navigationError && <p role="alert">{navigationError}</p>}
      {current && (
        <>
          <div className="addon-task-desk-ui">
            {task && (
              <nav aria-label="Add-on task breadcrumbs">
                {crumbs.map((crumb) => (
                  <button
                    type="button"
                    className="secondary"
                    key={crumb.kind}
                    disabled={busy}
                    aria-current={
                      pane === crumb.kind ||
                      (pane === 'context' && crumb.kind === 'job')
                        ? 'step'
                        : undefined
                    }
                    onClick={() =>
                      go(
                        crumb.kind === 'job' ||
                          crumb.kind === 'mode' ||
                          crumb.kind === 'edition'
                          ? 'context'
                          : crumb.kind,
                      )
                    }
                  >
                    {crumb.label}
                  </button>
                ))}
              </nav>
            )}
            {pane !== 'review' && (
              <h3 ref={heading} tabIndex={-1}>
                {pane === 'source'
                  ? 'Exact retained add-on sources'
                  : pane === 'record' && record
                    ? `Exact task source ${record.reference.kind} ${record.reference.id}`
                    : 'Retained add-on task context'}
              </h3>
            )}
            {pane === 'context' && (
              <>
                {jobs && (
                  <p>
                    {jobs.available} admitted jobs ·{' '}
                    {advancedHandoffKinds.length} original modes. Available
                    handles are not complete company history.
                  </p>
                )}
                {!task && jobs && (
                  <label>
                    Search task desk jobs
                    <input
                      value={query}
                      maxLength={100}
                      disabled={busy}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                )}
                {jobs && (task || rows.length) ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void open();
                    }}
                  >
                    <label>
                      Task desk job
                      <select
                        value={
                          task ||
                          rows.some((row) => row.job_id === input.job_id)
                            ? input.job_id
                            : ''
                        }
                        disabled={busy || Boolean(task)}
                        onChange={(e) =>
                          setInput({ ...input, job_id: e.target.value })
                        }
                      >
                        <option value="" disabled>
                          Select an exact admitted job
                        </option>
                        {(task ? jobs.rows : rows).map((row) => (
                          <option key={row.job_id} value={row.job_id}>
                            {row.job_label} · {row.property_label} ·{' '}
                            {row.job_id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Task desk mode
                      <select
                        value={input.kind}
                        disabled={busy || Boolean(task)}
                        onChange={(e) =>
                          setInput({
                            ...input,
                            kind: e.target.value as AddonTaskInput['kind'],
                          })
                        }
                      >
                        {advancedHandoffKinds.map((kind) => (
                          <option key={kind} value={kind}>
                            {addonReviewModes[kind]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Task desk edition
                      <select
                        value={input.edition}
                        disabled={busy || Boolean(task)}
                        onChange={(e) =>
                          setInput({
                            ...input,
                            edition: e.target
                              .value as AddonTaskInput['edition'],
                          })
                        }
                      >
                        {tradeEditions.map((edition) => (
                          <option key={edition} value={edition}>
                            {edition}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      Edition is a human-selected context. Company industry and
                      branding remain unchanged.
                    </p>
                    {task ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => go('review')}
                      >
                        Return to original add-on review
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={
                          busy ||
                          !rows.some((row) => row.job_id === input.job_id)
                        }
                      >
                        Open retained add-on review
                      </button>
                    )}
                  </form>
                ) : (
                  jobs && (
                    <p>
                      No matching admitted task sources. No different job is
                      substituted.
                    </p>
                  )
                )}
                {task && (
                  <p>
                    The same original controls, entered evidence, fixed expiry
                    and terminal holds remain retained. These selectors cannot
                    rebind the original task.
                  </p>
                )}
              </>
            )}
            {task && controls && pane === 'source' && (
              <>
                <p>
                  {controls.selection.company.name} ·{' '}
                  {controls.selection.customer_label} ·{' '}
                  {controls.selection.property_label}
                </p>
                <dl>
                  <dt>Exact job / mode / human edition</dt>
                  <dd>
                    {task.source.job_id} / {task.source.kind} /{' '}
                    {task.edition.human_selected_review_context}
                  </dd>
                  <dt>
                    Original industry / immutable issued version / saved
                    revision
                  </dt>
                  <dd>
                    {task.edition.company_industry} /{' '}
                    {task.source.issued_version_id} /{' '}
                    {task.source.saved_lock_revision}
                  </dd>
                  <dt>Report / published version</dt>
                  <dd>
                    {task.report.report_id} / {task.report.published_version}
                  </dd>
                  <dt>Source SHA-256</dt>
                  <dd>{task.source.source_sha256}</dd>
                </dl>
                <p>
                  Exact recorded references are not verification or operational
                  readiness.
                  Provider/sync/voice/catalog/bid/accounting/incident/network
                  evidence remains UNKNOWN or unavailable; original controls
                  show the actual missing requirements.
                </p>
                <ul>
                  {controls.selection.references.map((reference) => (
                    <li
                      key={`${reference.kind}:${reference.id}:${reference.version}`}
                    >
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => void inspect(reference)}
                      >
                        Inspect task source {reference.kind} {reference.id}
                      </button>
                      <span>
                        {' '}
                        · version {reference.version ?? 'not recorded'}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => go('review')}
                >
                  Return to original add-on review
                </button>
              </>
            )}
            {task && record && pane === 'record' && (
              <>
                <p>
                  Job {record.reference.job_id} · issued version{' '}
                  {record.reference.issued_version_id} · record version{' '}
                  {record.reference.version ?? 'not recorded'}
                </p>
                <p>Source SHA-256 {record.reference.source_sha256}</p>
                <p>
                  Recorded source identity grants no import, sync, booking,
                  dispatch, call/message, order/payment or provider authority.
                </p>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => go('source')}
                >
                  Return to exact task sources
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => go('review')}
                >
                  Return to original add-on review
                </button>
                {hasNavigation && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => void navigate()}
                  >
                    Open same add-on job {task.job_label}
                  </button>
                )}
              </>
            )}
          </div>
          {task && controls && (
            <div
              hidden={pane !== 'review'}
              aria-label="Retained original task controls"
            >
              <div className="addon-task-desk-ui">
                <h3 ref={reviewHeading} tabIndex={-1}>
                  Original add-on review · {task.job_label} ·{' '}
                  {addonReviewModes[task.source.kind]}
                </h3>
                <p>
                  Company industry {task.edition.company_industry} · selected
                  edition {task.edition.human_selected_review_context}. Original
                  controls own every confirmation, fixed deadline and lifecycle
                  state; breadcrumbs never renew or infer it.
                </p>
              </div>
              <SourceBoundAddons
                sources={controls.sources}
                selection={controls.selection}
                enabled
              />
            </div>
          )}
        </>
      )}
      <footer>
        Exact original source and control instances only. No new engine,
        business store, reservation, window, provider/import/sync/booking/send
        capability or hosted/financial authority. Local breadcrumb return
        retains references; host navigation/reload can unmount presentation
        without clearing original holds.
      </footer>
    </section>
  );
}
