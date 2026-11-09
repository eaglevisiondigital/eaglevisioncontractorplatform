import { useRef, useState } from 'react';
import type { Job } from '../../domain/jobs/financials';
import type { Phase3Repository } from '../../lib/phase3';
import { Field } from './fields';
import {
  reviewSampleExpense,
  expenseReviewAttempted,
  type ExpenseReviewDecision,
} from './expense-management-review';

export function ExpenseManagementReview({
  repo,
  org,
  job,
  expenseId,
  admin,
  refresh,
}: {
  repo: Phase3Repository;
  org: string;
  job: Job;
  expenseId: string;
  admin: boolean;
  refresh: () => void;
}) {
  const [decision, setDecision] = useState<ExpenseReviewDecision>('approved');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const held = expenseReviewAttempted(repo, org, job.id, expenseId);
  return (
    <form
      className="operational-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (running.current) return;
        running.current = true;
        setMessage('');
        try {
          const pending = reviewSampleExpense(
            repo,
            org,
            job,
            expenseId,
            admin,
            decision,
            reason,
            confirmed,
          );
          setBusy(true);
          void pending
            .then(
              () => {
                refresh();
              },
              () => {
                setMessage(
                  'Review outcome UNKNOWN. Read the exact saved review; do not resubmit.',
                );
              },
            )
            .finally(() => {
              running.current = false;
              setBusy(false);
            });
        } catch (error) {
          running.current = false;
          setMessage(
            expenseReviewAttempted(repo, org, job.id, expenseId)
              ? 'Review outcome UNKNOWN. Read the exact saved review; do not resubmit.'
              : error instanceof Error
                ? error.message
                : 'Review unavailable',
          );
        }
      }}
    >
      <p>
        Record a management decision on this original submission. Approval
        includes its evidence in job costs; it does not pay a supplier, prove
        delivery or make costs complete.
      </p>
      <Field label="Expense review decision">
        <select
          value={decision}
          disabled={busy || held}
          onChange={(e) => {
            setDecision(e.target.value as ExpenseReviewDecision);
            setConfirmed(false);
          }}
        >
          <option value="approved">Approve evidence for job costs</option>
          <option value="rejected">Reject evidence with reason</option>
        </select>
      </Field>
      <Field label="Expense review reason">
        <textarea
          value={reason}
          maxLength={2000}
          disabled={busy || held}
          onChange={(e) => {
            setReason(e.target.value);
            setConfirmed(false);
          }}
        />
      </Field>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || held}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{' '}
        I confirm this submission, review decision and reason.
      </label>
      <div className="button-row">
        <button disabled={!admin || busy || held}>Record expense review</button>
        {held && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={refresh}
          >
            Read exact saved review
          </button>
        )}
      </div>
      {held && !busy && (
        <p>
          Review attempted. An absent saved result remains UNKNOWN; no retry is
          enabled.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
