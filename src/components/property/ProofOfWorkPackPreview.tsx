import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CustomerPortalPreviewModel } from '../../lib/customer-preview';
import {
  createPropertyPassportTimeline,
  type PassportTimelineEvent,
  type PropertyPassportTimeline,
} from '../../domain/property/passport-timeline';
import {
  prepareProofOfWorkPack,
  proofOfWorkSourceReference,
  readProofOfWorkPackSource,
  verifyProofOfWorkPack,
  type ProofOfWorkPack,
  type ProofOfWorkPackStatus,
} from '../../domain/property/proof-of-work-pack';
import { PlatformBrand } from '../PlatformBrand';
import './proof-of-work-pack.css';

/** Own identity boundary: callers rerender after synchronous model selection or
 * session changes; no caller key/remount is required to clear retained evidence. */
export function ProofOfWorkPackPreview({
  model,
  enabled = false,
}: {
  model: CustomerPortalPreviewModel;
  enabled?: boolean;
}) {
  const [binding, setBinding] = useState({ model, generation: 0 });
  if (binding.model !== model) {
    setBinding({ model, generation: binding.generation + 1 });
    return null;
  }
  if (!enabled)
    return (
      <section className="proof-pack">
        <h1>Proof of Work preview is off</h1>
        <p>No customer access is enabled.</p>
      </section>
    );
  let context = 'unavailable';
  try {
    if (
      model.repo.operations.sample !== true ||
      model.repo.estimates.sample !== true
    )
      throw Error();
    const c = model.read().context;
    if (
      ![
        c.organization_id,
        c.customer_id,
        c.location_id,
        c.property_label,
      ].every((v) => typeof v === 'string') ||
      c.reports !== true ||
      !Array.isArray(c.version_ids) ||
      !c.version_ids.every((v) => typeof v === 'string')
    )
      throw Error();
    context = JSON.stringify([
      c.organization_id,
      c.customer_id,
      c.location_id,
      c.property_label,
      c.reports,
      ...c.version_ids,
    ]);
  } catch {
    /* Missing current context never retains a prior customer's pack. */
  }
  return <PackView key={`${binding.generation}:${context}`} model={model} />;
}
function SourceBody({
  event,
  level = 4,
}: {
  event: PassportTimelineEvent;
  level?: 3 | 4;
}) {
  const Heading = level === 3 ? 'h3' : 'h4';
  const FindingHeading = level === 3 ? 'h4' : 'h5';
  return event.kind === 'inspection-documentation' ? (
    <>
      <p>
        Report {event.reference.report_id} · published version{' '}
        {event.reference.published_version}
      </p>
      <p>
        Recorded visit date {event.date} · phase {event.report.phase}
      </p>
      <p>Published {event.published_at}</p>
      <p>{event.report.summary}</p>
      <Heading>Factual observations</Heading>
      {!event.report.observations.length && <p>No observations documented.</p>}
      {event.report.observations.map((o) => (
        <article key={o.reference.source_index}>
          <FindingHeading>
            {o.category} · {o.location} · reported {o.severity}
          </FindingHeading>
          <p>
            Finding {o.reference.finding_id} · source position{' '}
            {o.reference.source_index + 1}
          </p>
          <p>{o.observation}</p>
          <p>
            <strong>Maintenance recommendation:</strong> {o.recommendation}
          </p>
        </article>
      ))}
      <Heading>Recorded checklist</Heading>
      {!event.report.checklist.length && <p>No checklist items documented.</p>}
      {event.report.checklist.map((c) => (
        <p key={c.reference.source_index}>
          {c.label}:{' '}
          {c.recorded_completed ? 'Recorded checked' : 'Recorded unchecked'} ·
          source position {c.reference.source_index + 1}
        </p>
      ))}
      <p>
        Related job:{' '}
        {event.job_link_status === 'EXACT'
          ? event.linked_jobs[0].job_id
          : 'UNKNOWN — no single exact association'}
      </p>
    </>
  ) : (
    <>
      <p>
        Job {event.reference.job_id} · estimate {event.reference.estimate_id}
      </p>
      <p>
        Issued version {event.reference.issued_version_number} · version ID{' '}
        {event.reference.issued_version_id}
      </p>
      <p>
        Issued {event.issued_at} · UTC date {event.date}
      </p>
      <p>{event.job.issued_source.scope.description}</p>
      {event.job.issued_source.scope.lines.map((line) => (
        <p key={line.id}>
          {line.description} · {line.quantity_milli / 1000} {line.unit} · line{' '}
          {line.id}
        </p>
      ))}
      <p>
        Available linked reports: {event.job.documentation.reports.length}.
        Other relationships remain UNKNOWN.
      </p>
    </>
  );
}
function title(event: PassportTimelineEvent) {
  return event.kind === 'inspection-documentation'
    ? event.report.summary
    : event.job.issued_source.scope.name;
}
function PackView({ model }: { model: CustomerPortalPreviewModel }) {
  const [timeline, setTimeline] = useState<PropertyPassportTimeline | null>(
    null,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [pack, setPack] = useState<ProofOfWorkPack | null>(null);
  const [status, setStatus] =
    useState<ProofOfWorkPackStatus['status']>('UNKNOWN');
  const [detail, setDetail] = useState<PassportTimelineEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const epoch = useRef(0),
    alive = useRef(true),
    confirmation = useRef(false);
  const packetHeading = useRef<HTMLHeadingElement>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const lifecycleEpoch = epoch;
    alive.current = true;
    return () => {
      alive.current = false;
      confirmation.current = false;
      lifecycleEpoch.current++;
    };
  }, []);
  useEffect(() => {
    if (pack) packetHeading.current?.focus();
  }, [pack]);
  useEffect(() => {
    if (detail) sourceHeading.current?.focus();
  }, [detail]);
  function start(text: string) {
    const attempt = ++epoch.current;
    setBusy(true);
    setMessage(text);
    setError(false);
    setDetail(null);
    return attempt;
  }
  function current(attempt: number) {
    return alive.current && attempt === epoch.current;
  }
  function failure(attempt: number) {
    if (!current(attempt)) return;
    setBusy(false);
    setError(true);
    setStatus('UNKNOWN');
    setMessage(
      'Exact authorized documentation is unavailable or changed — UNKNOWN. No replacement source was selected.',
    );
  }
  async function load() {
    const attempt = start('Loading currently authorized evidence…');
    setTimeline(null);
    setSelected([]);
    setConfirmed(false);
    confirmation.current = false;
    try {
      const c = model.read().context;
      const t = await createPropertyPassportTimeline(
        model,
        {
          organization_id: c.organization_id,
          customer_id: c.customer_id,
          location_id: c.location_id,
        },
        { enabled: true },
      );
      if (!current(attempt)) return;
      setTimeline(t);
      setBusy(false);
      setMessage(
        `${t.snapshot.events.length} available evidence items. Coverage remains UNKNOWN.`,
      );
      if (pack)
        setStatus(
          t.integrity.sha256 === pack.reference.timeline_sha256
            ? 'CURRENT'
            : 'STALE',
        );
    } catch {
      failure(attempt);
    }
  }
  async function prepare() {
    if (!timeline || !confirmed || !selected.length) return;
    const attempt = start('Preparing selected documentation…');
    const admission = { enabled: true };
    const selection = {
      timeline_sha256: timeline.integrity.sha256,
      sources: timeline.snapshot.events
        .filter((e) => selected.includes(e.source_sha256))
        .map(proofOfWorkSourceReference),
      confirmed: true,
    };
    // The original selection/confirmation is kept live across all reader/hash waits.
    const cancel = () => {
      selection.confirmed = false;
      admission.enabled = false;
    };
    livePreparation.current = cancel;
    try {
      const s = timeline.snapshot;
      const result = await prepareProofOfWorkPack(
        model,
        {
          organization_id: s.organization_id,
          customer_id: s.customer_id,
          location_id: s.location_id,
        },
        selection,
        admission,
      );
      if (!current(attempt) || !confirmation.current) return;
      setPack(result);
      setStatus('CURRENT');
      setBusy(false);
      setMessage(
        'Immutable local documentation snapshot prepared. Nothing was sent.',
      );
    } catch {
      failure(attempt);
    } finally {
      if (livePreparation.current === cancel) livePreparation.current = null;
    }
  }
  const livePreparation = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      livePreparation.current?.();
    },
    [],
  );
  async function verify() {
    if (!pack) return;
    const attempt = start('Checking exact retained pack binding…');
    const result = await verifyProofOfWorkPack(model, pack.reference, {
      enabled: true,
    });
    if (!current(attempt)) return;
    setStatus(result.status);
    setBusy(false);
    setMessage(
      `Pack status: ${result.status}. Snapshot contents remain unchanged.`,
    );
  }
  async function open(event: PassportTimelineEvent) {
    if (!pack) return;
    const attempt = start('Reading exact selected source…');
    const result = await readProofOfWorkPackSource(
      model,
      pack.reference,
      proofOfWorkSourceReference(event),
      { enabled: true },
    );
    if (!current(attempt)) return;
    setBusy(false);
    if (result.status === 'AVAILABLE') {
      setDetail(result.evidence);
      setMessage('Exact current source opened.');
    } else failure(attempt);
  }
  return (
    <main
      className="proof-pack"
      style={{ '--proof-color': model.company.primary_color } as CSSProperties}
    >
      <header className="proof-pack__header">
        <p className="proof-pack__eyebrow">{model.company.name}</p>
        <h1>Proof of Work</h1>
        <p>
          Prepare a clear property documentation pack from the exact reports and
          issued job scope you select.
        </p>
        <span className="proof-pack__badge">
          Synthetic local preview · documentation only
        </span>
      </header>
      <section
        className="proof-pack__overview"
        aria-label="Property documentation overview"
      >
        <div>
          <p className="proof-pack__eyebrow">Your property</p>
          <h2>
            {timeline?.snapshot.property_label ??
              'Load authorized property evidence'}
          </h2>
          <p>Available documentation only. Historical coverage is unknown.</p>
        </div>
        <button disabled={busy} onClick={() => void load()}>
          Load available evidence
        </button>
      </section>
      <p className="proof-pack__notice">
        Reported observations and checked items do not verify physical
        completion, customer acceptance or warranty. Recorded visit dates and
        issued UTC dates do not establish same-day chronology.
      </p>
      {message && (
        <p role={error ? 'alert' : 'status'} aria-live="polite">
          {message}
        </p>
      )}
      {timeline && (
        <section
          aria-label="Select documentation"
          className="proof-pack__selection"
        >
          <h2>Select exact source evidence</h2>
          <p>
            Select one to twenty items, then confirm this selection before
            preparing. No automatic inclusion or sending.
          </p>
          {!timeline.snapshot.events.length && (
            <div className="proof-pack__empty">
              <h3>No available documentation</h3>
              <p>
                Missing or access-limited records do not establish that no work
                occurred.
              </p>
            </div>
          )}
          <div className="proof-pack__cards">
            {timeline.snapshot.events.map((event, index) => (
              <article className="proof-pack__card" key={event.source_sha256}>
                <label className="proof-pack__check">
                  <input
                    type="checkbox"
                    data-source-kind={event.kind}
                    disabled={busy}
                    checked={selected.includes(event.source_sha256)}
                    onChange={(e) => {
                      setSelected(
                        e.target.checked
                          ? [...selected, event.source_sha256]
                          : selected.filter((id) => id !== event.source_sha256),
                      );
                      setConfirmed(false);
                      confirmation.current = false;
                    }}
                    aria-label={`Select evidence ${index + 1}: ${title(event)}`}
                  />
                  <span>
                    <span className="proof-pack__badge">
                      {event.kind === 'inspection-documentation'
                        ? 'Published inspection'
                        : 'Issued job scope'}
                    </span>
                    <strong>{title(event)}</strong>
                  </span>
                </label>
                <p>
                  {event.date} ·{' '}
                  {event.date_meaning === 'recorded-visit-date'
                    ? 'Recorded visit date'
                    : 'Issued scope UTC date'}
                </p>
                <p>
                  {event.kind === 'inspection-documentation'
                    ? `Report ${event.reference.report_id} · published version ${event.reference.published_version}`
                    : `Job ${event.reference.job_id} · issued version ${event.reference.issued_version_number}`}
                </p>
              </article>
            ))}
          </div>
          {!!timeline.snapshot.events.length && (
            <div className="proof-pack__actions">
              <p>{selected.length} selected</p>
              <label className="proof-pack__check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => {
                    setConfirmed(e.target.checked);
                    confirmation.current = e.target.checked;
                    if (!e.target.checked) livePreparation.current?.();
                  }}
                />
                <span>
                  I confirm the selected source evidence for this local
                  documentation pack.
                </span>
              </label>
              <button
                disabled={
                  busy ||
                  !confirmed ||
                  selected.length < 1 ||
                  selected.length > 20
                }
                onClick={() => void prepare()}
              >
                Prepare documentation pack
              </button>
            </div>
          )}
        </section>
      )}
      {pack && status !== 'UNKNOWN' && (
        <section
          className="proof-pack__packet"
          aria-label="Immutable documentation pack"
        >
          <header>
            <p className="proof-pack__eyebrow">Detached local snapshot</p>
            <h2 tabIndex={-1} ref={packetHeading}>
              Property documentation pack
            </h2>
            <p>
              {pack.snapshot.contractor.name} · {pack.snapshot.property_label}
            </p>
            <span className="proof-pack__badge">
              {status} — documentation only
            </span>
            <button disabled={busy} onClick={() => void verify()}>
              Verify exact retained pack
            </button>
          </header>
          <p>
            No delivery, acceptance, verified completion or warranty is
            established.
          </p>
          <div className="proof-pack__media">
            <h3>Photos and media — UNAVAILABLE</h3>
            <p>
              The authorized report projection has no media. No file bytes,
              storage paths or download links were retrieved.
            </p>
          </div>
          {pack.snapshot.events.map((event) => (
            <article key={event.source_sha256} className="proof-pack__evidence">
              <h3>{title(event)}</h3>
              <SourceBody event={event} />
              <p className="proof-pack__digest">
                Source SHA-256 {event.source_sha256}
              </p>
              <button
                disabled={busy || status !== 'CURRENT'}
                onClick={() => void open(event)}
                aria-label={`Open exact source · ${event.kind === 'inspection-documentation' ? `report ${event.reference.report_id} version ${event.reference.published_version}` : `job ${event.reference.job_id} version ${event.reference.issued_version_number}`}`}
              >
                Open exact source
              </button>
            </article>
          ))}
          <details>
            <summary>Pack identity and integrity</summary>
            <p className="proof-pack__digest">Pack {pack.reference.pack_id}</p>
            <p className="proof-pack__digest">
              SHA-256 {pack.integrity.sha256}
            </p>
            <p className="proof-pack__digest">
              Original timeline {pack.snapshot.timeline_sha256}
            </p>
            <p>
              Property {pack.snapshot.location_id} · customer{' '}
              {pack.snapshot.customer_id}
            </p>
            <p>
              In-memory snapshot only. Refresh, process loss or a new tab does
              not retain custody. A hash proves content fidelity, not truth or
              authority.
            </p>
          </details>
        </section>
      )}
      {detail && (
        <section
          className="proof-pack__source"
          aria-label="Exact selected source"
        >
          <h2 tabIndex={-1} ref={sourceHeading}>
            Exact{' '}
            {detail.kind === 'inspection-documentation'
              ? 'published report'
              : 'issued job scope'}
          </h2>
          <SourceBody event={detail} level={3} />
          <p className="proof-pack__digest">
            Source SHA-256 {detail.source_sha256}
          </p>
          <button onClick={() => setDetail(null)}>Close exact source</button>
        </section>
      )}
      <footer>
        <p>
          Documentation never creates contracts, work authorization, invoices or
          payment obligations. Nothing is sent or published.
        </p>
        <PlatformBrand transparent href="#" />
      </footer>
    </main>
  );
}
