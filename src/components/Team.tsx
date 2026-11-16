import { useCallback, useId, useState } from 'react';
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
  const filtersId = useId();
  const [search, setSearch] = useState('');
  const [accessRole, setAccessRole] = useState('all');
  const [membershipStatus, setMembershipStatus] = useState('all');
  const loadedMembers = (members.data ?? []).filter(
    (member) => member.organization_id === org,
  );
  const query = search.trim().toLowerCase();
  const visibleMembers = (
    members.loading || members.error ? [] : loadedMembers
  ).filter(
    (member) =>
      (accessRole === 'all' || member.role === accessRole) &&
      (membershipStatus === 'all' ||
        member.active === (membershipStatus === 'active')) &&
      [
        member.user_id,
        member.role,
        member.staff_type.replaceAll('_', ' '),
      ].some((value) => value.toLowerCase().includes(query)),
  );
  const peopleReady = !members.loading && !members.error && members.data;
  const hasFilters =
    search !== '' || accessRole !== 'all' || membershipStatus !== 'all';
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
        <fieldset>
          <legend>Find people</legend>
          <div className="filters">
            <label>
              Search people
              <input
                type="search"
                maxLength={254}
                value={search}
                aria-describedby={`${filtersId}-hint`}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              Filter access role
              <select
                value={accessRole}
                onChange={(event) => setAccessRole(event.target.value)}
              >
                <option value="all">All access roles</option>
                <option value="owner">Owner</option>
                <option value="admin">Administrator</option>
                <option value="staff">Staff</option>
              </select>
            </label>
            <label>
              Filter membership status
              <select
                value={membershipStatus}
                onChange={(event) => setMembershipStatus(event.target.value)}
              >
                <option value="all">All membership statuses</option>
                <option value="active">Active</option>
                <option value="revoked">Revoked</option>
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              disabled={!hasFilters}
              onClick={() => {
                setSearch('');
                setAccessRole('all');
                setMembershipStatus('all');
              }}
            >
              Clear people filters
            </button>
          </div>
          <p id={`${filtersId}-hint`}>
            Search loaded account IDs and recorded access or job roles.
          </p>
        </fieldset>
        {peopleReady && (
          <p role="status">
            {visibleMembers.length} of {loadedMembers.length} loaded people
            shown.
          </p>
        )}
        {peopleReady && loadedMembers.length === 0 && (
          <p>No people available in this view.</p>
        )}
        {peopleReady &&
          loadedMembers.length > 0 &&
          visibleMembers.length === 0 && <p>No people match these filters.</p>}
        <div className="record-list">
          {visibleMembers.map((m) => (
            <section key={m.user_id}>
              <strong>
                {m.role === 'staff'
                  ? m.staff_type.replaceAll('_', ' ')
                  : m.role}
              </strong>
              <small className="block">Account {m.user_id}</small>
              <span className="tag">{m.active ? 'Active' : 'Revoked'}</span>
              {m.role === 'owner' ? (
                <p>Owner grants require the Propel control plane.</p>
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
