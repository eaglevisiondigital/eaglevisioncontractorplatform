import { useCallback, useState } from 'react';
import type { MarginScope } from '../../domain/jobs/margin-analysis';
import type { PropertyRepository } from '../../lib/property';
import type { FieldVisitReference } from '../../lib/field-scheduling';
import { useResource } from '../forms-state';
import {
  assertFieldIssuedJobSource,
  fieldVisitIssuedJobSource,
} from './field-service-review';

type Props = {
  repo: PropertyRepository;
  org: string;
  actor: string;
  reference: FieldVisitReference;
  scope: MarginScope;
  onVisit(reference: FieldVisitReference): void;
};

/** A source inspector inside the existing cost review, never another workspace. */
export function FieldJobSourceReview(props: Props) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <button
        className="secondary"
        aria-expanded={shown}
        onClick={() => setShown(!shown)}
      >
        {shown
          ? 'Close issued scope review'
          : 'Review issued scope & job visits'}
      </button>
      {shown && (
        <Source
          key={JSON.stringify([
            props.org,
            props.actor,
            props.reference,
            props.scope,
          ])}
          {...props}
        />
      )}
    </>
  );
}
function Source({ repo, org, actor, reference, scope, onVisit }: Props) {
  const resource = useResource(
    useCallback(
      () => fieldVisitIssuedJobSource(repo, org, actor, reference, scope),
      [repo, org, actor, reference, scope],
    ),
  );
  const [message, setMessage] = useState('');
  let order = resource.loading || resource.error ? undefined : resource.data;
  if (order) {
    try {
      assertFieldIssuedJobSource(repo, org, actor, reference, scope, order);
    } catch {
      order = undefined;
    }
  }
  return (
    <section aria-label="Issued estimate and job source review">
      <h3>Issued estimate → job → recorded visits</h3>
      <p>
        The job baseline is an issued estimate version, not the latest draft. It
        does not establish customer approval or an executed agreement. Recorded
        visits do not prove dispatch or performed work. Cost completeness and
        invoice readiness remain separate.
      </p>
      <button
        className="secondary"
        onClick={() => {
          setMessage('');
          resource.reload();
        }}
      >
        Refresh issued job source
      </button>
      {resource.loading ? (
        <p role="status">Reading exact issued source…</p>
      ) : !order ? (
        <p role="status">
          UNKNOWN — source, access or job revision changed. Refresh the original
          cost review; no newer source is substituted.
        </p>
      ) : (
        <>
          <dl>
            <dt>Company / customer</dt>
            <dd>
              {org} / {order.customer.id}
            </dd>
            <dt>Job ID / revision</dt>
            <dd>
              {order.source.job_id} / {order.source.job_revision}
            </dd>
            <dt>Estimate ID</dt>
            <dd>{order.source.estimate_id}</dd>
            <dt>Issued version ID / number</dt>
            <dd>
              {order.source.issued_version_id} /{' '}
              {order.source.issued_version_number}
            </dd>
            <dt>Issued baseline property</dt>
            <dd>
              {order.baseline_property?.id ??
                'UNKNOWN — job-wide scope; no property attribution'}
            </dd>
            <dt>Current visit property</dt>
            <dd>{reference.location_id}</dd>
          </dl>
          <h4>Original issued job scope</h4>
          <ul>
            {order.scope.map((line) => (
              <li key={line.id}>
                {line.quantity_milli / 1000} {line.unit} · {line.description}
              </li>
            ))}
          </ul>
          <h4>Recorded job visits at this property</h4>
          <p>
            Available source records only; history completeness remains UNKNOWN.
            Review inputs below remain selected while inspecting this source.
          </p>
          <ul>
            {order.visits
              .filter(
                (v) =>
                  v.customer_id === reference.customer_id &&
                  v.location_id === reference.location_id,
              )
              .map((visit) => (
                <li key={visit.id}>
                  <time dateTime={visit.date}>{visit.date}</time> ·{' '}
                  {visit.status}
                  <button
                    className="secondary"
                    disabled={visit.id === reference.visit_id}
                    onClick={() => {
                      try {
                        assertFieldIssuedJobSource(
                          repo,
                          org,
                          actor,
                          reference,
                          scope,
                          order!,
                        );
                        onVisit({
                          organization_id: org,
                          customer_id: visit.customer_id,
                          location_id: visit.location_id,
                          plan_id: visit.plan_id,
                          plan_revision: visit.plan_revision,
                          visit_id: visit.id,
                          visit_revision: visit.revision,
                        });
                      } catch {
                        setMessage(
                          'UNKNOWN — recorded source changed. Refresh before navigating.',
                        );
                      }
                    }}
                  >
                    Inspect job visit {visit.date}
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
