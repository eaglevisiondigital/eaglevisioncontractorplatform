import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  reviewScheduleProposalRevision,
  assertScheduleProposalRevisionCurrentNow,
  reconcileScheduleProposalRevision,
  closeScheduleProposalRevision,
  openScheduleProposalRevisionSource,
  type ScheduleProposalRevisionView,
  type ScheduleProposalRevisionInput,
} from '../../lib/workflows/schedule-proposal-revisions';
import './schedule-proposal-revisions.css';

export interface ScheduleProposalRevisionsProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function ScheduleProposalRevisions({
  sources,
  enabled = false,
  onSelectJob,
}: ScheduleProposalRevisionsProps) {
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
      const root = prototypeFields(sources, [
        'company',
        'operations',
        'estimates',
        'property',
        'entries',
        'gate',
      ]);
      check = captureOperatingSources(
        sources,
        root.gate as OperatingSources['gate'],
      ).check;
    } catch {
      /* Withhold every source before mounting the form. */
    }
  const [binding, setBinding] = useState({
    sources,
    admitted,
    check,
    epoch: 0,
  });
  let changed = false;
  if (admitted && check && binding.sources === sources)
    try {
      binding.check?.();
    } catch {
      changed = true;
    }
  if (
    binding.sources !== sources ||
    binding.admitted !== admitted ||
    changed ||
    Boolean(binding.check) !== Boolean(check)
  ) {
    setBinding({ sources, admitted, check, epoch: binding.epoch + 1 });
    return null;
  }
  return admitted && check ? (
    <RevisionForm
      key={binding.epoch}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="schedule-proposal-revisions"
      aria-label="Schedule proposal revisions"
    >
      <h2>Schedule proposal revisions</h2>
      <p>
        {admitted
          ? 'Current authorized sources unavailable. Prior review withheld.'
          : 'Schedule proposal revisions are off. No schedule writer or dispatch enabled.'}
      </p>
    </section>
  );
}
function RevisionForm({
  sources,
  onSelectJob,
}: ScheduleProposalRevisionsProps) {
  const [selected, setSelected] = useState(sources.entries[0].target.job_id!),
    [start, setStart] = useState('11:00'),
    [end, setEnd] = useState('13:00'),
    [hoursStart, setHoursStart] = useState('08:00'),
    [hoursEnd, setHoursEnd] = useState('16:00'),
    [expiration, setExpiration] = useState('30'),
    [confirmed, setConfirmed] = useState(false),
    [view, setView] = useState<ScheduleProposalRevisionView | null>(null),
    [busy, setBusy] = useState(false),
    [hasAttempt, setHasAttempt] = useState(false),
    [hasRetained, setHasRetained] = useState(false),
    [unknown, setUnknown] = useState(false),
    [closed, setClosed] = useState(false),
    [message, setMessage] = useState(''),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openScheduleProposalRevisionSource>
    > | null>(null);
  const active = useRef(true),
    pending = useRef(false),
    generation = useRef(0),
    gate = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    retained = useRef<ScheduleProposalRevisionView | null>(null),
    deadline = useRef<number | null>(null),
    revision = useRef(0),
    heading = useRef<HTMLHeadingElement>(null),
    detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (gate.current) gate.current.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (view) heading.current?.focus();
  }, [view]);
  useEffect(() => {
    if (detail) detailHeading.current?.focus();
  }, [detail]);
  function invalidate() {
    generation.current++;
    if (gate.current) gate.current.confirmed = false;
    if (pending.current) {
      setUnknown(true);
      setMessage(
        'Pending proposal changed / UNKNOWN. Exact retained read-only reconciliation only.',
      );
    } else setMessage('');
    setView(null);
    setDetail(null);
    setConfirmed(false);
  }
  async function review() {
    if (!confirmed || pending.current || unknown || closed) return;
    pending.current = true;
    setBusy(true);
    setView(null);
    setDetail(null);
    const token = ++generation.current,
      g = { enabled: true, confirmed: true };
    gate.current = g;
    try {
      const e = sources.entries.find((e) => e.target.job_id === selected)!;
      const minutes = Number(expiration);
      if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 60)
        throw Error('Expiration must be 1–60 minutes');
      deadline.current ??= Date.now() + minutes * 60_000;
      setHasAttempt(true);
      const original = {
        week_start: e.day,
        timezone: e.timezone,
        proposal: {
          job_id: e.target.job_id!,
          worker_id: e.worker_id,
          source_visit_id: e.scheduled_visit_id,
          day: e.day,
          start: e.day + 'T09:00',
          end: e.day + 'T11:00',
          hours_start: e.day + 'T08:00',
          hours_end: e.day + 'T16:00',
        },
      };
      const input: ScheduleProposalRevisionInput = {
        original,
        proposed: {
          ...original,
          proposal: {
            ...original.proposal,
            start: start ? e.day + 'T' + start : null,
            end: end ? e.day + 'T' + end : null,
            hours_start: hoursStart ? e.day + 'T' + hoursStart : null,
            hours_end: hoursEnd ? e.day + 'T' + hoursEnd : null,
          },
        },
        expected_revision: revision.current,
        expires_at: deadline.current,
      };
      const result = await reviewScheduleProposalRevision(sources, input, g);
      if (active.current && token === generation.current) {
        assertScheduleProposalRevisionCurrentNow(result);
        retained.current = result;
        setHasRetained(true);
        revision.current = result.revision;
        setView(result);
        setMessage(
          'Human proposal revision reviewed. No schedule changed; no browser or server writer connected.',
        );
      }
    } catch {
      if (active.current && token === generation.current) {
        setUnknown(true);
        setMessage(
          'Source, staff, clock or proposal unavailable / UNKNOWN. No replay, new ID or changed-time bypass.',
        );
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!retained.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const r = await reconcileScheduleProposalRevision(retained.current);
      if (active.current && token === generation.current) {
        if (r.status === 'UNKNOWN') {
          setUnknown(true);
          setView(null);
          setDetail(null);
        }
        if (['CANCELLED', 'REVOKED', 'EXPIRED'].includes(r.status)) {
          setClosed(true);
          setView(null);
          setDetail(null);
        }
        setMessage(
          'Exact retained review: ' +
            r.status +
            '. Read only; no replay or replacement.',
        );
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  function close(action: 'CANCEL' | 'REVOKE') {
    if (!view || pending.current) return;
    try {
      const r = closeScheduleProposalRevision(view, action);
      setClosed(true);
      setView(null);
      setDetail(null);
      setMessage(
        'Same-tab proposal review ' +
          r.status +
          '. This withdrawal is irrevocable in this source session. No business schedule changed.',
      );
    } catch {
      setUnknown(true);
      setView(null);
      setDetail(null);
      setMessage(
        'Withdrawal source UNKNOWN. No schedule changed; no replacement attempt.',
      );
    }
  }
  async function open(navigate = false) {
    if (!view || pending.current || (navigate && !detail)) return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const r = await openScheduleProposalRevisionSource(view);
      if (active.current && token === generation.current) {
        assertScheduleProposalRevisionCurrentNow(view);
        setDetail(r);
        if (
          navigate &&
          detail?.job_id === r.job_id &&
          detail.organization_id === r.organization_id
        )
          onSelectJob?.(r.job_id);
      }
    } catch {
      if (active.current && token === generation.current) {
        setUnknown(true);
        setView(null);
        setDetail(null);
        setMessage(
          'Exact source navigation UNKNOWN. Previous detail withheld.',
        );
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  let current = view;
  if (current)
    try {
      assertScheduleProposalRevisionCurrentNow(current);
    } catch {
      current = null;
    }
  if (view && !current && !unknown) {
    setUnknown(true);
    setView(null);
    setDetail(null);
    setMessage(
      'Source, staff, confirmation or expiration changed / UNKNOWN. Previous review withheld.',
    );
    return null;
  }
  const entry = sources.entries.find((e) => e.target.job_id === selected)!;
  return (
    <section
      className="schedule-proposal-revisions"
      aria-label="Schedule proposal revisions"
      aria-busy={busy}
    >
      <header>
        <div>
          <p className="spr-eyebrow">FIELD · HUMAN PROPOSAL REVIEW</p>
          <h2>Schedule proposal revisions</h2>
          <p>
            Compare an original human window with an expiring revision over
            exact existing job, crew and visit sources.
          </p>
        </div>
        <span className="spr-badge">
          Review only · actual availability UNKNOWN
        </span>
      </header>
      <p className="spr-boundary">
        Same-tab human review only. Original proposal 09:00–11:00 and working
        hours 08:00–16:00 are explicit human assumptions. Date-only visits never
        prove availability. The separate disposable server metadata lab is not
        connected to this browser. No schedule, dispatch, work or financial
        authority.
      </p>
      <div className="spr-controls">
        <label>
          Existing job and assigned technician
          <select
            value={selected}
            disabled={busy || hasAttempt || unknown || closed}
            onChange={(e) => {
              invalidate();
              setSelected(e.target.value);
            }}
          >
            {sources.entries.map((e) => (
              <option key={e.target.job_id} value={e.target.job_id!}>
                Job {e.target.job_id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Proposal expiration in minutes (1–60)
          <input
            type="number"
            min="1"
            max="60"
            value={expiration}
            disabled={busy || hasAttempt || unknown || closed}
            onChange={(e) => {
              invalidate();
              setExpiration(e.target.value);
            }}
          />
        </label>
        {(
          [
            ['Revised proposed start', start, setStart],
            ['Revised proposed end', end, setEnd],
            ['Revised proposed working-hours start', hoursStart, setHoursStart],
            ['Revised proposed working-hours end', hoursEnd, setHoursEnd],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label}>
            {label}
            <input
              type="time"
              value={value}
              disabled={unknown || closed}
              onChange={(e) => {
                invalidate();
                set(e.target.value);
              }}
            />
          </label>
        ))}
      </div>
      <p>
        Original recorded visit date: {entry.day}. Plan timezone:{' '}
        {entry.timezone}. Original visit: {entry.scheduled_visit_id}.
      </p>
      <label className="spr-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || unknown || closed}
          onChange={(e) => {
            invalidate();
            setConfirmed(e.target.checked);
          }}
        />
        I confirm this is an expiring human proposal revision, with no schedule
        change or dispatch.
      </label>
      <div className="spr-actions">
        <button
          disabled={!confirmed || busy || unknown || closed}
          onClick={() => void review()}
        >
          {busy
            ? 'Checking exact revision sources…'
            : 'Review schedule proposal revision'}
        </button>
        <button
          disabled={!hasRetained || busy}
          onClick={() => void reconcile()}
        >
          Reconcile exact retained proposal revision
        </button>
      </div>
      <p role={unknown ? 'alert' : 'status'}>{message}</p>
      {current && (
        <>
          <h3 ref={heading} tabIndex={-1}>
            Source-bound proposal revision
          </h3>
          <div className="spr-grid">
            <article className="spr-card">
              <h4>Original and revised human windows</h4>
              <p>
                Local review revision {current.revision} · expires{' '}
                {new Date(current.expires_at).toISOString()}
              </p>
              <dl>
                {(['original', 'proposed'] as const).map((kind) => (
                  <div key={kind}>
                    <dt>
                      {kind === 'original'
                        ? 'Original human window'
                        : 'Revised human window'}
                    </dt>
                    <dd>
                      {current[kind].envelope.start === null
                        ? 'Date-only / UNKNOWN'
                        : new Date(
                            current[kind].envelope.start,
                          ).toISOString()}{' '}
                      →{' '}
                      {current[kind].envelope.end === null
                        ? 'UNKNOWN'
                        : new Date(current[kind].envelope.end).toISOString()}
                    </dd>
                  </div>
                ))}
              </dl>
              <p>
                Times above use UTC; original plan timezone:{' '}
                {current.proposed.envelope.timezone}.
              </p>
              <p>
                Job: {current.proposed.envelope.job_id}. Visit:{' '}
                {current.proposed.envelope.visit_id}. Worker:{' '}
                {current.proposed.envelope.worker_id}.
              </p>
              <p>
                Issued source: {current.proposed.envelope.issued_version_id},
                version {current.proposed.envelope.issued_version_number}.
                Property: {current.proposed.envelope.property_id}.
              </p>
              <button disabled={busy} onClick={() => void open()}>
                Open exact proposal revision source
              </button>
            </article>
            <article className="spr-card">
              <h4>Canonical capacity and limits</h4>
              <p>
                {current.capacity?.planned_minutes ?? 'UNKNOWN'} proposed
                minutes. Capacity:{' '}
                {current.proposed.envelope.canonical_capacity_state}.
              </p>
              <p>
                {current.conflicts.length} recorded conflicts · actual
                availability UNKNOWN.
              </p>
              {current.conflicts.map((c, i) => (
                <p key={i}>
                  {c.kind.replaceAll('_', ' ')} · {c.minutes} minutes
                </p>
              ))}
              <p>Review SHA-256: {current.integrity.sha256}</p>
              <p>
                Source capture is not atomic with global Auth or the separate
                test database. Browser persistence NONE; durable writer NOT
                CONNECTED.
              </p>
              <div className="spr-actions">
                <button disabled={busy} onClick={() => close('CANCEL')}>
                  Cancel same-tab proposal review
                </button>
                <button disabled={busy} onClick={() => close('REVOKE')}>
                  Revoke same-tab proposal review
                </button>
              </div>
            </article>
          </div>
        </>
      )}
      {detail && current && (
        <section
          className="spr-card"
          aria-label="Exact proposal revision source"
        >
          <h3 ref={detailHeading} tabIndex={-1}>
            Exact proposal revision source
          </h3>
          <p>{detail.title}</p>
          <dl>
            {Object.entries(detail).map(([k, v]) => (
              <div key={k}>
                <dt>{k.replaceAll('_', ' ')}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {onSelectJob && (
            <button disabled={busy} onClick={() => void open(true)}>
              Display existing proposal revision job workflow
            </button>
          )}
        </section>
      )}
    </section>
  );
}
