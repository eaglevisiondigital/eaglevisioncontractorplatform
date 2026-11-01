import type { Decision } from '../release/types';
/** Staff-only provenance. Never part of EstimateInput or customer projections. */
export interface CustomerRevisionOrigin {
  organization_id: string;
  customer_id: string;
  location_id: string;
  estimate_id: string;
  source_version_id: string;
  source_version_number: number;
  offer_id: string;
  receipt: Decision;
  reviewed_by: string;
  reviewed_at: string;
  draft_version_id: string;
}
