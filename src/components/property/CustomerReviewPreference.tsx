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
}: {
  data: Data;
  review: CustomerReview;
  choice: PreviewReviewChoice;
  onRecord(note: string): Promise<unknown>;
  onCancel(): void;
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
          explanation.length > 2000 ||
          !acknowledged
        ) {
          setError(
            !acknowledged
              ? 'Confirm this is a synthetic review only.'
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
          ? 'Confirm your synthetic preference'
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
            No work, contract, invoice, payment or debt is authorized. This
            response lasts for this preview session only.
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
                maxLength={2000}
                required
                aria-describedby={`${id}-limit`}
                onChange={(e) => {
                  setNote(e.target.value);
                  setError('');
                }}
              />
              <small id={`${id}-limit`}>
                {note.length.toLocaleString()} / 2,000 characters. Required;
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
            Confirm this is a synthetic review only
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {pending && (
        <p role="status">
          Recording this exact version’s synthetic preference…
        </p>
      )}
      <div className="p3-actions">
        <button type="submit" disabled={pending}>
          {confirm
            ? changes
              ? 'Record synthetic change request'
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
