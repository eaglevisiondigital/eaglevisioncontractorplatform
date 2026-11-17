import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Operations } from '../../lib/operations';
import type { Phase3Repository } from '../../lib/phase3';
import { baselineFromEstimate, type Job } from '../../domain/jobs/financials';
import { exactForecastSource } from './job-forecast-conflicts';

type Contact = {
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  preference: string;
  property: {
    id: string;
    street: string;
    street2: string | null;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  } | null;
};
export function JobCustomerContext({
  repo,
  operations,
  org,
  job,
}: {
  repo: Phase3Repository;
  operations: Operations;
  org: string;
  job: Job;
}) {
  const context = useMemo(
    () => ({ repo, operations, org, job }),
    [repo, operations, org, job],
  );
  const live = useRef<typeof context | undefined>(undefined);
  const running = useRef<typeof context | undefined>(undefined);
  const loadButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [activity, setActivity] = useState<typeof context>();
  const [read, setRead] = useState<{
    context: typeof context;
    contact: Contact;
  }>();
  const [status, setStatus] = useState<{
    context: typeof context;
    text: string;
  }>();
  useLayoutEffect(() => {
    live.current = context;
    return () => {
      if (live.current === context) live.current = undefined;
    };
  }, [context]);
  const current = read?.context === context ? read.contact : undefined;
  const busy = activity === context;
  useLayoutEffect(() => {
    if (current) heading.current?.focus();
  }, [current]);

  async function load() {
    if (running.current === context) return;
    running.current = context;
    setActivity(context);
    setRead(undefined);
    setStatus(undefined);
    const active = () => live.current === context;
    try {
      const expected = structuredClone(job);
      const allowed = async () => {
        const [access, modules] = await Promise.all([
          operations.companyAccess(org),
          operations.listModules(org),
        ]);
        return (
          access.estimates === true &&
          access.crm === true &&
          Array.isArray(modules) &&
          modules.every((m) => m.organization_id === org) &&
          ['estimates', 'crm'].every((name) =>
            modules.some((m) => m.module === name && m.enabled),
          )
        );
      };
      if (!(await allowed()) || !active()) throw Error('Unavailable');
      const readJob = async () => {
        const rows = await repo.jobs(org);
        if (
          !Array.isArray(rows) ||
          rows.some((row) => row.organization_id !== org) ||
          new Set(rows.map((row) => row.id)).size !== rows.length
        )
          throw Error('Unavailable');
        const matches = rows.filter((row) => row.id === expected.id);
        if (matches.length !== 1 || !active()) throw Error('Unavailable');
        const value = structuredClone(matches[0]);
        exactForecastSource(org, expected, value);
        return value;
      };
      await readJob();
      const source = await repo.sourceEstimate(
        org,
        expected.baseline.issued_version_id,
      );
      if (!active()) throw Error('Unavailable');
      const sourceBytes = JSON.stringify(source);
      const version = source.version;
      const customerId = version.payload.customer_id;
      const locationId = version.payload.location_id;
      const checkSource = () => {
        if (
          source.estimate.organization_id !== org ||
          version.organization_id !== org ||
          version.estimate_id !== source.estimate.id ||
          version.id !== expected.baseline.issued_version_id ||
          version.status !== 'issued' ||
          typeof customerId !== 'string' ||
          !customerId ||
          source.estimate.customer_id !== customerId ||
          (locationId !== null &&
            (typeof locationId !== 'string' || !locationId)) ||
          JSON.stringify(
            baselineFromEstimate(
              version.id,
              version.payload,
              version.calculation,
            ),
          ) !== JSON.stringify(expected.baseline)
        )
          throw Error('Unavailable');
      };
      checkSource();
      const [customer, property] = await Promise.all([
        operations.getCustomer(org, customerId),
        locationId ? operations.getLocation(org, customerId, locationId) : null,
      ]);
      const customerBytes = JSON.stringify(customer);
      const propertyBytes = JSON.stringify(property);
      const latest = await readJob();
      if (!(await allowed()) || !active()) throw Error('Unavailable');
      exactForecastSource(org, expected, job);
      exactForecastSource(org, expected, latest);
      checkSource();
      if (
        JSON.stringify(source) !== sourceBytes ||
        JSON.stringify(customer) !== customerBytes ||
        JSON.stringify(property) !== propertyBytes ||
        customer.organization_id !== org ||
        customer.id !== customerId ||
        typeof customer.display_name !== 'string' ||
        !customer.display_name.trim() ||
        !['email', 'phone', 'sms'].includes(customer.preferred_contact) ||
        [customer.email, customer.phone].some(
          (value) => value !== null && typeof value !== 'string',
        ) ||
        (locationId &&
          (!property ||
            property.organization_id !== org ||
            property.customer_id !== customerId ||
            property.id !== locationId)) ||
        (property &&
          [
            property.address_line1,
            property.city,
            property.region,
            property.postal_code,
            property.country_code,
          ].some((value) => typeof value !== 'string' || !value.trim())) ||
        (property?.address_line2 !== null &&
          property?.address_line2 !== undefined &&
          typeof property.address_line2 !== 'string')
      )
        throw Error('Unavailable');
      const contact: Contact = {
        customerId,
        name: customer.display_name,
        email: customer.email,
        phone: customer.phone,
        preference: customer.preferred_contact,
        property: property
          ? {
              id: property.id,
              street: property.address_line1,
              street2: property.address_line2,
              city: property.city,
              region: property.region,
              postalCode: property.postal_code,
              country: property.country_code,
            }
          : null,
      };
      if (!active()) return;
      setRead({ context, contact });
      setStatus({
        context,
        text: 'Current CRM details loaded for the original estimate link.',
      });
    } catch {
      if (active()) {
        setRead(undefined);
        setStatus({
          context,
          text: 'Customer and property context is unavailable or no longer matches this job. Refresh the job before a new read.',
        });
      }
    } finally {
      if (running.current === context) running.current = undefined;
      if (active()) setActivity(undefined);
    }
  }
  return (
    <details>
      <summary>Job customer &amp; property</summary>
      <p>
        Review current CRM contact details using this job’s original estimate
        link. Recorded contact preference is not messaging consent.
      </p>
      <div className="filters">
        <button
          ref={loadButton}
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          {current ? 'Refresh customer & property' : 'Load customer & property'}
        </button>
        {current && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setRead(undefined);
              setStatus(undefined);
              loadButton.current?.focus();
            }}
          >
            Clear contact view
          </button>
        )}
      </div>
      {status?.context === context && <p role="status">{status.text}</p>}
      {busy && <p role="status">Loading customer and property…</p>}
      {current && (
        <section
          aria-label="Job customer and property context"
          style={{ overflowWrap: 'anywhere' }}
        >
          <h3 ref={heading} tabIndex={-1}>
            {current.name}
          </h3>
          <p style={{ overflowWrap: 'anywhere' }}>
            Job {job.id} · Original issued version{' '}
            {job.baseline.issued_version_id}
          </p>
          <dl style={{ overflowWrap: 'anywhere' }}>
            <dt style={{ color: '#304c40' }}>Customer ID</dt>
            <dd>{current.customerId}</dd>
            <dt style={{ color: '#304c40' }}>Current CRM email</dt>
            <dd>{current.email || 'Not recorded'}</dd>
            <dt style={{ color: '#304c40' }}>Current CRM phone</dt>
            <dd>{current.phone || 'Not recorded'}</dd>
            <dt style={{ color: '#304c40' }}>Recorded contact preference</dt>
            <dd>{current.preference}</dd>
            <dt style={{ color: '#304c40' }}>
              Property linked to original estimate
            </dt>
            <dd>
              {current.property ? (
                <>
                  <span>{current.property.street}</span>
                  {current.property.street2 && (
                    <span>, {current.property.street2}</span>
                  )}
                  <br />
                  {current.property.city}, {current.property.region}{' '}
                  {current.property.postalCode} · {current.property.country}
                  <br />
                  Property ID {current.property.id}
                </>
              ) : (
                'No property was linked to the original estimate.'
              )}
            </dd>
          </dl>
          <p className="muted">
            These are CRM details observed at the explicit read. They may differ
            from the retained issued-estimate snapshots. No message is sent.
          </p>
        </section>
      )}
    </details>
  );
}
