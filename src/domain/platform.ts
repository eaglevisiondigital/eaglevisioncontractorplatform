import type { Json } from '../lib/database.types';
export type StaffRole = 'owner' | 'admin' | 'staff';
export type Industry = 'property_services' | 'construction' | 'roofing';
export interface CompanyProfile {
  id: string;
  name: string;
  slug: string;
  industry: Industry;
  primary_color: string;
  accent_color: string;
  logo_document_id: string | null;
  business_info: Json;
  status?: string;
  subscription_plan?: string;
}
export const modules = [
  { name: 'Overview', detail: 'Your company workspace', phase: 1 },
  {
    name: 'Customers',
    detail: 'Customer and service location foundation',
    phase: 1,
  },
  {
    name: 'Intake',
    detail: 'Tenant-scoped request records; public submission comes next',
    phase: 1,
  },
  { name: 'Team', detail: 'Staff roles, invitations and access', phase: 1 },
  {
    name: 'Estimates',
    detail: 'Versioned scope, pricing and approval · Phase 3',
    phase: 3,
  },
  {
    name: 'Contracts',
    detail: 'Approved templates and execution evidence · Phase 4',
    phase: 4,
  },
  {
    name: 'Invoices',
    detail: 'Issued balances and payment schedules · Phase 5',
    phase: 5,
  },
  {
    name: 'Payments',
    detail: 'Merchant onboarding, tokens and reconciliation · Phase 5',
    phase: 5,
  },
  {
    name: 'Documents',
    detail: 'Private storage and quarantine foundation',
    phase: 1,
  },
  {
    name: 'Company settings',
    detail: 'Branding, business profile and industry template',
    phase: 1,
  },
] as const;

// Synthetic presentation data; never persisted or mixed with connected results.
export const sampleCompanies: CompanyProfile[] = [
  {
    id: 'sample-property',
    name: 'Straight Edge Property Services',
    slug: 'straight-edge',
    industry: 'property_services',
    primary_color: '#247364',
    accent_color: '#dfb461',
    logo_document_id: null,
    business_info: {},
  },
  {
    id: 'sample-construction',
    name: 'Cunningham Construction',
    slug: 'cunningham',
    industry: 'construction',
    primary_color: '#a85a32',
    accent_color: '#dfb461',
    logo_document_id: null,
    business_info: {},
  },
  {
    id: 'sample-roofing',
    name: 'Roofing Company · Example',
    slug: 'roofing-example',
    industry: 'roofing',
    primary_color: '#355ea0',
    accent_color: '#dfb461',
    logo_document_id: null,
    business_info: {},
  },
];

export interface Money {
  minorUnits: number;
  currency: string;
}
export function money(minorUnits: number, currency: string): Money {
  if (!Number.isSafeInteger(minorUnits) || !/^[A-Z]{3}$/.test(currency))
    throw new Error('Invalid money');
  return { minorUnits, currency };
}
export interface MerchantConfiguration {
  organizationId: string;
  provider: string;
  merchantReference: string; // Opaque identifier, never account credentials.
  environment: 'sandbox' | 'live';
  status: 'unconfigured' | 'pending_review' | 'approved' | 'suspended';
}
export const paymentCapabilities = Object.freeze({
  liveCharges: false,
  scheduledCharges: false,
  surcharges: false,
});
