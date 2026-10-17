import { useCallback, useState } from 'react';
import type { Operations } from '../lib/operations';
import { FieldsForm, Pagination, ResourceStatus } from './forms';
import { useResource, useTask, options } from './forms-state';
export function IntakeQueue({
  repo,
  org,
  onReviewCustomer,
  onTest,
  canManage = true,
}: {
  repo: Operations;
  org: string;
  onReviewCustomer?: () => void;
  onTest?: () => void;
  canManage?: boolean;
}) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const task = useTask();
  const requests = useResource(
    useCallback(
      () => repo.listIntake(org, status, page),
      [repo, org, status, page],
    ),
  );
  const members = useResource(
    useCallback(() => repo.listMembers(org), [repo, org]),
  );
  return (
    <article>
      <div className="section-title">
        <div>
          <h2>Estimate request inbox</h2>
          <p>
            New-lead notifications appear here. External notifications are
            disabled.
          </p>
        </div>
        {onTest && <button onClick={onTest}>Test public intake</button>}
      </div>
      <div className="filters">
        <label>
          Request status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All requests</option>
            {options(['new', 'reviewing', 'qualified', 'closed']).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ResourceStatus {...requests} />
      <p role="status">{task.message}</p>
      <div className="record-list">
        {requests.data?.rows.map((r) => (
          <section className="request-card" key={r.id}>
            <div className="section-title">
              <span className="tag">
                {r.status} · {r.source}
              </span>
              <small>{new Date(r.created_at).toLocaleDateString()}</small>
            </div>
            <h3>{r.service_category}</h3>
            <p>{r.summary}</p>
            <p>
              Preferred contact: {r.contact_preference} · Appointment:{' '}
              {r.preferred_appointment || 'Not specified'}
            </p>
            {r.customer_id && onReviewCustomer && (
              <button className="secondary" onClick={onReviewCustomer}>
                Open customer directory
              </button>
            )}
            {canManage && (
              <FieldsForm
                key={`${r.id}-${r.updated_at}`}
                fields={[
                  {
                    name: 'assigned_to',
                    label: 'Assign to employee',
                    type: 'select',
                    options: [
                      { value: '', label: 'Unassigned' },
                      ...(members.data ?? [])
                        .filter((m) => m.active)
                        .map((m) => ({
                          value: m.user_id,
                          label: `${m.role === 'staff' ? m.staff_type.replaceAll('_', ' ') : m.role} · ${m.user_id.slice(0, 12)}`,
                        })),
                    ],
                  },
                  {
                    name: 'status',
                    label: 'Update request status',
                    type: 'select',
                    options: options([
                      'new',
                      'reviewing',
                      'qualified',
                      'closed',
                    ]),
                  },
                ]}
                initial={r}
                submitLabel="Save assignment"
                busy={task.busy}
                onSubmit={async (v) => {
                  if (
                    await task.run(() =>
                      repo.assignIntake(
                        org,
                        r.id,
                        String(v.assigned_to) || null,
                        String(v.status),
                      ),
                    )
                  )
                    requests.reload();
                }}
              />
            )}
          </section>
        ))}
      </div>
      {!requests.loading && !requests.data?.rows.length && (
        <p>No requests in this view.</p>
      )}
      <Pagination
        page={page}
        count={requests.data?.count ?? 0}
        onChange={setPage}
      />
    </article>
  );
}
