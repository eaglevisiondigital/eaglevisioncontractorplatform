// Native-test page composition only. Not imported/mounted by App or a connected route.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { CustomerReviewPreference } from '../../../src/components/property/CustomerReviewPreference';
import { PersistedCustomerRequests } from '../../../src/components/phase3/PersistedCustomerRequests';
import {
  staffRequestQueue,
  type CustomerRequestStatus,
} from '../../../src/lib/customer-requests';
import type {
  CustomerReview,
  CustomerContext,
} from '../../../src/domain/customer/review';
declare global {
  interface Window {
    nativeReview: {
      review: CustomerReview;
      context: CustomerContext;
      customerName: string;
    };
    recordNativeRequest(note: string): Promise<CustomerRequestStatus>;
    readNativeQueue(): Promise<unknown>;
  }
}
function Harness() {
  const [receipt, setReceipt] = useState<CustomerRequestStatus>();
  const data = window.nativeReview;
  return (
    <main id="main">
      <h1>{data.context.company_name}</h1>
      <h2>Disposable local database review</h2>
      <h3>Issued estimate preference</h3>
      <p>
        Isolated identity fixtures; connected customer access remains disabled.
      </p>
      {!receipt && (
        <CustomerReviewPreference
          data={data}
          review={data.review}
          choice="changes_requested"
          evidence="durable-local"
          onRecord={async (note) => {
            setReceipt(await window.recordNativeRequest(note));
          }}
          onCancel={() => {}}
        />
      )}
      {receipt && (
        <p role="status">
          Persisted receipt {receipt.receipt?.id} · {receipt.outcome}
        </p>
      )}
      <PersistedCustomerRequests
        enabled
        organization={data.context.organization_id}
        reader={{
          queue: async (org) =>
            staffRequestQueue(await window.readNativeQueue(), org),
        }}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
