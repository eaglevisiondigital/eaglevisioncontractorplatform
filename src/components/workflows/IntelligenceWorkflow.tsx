import type { IntelligenceWorkflowReview } from '../../lib/workflows/intelligence-workflow';
import './intelligence-workflow.css';

/** Pure default-OFF staff display; Main owns live confirmation and exact keyed source context. */
export function IntelligenceWorkflow({
  review,
  enabled = false,
  loading = false,
  error = null,
}: {
  review: IntelligenceWorkflowReview | null;
  enabled?: boolean;
  loading?: boolean;
  error?: string | null;
}) {
  if (!enabled)
    return (
      <section
        className="intelligence-workflow"
        aria-label="Intelligence workflow"
      >
        <h2>Copilot and source review</h2>
        <p>
          Intelligence review is off. Explicit local human confirmation is
          required.
        </p>
      </section>
    );
  if (loading)
    return (
      <section
        className="intelligence-workflow"
        aria-label="Intelligence workflow"
      >
        <h2>Copilot and source review</h2>
        <p role="status">
          Preparing the exact saved source review. This session attempt is held;
          it will not replay after uncertainty.
        </p>
      </section>
    );
  if (error)
    return (
      <section
        className="intelligence-workflow"
        aria-label="Intelligence workflow"
      >
        <h2>Copilot and source review</h2>
        <p role="alert">{error}</p>
        <p>
          Previous suggestions are withheld. An uncertain attempt permits exact
          read-only inspection only.
        </p>
      </section>
    );
  if (!review)
    return (
      <section
        className="intelligence-workflow"
        aria-label="Intelligence workflow"
      >
        <h2>Copilot and source review</h2>
        <p>
          No Intelligence review prepared. Select the saved property context and
          explicitly confirm the review.
        </p>
      </section>
    );
  const copilot = review.copilot.snapshot,
    advanced = review.advanced;
  return (
    <section
      className="intelligence-workflow"
      aria-label="Intelligence workflow"
    >
      <header>
        <p className="intelligence-workflow-eyebrow">
          Explainable local staff review
        </p>
        <h2>Copilot and source review</h2>
        <p>
          Model: {review.model}. No provider, microphone, autonomous action or
          customer communication.
        </p>
        <p>
          Review context: {copilot.review_on}. This is a human-selected date,
          not a deadline, booking or availability claim.
        </p>
      </header>
      <section
        className="intelligence-workflow-card"
        aria-label="Existing-source priority review"
      >
        <h3>Review priorities</h3>
        <ul className="intelligence-workflow-priorities">
          {copilot.cards.map((card) => (
            <li key={card.kind}>
              <div>
                <strong>
                  {card.priority} priority · {card.kind.replaceAll('_', ' ')}
                </strong>
                <p>{card.observation}</p>
                <p>
                  <strong>Suggested human review:</strong>{' '}
                  {card.suggested_review}
                </p>
              </div>
              <details>
                <summary>Exact source evidence</summary>
                <ul>
                  {card.evidence.map((id) => (
                    <li key={id}>
                      <code>{id}</code>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
        <p>
          Suggestions are review text only. They do not save scope, post costs,
          assign work or grant approval.
        </p>
      </section>
      {advanced ? (
        <div className="intelligence-workflow-grid">
          <section
            className="intelligence-workflow-card"
            aria-label="Literal transcript review"
          >
            <h3>Synthetic transcript review</h3>
            <p>
              Recognition: {advanced.voice.snapshot.recognition}. Audio:{' '}
              {advanced.voice.snapshot.audio}. No prices or totals calculated.
            </p>
            <ul className="intelligence-workflow-clauses">
              {advanced.voice.snapshot.clauses.map((clause) => (
                <li key={`${clause.span.start}:${clause.span.end}`}>
                  <blockquote>{clause.span.literal}</blockquote>
                  <p>
                    Exact UTF-16 source span: {clause.span.start}–
                    {clause.span.end}
                  </p>
                  {clause.suggestion ? (
                    <>
                      <p>
                        <strong>Catalog suggestion:</strong>{' '}
                        {clause.suggestion.description}
                      </p>
                      <p>
                        {clause.suggestion.quantity_milli / 1000}{' '}
                        {clause.suggestion.unit} · price NOT_PROJECTED
                      </p>
                      <code>{clause.suggestion.catalog_item_id}</code>
                    </>
                  ) : (
                    <p>
                      <strong>Manual review:</strong> {clause.warning}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p>
              Suggestions never modify this issued version. Any editing must use
              the separately authorized existing editor workflow.
            </p>
          </section>
          <section
            className="intelligence-workflow-card"
            aria-label="Human-selected trade review"
          >
            <h3>Trade review context</h3>
            <p>
              Human-selected edition:{' '}
              <strong>{advanced.trade.snapshot.edition}</strong>. Original
              contractor identity and branding remain unchanged.
            </p>
            <ul className="intelligence-workflow-checklist">
              {advanced.trade.snapshot.checklist.map((item) => (
                <li key={item.section}>
                  <strong>{item.status}</strong>
                  <p>{item.prompt}</p>
                </li>
              ))}
            </ul>
            <p>
              Licensing, code compliance and physical completion remain
              UNVERIFIED.
            </p>
            <p>
              Explicit catalog fields selected:{' '}
              {advanced.trade.snapshot.catalog_draft_fields.length}. No
              measurement or price is inferred.
            </p>
            <p>
              Procurement: {advanced.procurement.status}. No order, subcontract,
              supplier approval or expense is created.
            </p>
          </section>
        </div>
      ) : (
        <section
          className="intelligence-workflow-card"
          aria-label="Advanced review status"
        >
          <h3>Optional advanced review</h3>
          <p>
            Not requested. Transcript, edition and catalog choices must be
            supplied explicitly before preparation.
          </p>
        </section>
      )}
      <details className="intelligence-workflow-card">
        <summary>Saved source and integrity</summary>
        <dl>
          <dt>Customer</dt>
          <dd>{review.target.customer_id}</dd>
          <dt>Property</dt>
          <dd>{review.target.location_id}</dd>
          <dt>Estimate / version</dt>
          <dd>
            {review.target.estimate_id} / {review.saved_version.id}
          </dd>
          <dt>Job / saved revision</dt>
          <dd>
            {review.target.job_id ?? 'No job recorded'} /{' '}
            {review.job_revision ?? 'UNKNOWN'}
          </dd>
          <dt>Source hash</dt>
          <dd>
            <code>{review.source_sha256}</code>
          </dd>
          <dt>Review hash</dt>
          <dd>
            <code>{review.sha256}</code>
          </dd>
        </dl>
        <p>
          Same-tab review only. A hash does not establish genuine authentication
          or refresh/process-crash durability. History coverage remains UNKNOWN.
        </p>
      </details>
    </section>
  );
}
