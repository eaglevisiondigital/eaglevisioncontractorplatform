import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import {
  serviceRequestActionsEnabled,
  readServiceRequestActions,
  inspectServiceRequestActions,
  parseServiceRequestAction,
  saveServiceRequestAction,
  reconcileServiceRequestAction,
  assertServiceRequestObservationAccess,
  savedRequestStatuses,
  readServiceRequestEvidence,
  inspectServiceRequestEvidence,
  inspectServiceRequestReport,
  type ServiceRequestActionView,
} from '../../lib/workflows/service-request-actions';
import './service-request-actions.css';

export type ServiceRequestActionsProps = SavedRevisionPanelProps & {
  onSourcesSaved?: () => void;
};
export function ServiceRequestActions(props: ServiceRequestActionsProps) {
  const allowed = serviceRequestActionsEnabled(props.enabled),
    [context, setContext] = useState({
      sources: props.sources,
      job: props.selectedJobId,
      allowed,
      epoch: 0,
    });
  if (
    context.sources !== props.sources ||
    context.job !== props.selectedJobId ||
    context.allowed !== allowed
  ) {
    setContext({
      sources: props.sources,
      job: props.selectedJobId,
      allowed,
      epoch: context.epoch + 1,
    });
    return null;
  }
  return (
    <section className="request-actions" aria-label="Service request actions">
      <h3>Review the original service request</h3>
      <p>
        Update the existing intake review status or staff responsibility.
        Closing an intake review does not complete work or establish customer
        acceptance.
      </p>
      {allowed && props.selectedJobId ? (
        <RequestForm
          key={context.epoch}
          {...props}
          selectedJobId={props.selectedJobId}
        />
      ) : (
        <p>
          Local request actions are OFF. Select an authorized existing job
          context.
        </p>
      )}
    </section>
  );
}
function RequestForm({
  sources,
  selectedJobId,
  onSourcesSaved,
}: ServiceRequestActionsProps & { selectedJobId: string }) {
  const [evidence, setEvidence] =
      useState<Awaited<ReturnType<typeof readServiceRequestEvidence>>>(),
    [report, setReport] =
      useState<Awaited<ReturnType<typeof inspectServiceRequestReport>>>();
  const [view, setView] = useState<ServiceRequestActionView>(),
    [loaded, setLoaded] =
      useState<ReturnType<typeof inspectServiceRequestActions>>(),
    [status, setStatus] = useState(''),
    [assignee, setAssignee] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Load the exact original intake request before changing its review.',
    ),
    [observation, setObservation] =
      useState<Awaited<ReturnType<typeof reconcileServiceRequestAction>>>();
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, serial: 0 }),
    callback = useRef(onSourcesSaved),
    heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    callback.current = onSourcesSaved;
  }, [onSourcesSaved]);
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current;
    g.enabled = true;
    g.confirmed = true;
    l.alive = true;
    return () => {
      g.enabled = false;
      g.confirmed = false;
      l.alive = false;
      l.serial++;
    };
  }, []);
  async function load() {
    const l = life.current;
    if (l.pending) return;
    l.pending = true;
    const token = ++l.serial;
    setBusy(true);
    setConfirmed(false);
    setObservation(undefined);
    setEvidence(undefined);
    setReport(undefined);
    try {
      const next = await readServiceRequestActions(
          sources,
          selectedJobId,
          gate.current,
        ),
        request = inspectServiceRequestActions(next),
        originalEvidence = await readServiceRequestEvidence(
          next,
          sources,
          selectedJobId,
          request,
          gate.current,
        );
      if (!l.alive || token !== l.serial) return;
      setView(next);
      setLoaded(request);
      setEvidence(originalEvidence);
      setStatus(request.status);
      setAssignee(request.assigned_to ?? '');
      setMessage(
        request.can_edit
          ? 'Exact request loaded. Choose a change and confirm this internal review only.'
          : 'Original request attempt is held or already used. Only read-only observation is available.',
      );
      heading.current?.focus();
    } catch {
      if (l.alive && token === l.serial) {
        setView(undefined);
        setLoaded(undefined);
        setMessage(
          'UNKNOWN — exact request or current staff authority is unavailable. No substitute was selected.',
        );
      }
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  const input = loaded
    ? {
        request_id: loaded.request_id,
        status,
        assigned_to: assignee || null,
        expected_status: loaded.status,
        expected_assigned_to: loaded.assigned_to,
        expected_updated_at: loaded.updated_at,
      }
    : undefined;
  let current = false,
    valid = false;
  if (view && loaded)
    try {
      const request = inspectServiceRequestActions(view);
      current =
        request.request_id === loaded.request_id &&
        request.status === loaded.status &&
        request.assigned_to === loaded.assigned_to &&
        request.updated_at === loaded.updated_at;
      if (input) {
        parseServiceRequestAction(view, input);
        valid = request.can_edit;
      }
    } catch {
      /* Stale or revoked evidence never enables the native command. */
    }
  let lineage: ReturnType<typeof inspectServiceRequestEvidence> | undefined;
  if (current && view && loaded && evidence)
    try {
      lineage = inspectServiceRequestEvidence(view, evidence, loaded);
    } catch {
      current = false;
      valid = false;
    }
  async function inspectReport(
    reference: Parameters<typeof inspectServiceRequestReport>[3],
  ) {
    const l = life.current;
    if (!view || !evidence || !loaded || !current || l.pending) return;
    l.pending = true;
    const token = ++l.serial;
    setBusy(true);
    setReport(undefined);
    try {
      const detail = await inspectServiceRequestReport(
        view,
        evidence,
        loaded,
        reference,
      );
      if (!l.alive || token !== l.serial) return;
      setReport(detail);
      setMessage(
        'Exact immutable published report version inspected. Documentation is not verified completion.',
      );
      heading.current?.focus();
    } catch {
      if (l.alive && token === l.serial) {
        setEvidence(undefined);
        setMessage(
          'UNKNOWN — exact published evidence changed or access was denied. No substitute source was opened.',
        );
      }
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  if (!lineage) valid = false;
  let observationAccess = false;
  if (view)
    try {
      // Old saved/UNKNOWN attempts remain readable under the original access
      // owner, but a later revoked render must not retain private row detail.
      assertServiceRequestObservationAccess(view);
      observationAccess = true;
    } catch {
      /* Withhold prior observations without resetting original custody. */
    }
  async function save() {
    const l = life.current;
    if (!view || !input || !confirmed || l.pending || !valid) return;
    l.pending = true;
    const token = ++l.serial,
      originalCallback = callback.current;
    setBusy(true);
    try {
      await saveServiceRequestAction(view, input, true);
      if (!l.alive || token !== l.serial) return;
      setConfirmed(false);
      setMessage(
        'SYNTHETIC_SOURCE_SAVED — the original intake request was updated. No work, customer approval or message was created. This one-use attempt cannot be replayed.',
      );
      if (callback.current === originalCallback) originalCallback?.();
    } catch {
      if (l.alive && token === l.serial)
        setMessage(
          'UNKNOWN — no successful acknowledgment is available. Inspect the original attempt read only; do not replay an admitted attempt or choose another job to bypass it.',
        );
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  async function reconcile() {
    const l = life.current;
    if (!view || l.pending) return;
    l.pending = true;
    const token = ++l.serial;
    setBusy(true);
    try {
      const result = await reconcileServiceRequestAction(view);
      if (!l.alive || token !== l.serial) return;
      setObservation(result);
      setMessage(
        'Exact current-row observation only. It is not a durable receipt and cannot identify an ambiguous writer or clear UNKNOWN.',
      );
    } catch {
      if (l.alive && token === l.serial) {
        setObservation(undefined);
        setMessage(
          'UNKNOWN — exact current-row observation is unavailable. No retry is authorized.',
        );
      }
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  return (
    <>
      <button disabled={busy} onClick={() => void load()}>
        Load exact service request
      </button>
      <p role="status">{message}</p>
      {loaded && current && lineage && (
        <div>
          <h4 ref={heading} tabIndex={-1}>
            Original intake review
          </h4>
          <dl>
            <div>
              <dt>Exact request</dt>
              <dd>{loaded.request_id}</dd>
            </div>
            <div>
              <dt>Customer / property</dt>
              <dd>
                {loaded.customer_id} / {loaded.location_id}
              </dd>
            </div>
            <div>
              <dt>Original review status</dt>
              <dd>{loaded.status}</dd>
            </div>
            <div>
              <dt>Original staff assignment</dt>
              <dd>{loaded.assigned_to ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Recorded update evidence</dt>
              <dd>{loaded.updated_at} · no native revision or server CAS</dd>
            </div>
            <div>
              <dt>Original same-tab attempt</dt>
              <dd>{loaded.state}</dd>
            </div>
          </dl>
          <p>
            Request → selected job: UNKNOWN — no recorded foreign key. This is
            an explicitly selected staff context.
          </p>
          <section aria-label="Original request and published evidence">
            <h4>Reported concern</h4>
            <p>{lineage.request.summary}</p>
            <p>
              {lineage.customer_label} · {lineage.property.label}
            </p>
            <dl>
              <dt>Selected job → estimate → immutable issued version</dt>
              <dd>
                {lineage.scope.job_id} → {lineage.scope.estimate_id} →{' '}
                {lineage.scope.issued_version_id} /{' '}
                {lineage.scope.issued_version_number}
              </dd>
            </dl>
            <h4>Exact published sources</h4>
            {lineage.reports.length === 0 && (
              <p>
                No exact published report is available. History remains UNKNOWN.
              </p>
            )}
            {lineage.reports.map((row) => (
              <article
                key={`${row.reference.report_id}/${row.reference.published_version}`}
              >
                <p>{row.summary}</p>
                <p>
                  {row.reference.report_id} · published version{' '}
                  {row.reference.published_version}
                </p>
                <p>
                  Visit {row.visit_id} → plan {row.plan_id} → job {row.job_id}
                </p>
                <p>
                  Available sibling versions:{' '}
                  {row.version.available_sibling_versions.join(', ')} ·{' '}
                  {row.version.status}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void inspectReport(row.reference)}
                >
                  Inspect original published evidence: version{' '}
                  {row.reference.published_version}
                </button>
              </article>
            ))}
            <h4>Completion requirements — not satisfied by intake closure</h4>
            <ul>
              {lineage.required_proof.map((item) => (
                <li key={item.kind}>
                  <strong>
                    {item.kind} · {item.status}
                  </strong>
                  <p>{item.required}</p>
                </li>
              ))}
            </ul>
            <p>
              Physical completion {lineage.physical_completion}; customer
              acceptance {lineage.customer_acceptance}; warranty{' '}
              {lineage.warranty}; complete history{' '}
              {lineage.history_completeness}.
            </p>
            {report && (
              <section aria-label="Inspected original published report">
                <h4>
                  Published report {report.report.reference.report_id} · version{' '}
                  {report.report.reference.published_version}
                </h4>
                <p>{report.report.summary}</p>
                <p>
                  {report.selected_job_association} · {report.completion_status}
                </p>
                {report.report.observations.map((finding) => (
                  <article
                    key={`${finding.reference.source_index}/${finding.reference.finding_id}`}
                  >
                    <h4>
                      {finding.category} · {finding.location}
                    </h4>
                    <p>
                      Finding {finding.reference.finding_id} · source position{' '}
                      {finding.reference.source_index} · {finding.severity}
                    </p>
                    <p>{finding.observation}</p>
                    <p>Recommendation: {finding.recommendation}</p>
                  </article>
                ))}
                <p>
                  Recorded checklist marks, findings and after-phase
                  documentation do not establish repairs or customer approval.
                </p>
              </section>
            )}
          </section>
          <label>
            Intake review status
            <select
              value={status}
              disabled={busy || !loaded.can_edit}
              onChange={(e) => {
                setStatus(e.target.value);
                setConfirmed(false);
              }}
            >
              {savedRequestStatuses.map((s) => (
                <option value={s} key={s}>
                  {s === 'closed' ? 'closed — intake review only' : s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsible staff
            <select
              value={assignee}
              disabled={busy || !loaded.can_edit}
              onChange={(e) => {
                setAssignee(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">Unassigned</option>
              {loaded.eligible_assignees.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.role} · {m.user_id}
                </option>
              ))}
            </select>
          </label>
          <label className="request-actions-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || !valid}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed this exact request and confirm only its internal intake
            status and responsibility change. No work completion, customer
            approval or communication is authorized.
          </label>
          <button
            disabled={busy || !valid || !confirmed}
            onClick={() => void save()}
          >
            Save exact request review
          </button>
        </div>
      )}
      {loaded && !current && (
        <p role="alert">
          Original request evidence is stale or denied. Prior private fields are
          withheld; the original attempt is not reset.
        </p>
      )}
      {view && (
        <button
          disabled={busy || !observationAccess}
          onClick={() => void reconcile()}
        >
          Observe exact request read only
        </button>
      )}
      {observation && observationAccess && (
        <section aria-label="Exact request observation">
          <p>
            Retained point-in-time observation. Observe the exact request again
            for a later read. This is not proof of its current saved state.
          </p>
          <p>
            {observation.state} · {observation.observed}
          </p>
          <p>
            Replay {observation.replay}; durable receipt{' '}
            {String(observation.durable_receipt)}; native CAS{' '}
            {String(observation.native_cas)}.
          </p>
          {observation.current && (
            <p>
              {observation.current.request_id} · {observation.current.status} ·{' '}
              {observation.current.assigned_to ?? 'Unassigned'}
            </p>
          )}
        </section>
      )}
      <p>
        Required scope verification, physical-completion evidence, customer
        acceptance and warranty remain unverified. Intake status and staff
        documentation do not satisfy them.
      </p>
    </>
  );
}
