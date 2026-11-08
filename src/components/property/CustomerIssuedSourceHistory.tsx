import { useState } from 'react';
import type { CustomerPortalPreviewModel } from '../../lib/customer-preview';
import { PropertyReportHistory } from './PropertyReportHistory';
import { readCustomerIssuedSourceHistory } from './customer-issued-source-history';

type Props = {
  data: ReturnType<CustomerPortalPreviewModel['read']>;
  versionId: string;
  read(): ReturnType<CustomerPortalPreviewModel['read']>;
};
export function CustomerIssuedSourceHistory(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Inspect published source documentation</summary>
      {open && <Source {...props} />}
    </details>
  );
}
function Source({ data, versionId, read }: Props) {
  let source: ReturnType<typeof readCustomerIssuedSourceHistory> = null;
  try {
    source = readCustomerIssuedSourceHistory(read, data, versionId);
  } catch {
    // Missing, stale or denied relationships never select another report.
  }
  return (
    <section aria-label="Issued estimate published source">
      {source ? (
        <>
          <p>
            Source report {source.reports[0].id} · Published version{' '}
            {source.reports[0].version} · Finding {source.findingId}
          </p>
          <p>
            {data.context.company_name} · {data.context.property_label}
          </p>
          <PropertyReportHistory reports={source.reports} />
          <p>
            This report records observations. The issued estimate proposes work;
            neither proves customer approval, completed repairs or an invoice.
            Your unfinished review stays here while you inspect the source.
          </p>
        </>
      ) : (
        <p role="status">
          UNKNOWN — no exact published report and finding can be verified for
          this issued version. No other property report is substituted.
        </p>
      )}
    </section>
  );
}
