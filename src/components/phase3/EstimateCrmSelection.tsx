import { useCallback, useState } from 'react';
import type { Operations } from '../../lib/operations';
import { crmPageSize } from '../../lib/operations';
import { useResource } from '../forms-state';
import { Field } from './fields';

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
      const [customers, selected, locations, property] = await Promise.all([
        operations.listCustomers(org, customerSearch, '', customerPage),
        operations.getCustomer(org, customerId),
        operations.listLocationPage(
          org,
          customerId,
          locationSearch,
          locationPage,
        ),
        locationId ? operations.getLocation(org, customerId, locationId) : null,
      ]);
      return { context, customers, selected, locations, property };
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
    ]),
  );
  // useResource intentionally retains old data during reload; it must never be
  // displayed or selectable under another query/customer/property context.
  const ready =
    data.data?.context === context && !data.loading && !data.error
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
      {data.error && (
        <button type="button" className="secondary" onClick={data.reload}>
          Reload CRM selection
        </button>
      )}
    </div>
  );
}
