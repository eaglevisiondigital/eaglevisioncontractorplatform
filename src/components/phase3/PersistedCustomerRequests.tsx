import { useEffect, useRef, useState } from 'react';
import type {
  PreparedCustomerRequests,
  StaffRequestQueue,
} from '../../lib/customer-requests';
/** Injected read-only presentation. Never mounted by App; no synthetic fallback. */
type QueueProps = {
  reader: Pick<PreparedCustomerRequests, 'queue'>;
  organization: string;
  enabled?: boolean;
};
export function PersistedCustomerRequests({
  enabled = false,
  ...props
}: QueueProps) {
  if (!enabled)
    return (
      <section
        className="p3-notice customer-change-review"
        aria-label="Persisted customer change requests"
      >
        <h2>Customer change requests</h2>
        <p>Connected customer request reader is not enabled.</p>
      </section>
    );
  return (
    <EnabledPersistedCustomerRequests key={props.organization} {...props} />
  );
}
function EnabledPersistedCustomerRequests({
  reader,
  organization,
}: Omit<QueueProps, 'enabled'>) {
  const [loaded, setLoaded] = useState<{
    reader: typeof reader;
    organization: string;
    value: StaffRequestQueue;
  }>();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const data =
    loaded?.reader === reader && loaded.organization === organization
      ? loaded.value
      : undefined;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section
      className="p3-notice customer-change-review"
      aria-label="Persisted customer change requests"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">CUSTOMER FOLLOW-UP</span>
          <h2>Customer change requests</h2>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError('');
            setLoaded(undefined);
            void reader
              .queue(organization)
              .then((value) => {
                if (alive.current) setLoaded({ reader, organization, value });
              })
              .catch(() =>
                setError(
                  'Request queue unavailable. No source or authority is inferred.',
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          Read persisted requests
        </button>
      </div>
      <p>
        Review preferences authorize no work, revised draft, issuance, contract
        or financial action.
      </p>
      {busy && <p role="status">Reading authorized requests…</p>}
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            {data.requests.length} available requests · bounded to 50 records
          </p>
          {!data.requests.length && (
            <p>No persisted change requests are available.</p>
          )}
          {data.requests.map((row) => (
            <article className="p3-card" key={row.receipt.id}>
              <h3>{row.project_name}</h3>
              <p>
                {row.customer_name} · {row.property_label}
              </p>
              <p>
                Issued version {row.receipt.version_number} · Request changes
              </p>
              <p className="customer-preference-note">{row.receipt.note}</p>
              <details>
                <summary>Exact source and receipt evidence</summary>
                <p>Estimate {row.receipt.estimate_id}</p>
                <p>Version {row.receipt.version_id}</p>
                <p>Publication {row.receipt.publication_id}</p>
                <p>Receipt {row.receipt.id}</p>
                <p>Request {row.receipt.request_id}</p>
                <p>Recorded {row.receipt.recorded_at}</p>
              </details>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
