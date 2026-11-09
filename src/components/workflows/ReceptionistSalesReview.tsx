import { useEffect, useRef, useState } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { receptionistSalesSource } from './receptionist-sales-source';

export function ReceptionistSalesReview({
  sources,
}: {
  sources: LocalJourney;
}) {
  const signature = JSON.stringify([
    sources.target,
    sources.intake_request_id,
    sources.gate,
  ]);
  const [binding, bind] = useState({ sources, signature, generation: 0 });
  if (binding.sources !== sources || binding.signature !== signature) {
    bind({ sources, signature, generation: binding.generation + 1 });
    return null;
  }
  return <Review key={binding.generation} sources={sources} />;
}
function Review({ sources }: { sources: LocalJourney }) {
  const [selection, setSelection] =
    useState<Awaited<ReturnType<typeof receptionistSalesSource>>>();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [note, setNote] = useState(''),
    [error, setError] = useState('');
  const life = useRef(true);
  useEffect(() => {
    life.current = true;
    return () => {
      life.current = false;
    };
  }, []);
  let current = false;
  try {
    selection?.check();
    current = !!selection;
  } catch {
    /* Withhold stale private evidence. */
  }
  async function read() {
    if (busy) return;
    if (selection) {
      try {
        selection.check();
        setOpen(!open);
      } catch {
        setError('UNKNOWN — original intake or authorization changed.');
      }
      return;
    }
    setBusy(true);
    try {
      const value = await receptionistSalesSource(sources);
      value.check();
      if (life.current) {
        setSelection(value);
        setOpen(true);
      }
    } catch {
      if (life.current)
        setError(
          'UNKNOWN — exact authorized intake unavailable. No substitute selected.',
        );
    } finally {
      if (life.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Receptionist to existing Sales review">
      <h3>Receptionist intake → exact Sales source</h3>
      <p>
        Use the existing optional receptionist review above to retain literal
        caller statements. Caller-to-lead relationship UNKNOWN. The source below
        is the selected job's exact intake reference, not a match inferred from
        names or wording. AI suggestions never establish CRM identity, approval
        or contact permission.
      </p>
      <button disabled={busy} onClick={() => void read()}>
        {open ? 'Hide exact intake review' : 'Open exact existing intake'}
      </button>
      {error && <p role="alert">{error}</p>}
      {selection && !current && (
        <p role="alert">UNKNOWN — private Sales details withheld.</p>
      )}
      {selection && current && (
        <div hidden={!open}>
          <h4>Verified CRM record · current local source</h4>
          <dl>
            <dt>Exact intake reference</dt>
            <dd>{selection.lead.id}</dd>
            <dt>Customer / property</dt>
            <dd>
              {selection.lead.customer_id} / {selection.lead.location_id}
            </dd>
            <dt>Category / recorded status</dt>
            <dd>
              {selection.lead.service_category} / {selection.lead.status}
            </dd>
          </dl>
          <p>{selection.lead.summary}</p>
          <p>
            Sales scope review: {selection.salesStatus}. {selection.reason}
          </p>
          <p>
            This CRM summary is recorded intake data; it does not verify caller
            statements. Estimate-to-lead association remains staff-selected, not
            a canonical origin link.
          </p>
          <label>
            Unfinished receptionist staff notes
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
            />
          </label>
          <p>
            Notes remain unsaved local review inputs. Assignment HELD; no lead,
            assignment, contact or booking action is available here.
          </p>
        </div>
      )}
    </section>
  );
}
