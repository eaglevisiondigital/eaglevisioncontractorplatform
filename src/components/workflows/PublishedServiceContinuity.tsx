import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { serviceRevisionReviewEnabled } from '../../lib/workflows/service-revision-review';
import { publishedServiceEvidenceRecipe } from '../../lib/workflows/published-service-continuity';
import { SavedEvidenceControls } from './SavedEvidenceControls';
import { ServiceRevisionReview } from './ServiceRevisionReview';
import './published-service-continuity.css';
/** One original workspace/source host. File reopening is historical read-only
 * evidence; it never restores business records or clears an original held action. */
export function PublishedServiceContinuity(props: SavedRevisionPanelProps) {
  if (!serviceRevisionReviewEnabled(props.enabled ?? false))
    return <p role="status">Published service continuity is off.</p>;
  return (
    <section
      className="published-service-continuity"
      aria-label="Published service continuity"
    >
      <header>
        <h2>Published service continuity</h2>
        <p>
          Save complete published-safe service evidence, reopen its original
          bytes and reconcile the exact current source separately.
        </p>
      </header>
      <SavedEvidenceControls
        {...props}
        recipe={publishedServiceEvidenceRecipe}
      />
      <p>
        Published documentation is separate from saved internal drafts. Internal
        notes, repair evidence, workforce and costs are excluded. Publication is
        not customer approval or verified physical completion.
      </p>
      <ServiceRevisionReview {...props} />
    </section>
  );
}
