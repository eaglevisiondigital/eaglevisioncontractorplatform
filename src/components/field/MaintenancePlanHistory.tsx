import { useState } from 'react';
import type { PropertyRepository } from '../../lib/property';
import type { MaintenanceSource } from '../../domain/property/maintenance';
import { PropertyReportHistory } from '../property/PropertyReportHistory';
import { maintenancePlanHistory } from './maintenance-plan-history';

/** Native details keeps report filters mounted while the existing proposed date changes. */
export function MaintenancePlanHistory({
  repo,
  org,
  actor,
  source,
  recordRevision,
  plan,
  proposedDate,
}: {
  repo: PropertyRepository;
  org: string;
  actor: string;
  source: MaintenanceSource;
  recordRevision: number;
  plan: { id: string; revision: number };
  proposedDate: string;
}) {
  const [coverage, setCoverage] = useState('property');
  let view: ReturnType<typeof maintenancePlanHistory> | null = null,
    error = '';
  try {
    view = maintenancePlanHistory(
      repo,
      org,
      actor,
      source,
      recordRevision,
      plan,
    );
  } catch (failure) {
    error =
      failure instanceof Error
        ? failure.message
        : 'Current plan evidence unavailable';
  }
  const visits = view
    ? coverage === 'plan'
      ? view.visits
      : view.propertyVisits
    : [];
  const reports = view
    ? coverage === 'plan'
      ? view.reports
      : view.propertyReports
    : [];
  return (
    <details>
      <summary>Review selected plan history</summary>
      <section aria-label="Selected maintenance plan history">
        <h4>Current plan & service evidence</h4>
        <p>
          Proposed inspection date:{' '}
          {proposedDate || 'UNKNOWN — select a valid date'}. Reading history
          does not prepare or book a visit, enroll a customer, renew service,
          create a work order or authorize payment.
        </p>
        <p>
          Enrollment and purpose-specific consent: UNKNOWN — inspection cadence
          and published reports do not verify consent. Recorded checklist marks
          are not verified physical completion.
        </p>
        {!view ? (
          <p role="status">
            UNKNOWN — {error}. Reselect current source/plan evidence before
            review.
          </p>
        ) : (
          <>
            <dl>
              <dt>Selected plan ID / revision</dt>
              <dd>
                {view.plan.id} / {view.plan.revision}
              </dd>
              <dt>Plan name</dt>
              <dd>{view.plan.name}</dd>
              <dt>Company / customer / property</dt>
              <dd>
                {org} / {source.customer_id} / {source.location_id}
              </dd>
              <dt>Recorded inspection cadence / interval</dt>
              <dd>
                {view.plan.cadence} / {view.plan.interval_days} days
              </dd>
              <dt>Recorded start / timezone</dt>
              <dd>
                {view.plan.starts_on} / {view.plan.timezone}
              </dd>
            </dl>
            <p>
              {view.visits.length} selected-plan visit(s); {view.reports.length}{' '}
              selected-plan report version(s). Viewing {visits.length} visit(s)
              and {reports.length} available published report version(s).
              History completeness remains UNKNOWN.
            </p>
            {!view.visits.length && (
              <p>UNKNOWN — no recorded visits for this exact plan.</p>
            )}
            {view.withoutPublishedEvidence > 0 && (
              <p>
                {view.withoutPublishedEvidence} visit(s) have no published
                report. Service documentation requires review; performed work
                and completion remain UNKNOWN.
              </p>
            )}
            <label>
              Maintenance history scope
              <select
                value={coverage}
                onChange={(event) => setCoverage(event.target.value)}
              >
                <option value="property">
                  All plans at this exact property
                </option>
                <option value="plan">Selected plan only</option>
              </select>
            </label>
            <p>
              Other plans provide property context; their visits and reports do
              not prove service under the selected plan.
            </p>
            <ul aria-label="Recorded maintenance history visits">
              {visits.map((visit) => (
                <li key={visit.source.visit_id}>
                  <time dateTime={visit.date}>{visit.date}</time> ·{' '}
                  {visit.status} ·{' '}
                  {visit.reports.length
                    ? 'Published documentation available; completion UNVERIFIED'
                    : 'Published evidence UNKNOWN'}
                  <dl>
                    <dt>Source plan ID / revision</dt>
                    <dd>
                      {visit.source.plan_id} / {visit.source.plan_revision}
                    </dd>
                    <dt>Published report references</dt>
                    <dd>
                      {visit.reports.length
                        ? visit.reports
                            .map(
                              (report) => `${report.id} / v${report.version}`,
                            )
                            .join(', ')
                        : 'UNKNOWN — no published report'}
                    </dd>
                    <dt>Plan relationship</dt>
                    <dd>
                      {visit.source.plan_id === plan.id
                        ? 'Selected plan'
                        : 'Other recorded plan at this property'}
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>
            <PropertyReportHistory reports={reports} />
          </>
        )}
      </section>
    </details>
  );
}
