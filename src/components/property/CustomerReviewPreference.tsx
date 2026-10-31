import { useEffect, useId, useRef, useState } from 'react';
import type { CustomerReview } from '../../domain/customer/review';
import type {
  CustomerPortalPreviewModel,
  PreviewReviewChoice,
} from '../../lib/customer-preview';

type Data = ReturnType<CustomerPortalPreviewModel['read']>;
const preferenceLabel: Record<PreviewReviewChoice, string> = {
  accepted: 'Approve',
  declined: 'Decline',
  changes_requested: 'Request changes',
};

/** Presentation only. The existing synthetic model/ReleasePreview owns decisions. */
export function CustomerReviewPreference({
  data,
  review,
  choice,
  onRecord,
  onCancel,
  evidence = 'session',
}: {
  data: Pick<Data, 'context' | 'customerName'>;
  review: CustomerReview;
  choice: PreviewReviewChoice;
  onRecord(note: string): Promise<unknown>;
  onCancel(): void;
  evidence?: 'session' | 'durable-local';
}) {
  const [note, setNote] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const id = useId(),
    heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true),
    submitting = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [confirm]);
  const changes = choice === 'changes_requested';
  const durable = evidence === 'durable-local';
  const length = (text: string) =>
    durable ? Array.from(text).length : text.length;
  return (
    <form
      className="customer-preference"
      aria-label={`${preferenceLabel[choice]} version ${review.version_number}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (submitting.current) return;
        const explanation = note.trim();
        if (
          (changes && !explanation) ||
          length(explanation) > 2000 ||
          !acknowledged
        ) {
          setError(
            !acknowledged
              ? durable
                ? 'Confirm this is a local database review only.'
                : 'Confirm this is a synthetic review only.'
              : 'Enter the requested changes using 1–2,000 characters.',
          );
          return;
        }
        setError('');
        if (!confirm) {
          setNote(explanation);
          setConfirm(true);
          return;
        }
        submitting.current = true;
        setPending(true);
        void onRecord(explanation)
          .catch(() => {
            if (alive.current)
              setError(
                'Review outcome unavailable. Read exact review status before any further action.',
              );
          })
          .finally(() => {
            submitting.current = false;
            if (alive.current) setPending(false);
          });
      }}
    >
      <h4 ref={heading} tabIndex={-1}>
        {confirm
          ? durable
            ? 'Confirm your local database preference'
            : 'Confirm your synthetic preference'
          : `${preferenceLabel[choice]} · Version ${review.version_number}`}
      </h4>
      <p>
        {data.context.company_name} · {data.customerName} ·{' '}
        {data.context.property_label}
      </p>
      <p>
        {review.scope.name} · Issued version {review.version_number}
      </p>
      <details>
        <summary>Exact estimate and version identity</summary>
        <p>Estimate {review.estimate_id}</p>
        <p>Version {review.version_id}</p>
      </details>
      {confirm ? (
        <>
          <p>
            Preference: {preferenceLabel[choice]}. This applies only to the
            version identified above.
          </p>
          {changes && <p className="customer-preference-note">{note}</p>}
          <p>
            No work, contract, invoice, payment or debt is authorized. This{' '}
            {durable
              ? 'receipt is retained in the disposable local database.'
              : 'response lasts for this preview session only.'}
          </p>
        </>
      ) : (
        <>
          {changes && (
            <label htmlFor={`${id}-note`}>
              Requested changes
              <textarea
                id={`${id}-note`}
                value={note}
                maxLength={durable ? 4000 : 2000}
                required
                aria-describedby={`${id}-limit`}
                onChange={(e) => {
                  setNote(e.target.value);
                  setError('');
                }}
              />
              <small id={`${id}-limit`}>
                {length(note).toLocaleString()} / 2,000 characters. Required;
                customer-visible text only.
              </small>
            </label>
          )}
          <label>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            {durable
              ? 'Confirm this is a local database review only'
              : 'Confirm this is a synthetic review only'}
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {pending && (
        <p role="status">
          {durable
            ? 'Recording this exact version’s local database preference…'
            : 'Recording this exact version’s synthetic preference…'}
        </p>
      )}
      <div className="p3-actions">
        <button type="submit" disabled={pending}>
          {confirm
            ? changes
              ? durable
                ? 'Record local database change request'
                : 'Record synthetic change request'
              : durable
                ? 'Record local database preference'
                : 'Record synthetic preference'
            : 'Review preference'}
        </button>
        {confirm && (
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() => {
              setConfirm(false);
              setError('');
            }}
          >
            Edit preference
          </button>
        )}
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel preference
        </button>
      </div>
    </form>
  );
}
