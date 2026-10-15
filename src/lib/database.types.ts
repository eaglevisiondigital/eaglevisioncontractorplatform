// Generated from a disposable PostgreSQL catalog after applying committed migrations.
// Run npm run types:generate; do not hand-edit. Hosted schema verification is separate.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export interface Database {
  public: {
    Tables: {
      activity_events: {
        Row: {
          id: string;
          organization_id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          occurred_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          occurred_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          actor_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          occurred_at?: string;
        };
        Relationships: [];
      };
      communication_consents: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          email_allowed: boolean;
          sms_allowed: boolean;
          policy_version: string;
          source: string;
          recorded_by: string | null;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          email_allowed: boolean;
          sms_allowed: boolean;
          policy_version: string;
          source: string;
          recorded_by?: string | null;
          recorded_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          email_allowed?: boolean;
          sms_allowed?: boolean;
          policy_version?: string;
          source?: string;
          recorded_by?: string | null;
          recorded_at?: string;
        };
        Relationships: [];
      };
      company_modules: {
        Row: { organization_id: string; module: string; enabled: boolean };
        Insert: { organization_id: string; module: string; enabled?: boolean };
        Update: {
          organization_id?: string;
          module?: string;
          enabled?: boolean;
        };
        Relationships: [];
      };
      company_settings: {
        Row: {
          organization_id: string;
          business_address: string;
          contact_email: string;
          contact_phone: string;
          website: string;
          service_areas: string;
          specialties: string;
          license_metadata: string;
          insurance_metadata: string;
          estimate_prefix: string;
          estimate_next_number: number;
          default_terms: string;
          expiration_days: number;
          material_markup_bps: number;
          labor_rate_minor: number;
          currency: string;
          intake_enabled: boolean;
          service_categories: string[];
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          business_address?: string;
          contact_email?: string;
          contact_phone?: string;
          website?: string;
          service_areas?: string;
          specialties?: string;
          license_metadata?: string;
          insurance_metadata?: string;
          estimate_prefix?: string;
          estimate_next_number?: number;
          default_terms?: string;
          expiration_days?: number;
          material_markup_bps?: number;
          labor_rate_minor?: number;
          currency?: string;
          intake_enabled?: boolean;
          service_categories?: string[];
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          business_address?: string;
          contact_email?: string;
          contact_phone?: string;
          website?: string;
          service_areas?: string;
          specialties?: string;
          license_metadata?: string;
          insurance_metadata?: string;
          estimate_prefix?: string;
          estimate_next_number?: number;
          default_terms?: string;
          expiration_days?: number;
          material_markup_bps?: number;
          labor_rate_minor?: number;
          currency?: string;
          intake_enabled?: boolean;
          service_categories?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      customer_notes: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          body: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          body: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          body?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          organization_id: string;
          display_name: string;
          email: string | null;
          phone: string | null;
          created_at: string;
          customer_type: string;
          preferred_contact: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          display_name: string;
          email?: string | null;
          phone?: string | null;
          created_at?: string;
          customer_type?: string;
          preferred_contact?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          display_name?: string;
          email?: string | null;
          phone?: string | null;
          created_at?: string;
          customer_type?: string;
          preferred_contact?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          organization_id: string;
          object_name: string;
          display_name: string;
          content_type: string;
          byte_size: number;
          visibility: string;
          scan_status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          object_name: string;
          display_name: string;
          content_type: string;
          byte_size: number;
          visibility?: string;
          scan_status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          object_name?: string;
          display_name?: string;
          content_type?: string;
          byte_size?: number;
          visibility?: string;
          scan_status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      intake_requests: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string | null;
          service_location_id: string | null;
          assigned_to: string | null;
          summary: string;
          status: string;
          source: string;
          created_at: string;
          service_category: string;
          preferred_appointment: string;
          contact_preference: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id?: string | null;
          service_location_id?: string | null;
          assigned_to?: string | null;
          summary: string;
          status?: string;
          source?: string;
          created_at?: string;
          service_category?: string;
          preferred_appointment?: string;
          contact_preference?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string | null;
          service_location_id?: string | null;
          assigned_to?: string | null;
          summary?: string;
          status?: string;
          source?: string;
          created_at?: string;
          service_category?: string;
          preferred_appointment?: string;
          contact_preference?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lead_notifications: {
        Row: {
          id: string;
          organization_id: string;
          intake_request_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          intake_request_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          intake_request_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          organization_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'staff';
          active: boolean;
          created_at: string;
          staff_type: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'staff';
          active?: boolean;
          created_at?: string;
          staff_type?: string;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          role?: 'owner' | 'admin' | 'staff';
          active?: boolean;
          created_at?: string;
          staff_type?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          industry: 'property_services' | 'construction' | 'roofing';
          primary_color: string;
          accent_color: string;
          business_info: Json;
          logo_document_id: string | null;
          created_at: string;
          status: string;
          subscription_plan: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          industry: 'property_services' | 'construction' | 'roofing';
          primary_color?: string;
          accent_color?: string;
          business_info?: Json;
          logo_document_id?: string | null;
          created_at?: string;
          status?: string;
          subscription_plan?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          industry?: 'property_services' | 'construction' | 'roofing';
          primary_color?: string;
          accent_color?: string;
          business_info?: Json;
          logo_document_id?: string | null;
          created_at?: string;
          status?: string;
          subscription_plan?: string;
        };
        Relationships: [];
      };
      service_locations: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          address_line1: string;
          address_line2: string | null;
          city: string;
          region: string;
          postal_code: string;
          country_code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          address_line1: string;
          address_line2?: string | null;
          city: string;
          region: string;
          postal_code: string;
          country_code: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          address_line1?: string;
          address_line2?: string | null;
          city?: string;
          region?: string;
          postal_code?: string;
          country_code?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_invitation: { Args: { p_token: string | null }; Returns: string };
      assign_intake: {
        Args: {
          p_org: string | null;
          p_id: string | null;
          p_assignee: string | null;
          p_status: string | null;
        };
        Returns: undefined;
      };
      company_metrics: { Args: Record<string, never>; Returns: Json };
      configure_company: {
        Args: {
          p_org: string | null;
          p_status: string | null;
          p_plan: string | null;
          p_modules: Json | null;
          p_owner?: string | null;
        };
        Returns: undefined;
      };
      create_invitation: {
        Args: {
          p_org: string | null;
          p_email: string | null;
          p_role: 'owner' | 'admin' | 'staff' | null;
          p_staff_type: string | null;
        };
        Returns: Json;
      };
      intake_profile: { Args: { p_slug: string | null }; Returns: Json };
      list_invitations: { Args: { p_org: string | null }; Returns: Json };
      manage_member: {
        Args: {
          p_org: string | null;
          p_user: string | null;
          p_active: boolean | null;
          p_role: 'owner' | 'admin' | 'staff' | null;
          p_staff_type: string | null;
        };
        Returns: undefined;
      };
      platform_access: { Args: Record<string, never>; Returns: boolean };
      platform_activity: { Args: Record<string, never>; Returns: Json };
      provision_company: {
        Args: {
          p_name: string | null;
          p_slug: string | null;
          p_industry: 'property_services' | 'construction' | 'roofing' | null;
          p_owner: string | null;
        };
        Returns: string;
      };
      record_consent: {
        Args: {
          p_org: string | null;
          p_customer: string | null;
          p_email: boolean | null;
          p_sms: boolean | null;
        };
        Returns: undefined;
      };
      revoke_invitation: {
        Args: { p_org: string | null; p_id: string | null };
        Returns: undefined;
      };
      revoke_owner: {
        Args: { p_org: string | null; p_user: string | null };
        Returns: undefined;
      };
      save_company_profile: {
        Args: {
          p_org: string | null;
          p_profile: Json | null;
          p_settings: Json | null;
        };
        Returns: undefined;
      };
      submit_intake_gateway: {
        Args: {
          p_gateway_key: string | null;
          p_slug: string | null;
          p_payload: Json | null;
          p_fingerprint: string | null;
          p_key: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      industry_template: 'property_services' | 'construction' | 'roofing';
      staff_role: 'owner' | 'admin' | 'staff';
    };
    CompositeTypes: { [_ in never]: never };
  };
}
