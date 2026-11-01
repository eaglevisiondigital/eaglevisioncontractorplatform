import type { MaintenanceSource } from './maintenance';
import type { EstimateInput } from '../estimating/types';

/** Staff-only session evidence. Never part of a published/customer projection. */
export interface RepairProvenance {
  source: MaintenanceSource;
  job_id: string | null;
  estimate_id: string;
  draft_version_id: string;
  draft_version_number: number;
  line_id: string;
  prepared_by: string;
  prepared_at: string;
  preparation_id: string;
}
export interface RepairReview {
  id: string;
  source: MaintenanceSource;
  maintenance_revision: number;
  plan_revision: number;
  job_baseline_version_id: string | null;
  job_id: string | null;
  actor: string;
  evidence: string;
  payload: EstimateInput;
}
export interface RepairAttempt {
  review: RepairReview;
  status: 'preparing' | 'prepared' | 'uncertain';
  provenance: RepairProvenance | null;
}
