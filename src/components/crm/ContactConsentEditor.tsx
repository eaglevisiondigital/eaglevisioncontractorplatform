import { useLayoutEffect, useRef, useState } from 'react';
import type {
  Customer,
  CustomerHistory,
  Operations,
} from '../../lib/operations';
import { useTask } from '../forms-state';
import {
  consentHistoryKey,
  recordCurrentContactConsent,
} from './contact-consent-source';
export function ContactConsentEditor({
  repo,
  org,
  customer,
  history,
  ready,
  onRefresh,
}: {
  repo: Operations;
  org: string;
  customer: Customer;
  history: CustomerHistory;
  ready: boolean;
  onRefresh: () => void;
}) {
  let source: string | null = null;
  try {
    if (customer.organization_id === org)
      source = consentHistoryKey(history.consents, org, customer.id);
  } catch {
    /* Unavailable source never becomes a default permission. */
  }
  const [email, setEmail] = useState(
      source !== null ? (history.consents[0]?.email_allowed ?? false) : false,
    ),
    [sms, setSms] = useState(
      source !== null ? (history.consents[0]?.sms_allowed ?? false) : false,
    ),
    [reviewed, setReviewed] = useState<string | null>(null);
  const token = JSON.stringify([source, email, sms]),
    confirmed = source !== null && reviewed === token;
  const task = useTask(),
    generation = useRef(0);
  useLayoutEffect(() => {
    const frame = generation.current + 1;
    generation.current = frame;
    return () => {
      generation.current = frame + 1;
    };
  }, [repo, org, customer.id, source, ready, email, sms]);
  const available =
    ready && source !== null && customer.organization_id === org;
  const stored = source !== null ? history.consents[0] : undefined;
  if (source === null)
    return (
      <section aria-label="Contact consent recording">
        <p role="status">
          Current customer consent source unavailable · UNKNOWN
        </p>
        <button className="secondary" disabled={task.busy} onClick={onRefresh}>
          Refresh consent evidence
        </button>
      </section>
    );
  return (
    <section aria-label="Contact consent recording">
      {source !== null &&
        (stored ? (
          <p>
            Stored source: email{' '}
            {stored.email_allowed ? 'allowed' : 'not allowed'} · SMS{' '}
            {stored.sms_allowed ? 'allowed' : 'not allowed'}. These stored
            choices do not establish new customer permission or sending
            authority.
          </p>
        ) : (
          <p>
            No consent record is available in this loaded history.
            Communications remain disabled.
          </p>
        ))}
      {!available && (
        <p role="status">
          Current customer consent source unavailable · UNKNOWN
        </p>
      )}
      <button
        className="secondary"
        disabled={task.busy}
        onClick={() => {
          setReviewed(null);
          onRefresh();
        }}
      >
        Refresh consent evidence
      </button>
      <form
        className="operational-form"
        onSubmit={(event) => {
          event.preventDefault();
          const frame = generation.current;
          void task.run(async () => {
            await recordCurrentContactConsent(
              repo,
              org,
              customer,
              history.consents,
              email,
              sms,
              confirmed,
              () => available && frame === generation.current,
            );
            if (frame === generation.current) {
              setReviewed(null);
              onRefresh();
            }
          }, 'Customer choices recorded; communications remain disabled');
        }}
      >
        <fieldset disabled={!available || task.busy}>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={email}
              onChange={(event) => {
                setEmail(event.target.checked);
                setReviewed(null);
              }}
            />
            Customer permits email contact
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={sms}
              onChange={(event) => {
                setSms(event.target.checked);
                setReviewed(null);
              }}
            />
            Customer permits SMS contact
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) =>
                setReviewed(event.target.checked ? token : null)
              }
            />
            I reviewed the current stored consent and these explicit customer
            choices
          </label>
          <button disabled={!confirmed}>Record consent</button>
        </fieldset>
      </form>
      {task.message && <p role="status">{task.message}</p>}
    </section>
  );
}
