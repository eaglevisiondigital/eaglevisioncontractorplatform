import { useCallback, useState } from 'react';
import type {
  Operations,
  Customer,
  CustomerDraft,
  LocationDraft,
  Row,
} from '../lib/operations';
import {
  FieldsForm,
  Pagination,
  ResourceStatus,
  type Field,
  type Values,
} from './forms';
import { useResource, useTask, options } from './forms-state';
const customerFields: Field[] = [
  {
    name: 'display_name',
    label: 'Customer name',
    required: true,
    maxLength: 200,
  },
  { name: 'email', label: 'Email', type: 'email', maxLength: 254 },
  { name: 'phone', label: 'Phone', type: 'tel', maxLength: 40 },
  {
    name: 'customer_type',
    label: 'Customer type',
    type: 'select',
    options: options(['residential', 'commercial']),
  },
  {
    name: 'preferred_contact',
    label: 'Preferred contact method',
    type: 'select',
    options: options(['email', 'phone', 'sms']),
  },
];
const locationFields: Field[] = [
  { name: 'address_line1', label: 'Street address', required: true },
  { name: 'address_line2', label: 'Address line 2' },
  { name: 'city', label: 'City', required: true },
  { name: 'region', label: 'State / region', required: true },
  { name: 'postal_code', label: 'Postal code', required: true },
  { name: 'country_code', label: 'Country code', required: true, maxLength: 2 },
];
function LocationEditor({
  repo,
  org,
  customer,
  onSaved,
  location,
}: {
  repo: Operations;
  org: string;
  customer: string;
  onSaved: () => void;
  location?: Row<'service_locations'>;
}) {
  const task = useTask();
  return (
    <>
      <FieldsForm
        fields={locationFields}
        initial={location ?? { country_code: 'US' }}
        submitLabel={location ? 'Update location' : 'Add location'}
        busy={task.busy}
        onSubmit={async (v) => {
          if (
            await task.run(() =>
              repo.saveLocation(
                org,
                customer,
                v as unknown as LocationDraft,
                location?.id,
              ),
            )
          )
            onSaved();
        }}
      />
      <p role="status">{task.message}</p>
    </>
  );
}
function CustomerDetail({
  repo,
  org,
  customer,
  onClose,
  onSaved,
}: {
  repo: Operations;
  org: string;
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const task = useTask();
  const [duplicates, setDuplicates] = useState<Customer[]>([]);
  const [editingLocation, setEditingLocation] =
    useState<Row<'service_locations'>>();
  const history = useResource(
    useCallback(
      () =>
        customer
          ? repo.customerHistory(org, customer.id)
          : Promise.resolve(null),
      [repo, org, customer],
    ),
  );
  const locations = useResource(
    useCallback(
      () =>
        customer ? repo.listLocations(org, customer.id) : Promise.resolve([]),
      [repo, org, customer],
    ),
  );
  async function save(v: Values, intent: string) {
    const draft = v as unknown as CustomerDraft;
    if (intent === 'secondary') {
      await task.run(async () => {
        setDuplicates(
          await repo.duplicates(
            org,
            String(draft.email ?? ''),
            String(draft.phone ?? ''),
            customer?.id,
          ),
        );
      }, 'Duplicate check complete. Matches are limited to this company.');
      return;
    }
    if (
      await task.run(async () => {
        await repo.saveCustomer(org, draft, customer?.id);
      })
    ) {
      onSaved();
    }
  }
  return (
    <article className="detail-panel">
      <div className="section-title">
        <h2>{customer ? 'Customer details' : 'New customer'}</h2>
        <button className="secondary" onClick={onClose}>
          Close details
        </button>
      </div>
      <FieldsForm
        fields={customerFields}
        initial={customer ?? {}}
        submitLabel={customer ? 'Update customer' : 'Create customer'}
        secondaryLabel="Check duplicates"
        busy={task.busy}
        onSubmit={save}
      />
      <p role="status">{task.message}</p>
      {duplicates.length > 0 && (
        <div className="notice">
          <strong>Possible duplicates in this company</strong>
          <ul>
            {duplicates.map((c) => (
              <li key={c.id}>
                {c.display_name} · {c.email ?? c.phone}
              </li>
            ))}
          </ul>
          <p>No records are automatically merged.</p>
        </div>
      )}
      {customer && (
        <>
          <h3>Service locations</h3>
          <ResourceStatus {...locations} />
          <div className="record-list">
            {locations.data?.map((l) => (
              <div key={l.id}>
                <strong>{l.address_line1}</strong>
                <p>
                  {l.city}, {l.region} {l.postal_code}
                </p>
                <button
                  className="secondary"
                  onClick={() => setEditingLocation(l)}
                >
                  Edit location
                </button>
              </div>
            ))}
          </div>
          <details>
            <summary>
              {editingLocation
                ? 'Edit selected location'
                : 'Add service location'}
            </summary>
            <LocationEditor
              key={editingLocation?.id ?? 'new'}
              repo={repo}
              org={org}
              customer={customer.id}
              location={editingLocation}
              onSaved={() => {
                locations.reload();
                setEditingLocation(undefined);
              }}
            />
          </details>
          <h3>Contact consent</h3>
          <p>
            Record explicit customer permission. External messaging remains
            disabled.
          </p>
          <FieldsForm
            fields={[
              {
                name: 'email_allowed',
                label: 'Customer permits email contact',
                type: 'checkbox',
              },
              {
                name: 'sms_allowed',
                label: 'Customer permits SMS contact',
                type: 'checkbox',
              },
            ]}
            initial={{
              email_allowed: history.data?.consents[0]?.email_allowed ?? false,
              sms_allowed: history.data?.consents[0]?.sms_allowed ?? false,
            }}
            key={history.data?.consents[0]?.id ?? 'consent'}
            submitLabel="Record consent"
            busy={task.busy}
            onSubmit={async (v) => {
              if (
                await task.run(() =>
                  repo.recordConsent(
                    org,
                    customer.id,
                    Boolean(v.email_allowed),
                    Boolean(v.sms_allowed),
                  ),
                )
              )
                history.reload();
            }}
          />
          <h3>Notes and activity</h3>
          <FieldsForm
            fields={[
              {
                name: 'body',
                label: 'Internal customer note',
                type: 'textarea',
                required: true,
                maxLength: 5000,
              },
            ]}
            submitLabel="Add note"
            busy={task.busy}
            onSubmit={async (v) => {
              if (
                await task.run(() =>
                  repo.addNote(org, customer.id, String(v.body)),
                )
              )
                history.reload();
            }}
          />
          <ResourceStatus {...history} />
          <div className="timeline">
            {history.data?.notes.map((n) => (
              <div key={n.id}>
                <small>{new Date(n.created_at).toLocaleString()}</small>
                <p>{n.body}</p>
              </div>
            ))}
            {history.data?.requests.map((r) => (
              <div key={r.id}>
                <small>
                  Inquiry · {r.status} ·{' '}
                  {new Date(r.created_at).toLocaleDateString()}
                </small>
                <p>{r.summary}</p>
              </div>
            ))}
            {history.data?.consents.map((c) => (
              <div key={c.id}>
                <small>
                  Consent · {new Date(c.recorded_at).toLocaleString()} ·{' '}
                  {c.policy_version}
                </small>
                <p>
                  Email {c.email_allowed ? 'permitted' : 'not permitted'} · SMS{' '}
                  {c.sms_allowed ? 'permitted' : 'not permitted'}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
export function Customers({ repo, org }: { repo: Operations; org: string }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Customer | null | undefined>();
  const resource = useResource(
    useCallback(
      () => repo.listCustomers(org, q, kind, page),
      [repo, org, q, kind, page],
    ),
  );
  return (
    <>
      <article>
        <div className="section-title">
          <h2>Customer directory</h2>
          <button onClick={() => setSelected(null)}>New customer</button>
        </div>
        <div className="filters">
          <label>
            Search customers
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Name, email or phone"
            />
          </label>
          <label>
            Customer type
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All customers</option>
              {options(['residential', 'commercial']).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ResourceStatus {...resource} />
        <div className="record-list">
          {!resource.loading &&
            resource.data?.rows.map((c) => (
              <button
                className="record-button"
                key={c.id}
                onClick={() => setSelected(c)}
              >
                <span>
                  <strong>{c.display_name}</strong>
                  <small>
                    {c.email ?? 'No email'} · {c.phone ?? 'No phone'}
                  </small>
                </span>
                <span className="tag">{c.customer_type}</span>
              </button>
            ))}
          {!resource.loading && !resource.data?.rows.length && (
            <p>No customers match this view.</p>
          )}
        </div>
        <Pagination
          page={page}
          count={resource.data?.count ?? 0}
          onChange={setPage}
        />
      </article>
      {selected !== undefined && (
        <CustomerDetail
          key={selected?.id ?? 'new'}
          repo={repo}
          org={org}
          customer={selected}
          onClose={() => setSelected(undefined)}
          onSaved={() => {
            resource.reload();
            setSelected(undefined);
          }}
        />
      )}
    </>
  );
}
