import { useEffect, useRef, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import {
  assertSavedRevisionAccess,
  createSavedRevisionSelection,
  readSavedRevisionSelection,
  type SavedRevisionSelection,
} from '../../lib/workflows/saved-revision-runtime';
import {
  readMaintenanceSavedRevision,
  assertMaintenanceSavedRevisionCurrent,
  adoptMaintenanceSavedRevision,
  compareMaintenanceSavedRevisions,
  type MaintenanceSavedEvidence,
  type MaintenanceSavedSnapshot,
} from '../../lib/workflows/maintenance-saved-revisions';
import { SharedRecordSearch } from './SharedRecordSearch';
import './maintenance-saved-revisions.css';
export function MaintenanceSavedRevisions(props: SavedRevisionPanelProps) {
  let admitted = false;
  if (
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    })
  ) {
    try {
      const c = captureOperatingSources(props.sources, {
        enabled: true,
        confirmed: true,
      });
      admitted =
        props.selectedJobId === undefined ||
        c.entries.some((e) => e.target.job_id === props.selectedJobId);
      c.check();
    } catch {
      /* Previous details are withheld after source/access changes. */
    }
  }
  const [context, setContext] = useState({
    sources: props.sources,
    job: props.selectedJobId,
    admitted,
    epoch: 0,
  });
  if (
    context.sources !== props.sources ||
    context.job !== props.selectedJobId ||
    context.admitted !== admitted
  ) {
    setContext({
      sources: props.sources,
      job: props.selectedJobId,
      admitted,
      epoch: context.epoch + 1,
    });
    return null;
  }
  if (!admitted)
    return (
      <section
        className="maintenance-saved-revisions"
        aria-label="Saved maintenance revisions"
      >
        <h2>Saved maintenance revisions</h2>
        <p role="status">
          Saved maintenance review is off or exact current source access is
          unavailable.
        </p>
      </section>
    );
  if (!props.selectedJobId)
    return (
      <section
        className="maintenance-saved-revisions"
        aria-label="Saved maintenance revisions"
      >
        <h2>Saved maintenance revisions</h2>
        <p>Select an exact authorized job using shared record search.</p>
        <SharedRecordSearch {...props} />
      </section>
    );
  return (
    <Review
      key={context.epoch}
      {...props}
      selectedJobId={props.selectedJobId}
    />
  );
}
function Review({
  sources,
  selectedJobId,
}: SavedRevisionPanelProps & { selectedJobId: string }) {
  const day = sources.entries.find(
    (e) => e.target.job_id === selectedJobId,
  )!.day;
  const [snapshot, setSnapshot] = useState<MaintenanceSavedSnapshot>(),
    [selection, setSelection] =
      useState<SavedRevisionSelection<MaintenanceSavedEvidence>>(),
    [comparison, setComparison] =
      useState<ReturnType<typeof compareMaintenanceSavedRevisions>>(),
    [confirmed, setConfirmed] = useState(false),
    [query, setQuery] = useState(''),
    [kind, setKind] = useState('all'),
    [from, setFrom] = useState(day),
    [through, setThrough] = useState(
      Temporal.PlainDate.from(day).add({ days: 28 }).toString(),
    ),
    [channel, setChannel] = useState<'email' | 'sms'>('email'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Read current saved plans, exact follow-up sources and recorded channel evidence. No messages or enrollments are created.',
    );
  const gate = useRef({ enabled: true, confirmed: true }),
    live = useRef(true),
    pending = useRef(false),
    serial = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const g = gate.current,
      epoch = serial;
    live.current = true;
    g.enabled = true;
    g.confirmed = true;
    return () => {
      live.current = false;
      g.enabled = false;
      g.confirmed = false;
      epoch.current++;
    };
  }, []);
  let accessible = true,
    stale = false;
  if (snapshot)
    try {
      assertSavedRevisionAccess(snapshot);
    } catch {
      accessible = false;
    }
  if (snapshot && accessible)
    try {
      assertMaintenanceSavedRevisionCurrent(snapshot);
    } catch {
      stale = true;
    }
  async function read(updates: boolean) {
    if (pending.current || !accessible) return;
    pending.current = true;
    const token = ++serial.current;
    setBusy(true);
    setConfirmed(false);
    setComparison(undefined);
    try {
      if (updates && snapshot) assertSavedRevisionAccess(snapshot);
      const next = await readMaintenanceSavedRevision(
        sources,
        selectedJobId,
        gate.current,
        { from, through, as_of: day + 'T12:00:00Z', channel },
      );
      if (!live.current || token !== serial.current) return;
      assertMaintenanceSavedRevisionCurrent(next);
      if (updates && snapshot) {
        setComparison(compareMaintenanceSavedRevisions(snapshot, next));
        setMessage(
          'Inspect exact saved differences. Adoption changes this maintenance review selection only.',
        );
      } else {
        setSelection(createSavedRevisionSelection(next));
        setSnapshot(next);
        setMessage(
          'Saved maintenance evidence captured. Source updates require an explicit read and confirmation.',
        );
      }
      heading.current?.focus();
    } catch {
      if (live.current && token === serial.current)
        setMessage(
          'UNKNOWN — exact saved maintenance evidence could not be verified. No action was replayed and no source was adopted.',
        );
    } finally {
      pending.current = false;
      if (live.current && token === serial.current) setBusy(false);
    }
  }
  async function adopt() {
    if (!selection || !comparison || pending.current || !confirmed) return;
    pending.current = true;
    const token = ++serial.current;
    setBusy(true);
    try {
      const selected = readSavedRevisionSelection(selection),
        next = await adoptMaintenanceSavedRevision(
          selection,
          comparison,
          selected.generation,
          confirmed,
        );
      if (!live.current || token !== serial.current) return;
      setSnapshot(next.snapshot as MaintenanceSavedSnapshot);
      setComparison(undefined);
      setConfirmed(false);
      setMessage(
        'Confirmed saved maintenance revision adopted for local review only. Original snapshot evidence remains unchanged.',
      );
      heading.current?.focus();
    } catch {
      if (!live.current || token !== serial.current) return;
      setConfirmed(false);
      setMessage(
        'UNKNOWN — duplicate, stale or revoked selection. No saved revision was adopted.',
      );
    } finally {
      pending.current = false;
      if (live.current && token === serial.current) setBusy(false);
    }
  }
  const evidence = snapshot?.evidence,
    occurrences = evidence?.occurrences.filter(
      (o) =>
        (kind === 'all' || o.kind === kind) &&
        [o.id, o.kind, o.due_on, o.source.plan_id]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    );
  return (
    <section
      className="maintenance-saved-revisions"
      aria-label="Saved maintenance revisions"
      aria-busy={busy}
    >
      <h2 ref={heading} tabIndex={-1}>
        Saved maintenance revisions
      </h2>
      <p>
        Local saved-source review · purpose consent, suppression and enrollment
        UNVERIFIED · sending BLOCKED.
      </p>
      <p role="status">
        {!accessible
          ? 'Current source access unavailable. Historical details withheld.'
          : message}
      </p>
      {accessible && (
        <>
          <div className="maintenance-saved-revisions-grid">
            <label>
              Maintenance review from
              <input
                type="date"
                value={from}
                disabled={!!snapshot || busy}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Maintenance review through
              <input
                type="date"
                value={through}
                disabled={!!snapshot || busy}
                onChange={(e) => setThrough(e.target.value)}
              />
            </label>
            <label>
              Recorded channel context
              <select
                value={channel}
                disabled={!!snapshot || busy}
                onChange={(e) => setChannel(e.target.value as 'email' | 'sms')}
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !!snapshot}
            onClick={() => void read(false)}
          >
            Read current saved maintenance evidence
          </button>
          {snapshot && (
            <>
              <h3>{evidence!.title}</h3>
              <p className="maintenance-saved-revisions-source">
                Job {snapshot.identity.job_id} · property{' '}
                {snapshot.identity.location_id}
              </p>
              <p>
                {stale
                  ? 'Saved source changed. This snapshot is historical until a new read is confirmed.'
                  : 'Current saved plan and follow-up snapshot verified; recorded contact is captured, not atomic sending authority.'}{' '}
                Recurrence and review status never verify physical work, renewal
                or customer authorization.
              </p>
              <h3>Saved plans and staff follow-up</h3>
              <div className="maintenance-saved-revisions-grid">
                {evidence!.plans.map((p) => (
                  <article key={p.id}>
                    <strong>
                      {p.name} · revision {p.revision}
                    </strong>
                    <p>
                      {p.cadence} · anchored {p.starts_on} · {p.timezone}
                    </p>
                    <code>{p.id}</code>
                  </article>
                ))}
              </div>
              <ul>
                {evidence!.followups.map((f) => (
                  <li key={f.id}>
                    {f.priority} · {f.review} · revision {f.revision} ·
                    follow-up {f.follow_up_on || 'not recorded'}
                    <p className="maintenance-saved-revisions-source">
                      Report {f.source.report_id} version{' '}
                      {f.source.report_version} · finding {f.source.finding_id}
                    </p>
                  </li>
                ))}
              </ul>
              <label>
                Search saved occurrences
                <input
                  value={query}
                  maxLength={200}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                Occurrence kind
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="all">All recorded kinds</option>
                  <option value="inspection_occurrence">
                    Inspection occurrence
                  </option>
                  <option value="staff_follow_up">Staff follow-up</option>
                </select>
              </label>
              <p>
                {occurrences!.length} matching available occurrences; complete
                history is UNKNOWN. Recorded channel:{' '}
                {evidence!.recorded_channel.state}.
              </p>
              {occurrences!.length ? (
                <ul>
                  {occurrences!.map((o) => (
                    <li key={o.id}>
                      {o.due_on} · {o.kind} · {o.planning_status}
                      <p className="maintenance-saved-revisions-source">
                        Plan {o.source.plan_id} revision{' '}
                        {o.source.plan_revision}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No recorded occurrences match this available source view.</p>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void read(true)}
              >
                Read saved maintenance updates
              </button>
              {comparison && (
                <section aria-label="Maintenance saved revision comparison">
                  <h3>Before and current saved maintenance evidence</h3>
                  <p>
                    {comparison.comparison.changed
                      ? 'Observed saved differences'
                      : 'No observed saved differences'}
                    . Recorded channel changed:{' '}
                    {comparison.differences.recorded_channel_changed
                      ? 'yes'
                      : 'no'}
                    .
                  </p>
                  {(['plans', 'followups', 'occurrences'] as const).map(
                    (group) => (
                      <div key={group}>
                        <h4>{group}</h4>
                        {comparison.differences[group].map((d) => (
                          <article key={d.id}>
                            <strong>{d.state}</strong>
                            <p className="maintenance-saved-revisions-source">
                              {d.id}
                            </p>
                            <div className="maintenance-saved-revisions-grid">
                              <details>
                                <summary>Before recorded evidence</summary>
                                <pre>{JSON.stringify(d.before, null, 2)}</pre>
                              </details>
                              <details>
                                <summary>Current recorded evidence</summary>
                                <pre>{JSON.stringify(d.current, null, 2)}</pre>
                              </details>
                            </div>
                          </article>
                        ))}
                      </div>
                    ),
                  )}
                  <p>
                    Changed revision occurrence keys remain separate; missing
                    evidence never means completed, renewed or suppressed.
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />{' '}
                    I reviewed these exact saved maintenance revisions and
                    confirm local review adoption.
                  </label>
                  <button
                    type="button"
                    disabled={!confirmed || busy}
                    onClick={() => void adopt()}
                  >
                    Adopt saved maintenance revision for review
                  </button>
                </section>
              )}
              <details>
                <summary>Snapshot identity and integrity</summary>
                <p className="maintenance-saved-revisions-source">
                  SHA-256 {snapshot.sha256}
                </p>
                <p>
                  Same-tab read-only selection. No recipient, provider request,
                  sender, enrollment or financial authority.
                </p>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
