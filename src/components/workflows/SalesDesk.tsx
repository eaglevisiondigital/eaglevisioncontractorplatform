import { useEffect, useRef, useState } from 'react';
import { formatMinor } from '../../domain/estimating/calculation';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import {
  contractPreparationChecks,
  type ContractPreparationCheck,
} from '../../lib/sales-contract-preparation';
import {
  prepareSalesDesk,
  readSalesDesk,
  reconcileSalesDesk,
  type SalesDeskConfirmation,
  type SalesDeskPacket,
  type SalesDeskSelection,
  type SalesDeskView,
} from '../../lib/workflows/sales-desk';
import './sales-desk.css';

export interface SalesDeskProps {
  sources: LocalJourney;
  enabled?: boolean;
}
/** Default-off, staff-only composition inside Main's explicit synthetic journey. */
export function SalesDesk(props: SalesDeskProps) {
  const signature = JSON.stringify({
    target: props.sources.target,
    intake: props.sources.intake_request_id,
    offer: props.sources.offer_id,
    receipt: props.sources.receipt_id,
    visit: props.sources.scheduled_visit_id,
    report: props.sources.visit_id,
    worker: props.sources.worker_id,
    enabled: props.enabled,
  });
  const [binding, bind] = useState({
    sources: props.sources,
    signature,
    generation: 0,
  });
  if (binding.sources !== props.sources || binding.signature !== signature) {
    bind({
      sources: props.sources,
      signature,
      generation: binding.generation + 1,
    });
    return null;
  }
  return props.enabled === true && props.sources.estimates.sample === true ? (
    <Desk key={binding.generation} sources={props.sources} />
  ) : null;
}
function Desk({ sources }: { sources: LocalJourney }) {
  const [visit, setVisit] = useState(sources.scheduled_visit_id),
    [note, setNote] = useState(
      'Review the recorded appointment alongside this exact issued scope.',
    );
  const [view, setView] = useState<SalesDeskView>(),
    [packet, setPacket] = useState<SalesDeskPacket>(),
    [checks, setChecks] = useState<
      Partial<Record<ContractPreparationCheck, boolean>>
    >({}),
    [association, setAssociation] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [held, setHeld] = useState(false),
    [attempted, setAttempted] = useState(false),
    [state, setState] = useState<string>();
  const life = useRef({ active: true }),
    gate = useRef({ enabled: true, confirmed: true }),
    pending = useRef<SalesDeskSelection | undefined>(undefined),
    confirmation = useRef<SalesDeskConfirmation | undefined>(undefined),
    attempt = useRef(false);
  useEffect(() => {
    const activeLife = life.current,
      activeGate = gate.current;
    activeLife.active = true;
    activeGate.enabled = true;
    return () => {
      activeLife.active = false;
      activeGate.enabled = false;
      if (confirmation.current) confirmation.current.confirmed = false;
    };
  }, []);
  function invalidate() {
    if (pending.current) pending.current.review_note = '';
    if (confirmation.current) confirmation.current.confirmed = false;
    setView(undefined);
    setPacket(undefined);
    setChecks({});
    setAssociation(false);
    setConfirmed(false);
    setError(undefined);
    setState(undefined);
  }
  async function read() {
    if (busy) return;
    setBusy(true);
    setView(undefined);
    setError(undefined);
    setConfirmed(false);
    const input: SalesDeskSelection = {
      intake_request_id: sources.intake_request_id,
      offer_id: sources.offer_id,
      receipt_id: sources.receipt_id,
      visit_id: visit,
      worker_id: sources.worker_id,
      review_note: note,
    };
    pending.current = input;
    try {
      const value = await readSalesDesk(sources, input, gate.current);
      if (!life.current.active || pending.current !== input) return;
      setView(value);
    } catch {
      if (life.current.active)
        setError(
          'Exact sources are unavailable or changed. No replacement booking, scope or receipt was selected.',
        );
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  const all = (
    Object.keys(contractPreparationChecks) as ContractPreparationCheck[]
  ).every((k) => checks[k] === true);
  async function prepare() {
    if (
      !view ||
      busy ||
      attempt.current ||
      held ||
      !all ||
      !association ||
      !confirmed
    )
      return;
    attempt.current = true;
    setAttempted(true);
    setBusy(true);
    const input: SalesDeskConfirmation = {
      confirmed: true,
      association_confirmed: true,
      checks: { scope: true, preference: true, terms: true, boundaries: true },
    };
    confirmation.current = input;
    try {
      const value = await prepareSalesDesk(view, input);
      if (!life.current.active) return;
      setPacket(value);
      setState('CURRENT_REVIEW_ONLY');
      setConfirmed(false);
    } catch {
      if (life.current.active) {
        setHeld(true);
        setView(undefined);
        setError(
          'UNKNOWN — preparation is held. No retry or replacement is permitted; no contract or booking was created.',
        );
      }
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  async function inspect() {
    if (!packet || busy) return;
    setBusy(true);
    const result = await reconcileSalesDesk(packet);
    if (!life.current.active) return;
    setBusy(false);
    setState(result.status);
    if (result.status === 'UNKNOWN') {
      setHeld(true);
      setView(undefined);
    }
  }
  return (
    <section className="sales-desk" aria-label="Booking and scope review">
      <div className="sales-desk-heading">
        <span className="eyebrow">Sales desk · staff review</span>
        <h2>Booking and scope review</h2>
        <p>
          Review the recorded appointment, original request and exact issued
          scope together. Preparation creates a staff snapshot only.
        </p>
      </div>
      <div className="sales-desk-controls">
        <label>
          Recorded appointment
          <select
            value={visit}
            disabled={busy || attempted}
            onChange={(e) => {
              invalidate();
              setVisit(e.target.value);
            }}
          >
            <option value={sources.scheduled_visit_id}>
              Planned property visit
            </option>
            <option value={sources.visit_id}>Published inspection visit</option>
          </select>
        </label>
        <label>
          Scheduling review note
          <textarea
            value={note}
            maxLength={200}
            disabled={busy || attempted}
            onChange={(e) => {
              invalidate();
              setNote(e.target.value);
            }}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy || !note.trim() || attempted}
        onClick={() => void read()}
      >
        Review booking and exact scope
      </button>
      {busy && <p role="status">Checking current recorded sources…</p>}
      {error && <p role="alert">{error}</p>}
      {view && (
        <>
          <div className="sales-desk-grid">
            <section aria-label="Recorded appointment evidence">
              <h3>Recorded appointment</h3>
              <p>
                {view.appointment.date} · {view.appointment.timezone}
              </p>
              <dl>
                <dt>Visit / revision</dt>
                <dd>
                  {view.appointment.visit_id} /{' '}
                  {view.appointment.visit_revision}
                </dd>
                <dt>Plan / revision</dt>
                <dd>
                  {view.appointment.plan_id} / {view.appointment.plan_revision}
                </dd>
                <dt>Assigned technician reference</dt>
                <dd>{view.appointment.worker_id}</dd>
                <dt>Actual availability</dt>
                <dd>
                  UNKNOWN — date-only evidence; no timed booking or dispatch.
                </dd>
              </dl>
              <p>{view.appointment.review_note}</p>
            </section>
            <section aria-label="Exact source handoff">
              <h3>Issued scope and request</h3>
              <p>
                {view.source.scope.company.name} ·{' '}
                {view.source.scope.customer.display_name}
              </p>
              <p>{view.source.scope.location?.address_line1}</p>
              <p>{view.lead.summary}</p>
              <dl>
                <dt>Original request</dt>
                <dd>{view.lead.id}</dd>
                <dt>Property</dt>
                <dd>{view.target.location_id}</dd>
                <dt>Issued estimate / version</dt>
                <dd>
                  {view.source.estimate_number} / {view.source.version_number} ·{' '}
                  {view.source.version_id}
                </dd>
                <dt>Accepted LOCAL-TEST receipt</dt>
                <dd>{view.receipt.id}</dd>
                <dt>Canonical customer total</dt>
                <dd>
                  {formatMinor(
                    view.source.scope.total_minor,
                    view.source.scope.currency,
                  )}
                </dd>
              </dl>
            </section>
          </div>
          <details>
            <summary>Exact issued scope and recorded terms</summary>
            <p>{view.source.scope.project.description}</p>
            <ul>
              {view.source.scope.lines.map((line, i) => (
                <li key={i}>
                  {line.description} · {line.quantity_milli / 1000} {line.unit}{' '}
                  · {formatMinor(line.amount_minor, view.source.scope.currency)}
                </li>
              ))}
            </ul>
            <p>{view.source.scope.notes}</p>
            <p>{view.source.scope.terms}</p>
          </details>
          <fieldset disabled={busy || attempted || held}>
            <legend>Confirm the exact source handoff</legend>
            <label>
              <input
                type="checkbox"
                checked={association}
                onChange={(e) => {
                  setAssociation(e.target.checked);
                  setConfirmed(false);
                }}
              />
              I explicitly selected these existing request, appointment and
              estimate records for this customer and property. The estimate has
              no recorded lead link.
            </label>
            {(
              Object.entries(contractPreparationChecks) as [
                ContractPreparationCheck,
                string,
              ][]
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={checks[key] === true}
                  onChange={(e) => {
                    setChecks({ ...checks, [key]: e.target.checked });
                    setConfirmed(false);
                  }}
                />
                {label}
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={!all || !association}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Prepare this exact booking-to-contract staff review snapshot.
            </label>
          </fieldset>
          <button
            type="button"
            disabled={
              busy || attempted || held || !all || !association || !confirmed
            }
            onClick={() => void prepare()}
          >
            Prepare booking-to-contract staff snapshot
          </button>
        </>
      )}
      {packet && (
        <section
          className="sales-desk-packet"
          aria-label="Booking-to-contract staff snapshot"
        >
          <h3>Booking-to-contract staff snapshot</h3>
          <p role="status">
            {state} · Contract execution BLOCKED · appointment unchanged.
          </p>
          {state !== 'UNKNOWN' && (
            <dl>
              <dt>Exact issued version</dt>
              <dd>{packet.review.source.version_id}</dd>
              <dt>Original receipt</dt>
              <dd>{packet.review.receipt.id}</dd>
              <dt>Appointment / revision</dt>
              <dd>
                {packet.review.appointment.visit_id} /{' '}
                {packet.review.appointment.visit_revision}
              </dd>
              <dt>SHA-256 integrity</dt>
              <dd>{packet.integrity.sha256}</dd>
            </dl>
          )}
          <button type="button" disabled={busy} onClick={() => void inspect()}>
            Inspect exact retained sales snapshot
          </button>
        </section>
      )}
      <p className="sales-desk-boundary">
        Staff-only, same-tab local evidence. Accepted test preference is not
        genuine customer approval. No booking, assignment, contract, signature,
        delivery or payment action.
      </p>
    </section>
  );
}
