import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  addonReadinessGuideEnabled,
  readAddonReadinessJobs,
  assertAddonReadinessJobsCurrent,
  selectAddonReadinessJob,
  filterAddonReadinessJobs,
  readAddonReadinessGuide,
  assertAddonReadinessCurrent,
  openAddonReadinessControls,
  resumeAddonReadinessControls,
  returnAddonReadinessContext,
  filterAddonReadinessRequirements,
  filterAddonReadinessReferences,
  inspectAddonReadinessReference,
  navigateAddonReadinessJob,
  advancedHandoffKinds,
  addonReviewModes,
  tradeEditions,
  type AddonTaskInput,
  type AddonReadinessJobs,
  type AddonReadinessGuideRead,
  type AddonReadinessCallback,
  type AddonReadinessLiveCallback,
  type AddonReadinessReferenceRead,
} from '../../lib/workflows/addon-readiness-guide';
import { SourceBoundAddons } from './SourceBoundAddons';
import './addon-readiness-guide.css';
export interface AddonReadinessGuideProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: AddonReadinessCallback;
}
export function AddonReadinessGuide({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: AddonReadinessGuideProps) {
  const allowed = addonReadinessGuideEnabled(enabled),
    liveCallback = useRef<AddonReadinessLiveCallback>({
      current: onSelectJob,
      generation: 0,
    });
  useLayoutEffect(() => {
    const live = liveCallback.current;
    live.current = onSelectJob;
    live.generation++;
    return () => {
      live.current = undefined;
      live.generation++;
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
        throw Error('Exact selected job unavailable');
    } catch {
      admitted = false;
    }
  return admitted ? (
    <Guide
      key={bound.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      liveCallback={liveCallback}
      hasNavigation={typeof onSelectJob === 'function'}
    />
  ) : (
    <section
      className="addon-readiness-guide"
      aria-label="Add-on readiness guide"
    >
      <h2>Add-on readiness guide</h2>
      <p>
        {allowed
          ? 'UNKNOWN — current source or selected job is unavailable. Original holds remain intact; no fallback.'
          : 'Add-on readiness guide is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
function Guide({
  sources,
  selectedJobId,
  liveCallback,
  hasNavigation,
}: Omit<AddonReadinessGuideProps, 'enabled' | 'onSelectJob'> & {
  liveCallback: { current: AddonReadinessLiveCallback };
  hasNavigation: boolean;
}) {
  const [jobs, setJobs] = useState<AddonReadinessJobs>(),
    [query, setQuery] = useState(''),
    [property, setProperty] = useState(''),
    [input, setInput] = useState<AddonTaskInput>({
      job_id: selectedJobId ?? sources.entries[0].target.job_id!,
      kind: 'offline',
      edition: 'property_services',
    }),
    [task, setTask] = useState<AddonReadinessGuideRead>(),
    [controls, setControls] =
      useState<ReturnType<typeof openAddonReadinessControls>>(),
    [requirementsQuery, setRequirementsQuery] = useState(''),
    [referenceQuery, setReferenceQuery] = useState(''),
    [record, setRecord] = useState<AddonReadinessReferenceRead>(),
    [atContext, setAtContext] = useState(true),
    [busy, setBusy] = useState(true),
    [held, setHeld] = useState(false),
    [error, setError] = useState(''),
    [navigationError, setNavigationError] = useState('');
  const life = useRef({ active: true, sequence: 0, pending: false }),
    gate = useRef({ enabled: true, confirmed: true }),
    original = useRef<AddonTaskInput | undefined>(undefined),
    contextHeading = useRef<HTMLHeadingElement>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null),
    recordHeading = useRef<HTMLHeadingElement>(null);
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
    void readAddonReadinessJobs(sources, gate.current)
      .then((view) => {
        assertAddonReadinessJobsCurrent(view);
        const selected = selectAddonReadinessJob(view, selectedJobId);
        if (l.active && l.sequence === id) {
          setJobs(view);
          setInput((value) => ({ ...value, job_id: selected ?? '' }));
          setBusy(false);
        }
      })
      .catch(() => {
        if (l.active && l.sequence === id) {
          setHeld(true);
          setError(
            'UNKNOWN — exact admitted job sources are unavailable. No fallback.',
          );
          setBusy(false);
        }
      });
    return () => {
      l.sequence++;
    };
  }, [sources, selectedJobId]);
  useEffect(() => {
    if (atContext) contextHeading.current?.focus();
    else if (record) recordHeading.current?.focus();
    else sourceHeading.current?.focus();
  }, [atContext, task, record]);
  function fail() {
    setHeld(true);
    setError(
      'UNKNOWN — exact source, mode, edition or current access changed. Original controls and holds cannot be reset or replaced.',
    );
  }
  async function inspect() {
    const l = life.current;
    if (l.pending || busy || task || held || !jobs) return;
    l.pending = true;
    setBusy(true);
    setError('');
    const id = ++l.sequence,
      selected = { ...input };
    original.current = selected;
    try {
      assertAddonReadinessJobsCurrent(jobs);
      selectAddonReadinessJob(jobs, selected.job_id);
      const value = await readAddonReadinessGuide(
          sources,
          selected,
          gate.current,
        ),
        props = openAddonReadinessControls(value);
      assertAddonReadinessCurrent(value);
      if (l.active && l.sequence === id) {
        setTask(value);
        setControls(props);
        setAtContext(false);
      }
    } catch {
      if (l.active && l.sequence === id) fail();
    } finally {
      if (l.active) {
        l.pending = false;
        setBusy(false);
      }
    }
  }
  function change(value: AddonTaskInput) {
    if (busy || task) return;
    if (original.current) original.current.job_id = '\u0000changed';
    life.current.sequence++;
    setInput(value);
    setError('');
  }
  function back() {
    if (!task || busy) return;
    try {
      const retained = returnAddonReadinessContext(task);
      if (
        retained.job_id !== input.job_id ||
        retained.kind !== input.kind ||
        retained.edition !== input.edition
      )
        throw Error('Return context changed');
      setAtContext(true);
    } catch {
      fail();
    }
  }
  function resume() {
    if (!task || busy) return;
    try {
      if (resumeAddonReadinessControls(task) !== controls)
        throw Error('Original controls changed');
      setAtContext(false);
    } catch {
      fail();
    }
  }
  async function inspectRecord(
    reference: Parameters<typeof inspectAddonReadinessReference>[1],
  ) {
    const l = life.current;
    if (!task || busy || l.pending) return;
    l.pending = true;
    setBusy(true);
    setRecord(undefined);
    const id = ++l.sequence;
    try {
      const value = await inspectAddonReadinessReference(task, reference);
      assertAddonReadinessCurrent(task);
      if (l.active && id === l.sequence) setRecord(value);
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
      live = liveCallback.current,
      callback = live.current;
    if (!task || !record || busy || l.pending || !callback) return;
    l.pending = true;
    setBusy(true);
    setNavigationError('');
    const id = ++l.sequence;
    try {
      await navigateAddonReadinessJob(task, record.reference, callback, live);
    } catch {
      if (l.active && id === l.sequence)
        setNavigationError(
          'Job navigation was withdrawn or current source is unavailable. The original review remains retained; no fallback callback runs.',
        );
    } finally {
      if (l.active) {
        l.pending = false;
        setBusy(false);
      }
    }
  }
  let current = !held,
    rows: ReturnType<typeof filterAddonReadinessJobs> = [],
    requirements: readonly string[] = [],
    references: ReturnType<typeof filterAddonReadinessReferences> = [];
  try {
    if (jobs) {
      assertAddonReadinessJobsCurrent(jobs);
      rows = filterAddonReadinessJobs(jobs, { query, location_id: property });
    }
    if (task) {
      assertAddonReadinessCurrent(task);
      requirements = filterAddonReadinessRequirements(task, requirementsQuery);
      references = filterAddonReadinessReferences(task, referenceQuery);
    }
  } catch {
    current = false;
  }
  const selectedVisible = rows.some((r) => r.job_id === input.job_id);
  return (
    <section
      className="addon-readiness-guide"
      aria-label="Add-on readiness guide"
      aria-busy={busy}
    >
      <header>
        <div>
          <h2>Add-on readiness guide</h2>
          <p>
            Inspect actual job evidence, review missing requirements and
            continue in the same original control. Operational readiness remains
            false.
          </p>
        </div>
        <span>Seven original modes · staff review only</span>
      </header>
      {busy && <p role="status">Loading exact add-on readiness evidence…</p>}
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — current source or access changed. Previous controls are withheld; original holds remain authoritative.'}
        </p>
      )}
      {navigationError && <p role="alert">{navigationError}</p>}
      {current && (
        <>
          {atContext && (
            <div className="addon-readiness-guide-ui">
              <h3 ref={contextHeading} tabIndex={-1}>
                Add-on source context and next review
              </h3>
              {jobs && (
                <p>
                  {jobs.available} admitted jobs · {advancedHandoffKinds.length}{' '}
                  original modes. Available source handles are not complete
                  company history.
                </p>
              )}
              {jobs && !task && (
                <div className="addon-readiness-guide-filters">
                  <label>
                    Search add-on jobs
                    <input
                      value={query}
                      maxLength={100}
                      disabled={busy}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <label>
                    Add-on property
                    <select
                      value={property}
                      disabled={busy}
                      onChange={(e) => setProperty(e.target.value)}
                    >
                      <option value="">All admitted properties</option>
                      {[
                        ...new Map(
                          jobs.rows.map((row) => [row.location_id, row]),
                        ).values(),
                      ].map((row) => (
                        <option key={row.location_id} value={row.location_id}>
                          {row.property_label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {!task && jobs && (
                <p role="status">{rows.length} matching admitted jobs.</p>
              )}
              {jobs && (task || rows.length > 0) ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void inspect();
                  }}
                >
                  <label>
                    Add-on source job
                    <select
                      value={task || selectedVisible ? input.job_id : ''}
                      disabled={busy || Boolean(task)}
                      onChange={(e) =>
                        change({ ...input, job_id: e.target.value })
                      }
                    >
                      <option value="" disabled>
                        Select an exact admitted job
                      </option>
                      {(task ? jobs.rows : rows).map((row) => (
                        <option key={row.job_id} value={row.job_id}>
                          {row.job_label} · {row.property_label} · {row.job_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Add-on source mode
                    <select
                      value={input.kind}
                      disabled={busy || Boolean(task)}
                      onChange={(e) =>
                        change({
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
                    Add-on review edition
                    <select
                      value={input.edition}
                      disabled={busy || Boolean(task)}
                      onChange={(e) =>
                        change({
                          ...input,
                          edition: e.target.value as AddonTaskInput['edition'],
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
                    Edition is an explicit human review context. The original
                    company industry and branding stay unchanged.
                  </p>
                  {task ? (
                    <button type="button" disabled={busy} onClick={resume}>
                      Resume retained original add-on review
                    </button>
                  ) : (
                    <button type="submit" disabled={busy || !selectedVisible}>
                      Inspect add-on readiness source
                    </button>
                  )}
                </form>
              ) : (
                jobs && (
                  <p>
                    No matching admitted add-on jobs. Adjust literal filters; no
                    substitute source is selected.
                  </p>
                )
              )}
              {task && (
                <p>
                  The same original control, fixed deadline, inputs and result
                  remain retained below. Return never renews or resets UNKNOWN,
                  expired, cancelled or revoked reviews.
                </p>
              )}
            </div>
          )}
          {task && controls && (
            <div
              hidden={atContext}
              aria-label="Retained original add-on readiness review"
            >
              <div className="addon-readiness-guide-ui">
                <nav aria-label="Add-on readiness return">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={back}
                  >
                    Return to add-on source context
                  </button>
                </nav>
                <h3 ref={sourceHeading} tabIndex={-1}>
                  {task.job_label} · exact add-on readiness source
                </h3>
                <p>
                  {controls.selection.company.name} · original industry{' '}
                  {task.edition.company_industry} ·{' '}
                  {addonReviewModes[task.source.kind]} · human-selected edition{' '}
                  {task.edition.human_selected_review_context}
                </p>
                <dl>
                  <dt>Exact tenant / customer / property</dt>
                  <dd>
                    {task.source.organization_id} / {task.source.customer_id} /{' '}
                    {task.source.location_id}
                  </dd>
                  <dt>Exact job / immutable issued version / saved revision</dt>
                  <dd>
                    {task.source.job_id} / {task.source.issued_version_id} /{' '}
                    {task.source.saved_lock_revision}
                  </dd>
                  <dt>Original report / published version</dt>
                  <dd>
                    {task.report.report_id} / {task.report.published_version}
                  </dd>
                  <dt>Original source SHA-256</dt>
                  <dd>{task.source.source_sha256}</dd>
                  <dt>Recorded catalog links</dt>
                  <dd>{controls.selection.catalog_links.state}</dd>
                  <dt>Original lifecycle state</dt>
                  <dd>
                    Read-only source inspection cannot infer review status. Use
                    the unchanged original control below.
                  </dd>
                </dl>
                <h4>Missing requirements and next review</h4>
                <p>
                  Review these original requirements and their exact source
                  references before any separately confirmed local proposal. No
                  requirement is resolved by inspecting this guide.
                </p>
                <label>
                  Search add-on requirements
                  <input
                    value={requirementsQuery}
                    maxLength={100}
                    disabled={busy}
                    onChange={(e) => setRequirementsQuery(e.target.value)}
                  />
                </label>
                <p>
                  {requirements.length} matching of {task.requirements.length}{' '}
                  original requirements. An empty search result does not mean
                  readiness.
                </p>
                {requirements.length ? (
                  <ul>
                    {requirements.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No matching original requirements. Operational readiness
                    remains false.
                  </p>
                )}
                <details>
                  <summary>Missing provider and operational evidence</summary>
                  <dl>
                    {Object.entries(controls.selection.missing_evidence).map(
                      ([name, value]) => (
                        <div key={name}>
                          <dt>{name.replaceAll('_', ' ')}</dt>
                          <dd>{value}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                  <p>
                    No provider/catalog mapping, authenticated sync, voice
                    recognition, bid, accounting acceptance, incident, network
                    vetting or availability is invented.
                  </p>
                </details>
                <h4>Exact recorded source references</h4>
                <label>
                  Search add-on references
                  <input
                    value={referenceQuery}
                    maxLength={100}
                    disabled={busy}
                    onChange={(e) => setReferenceQuery(e.target.value)}
                  />
                </label>
                {references.length ? (
                  <ul>
                    {references.map((reference) => (
                      <li
                        key={`${reference.kind}:${reference.id}:${reference.version}`}
                      >
                        <span>
                          {reference.kind} · {reference.id} · version{' '}
                          {reference.version ?? 'not recorded'}
                        </span>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => void inspectRecord(reference)}
                        >
                          Inspect exact add-on reference {reference.kind}{' '}
                          {reference.id}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No matching exact source references. No fuzzy or replacement
                    reference is used.
                  </p>
                )}
                {record && (
                  <article>
                    <h4 ref={recordHeading} tabIndex={-1}>
                      Exact add-on reference {record.reference.kind}{' '}
                      {record.reference.id}
                    </h4>
                    <p>
                      Job {record.reference.job_id} · issued version{' '}
                      {record.reference.issued_version_id} · source version{' '}
                      {record.reference.version ?? 'not recorded'}
                    </p>
                    <p>
                      Source SHA-256 {record.reference.source_sha256}. Recorded
                      identity is not verification, readiness or execution
                      authority.
                    </p>
                    {hasNavigation && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void navigate()}
                      >
                        Open same add-on job {task.job_label}
                      </button>
                    )}
                  </article>
                )}
                <h4>Original source-bound review controls</h4>
                <p>
                  The original component below owns every explicit confirmation,
                  fixed review deadline, lifecycle result and permanent one-use
                  hold. Its state stays separate from this read-only guide.
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
        No duplicate engine, attempt store, new deadline or reset. No
        provider/import/sync, booking, dispatch, call/message, order/payment or
        hosted capability. Local Return/Resume retains the original mounted
        control; host navigation may unmount it, while original engine holds
        remain authoritative.
      </footer>
    </section>
  );
}
