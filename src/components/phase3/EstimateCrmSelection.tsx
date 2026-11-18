import { useCallback, useMemo, useState } from 'react';
import type {
  Operations,
  Customer,
  ServiceLocation,
  Page,
} from '../../lib/operations';
import { crmPageSize } from '../../lib/operations';
import { useResource } from '../forms-state';
import { Field } from './fields';

const unavailableCrm =
  'CRM selection is unavailable. Reload this selection to try again.';
const text = (value: unknown) => typeof value === 'string' && !!value.trim();
const optionalText = (value: unknown) =>
  value === null || typeof value === 'string';
const locality = (value: ServiceLocation) => {
  const place = [value.city, value.region].filter(text).join(', ');
  return (
    [place, value.postal_code].filter(text).join(' ') ||
    'City, region and postal code not recorded'
  );
};
const customerIdentity = (value: Customer) =>
  JSON.stringify([
    value.id,
    value.organization_id,
    value.display_name,
    value.email,
    value.phone,
    value.customer_type,
  ]);
const propertyIdentity = (value: ServiceLocation) =>
  JSON.stringify([
    value.id,
    value.organization_id,
    value.customer_id,
    value.address_line1,
    value.address_line2,
    value.city,
    value.region,
    value.postal_code,
    value.country_code,
  ]);
function checkedSelection(
  value: {
    customers: Page<Customer>;
    selected: Customer;
    locations: Page<ServiceLocation>;
    property: ServiceLocation | null;
  },
  org: string,
  customerId: string,
  locationId: string | null,
) {
  const customer = (c: Customer) =>
    c.organization_id === org &&
    text(c.id) &&
    typeof c.display_name === 'string' &&
    optionalText(c.email) &&
    optionalText(c.phone) &&
    ['residential', 'commercial'].includes(c.customer_type);
  const property = (p: ServiceLocation) =>
    p.organization_id === org &&
    p.customer_id === customerId &&
    text(p.id) &&
    [p.address_line1, p.city, p.region, p.postal_code, p.country_code].every(
      (value) => typeof value === 'string',
    ) &&
    optionalText(p.address_line2);
  const page = <T extends { id: string }>(
    p: Page<T>,
    valid: (row: T) => boolean,
  ) =>
    Array.isArray(p.rows) &&
    p.rows.length <= crmPageSize &&
    Number.isSafeInteger(p.count) &&
    p.count >= p.rows.length &&
    new Set(p.rows.map((r) => r.id)).size === p.rows.length &&
    p.rows.every(valid);
  if (
    !customer(value.selected) ||
    value.selected.id !== customerId ||
    !page(value.customers, customer) ||
    !page(value.locations, property) ||
    value.customers.rows.some(
      (c) =>
        c.id === customerId &&
        customerIdentity(c) !== customerIdentity(value.selected),
    ) ||
    (locationId === null
      ? value.property !== null
      : !value.property ||
        !property(value.property) ||
        value.property.id !== locationId) ||
    (value.property &&
      value.locations.rows.some(
        (p) =>
          p.id === locationId &&
          propertyIdentity(p) !== propertyIdentity(value.property!),
      ))
  )
    throw Error(unavailableCrm);
  return value;
}

