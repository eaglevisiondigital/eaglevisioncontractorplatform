import { useCallback, useState } from 'react';
import type { Operations } from '../lib/operations';
import type { StaffRole } from '../domain/platform';
import { FieldsForm, ResourceStatus } from './forms';
import { useResource, useTask, options } from './forms-state';
export function Team({ repo, org }: { repo: Operations; org: string }) {
  const members = useResource(
    useCallback(() => repo.listMembers(org), [repo, org]),
  );
  const invitations = useResource(
    useCallback(() => repo.listInvitations(org), [repo, org]),
  );
  const task = useTask();
  const [link, setLink] = useState('');
  const [viewTime] = useState(() => Date.now());
  return (
    <>
      <article>
        <h2>People and permissions</h2>
        <p>
          Owners manage administrators. Administrators can manage staff.
          Revocation takes effect on the next authorized database operation.
        </p>
        <ResourceStatus {...members} />
        <p role="status">{task.message}</p>
        <div className="record-list">
          {members.data?.map((m) => (
            <section key={m.user_id}>
              <strong>
                {m.role === 'staff'
                  ? m.staff_type.replaceAll('_', ' ')
                  : m.role}
              </strong>
              <small className="block">Account {m.user_id}</small>
              <span className="tag">{m.active ? 'Active' : 'Revoked'}</span>
              {m.role === 'owner' ? (
                <p>Owner grants require the Eagle Vision control plane.</p>
              ) : (
                <FieldsForm
                  fields={[
                    {
                      name: 'role',
                      label: 'Access role',
                      type: 'select',
                      options: options(['staff', 'admin']),
                    },
                    {
                      name: 'staff_type',
                      label: 'Job role',
                      type: 'select',
                      options: options([
                        'estimator',
                        'office_manager',
                        'field_staff',
                      ]),
                    },
                    {
                      name: 'active',
                      label: 'Membership active',
                      type: 'checkbox',
                    },
                  ]}
                  initial={m}
                  submitLabel="Update membership"
                  busy={task.busy}
                  onSubmit={async (v) => {
                    if (
                      await task.run(() =>
                        repo.manageMember(
                          org,
                          m.user_id,
                          Boolean(v.active),
                          String(v.role) as StaffRole,
                          String(v.staff_type),
                        ),
                      )
                    )
                      members.reload();
                  }}
                />
              )}
            </section>
          ))}
        </div>
      </article>
      <article>
        <h2>Invite an employee</h2>
        <p>
          Create a 72-hour, single-use invitation for an existing verified
          account. The invitation is not emailed. Privileged acceptance requires
          MFA.
        </p>
        <FieldsForm
          fields={[
            {
              name: 'email',
              label: 'Employee email',
              type: 'email',
              required: true,
              maxLength: 254,
            },
            {
              name: 'role',
              label: 'Invitation access role',
              type: 'select',
              options: options(['staff', 'admin']),
            },
            {
              name: 'staff_type',
              label: 'Invitation job role',
              type: 'select',
              options: options(['estimator', 'office_manager', 'field_staff']),
            },
          ]}
          submitLabel="Create invitation link"
          busy={task.busy}
          onSubmit={async (v) => {
            await task.run(async () => {
              const result = await repo.createInvitation(
                org,
                String(v.email),
                String(v.role) as StaffRole,
                String(v.staff_type),
              );
              setLink(
                `${window.location.origin}/${repo.sample ? 'preview/' : ''}join#token=${encodeURIComponent(result.token)}`,
              );
              invitations.reload();
            }, 'Invitation created. No message was sent.');
          }}
        />
        {link && (
          <label className="share-link">
            Private invitation link
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <small>
              Shown only in this session. Share through an approved channel;
              treat it as confidential.
            </small>
          </label>
        )}
        <ResourceStatus {...invitations} />
        <div className="record-list">
          {invitations.data?.map((i) => (
            <div key={i.id}>
              <strong>{i.email}</strong>
              <p>
                {i.role} · {i.staff_type.replaceAll('_', ' ')} ·{' '}
                {i.accepted_at
                  ? 'Accepted'
                  : i.revoked_at
                    ? 'Revoked'
                    : new Date(i.expires_at).getTime() < viewTime
                      ? 'Expired'
                      : 'Pending'}
              </p>
              {!i.accepted_at && !i.revoked_at && (
                <button
                  className="secondary"
                  disabled={task.busy}
                  onClick={() =>
                    void task.run(async () => {
                      await repo.revokeInvitation(org, i.id);
                      invitations.reload();
                    })
                  }
                >
                  Revoke invitation
                </button>
              )}
            </div>
          ))}
        </div>
      </article>
    </>
  );
}
