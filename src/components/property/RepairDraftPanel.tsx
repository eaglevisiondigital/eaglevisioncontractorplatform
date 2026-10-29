import { useCallback, useState, useEffect, useRef, useContext } from 'react';
import { BackOfficeConcept } from './back-office-presentation';
import type { CompanyProfile } from '../../domain/platform';
import type {
  MaintenanceItem,
  MaintenanceSource,
} from '../../domain/property/maintenance';
import type { RepairReview } from '../../domain/property/repair-draft';
import type { PropertyRepository } from '../../lib/property';
import { useResource, useTask } from '../forms-state';
import { Estimates } from '../phase3/Estimates';

export function RepairDraftPanel({
  repo,
  company,
  actor,
  item,
  onSource,
  onChanged,
}: {
  repo: PropertyRepository;
  company: CompanyProfile;
  actor: string;
  item: MaintenanceItem;
  onSource(source: MaintenanceSource): void;
  onChanged(): void;
}) {
  const concept = useContext(BackOfficeConcept);
  const org = company.id,
    task = useTask();
  const focus = useRef<HTMLElement>(null);
  const [review, setReview] = useState<RepairReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [opened, setOpened] = useState<Awaited<
    ReturnType<PropertyRepository['openRepair']>
  > | null>(null);
  useEffect(() => {
    focus.current?.focus();
  }, [opened, review]);
  const attempt = useResource(
    useCallback(
      async () => repo.repairAttempt(org, actor, item.source),
      [repo, org, actor, item.source],
    ),
  );
  if (opened)
    return (
      <section
        className="maintenance-editor"
        aria-label="Exact repair estimate workflow"
        ref={focus}
        tabIndex={-1}
      >
        <h3>Repair draft · contractor review required</h3>
        <p>
          <strong>
            {item.customer_name} · {item.property_label}
          </strong>
          <br />
          Inspection {item.report.visited_on} · Published v
          {opened.provenance.source.report_version}
        </p>
        <details>
          <summary>Exact repair source & preparation evidence</summary>
          <p>
            Report {opened.provenance.source.report_id} · Published v
            {opened.provenance.source.report_version} · Finding{' '}
            {opened.provenance.source.finding_id}.
          </p>
          <p>
            Estimate {opened.provenance.estimate_id} · Draft{' '}
            {opened.provenance.draft_version_id} v
            {opened.provenance.draft_version_number} · Prepared by{' '}
            {opened.provenance.prepared_by}. Job:{' '}
            {opened.provenance.job_id || 'No linked job'}.
          </p>
        </details>
        <p>
          {concept ? (
            'Proposed work stays separate from published observations. Review scope and quantities before confirming readiness. Issuance and work authority remain blocked.'
          ) : (
            <>
              Proposed repair scope only. One unit and zero prices are
              unmeasured placeholders. Review quantities, materials, labor,
              prices, tax and markup. No issuance, work approval or financial
              obligation.
            </>
          )}
        </p>
        <div className="maintenance-actions">
          <button
            className="secondary"
            onClick={() => {
              setOpened(null);
              onChanged();
            }}
          >
            Return to originating maintenance finding
          </button>
          <button
            className="secondary"
            onClick={() => onSource(opened.provenance.source)}
          >
            Open originating published report
          </button>
        </div>
        {concept && (
          <nav
            className="concept-workflow-links"
            aria-label="Repair draft sections"
          >
            <a href="#concept-scope-editor">
              Edit proposed scope <span aria-hidden="true">↗</span>
            </a>
            <a href="#concept-repair-readiness">
              Review readiness <span aria-hidden="true">↓</span>
            </a>
          </nav>
        )}
        <div id={concept ? 'concept-scope-editor' : undefined}>
          <Estimates
            key={opened.bundle.version.id}
            repo={repo.estimates}
            company={company}
            canIssue={false}
            initialBundle={opened.bundle}
            draftOnly
          />
        </div>
      </section>
    );
  return (
    <section
      className="maintenance-editor"
      aria-label="Repair estimate preparation"
      ref={focus}
      tabIndex={-1}
    >
      <h3>Finding → repair estimate</h3>
      {attempt.loading ? (
        <p role="status">Checking exact repair draft evidence…</p>
      ) : attempt.error ? (
        <p role="alert">
          Repair evidence unavailable. Reload the maintenance queue.
        </p>
      ) : attempt.data ? (
        <>
          <p>
            Preparation {attempt.data.status}.{' '}
            {attempt.data.provenance
              ? `Exact draft ${attempt.data.provenance.draft_version_id}`
              : 'No committed draft identity confirmed.'}{' '}
            This is not customer-approved work.
          </p>
          <button
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                setOpened(
                  await repo.openRepair(
                    org,
                    actor,
                    item.source,
                    attempt.data?.status !== 'prepared',
                  ),
                );
                attempt.reload();
              }, 'Exact repair evidence checked. No preparation replayed.')
            }
          >
            {attempt.data.status === 'prepared'
              ? 'Open exact repair draft'
              : 'Reconcile repair preparation'}
          </button>
          <p>
            Interrupted or uncertain preparation cannot be retried.
            Reconciliation reads only the retained exact draft.
          </p>
        </>
      ) : (
        <button
          disabled={task.busy}
          onClick={() =>
            void task.run(async () => {
              setReview(
                await repo.reviewRepair(
                  company,
                  actor,
                  item.source,
                  item.record.revision,
                ),
              );
              setConfirmed(false);
            }, 'Review the source and confirm the property before preparation.')
          }
        >
          Prepare repair estimate
        </button>
      )}
      {review && !attempt.data && (
        <div role="group" aria-label="Confirm repair evidence">
          <p>
            <strong>
              {item.customer_name} · {item.property_label}
            </strong>
          </p>
          <p>
            Report {review.source.report_id} · Published v
            {review.source.report_version} · Finding {review.source.finding_id}.
          </p>
          <p>
            Location: {item.finding.location} · Severity:{' '}
            {item.finding.severity}
          </p>
          <p>Observation: {item.finding.description}</p>
          <p>
            Recommendation: {item.finding.recommendation || 'None recorded'}
          </p>
          <p>
            Existing job: {review.job_id || 'None; no job will be created'}. A
            separate new estimate draft will preserve all existing issued
            versions and working estimates.
          </p>
          <label className="repair-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            I confirm this customer, property, published finding and existing
            job context. All scope and pricing require review.
          </label>
          <div className="maintenance-actions">
            <button
              disabled={!confirmed || task.busy}
              onClick={() =>
                void task.run(async () => {
                  try {
                    await repo.findingEstimate(
                      company,
                      actor,
                      item.source,
                      review.id,
                    );
                    setOpened(await repo.openRepair(org, actor, item.source));
                  } finally {
                    setReview(null);
                    attempt.reload();
                  }
                }, 'Separate repair draft prepared. Nothing issued or authorized.')
              }
            >
              Confirm & prepare repair draft
            </button>
            <button
              className="secondary"
              disabled={task.busy}
              onClick={() => setReview(null)}
            >
              Cancel repair preparation
            </button>
          </div>
        </div>
      )}
      {task.message && <p role="status">{task.message}</p>}
    </section>
  );
}
