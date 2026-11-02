import { useEffect, useRef, useState } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { advancedHandoffKinds } from '../../lib/workflows/advanced-handoffs';
import { tradeEditions } from '../../lib/program/trade-editions';
import {
  addonReviewModes,
  readAddonReviewDesk,
  inspectAddonReviewSource,
  assertAddonReviewCurrentNow,
  assertAddonReviewDetailCurrentNow,
  inspectAddonReviewReference,
  selectAddonReviewJob,
  openAddonOriginalControl,
  type AddonReviewInput,
  type AddonReviewView,
  type AddonReviewDetail,
  type AddonSourceReference,
  type AddonRecordReference,
} from '../../lib/workflows/addon-review-desk';
import { ExternalProposalLifecycle } from './ExternalProposalLifecycle';
import './addon-review-desk.css';

export interface AddonReviewDeskProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function AddonReviewDesk({
  sources,
  enabled = false,
  onSelectJob,
}: AddonReviewDeskProps) {
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
      check = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      }).check;
    } catch {
      /* Denied content is withheld. */
    }
  const [binding, bind] = useState({ sources, admitted, check, generation: 0 });
  let stale = false;
  try {
    binding.check?.();
  } catch {
    stale = true;
  }
  if (
    binding.sources !== sources ||
    binding.admitted !== admitted ||
    stale ||
    Boolean(binding.check) !== Boolean(check)
  ) {
    bind({ sources, admitted, check, generation: binding.generation + 1 });
    return null;
  }
  return admitted && check ? (
    <Desk
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section className="addon-review-desk" aria-label="Advanced review desk">
      <h2>Advanced review desk</h2>
      <p>
        {admitted
          ? 'UNKNOWN — current authorized sources are unavailable. Previous evidence is withheld.'
          : 'Advanced review desk is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
const initial = (): AddonReviewInput => ({
  query: '',
  job_id: '',
  kind: 'offline',
  edition: 'property_services',
});
function Desk({ sources, onSelectJob }: AddonReviewDeskProps) {
  const [input, setInput] = useState(initial),
    [view, setView] = useState<AddonReviewView>(),
    [options, setOptions] = useState<AddonReviewView['job_options']>([]),
    [detail, setDetail] = useState<AddonReviewDetail>(),
    [record, setRecord] =
      useState<Awaited<ReturnType<typeof inspectAddonReviewReference>>>(),
    [originalControl, setOriginalControl] = useState<OperatingSources>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [held, setHeld] = useState(false);
  const active = useRef(true),
    gate = useRef({ enabled: true, confirmed: true }),
    selected = useRef<AddonReviewInput | undefined>(undefined),
    operation = useRef(0),
    pending = useRef(false),
    sourceHeading = useRef<HTMLHeadingElement>(null),
    recordHeading = useRef<HTMLHeadingElement>(null),
    controlHeading = useRef<HTMLHeadingElement>(null),
    selectionHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const admission = gate.current;
    active.current = true;
    admission.enabled = true;
    return () => {
      active.current = false;
      admission.enabled = false;
    };
  }, []);
  useEffect(() => {
    if (originalControl) controlHeading.current?.focus();
    else if (record) recordHeading.current?.focus();
    else if (detail) sourceHeading.current?.focus();
  }, [detail, record, originalControl]);
  function change(value: AddonReviewInput) {
    if (selected.current) selected.current.query = '\u0000selection changed';
    operation.current++;
    setInput(value);
    setView(undefined);
    setDetail(undefined);
    setRecord(undefined);
    setOriginalControl(undefined);
    setError('');
  }
  async function task<T>(read: () => Promise<T>, apply: (value: T) => void) {
    if (pending.current || held) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const id = ++operation.current;
    try {
      const value = await read();
      if (active.current && operation.current === id) apply(value);
    } catch {
      if (active.current && operation.current === id) {
        setHeld(true);
        setDetail(undefined);
        setRecord(undefined);
        setOriginalControl(undefined);
        setError(
          'UNKNOWN — exact source, input or access changed, or the read acknowledgment is unavailable. No replay or replacement. Original review holds remain intact.',
        );
      }
    } finally {
      if (active.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  function load() {
    if (pending.current || held) return;
    const filters = { ...input };
    selected.current = filters;
    setView(undefined);
    setDetail(undefined);
    setRecord(undefined);
    setOriginalControl(undefined);
    void task(
      () => readAddonReviewDesk(sources, filters, gate.current),
      (v) => {
        assertAddonReviewCurrentNow(v);
        setView(v);
        setOptions(v.job_options);
      },
    );
  }
  function inspect(reference: AddonSourceReference) {
    if (!view) return;
    setDetail(undefined);
    setRecord(undefined);
    setOriginalControl(undefined);
    void task(
      () => inspectAddonReviewSource(view, reference),
      (d) => {
        assertAddonReviewDetailCurrentNow(d);
        setDetail(d);
      },
    );
  }
  function inspectRecord(reference: AddonRecordReference) {
    if (!detail) return;
    setRecord(undefined);
    void task(
      () => inspectAddonReviewReference(detail, reference),
      (r) => {
        assertAddonReviewDetailCurrentNow(detail);
        setRecord(r);
      },
    );
  }
  function original() {
    if (!detail || busy || held) return;
    try {
      setOriginalControl(openAddonOriginalControl(detail));
    } catch {
      setHeld(true);
      setError(
        'UNKNOWN — original review controls are unavailable. Existing holds are not reset.',
      );
    }
  }
  function navigate() {
    if (!detail || busy || held) return;
    try {
      onSelectJob?.(selectAddonReviewJob(detail));
    } catch {
      setHeld(true);
      setOriginalControl(undefined);
      setError('UNKNOWN — exact existing job navigation is unavailable.');
    }
  }
  function originalNavigate(jobId: string) {
    if (!detail) return;
    try {
      assertAddonReviewDetailCurrentNow(detail);
      if (!sources.entries.some((e) => e.target.job_id === jobId))
        throw Error('Foreign original target');
      onSelectJob?.(jobId);
    } catch {
      setHeld(true);
      setOriginalControl(undefined);
      setError('UNKNOWN — original exact source navigation is unavailable.');
    }
  }
  let current = !held;
  try {
    if (view) assertAddonReviewCurrentNow(view);
    if (detail) assertAddonReviewDetailCurrentNow(detail);
  } catch {
    current = false;
  }
  const source = current ? detail : undefined;
  return (
    <section
      className="addon-review-desk"
      aria-label="Advanced review desk"
      aria-busy={busy}
    >
      <header>
        <div>
          <span className="addon-review-desk-eyebrow">
            Advanced source review · existing workflows
          </span>
          <h2>Advanced review desk</h2>
          <p>
            Explore existing job evidence, inspect exact references and open the
            original proposal review when needed.
          </p>
        </div>
        <span className="addon-review-desk-pill">
          Local preview · no execution
        </span>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <label>
          Search advanced sources
          <input
            maxLength={100}
            value={input.query}
            onChange={(e) => change({ ...input, query: e.target.value })}
          />
        </label>
        <label>
          Advanced job
          <select
            value={input.job_id}
            onChange={(e) => change({ ...input, job_id: e.target.value })}
          >
            <option value="">All available jobs</option>
            {options.map((j) => (
              <option value={j.job_id} key={j.job_id}>
                {j.label} · {j.property_label} · {j.job_id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Advanced review mode
          <select
            value={input.kind}
            onChange={(e) =>
              change({
                ...input,
                kind: e.target.value as AddonReviewInput['kind'],
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
            Human-selected edition context
            <select
              value={input.edition}
              onChange={(e) =>
                change({
                  ...input,
                  edition: e.target.value as AddonReviewInput['edition'],
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
        )}
        <button type="submit" disabled={busy || held}>
          Explore advanced sources
        </button>
      </form>
      {busy && (
        <p role="status">
          Loading exact existing source and workflow references…
        </p>
      )}
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — source evidence changed or access was denied. Previous content is withheld; original engine and lifecycle holds remain intact.'}
        </p>
      )}
      {!view && !busy && !error && (
        <p role="status">
          Choose a mode and explore available sources. Reading does not start a
          proposal or preparation attempt.
        </p>
      )}
      {view && current && (
        <>
          <p role="status">
            {view.matching_jobs} matching source records from{' '}
            {view.available_jobs} available jobs · {view.available_modes}{' '}
            original modes. These prepared sources are not complete company
            history.
          </p>
          <p className="addon-review-desk-muted">
            {view.company.name} · recorded company industry:{' '}
            {view.company.industry}. A human review edition does not change the
            company, brand, licensing or compliance.
          </p>
          {!source && (
            <>
              <h3 tabIndex={-1} ref={selectionHeading}>
                Advanced source selection
              </h3>
              {view.rows.length === 0 ? (
                <p>
                  No matching available advanced sources. Adjust the literal
                  search or job filter.
                </p>
              ) : (
                <div className="addon-review-desk-grid">
                  {view.rows.map((row) => (
                    <article key={row.reference.job_id}>
                      <span className="addon-review-desk-pill">
                        {addonReviewModes[row.reference.kind]}
                      </span>
                      <h4>{row.job_label}</h4>
                      <p>
                        {row.customer_label} · {row.property_label}
                      </p>
                      <p>{row.scope_summary}</p>
                      <dl>
                        <dt>Exact job / issued version</dt>
                        <dd>
                          {row.reference.job_id} /{' '}
                          {row.reference.issued_version_id}
                        </dd>
                        <dt>Recorded report / published version</dt>
                        <dd>
                          {row.report_id} · version {row.published_version}
                        </dd>
                        <dt>Recorded catalog relationship</dt>
                        <dd>{row.catalog_state}</dd>
                      </dl>
                      <ul>
                        {row.requirements.map((gap) => (
                          <li key={gap}>{gap}</li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => inspect(row.reference)}
                        aria-label={`Inspect advanced source ${row.job_label} ${row.reference.job_id}`}
                      >
                        Inspect advanced source
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {source && (
            <>
              <nav aria-label="Advanced source path">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setDetail(undefined);
                    setRecord(undefined);
                    setOriginalControl(undefined);
                    requestAnimationFrame(() =>
                      selectionHeading.current?.focus(),
                    );
                  }}
                >
                  Back to advanced selection
                </button>
                <span>
                  {source.customer_label} › {source.property_label} ›{' '}
                  {source.job_label}
                </span>
              </nav>
              <h3 tabIndex={-1} ref={sourceHeading}>
                Exact advanced source: {source.job_label}
              </h3>
              <div className="addon-review-desk-grid">
                <article>
                  <h4>{addonReviewModes[source.reference.kind]}</h4>
                  <dl>
                    <dt>Company / customer / property</dt>
                    <dd>
                      {source.reference.organization_id} /{' '}
                      {source.reference.customer_id} /{' '}
                      {source.reference.location_id}
                    </dd>
                    <dt>Job / issued version / saved revision</dt>
                    <dd>
                      {source.reference.job_id} /{' '}
                      {source.reference.issued_version_id} /{' '}
                      {source.reference.saved_lock_revision}
                    </dd>
                    <dt>Canonical source SHA-256</dt>
                    <dd>{source.reference.source_sha256}</dd>
                    <dt>Existing engine attempt at source read</dt>
                    <dd>{source.original_engine_attempt}</dd>
                    <dt>Original proposal review hold</dt>
                    <dd>
                      UNKNOWN here. Only the original review can check its
                      retained control. Opening this desk does not reset it.
                    </dd>
                  </dl>
                </article>
                <article>
                  <h4>Missing requirements</h4>
                  <ul>
                    {source.requirements.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                  <p>
                    Provider, authenticated sync, supplier bids, accounting
                    mapping, storm incident, network vetting, availability and
                    physical completion remain UNKNOWN. Voice recognition is
                    NONE.
                  </p>
                  <p>
                    Recorded company industry: {source.edition.company_industry}
                    . Human-selected edition context:{' '}
                    {source.edition.human_selected_review_context}; no identity
                    or trade mapping is inferred.
                  </p>
                </article>
              </div>
              <article>
                <h4>Recorded references</h4>
                <p>
                  Inspect an exact original identity. Time and material records
                  stay attached to this job and immutable issued source.
                </p>
                <div
                  className="addon-review-desk-table"
                  role="region"
                  aria-label="Exact advanced source reference table"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Record kind</th>
                        <th scope="col">Exact identity</th>
                        <th scope="col">Version / revision</th>
                        <th scope="col">Inspect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {source.references.map((ref) => (
                        <tr key={`${ref.kind}:${ref.id}:${ref.version}`}>
                          <td>{ref.kind}</td>
                          <td>{ref.id}</td>
                          <td>
                            {ref.version ?? 'Not versioned by this source'}
                          </td>
                          <td>
                            <button
                              className="secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => inspectRecord(ref)}
                            >
                              Inspect recorded reference {ref.kind} {ref.id}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  {source.time.length} job-specific time records available.{' '}
                  {source.time.length === 0
                    ? 'No recorded time evidence is available; attendance and availability remain UNKNOWN.'
                    : 'Recorded work/break timestamps do not establish dispatch or future availability.'}
                </p>
                <ul>
                  {source.time.map((time) => (
                    <li key={time.id}>
                      {time.id} · {time.kind} · {time.started_at} →{' '}
                      {time.ended_at ?? 'No end recorded'} ·{' '}
                      {time.submitted
                        ? 'recorded submitted'
                        : 'recorded unsubmitted'}
                    </li>
                  ))}
                </ul>
                <h5>Actual included material lines</h5>
                {source.materials.length === 0 ? (
                  <p>
                    No included material lines are available in this issued
                    source.
                  </p>
                ) : (
                  <ul>
                    {source.materials.map((line) => (
                      <li key={line.line_id}>
                        {line.description} · {line.quantity_milli / 1000}{' '}
                        {line.unit} · line {line.line_id} · catalog{' '}
                        {line.catalog_item_id ??
                          'UNKNOWN — no recorded association'}
                      </li>
                    ))}
                  </ul>
                )}
                <p>
                  Supplier bids, purchase matching, orders and provider evidence
                  are not supplied by a line or catalog ID.
                </p>
              </article>
              {record && (
                <article>
                  <h4 tabIndex={-1} ref={recordHeading}>
                    Exact recorded reference: {record.reference.kind}
                  </h4>
                  <dl>
                    <dt>Record identity</dt>
                    <dd>{record.reference.id}</dd>
                    <dt>Version / revision</dt>
                    <dd>
                      {record.reference.version ??
                        'Not versioned by this source'}
                    </dd>
                    <dt>Exact job and immutable issued version</dt>
                    <dd>
                      {record.reference.job_id} /{' '}
                      {record.reference.issued_version_id}
                    </dd>
                    <dt>Source SHA-256</dt>
                    <dd>{record.reference.source_sha256}</dd>
                  </dl>
                  <p>
                    Exact source reference only. Inspection grants no
                    verification, provider, sync, dispatch, message, purchase or
                    financial authority.
                  </p>
                </article>
              )}
              <div className="addon-review-desk-actions">
                <button
                  type="button"
                  disabled={busy || held}
                  onClick={original}
                >
                  Open original C12 control
                </button>
                {onSelectJob && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || held}
                    onClick={navigate}
                  >
                    Open existing advanced job {source.job_label}
                  </button>
                )}
              </div>
              {originalControl && (
                <section
                  aria-label="Original advanced proposal review"
                  className="addon-review-desk-original"
                >
                  <h4 tabIndex={-1} ref={controlHeading}>
                    Original proposal review controls
                  </h4>
                  <p>
                    Continue with the original review below. Choose job{' '}
                    {source.reference.job_id} and{' '}
                    {addonReviewModes[source.reference.kind]} in its own
                    selectors. Values are not copied into a proposal. Its
                    original confirmations, expiry, cancellation, revocation and
                    UNKNOWN holds remain authoritative.
                  </p>
                  <ExternalProposalLifecycle
                    sources={originalControl}
                    enabled
                    onSelectJob={onSelectJob ? originalNavigate : undefined}
                  />
                </section>
              )}
              <aside className="addon-review-desk-notice">
                Read-only source inspection creates no integration, approval or
                positive missing evidence. Returning, changing mode/job or
                opening another desk cannot replace an existing original engine
                or lifecycle attempt.
              </aside>
            </>
          )}
        </>
      )}
      <footer>
        Staff evidence review only. No customer projection, provider import,
        authenticated sync, recognition, partner discovery, call, message,
        order, payment or hosted action. Same-tab references are not genuine
        Auth or durable custody.
      </footer>
    </section>
  );
}