/** Paged views only. Exact selected IDs are read separately and never inferred from a page. */
export function EstimateCrmSelection({
  operations,
  org,
  customerId,
  locationId,
  disabled,
  onChange,
}: {
  operations: Operations;
  org: string;
  customerId: string;
  locationId: string | null;
  disabled: boolean;
  onChange: (customer: string, location: string | null) => void;
}) {
  const [customerSearch, setCustomerSearch] = useState(''),
    [customerPage, setCustomerPage] = useState(0),
    [locationSearch, setLocationSearch] = useState(''),
    [locationPage, setLocationPage] = useState(0);
  const scope = useMemo(() => ({ operations, org }), [operations, org]);
  const context = JSON.stringify([
    org,
    customerId,
    locationId,
    customerSearch,
    customerPage,
    locationSearch,
    locationPage,
  ]);
  const data = useResource(
    useCallback(async () => {
      try {
        const [customers, selected, locations, property] = await Promise.all([
          operations.listCustomers(org, customerSearch, '', customerPage),
          operations.getCustomer(org, customerId),
          operations.listLocationPage(
            org,
            customerId,
            locationSearch,
            locationPage,
          ),
          locationId
            ? operations.getLocation(org, customerId, locationId)
            : null,
        ]);
        const value = checkedSelection(
          structuredClone({ customers, selected, locations, property }),
          org,
          customerId,
          locationId,
        );
        return { scope, context, ...value };
      } catch {
        throw Error(unavailableCrm);
      }
    }, [
      operations,
      org,
      customerId,
      locationId,
      customerSearch,
      customerPage,
      locationSearch,
      locationPage,
      context,
      scope,
    ]),
  );
  // useResource intentionally retains old data during reload; it must never be
  // displayed or selectable under another query/customer/property context.
  const ready =
    data.data?.scope === scope &&
    data.data.context === context &&
    !data.loading &&
    !data.error
      ? data.data
      : undefined;
  const customers = ready
    ? [
        ...new Map(
          [ready.selected, ...ready.customers.rows].map((c) => [c.id, c]),
        ).values(),
      ]
    : [];
  const locations = ready
    ? [
        ...new Map(
          [
            ...(ready.property ? [ready.property] : []),
            ...ready.locations.rows,
          ].map((l) => [l.id, l]),
        ).values(),
      ]
    : [];
  const status = (count: number, page: number, label: string) =>
    count
      ? `${label}: ${Math.min(page * crmPageSize + 1, count)}–${Math.min((page + 1) * crmPageSize, count)} of ${count} matching records`
      : `No ${label.toLowerCase()} match this search`;
  return (
    <div
      className="wide"
      aria-label="Estimate CRM selection"
      aria-busy={!ready && !data.error}
    >
      <div className="form-grid">
        <Field label="Find estimate customer">
          <input
            type="search"
            maxLength={100}
            value={customerSearch}
            disabled={disabled}
            onChange={(e) => {
              setCustomerSearch(e.target.value);
              setCustomerPage(0);
            }}
          />
        </Field>
        <Field label="Estimate customer">
          <select
            value={ready ? customerId : ''}
            disabled={disabled || !ready}
            onChange={(e) => {
              if (customers.some((c) => c.id === e.target.value))
                onChange(e.target.value, null);
            }}
          >
            {!ready && (
              <option value="">Customer unavailable while loading</option>
            )}
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p role="status">
        {ready
          ? status(ready.customers.count, customerPage, 'Customers')
          : data.error || 'Loading CRM selection…'}
      </p>
      <div
        className="action-row"
        role="group"
        aria-label="Customer result pages"
      >
        <button
          type="button"
          className="secondary"
          disabled={disabled || !ready || customerPage === 0}
          onClick={() => setCustomerPage((p) => p - 1)}
        >
          Previous customers
        </button>
        <button
          type="button"
          className="secondary"
          disabled={
            disabled ||
            !ready ||
            (customerPage + 1) * crmPageSize >= ready.customers.count
          }
          onClick={() => setCustomerPage((p) => p + 1)}
        >
          Next customers
        </button>
        <button
          type="button"
          className="secondary"
          disabled={disabled || (!customerSearch && customerPage === 0)}
          onClick={() => {
            setCustomerSearch('');
            setCustomerPage(0);
          }}
        >
          Reset customer search
        </button>
      </div>
      <div className="form-grid">
        <Field label="Find job location">
          <input
            type="search"
            maxLength={100}
            value={locationSearch}
            disabled={disabled}
            onChange={(e) => {
              setLocationSearch(e.target.value);
              setLocationPage(0);
            }}
          />
        </Field>
        <Field label="Job location">
          <select
            value={ready ? (locationId ?? '') : ''}
            disabled={disabled || !ready}
            onChange={(e) => {
              if (
                !e.target.value ||
                locations.some(
                  (l) =>
                    l.id === e.target.value && l.customer_id === customerId,
                )
              )
                onChange(customerId, e.target.value || null);
            }}
          >
            <option value="">No location selected</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.address_line1}, {l.city}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {ready && (
        <p role="status">
          {status(ready.locations.count, locationPage, 'Locations')}
        </p>
      )}
      <div
        className="action-row"
        role="group"
        aria-label="Location result pages"
      >
        <button
          type="button"
          className="secondary"
          disabled={disabled || !ready || locationPage === 0}
          onClick={() => setLocationPage((p) => p - 1)}
        >
          Previous locations
        </button>
        <button
          type="button"
          className="secondary"
          disabled={
            disabled ||
            !ready ||
            (locationPage + 1) * crmPageSize >= ready.locations.count
          }
          onClick={() => setLocationPage((p) => p + 1)}
        >
          Next locations
        </button>
        <button
          type="button"
          className="secondary"
          disabled={disabled || (!locationSearch && locationPage === 0)}
          onClick={() => {
            setLocationSearch('');
            setLocationPage(0);
          }}
        >
          Reset location search
        </button>
      </div>
      <p className="muted">
        The selected customer and property stay available across pages. Search
        results show accessible CRM records; they do not grant customer access.
      </p>
      <details>
        <summary>Selected customer &amp; property</summary>
        {ready ? (
          <section
            aria-label="Selected CRM details"
            style={{ overflowWrap: 'anywhere' }}
          >
            <h3>
              {ready.selected.display_name || 'Customer name not recorded'}
            </h3>
            <p>Current CRM details for this selection.</p>
            <dl>
              <dt style={{ color: '#304c40' }}>Customer email</dt>
              <dd>{ready.selected.email || 'Not recorded'}</dd>
              <dt style={{ color: '#304c40' }}>Customer phone</dt>
              <dd>{ready.selected.phone || 'Not recorded'}</dd>
              <dt style={{ color: '#304c40' }}>Customer type</dt>
              <dd>{ready.selected.customer_type}</dd>
              <dt style={{ color: '#304c40' }}>Selected property</dt>
              <dd>
                {ready.property ? (
                  <>
                    {text(ready.property.address_line1)
                      ? ready.property.address_line1
                      : 'Street address not recorded'}
                    {ready.property.address_line2 && (
                      <>, {ready.property.address_line2}</>
                    )}
                    <br />
                    {locality(ready.property)}
                    <br />
                    {text(ready.property.country_code)
                      ? ready.property.country_code
                      : 'Country not recorded'}
                  </>
                ) : (
                  'No property selected.'
                )}
              </dd>
            </dl>
          </section>
        ) : (
          <p>
            CRM details are unavailable while the selection is loading or
            unavailable.
          </p>
        )}
      </details>
      {data.error && (
        <button type="button" className="secondary" onClick={data.reload}>
          Reload CRM selection
        </button>
      )}
    </div>
  );
}
