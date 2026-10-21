export const estimateUnits = [
  'each',
  'sq_ft',
  'linear_ft',
  'roofing_square',
  'bundle',
  'cubic_yard',
  'hour',
  'day',
  'lump_sum',
] as const;
export type EstimateUnit = (typeof estimateUnits)[number];
export type LineKind =
  'material' | 'product' | 'labor' | 'service' | 'allowance';
export interface EstimateLine {
  id: string;
  kind: LineKind;
  description: string;
  quantity_milli: number;
  unit: EstimateUnit;
  unit_cost_minor: number;
  unit_price_minor: number | null;
  markup_bps: number;
  taxable: boolean;
  option_id: string | null;
  catalog_item_id: string | null;
  internal_note: string;
  fixed_markup_minor: number;
  import_approval_id: string | null;
  material_import_line_ids: string[];
}
export interface EstimateOption {
  id: string;
  label: string;
  kind: 'exclusive' | 'addon';
  group: string | null;
  selected: boolean;
  description: string;
}
export interface SchedulePart {
  id: string;
  label: string;
  kind: 'deposit' | 'milestone' | 'dated';
  share_bps: number;
  due_on: string | null;
}
export interface EstimateInput {
  schema_version: 1;
  customer_id: string;
  location_id: string | null;
  currency: string;
  project: {
    name: string;
    type: string;
    description: string;
    start_on: string | null;
    end_on: string | null;
  };
  expires_on: string;
  internal_notes: string;
  customer_notes: string;
  terms: string;
  tax_policy_id: string | null;
  discount: { kind: 'none' | 'fixed' | 'percent'; value: number };
  lines: EstimateLine[];
  options: EstimateOption[];
  payment_schedule: SchedulePart[];
  attachments: { document_id: string; customer_visible: boolean }[];
}
export interface LineCalculation {
  id: string;
  included: boolean;
  unit_price_minor: number;
  subtotal_minor: number;
  cost_minor: number;
}
export interface EstimateCalculation {
  engine_version: 1;
  currency: string;
  lines: LineCalculation[];
  subtotal_minor: number;
  discount_minor: number;
  net_minor: number;
  taxable_subtotal_minor: number;
  taxable_discount_minor: number;
  taxable_net_minor: number;
  tax_rate_bps: number;
  tax_minor: number;
  total_minor: number;
  cost_minor: number;
  gross_profit_minor: number;
  profit_margin_bps: number;
  options: {
    id: string;
    selected: boolean;
    scope_subtotal_minor: number;
    scope_cost_minor: number;
  }[];
  payment_schedule: (SchedulePart & { amount_minor: number })[];
}
export interface TaxPolicy {
  id: string;
  organization_id: string;
  name: string;
  reference: string;
  jurisdiction: string;
  contract_type: string;
  rate_bps: number;
  status: 'draft' | 'reviewed';
  active: boolean;
  policy_version: number;
}
export interface CatalogItem {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  category: string;
  kind: LineKind;
  unit: EstimateUnit;
  unit_cost_minor: number;
  unit_price_minor: number | null;
  markup_bps: number;
  vendor: string;
  active: boolean;
}
export interface EstimateTemplate {
  id: string;
  organization_id: string;
  name: string;
  content: EstimateInput;
  active: boolean;
}
export interface EstimateSummary {
  id: string;
  organization_id: string;
  estimate_number: string;
  project_name: string;
  customer_id: string;
  current_version_id: string;
  status: 'draft' | 'issued' | 'archived';
  total_minor: number;
  currency: string;
  created_at: string;
  updated_at: string;
}
export interface EstimateVersion {
  id: string;
  organization_id: string;
  estimate_id: string;
  version_number: number;
  lock_revision: number;
  status: 'draft' | 'issued';
  payload: EstimateInput;
  calculation: EstimateCalculation;
  company_snapshot: CompanySnapshot;
  customer_snapshot: {
    id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
  };
  location_snapshot: {
    id: string;
    address_line1: string;
    city: string;
    region: string;
    postal_code: string;
    country_code: string;
  } | null;
  tax_policy_snapshot: TaxPolicy | null;
  attachment_snapshots: {
    document_id: string;
    customer_visible: boolean;
    display_name: string;
    content_type: string;
  }[];
  supersedes_version_id: string | null;
  created_at: string;
  issued_at: string | null;
}
export interface CompanySnapshot {
  name: string;
  primary_color: string;
  accent_color: string;
  business_address: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  logo_document_id: string | null;
}
export interface EstimateBundle {
  estimate: EstimateSummary;
  version: EstimateVersion;
}
export interface EstimateDefaults {
  currency: string;
  default_terms: string;
  expiration_days: number;
  material_markup_bps: number;
  labor_rate_minor: number;
  estimate_prefix: string;
  estimate_next_number: number;
}
// Interfaces for a later authorized acceptance/contract workflow. No executable acceptance endpoint.
export interface FutureEstimateAcceptance {
  organization_id: string;
  estimate_id: string;
  issued_version_id: string;
  calculation_engine_version: 1;
  consent_evidence_reference: string;
}
export interface FutureContractSource {
  organization_id: string;
  issued_version_id: string;
  immutable_calculation: EstimateCalculation;
  merchant_provider: 'authorize_net' | 'nmi' | null;
}
