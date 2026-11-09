import { useLayoutEffect, useRef, useState } from 'react';
import { prototypeFields } from '../../lib/program/prototype-source';
import type {
  EstimateBundle,
  EstimateInput,
  EstimateLine,
} from '../../domain/estimating/types';
import type { Phase3Repository } from '../../lib/phase3';
import { formatMinor } from '../../domain/estimating/calculation';
import {
  prepareVoiceDraftReview,
  selectedVoiceDraftLines,
  type VoiceDraftContext,
  type VoiceDraftReview as Review,
} from './voice-draft-review';

export function VoiceDraftReview({
  repo,
  context,
  bundle,
  liveDraft,
  onAppend,
}: {
  repo: Phase3Repository;
  context: VoiceDraftContext;
  bundle: EstimateBundle;
  liveDraft(): EstimateInput;
  onAppend(lines: EstimateLine[], expected: string, check: () => void): void;
}) {
  const [review, setReview] = useState<Review>();
  const [binding, setBinding] = useState<{
    repo: Phase3Repository;
    context: VoiceDraftContext;
    version: string;
  }>();
  const [confirmation, setConfirmation] = useState<{
      repo: Phase3Repository;
      context: VoiceDraftContext;
      version: string;
      form: string;
    }>(),
    [selected, select] = useState<number[]>([]),
    [attempted, setAttempted] = useState(false),
    [applied, setApplied] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const confirmed =
    confirmation?.repo === repo &&
    confirmation.version === bundle.version.id &&
    confirmation.context.target === context.target &&
    confirmation.context.input === context.input &&
    confirmation.context.gate === context.gate &&
    confirmation.form === JSON.stringify(liveDraft());
  function confirm(value: boolean) {
    setConfirmation(
      value
        ? {
            repo,
            context,
            version: bundle.version.id,
            form: JSON.stringify(liveDraft()),
          }
        : undefined,
    );
  }
  const gate = useRef({ enabled: true, confirmed: false }),
    life = useRef(true),
    attemptHold = useRef(false),
    applyHold = useRef(false),
    epoch = useRef(0);
  useLayoutEffect(() => {
    const g = { enabled: true, confirmed: false };
    gate.current = g;
    life.current = true;
    epoch.current++;
    return () => {
      life.current = false;
      g.enabled = false;
      g.confirmed = false;
    };
  }, [repo, context.target, context.input, context.gate, bundle.version.id]);
  let text = '';
  try {
    const value = prototypeFields(context.input, ['transcript']).transcript;
    structuredClone(context.input);
    if (typeof value === 'string') text = value;
  } catch {
    /* Unadmitted input is never rendered or executed. */
  }
  let current =
    !review ||
    (binding?.repo === repo &&
      binding.version === bundle.version.id &&
      binding.context.target === context.target &&
      binding.context.input === context.input &&
      binding.context.gate === context.gate);
  if (review && !applied)
    try {
      review.check();
    } catch {
      current = false;
    }
  async function prepare() {
    if (busy || attemptHold.current || !confirmed) return;
    attemptHold.current = true;
    setAttempted(true);
    const token = epoch.current;
    gate.current.confirmed = true;
    setBusy(true);
    setMessage('');
    try {
      const value = await prepareVoiceDraftReview(
        repo,
        context,
        bundle,
        liveDraft,
        gate.current,
      );
      if (life.current && epoch.current === token) {
        setBinding({ repo, context, version: bundle.version.id });
        setReview(value);
        confirm(false);
        setMessage(
          'Literal source reviewed. Select exact suggestions and confirm before adding them.',
        );
      }
    } catch {
      if (life.current)
        setMessage(
          'UNKNOWN — original source or input changed. No automatic retry or replacement review.',
        );
    } finally {
      if (life.current) setBusy(false);
    }
  }
  async function apply() {
    if (!review || !current || busy || applyHold.current || !confirmed) return;
    applyHold.current = true;
    setApplied(true);
    const token = epoch.current;
    setBusy(true);
    try {
      const lines = await selectedVoiceDraftLines(review, selected, confirmed);
      if (!life.current || epoch.current !== token) throw Error();
      onAppend(lines, review.expected, review.check);
      setMessage(
        'Selected scope added to the unsaved working draft. Review pricing and use Save estimate draft separately; nothing issued or sent.',
      );
    } catch {
      if (life.current)
        setMessage(
          'UNKNOWN — draft application not confirmed. Inspect the existing draft; no replay or duplicate application.',
        );
    } finally {
      if (life.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Voice scope to working draft">
      <h3>Review captured scope for this draft</h3>
      <p>
        Literal transcript only; no microphone, speech recognition or AI
        inference. Existing catalog values are unverified working prices, not
        supplier quotes or customer approval.
      </p>
      <h4>Original captured transcript</h4>
      <pre tabIndex={0}>
        {current
          ? (review?.originalText ?? text)
          : 'UNKNOWN — source context changed'}
      </pre>
      <p>
        Draft version {bundle.version.version_number} · {bundle.version.id}.
        Missing quantities or unmatched catalog names require manual review.
      </p>
      {!attempted && (
        <>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => confirm(e.target.checked)}
            />
            I confirm this original transcript and exact draft for local scope
            review.
          </label>
          <button
            disabled={busy || !confirmed || !text.trim()}
            onClick={() => void prepare()}
          >
            Review captured draft scope
          </button>
        </>
      )}
      {review && !applied && current && (
        <>
          <ul>
            {review.review.snapshot.clauses.map((clause, index) => (
              <li key={`${clause.span.start}:${clause.span.end}`}>
                <p>{clause.span.literal}</p>
                {clause.suggestion ? (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        disabled={busy || applied || !current}
                        checked={selected.includes(index)}
                        onChange={(e) => {
                          select(
                            e.target.checked
                              ? [...selected, index]
                              : selected.filter((i) => i !== index),
                          );
                          confirm(false);
                        }}
                      />
                      {clause.suggestion.quantity_milli / 1000}{' '}
                      {clause.suggestion.unit} · {clause.suggestion.description}{' '}
                      · current catalog pricing UNVERIFIED
                    </label>
                    {current && (
                      <p>
                        Current catalog selling price:{' '}
                        {(() => {
                          const item = review
                            .catalog()
                            .find(
                              (item) =>
                                item.id === clause.suggestion!.catalog_item_id,
                            );
                          return item?.unit_price_minor === null
                            ? 'Not fixed; review cost and markup in the editor'
                            : item
                              ? formatMinor(
                                  item.unit_price_minor,
                                  bundle.version.payload.currency,
                                ) +
                                ' per ' +
                                item.unit
                              : 'UNKNOWN';
                        })()}{' '}
                        · Verification UNVERIFIED
                      </p>
                    )}
                  </>
                ) : (
                  <p>Manual review required: {clause.warning}</p>
                )}
              </li>
            ))}
          </ul>
          {!current && (
            <p role="alert">
              UNKNOWN — original transcript, draft, source or authorization
              changed. Suggestions cannot be used.
            </p>
          )}
          <label>
            <input
              type="checkbox"
              disabled={busy || applied || !current || !selected.length}
              checked={confirmed}
              onChange={(e) => confirm(e.target.checked)}
            />
            I reviewed selected quantities and current catalog values for this
            working draft; pricing still requires verification.
          </label>
          <button
            disabled={
              busy || applied || !current || !selected.length || !confirmed
            }
            onClick={() => void apply()}
          >
            Use selected scope in working draft
          </button>
        </>
      )}
      {attempted && (
        <p>
          One source review retained for this draft version. No automatic retry,
          issuance or replacement.
        </p>
      )}
      {busy && (
        <p role="status">Checking original transcript and draft sources…</p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
