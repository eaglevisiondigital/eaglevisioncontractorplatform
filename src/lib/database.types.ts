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
      catalog_items: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string;
          category: string;
          kind: string;
          unit: string;
          unit_cost_minor: number;
          unit_price_minor: number | null;
          markup_bps: number;
          vendor: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string;
          category?: string;
          kind: string;
          unit: string;
          unit_cost_minor: number;
          unit_price_minor?: number | null;
          markup_bps?: number;
          vendor?: string;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string;
          category?: string;
          kind?: string;
          unit?: string;
          unit_cost_minor?: number;
          unit_price_minor?: number | null;
          markup_bps?: number;
          vendor?: string;
          active?: boolean;
          created_at?: string;
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
      company_email_profiles: {
        Row: {
          organization_id: string;
          sender_name: string;
          sender_email: string;
          domain: string;
          status: string;
          verification_reference: string | null;
        };
        Insert: {
          organization_id: string;
          sender_name: string;
          sender_email: string;
          domain: string;
          status?: string;
          verification_reference?: string | null;
        };
        Update: {
          organization_id?: string;
          sender_name?: string;
          sender_email?: string;
          domain?: string;
          status?: string;
          verification_reference?: string | null;
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
      estimate_attachments: {
        Row: {
          organization_id: string;
          version_id: string;
          document_id: string;
          customer_visible: boolean;
        };
        Insert: {
          organization_id: string;
          version_id: string;
          document_id: string;
          customer_visible: boolean;
        };
        Update: {
          organization_id?: string;
          version_id?: string;
          document_id?: string;
          customer_visible?: boolean;
        };
        Relationships: [];
      };
      estimate_lines: {
        Row: {
          organization_id: string;
          version_id: string;
          id: string;
          position: number;
          catalog_item_id: string | null;
          option_id: string | null;
          content: Json;
          calculation: Json;
        };
        Insert: {
          organization_id: string;
          version_id: string;
          id: string;
          position: number;
          catalog_item_id?: string | null;
          option_id?: string | null;
          content: Json;
          calculation: Json;
        };
        Update: {
          organization_id?: string;
          version_id?: string;
          id?: string;
          position?: number;
          catalog_item_id?: string | null;
          option_id?: string | null;
          content?: Json;
          calculation?: Json;
        };
        Relationships: [];
      };
      estimate_options: {
        Row: {
          organization_id: string;
          version_id: string;
          id: string;
          position: number;
          content: Json;
        };
        Insert: {
          organization_id: string;
          version_id: string;
          id: string;
          position: number;
          content: Json;
        };
        Update: {
          organization_id?: string;
          version_id?: string;
          id?: string;
          position?: number;
          content?: Json;
        };
        Relationships: [];
      };
      estimate_schedule_proposals: {
        Row: {
          organization_id: string;
          version_id: string;
          id: string;
          position: number;
          content: Json;
        };
        Insert: {
          organization_id: string;
          version_id: string;
          id: string;
          position: number;
          content: Json;
        };
        Update: {
          organization_id?: string;
          version_id?: string;
          id?: string;
          position?: number;
          content?: Json;
        };
        Relationships: [];
      };
      estimate_tax_policies: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          reference: string;
          jurisdiction: string;
          contract_type: string;
          rate_bps: number;
          status: string;
          active: boolean;
          policy_version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          reference: string;
          jurisdiction: string;
          contract_type: string;
          rate_bps: number;
          status?: string;
          active?: boolean;
          policy_version?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          reference?: string;
          jurisdiction?: string;
          contract_type?: string;
          rate_bps?: number;
          status?: string;
          active?: boolean;
          policy_version?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      estimate_templates: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          content: Json;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          content: Json;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          content?: Json;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      estimate_versions: {
        Row: {
          id: string;
          organization_id: string;
          estimate_id: string;
          version_number: number;
          lock_revision: number;
          status: string;
          customer_id: string;
          location_id: string | null;
          tax_policy_id: string | null;
          payload: Json;
          calculation: Json;
          company_snapshot: Json;
          customer_snapshot: Json;
          location_snapshot: Json | null;
          tax_policy_snapshot: Json | null;
          attachment_snapshots: Json;
          supersedes_version_id: string | null;
          created_by: string;
          created_at: string;
          issued_by: string | null;
          issued_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          estimate_id: string;
          version_number: number;
          lock_revision?: number;
          status?: string;
          customer_id: string;
          location_id?: string | null;
          tax_policy_id?: string | null;
          payload: Json;
          calculation: Json;
          company_snapshot: Json;
          customer_snapshot: Json;
          location_snapshot?: Json | null;
          tax_policy_snapshot?: Json | null;
          attachment_snapshots?: Json;
          supersedes_version_id?: string | null;
          created_by?: string;
          created_at?: string;
          issued_by?: string | null;
          issued_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          estimate_id?: string;
          version_number?: number;
          lock_revision?: number;
          status?: string;
          customer_id?: string;
          location_id?: string | null;
          tax_policy_id?: string | null;
          payload?: Json;
          calculation?: Json;
          company_snapshot?: Json;
          customer_snapshot?: Json;
          location_snapshot?: Json | null;
          tax_policy_snapshot?: Json | null;
          attachment_snapshots?: Json;
          supersedes_version_id?: string | null;
          created_by?: string;
          created_at?: string;
          issued_by?: string | null;
          issued_at?: string | null;
        };
        Relationships: [];
      };
      estimates: {
        Row: {
          id: string;
          organization_id: string;
          estimate_number: string;
          project_name: string;
          customer_id: string;
          current_version_id: string | null;
          status: string;
          total_minor: number;
          currency: string;
          creation_key: string;
          creation_hash: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          estimate_number: string;
          project_name: string;
          customer_id: string;
          current_version_id?: string | null;
          status?: string;
          total_minor?: number;
          currency: string;
          creation_key: string;
          creation_hash: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          estimate_number?: string;
          project_name?: string;
          customer_id?: string;
          current_version_id?: string | null;
          status?: string;
          total_minor?: number;
          currency?: string;
          creation_key?: string;
          creation_hash?: string;
          created_at?: string;
          updated_at?: string;
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
      job_assignments: {
        Row: {
          organization_id: string;
          job_id: string;
          user_id: string;
          active: boolean;
        };
        Insert: {
          organization_id: string;
          job_id: string;
          user_id: string;
          active?: boolean;
        };
        Update: {
          organization_id?: string;
          job_id?: string;
          user_id?: string;
          active?: boolean;
        };
        Relationships: [];
      };
      job_change_approvals: {
        Row: {
          id: string;
          organization_id: string;
          change_id: string;
          authorization_reference: string;
          approved_by: string;
          approved_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          change_id: string;
          authorization_reference: string;
          approved_by?: string;
          approved_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          change_id?: string;
          authorization_reference?: string;
          approved_by?: string;
          approved_at?: string;
        };
        Relationships: [];
      };
      job_change_orders: {
        Row: {
          id: string;
          organization_id: string;
          job_id: string;
          description: string;
          revenue_minor: number;
          cost_minor: number;
          category: string;
          status: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          job_id: string;
          description: string;
          revenue_minor: number;
          cost_minor: number;
          category: string;
          status: string;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          job_id?: string;
          description?: string;
          revenue_minor?: number;
          cost_minor?: number;
          category?: string;
          status?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      job_expense_material_lines: {
        Row: {
          organization_id: string;
          approval_id: string;
          line_id: string;
          expense_id: string;
        };
        Insert: {
          organization_id: string;
          approval_id: string;
          line_id: string;
          expense_id: string;
        };
        Update: {
          organization_id?: string;
          approval_id?: string;
          line_id?: string;
          expense_id?: string;
        };
        Relationships: [];
      };
      job_expense_reviews: {
        Row: {
          id: string;
          organization_id: string;
          job_id: string;
          submission_id: string;
          decision: string;
          reason: string;
          reviewed_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          job_id: string;
          submission_id: string;
          decision: string;
          reason: string;
          reviewed_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          job_id?: string;
          submission_id?: string;
          decision?: string;
          reason?: string;
          reviewed_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      job_expenses: {
        Row: {
          id: string;
          organization_id: string;
          job_id: string;
          submitted_by: string;
          submitted_at: string;
          purchase_key: string;
          supplier: string;
          reference: string;
          category: string;
          kind: string;
          amount_minor: number;
          description: string;
          labor_worker_id: string | null;
          estimate_line_id: string | null;
          quantity_milli: number | null;
          unit: string | null;
          unit_cost_minor: number | null;
          material_import_line_ids: string[];
          document_ids: string[];
          material_approval_id: string | null;
          adjusts_expense_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          job_id: string;
          submitted_by?: string;
          submitted_at?: string;
          purchase_key: string;
          supplier: string;
          reference: string;
          category: string;
          kind: string;
          amount_minor: number;
          description: string;
          labor_worker_id?: string | null;
          estimate_line_id?: string | null;
          quantity_milli?: number | null;
          unit?: string | null;
          unit_cost_minor?: number | null;
          material_import_line_ids?: string[];
          document_ids?: string[];
          material_approval_id?: string | null;
          adjusts_expense_id?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          job_id?: string;
          submitted_by?: string;
          submitted_at?: string;
          purchase_key?: string;
          supplier?: string;
          reference?: string;
          category?: string;
          kind?: string;
          amount_minor?: number;
          description?: string;
          labor_worker_id?: string | null;
          estimate_line_id?: string | null;
          quantity_milli?: number | null;
          unit?: string | null;
          unit_cost_minor?: number | null;
          material_import_line_ids?: string[];
          document_ids?: string[];
          material_approval_id?: string | null;
          adjusts_expense_id?: string | null;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          estimate_id: string;
          baseline_version_id: string;
          baseline: Json;
          projection: Json;
          lock_revision: number;
          approved_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          estimate_id: string;
          baseline_version_id: string;
          baseline: Json;
          projection: Json;
          lock_revision?: number;
          approved_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          estimate_id?: string;
          baseline_version_id?: string;
          baseline?: Json;
          projection?: Json;
          lock_revision?: number;
          approved_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      labor_rates: {
        Row: {
          id: string;
          organization_id: string;
          worker_id: string;
          effective_from: string;
          cash_hour_minor: number;
          salary_week_minor: number;
          burden_bps: number;
          estimated_loaded_hour_minor: number;
          billing_hour_minor: number;
          imputed_hour_minor: number;
          overtime_eligible: boolean;
          classification_review_reference: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          worker_id: string;
          effective_from: string;
          cash_hour_minor: number;
          salary_week_minor?: number;
          burden_bps: number;
          estimated_loaded_hour_minor: number;
          billing_hour_minor: number;
          imputed_hour_minor: number;
          overtime_eligible: boolean;
          classification_review_reference: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          worker_id?: string;
          effective_from?: string;
          cash_hour_minor?: number;
          salary_week_minor?: number;
          burden_bps?: number;
          estimated_loaded_hour_minor?: number;
          billing_hour_minor?: number;
          imputed_hour_minor?: number;
          overtime_eligible?: boolean;
          classification_review_reference?: string;
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
      material_import_approvals: {
        Row: {
          id: string;
          organization_id: string;
          batch_id: string;
          estimate_id: string;
          job_id: string | null;
          approved_by: string;
          approved_at: string;
          review_snapshot: Json;
          source_snapshots: Json;
          estimate_lines: Json;
          cost_minor: number;
          price_minor: number;
          currency: string;
        };
        Insert: {
          id: string;
          organization_id: string;
          batch_id: string;
          estimate_id: string;
          job_id?: string | null;
          approved_by?: string;
          approved_at?: string;
          review_snapshot: Json;
          source_snapshots: Json;
          estimate_lines: Json;
          cost_minor: number;
          price_minor: number;
          currency: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          batch_id?: string;
          estimate_id?: string;
          job_id?: string | null;
          approved_by?: string;
          approved_at?: string;
          review_snapshot?: Json;
          source_snapshots?: Json;
          estimate_lines?: Json;
          cost_minor?: number;
          price_minor?: number;
          currency?: string;
        };
        Relationships: [];
      };
      material_import_batches: {
        Row: {
          id: string;
          organization_id: string;
          estimate_id: string;
          job_id: string | null;
          purpose: string;
          status: string;
          lock_revision: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          estimate_id: string;
          job_id?: string | null;
          purpose?: string;
          status?: string;
          lock_revision?: number;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          estimate_id?: string;
          job_id?: string | null;
          purpose?: string;
          status?: string;
          lock_revision?: number;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      material_import_preferences: {
        Row: { organization_id: string; mode: string; value: number };
        Insert: { organization_id: string; mode?: string; value?: number };
        Update: { organization_id?: string; mode?: string; value?: number };
        Relationships: [];
      };
      material_import_sources: {
        Row: {
          id: string;
          organization_id: string;
          batch_id: string;
          job_id: string | null;
          filename: string;
          mime: string;
          byte_size: number;
          sha256: string;
          status: string;
          provenance: string;
          scan_evidence: Json | null;
          extraction: Json | null;
          provider_metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          batch_id: string;
          job_id?: string | null;
          filename: string;
          mime: string;
          byte_size: number;
          sha256: string;
          status?: string;
          provenance?: string;
          scan_evidence?: Json | null;
          extraction?: Json | null;
          provider_metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          batch_id?: string;
          job_id?: string | null;
          filename?: string;
          mime?: string;
          byte_size?: number;
          sha256?: string;
          status?: string;
          provenance?: string;
          scan_evidence?: Json | null;
          extraction?: Json | null;
          provider_metadata?: Json | null;
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
      payroll_adjustments: {
        Row: {
          id: string;
          organization_id: string;
          source_period_id: string;
          entry_id: string;
          job_id: string | null;
          effective_at: string;
          cash_minor: number;
          burden_minor: number;
          imputed_minor: number;
          reason: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          source_period_id: string;
          entry_id: string;
          job_id?: string | null;
          effective_at: string;
          cash_minor: number;
          burden_minor: number;
          imputed_minor: number;
          reason: string;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          source_period_id?: string;
          entry_id?: string;
          job_id?: string | null;
          effective_at?: string;
          cash_minor?: number;
          burden_minor?: number;
          imputed_minor?: number;
          reason?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      payroll_periods: {
        Row: {
          id: string;
          organization_id: string;
          starts_at: string;
          ends_at: string;
          status: string;
          deductions: Json;
          snapshot: Json | null;
          locked_by: string | null;
          locked_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          starts_at: string;
          ends_at: string;
          status?: string;
          deductions?: Json;
          snapshot?: Json | null;
          locked_by?: string | null;
          locked_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          starts_at?: string;
          ends_at?: string;
          status?: string;
          deductions?: Json;
          snapshot?: Json | null;
          locked_by?: string | null;
          locked_at?: string | null;
        };
        Relationships: [];
      };
      portal_identities: {
        Row: {
          organization_id: string;
          customer_id: string;
          user_id: string;
          active: boolean;
        };
        Insert: {
          organization_id: string;
          customer_id: string;
          user_id: string;
          active?: boolean;
        };
        Update: {
          organization_id?: string;
          customer_id?: string;
          user_id?: string;
          active?: boolean;
        };
        Relationships: [];
      };
      release_authorizations: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          invoice_id: string;
          amount_minor: number;
          currency: string;
          scope: string;
          expires_at: string;
          created_at: string;
          actor_id: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          invoice_id: string;
          amount_minor: number;
          currency: string;
          scope: string;
          expires_at: string;
          created_at?: string;
          actor_id?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          invoice_id?: string;
          amount_minor?: number;
          currency?: string;
          scope?: string;
          expires_at?: string;
          created_at?: string;
          actor_id?: string;
        };
        Relationships: [];
      };
      release_contracts: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          offer_id: string;
          legal_reference: string;
          terms: string;
          document: Json;
          document_hash: string;
          created_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          offer_id: string;
          legal_reference: string;
          terms: string;
          document: Json;
          document_hash: string;
          created_at?: string;
          created_by?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          offer_id?: string;
          legal_reference?: string;
          terms?: string;
          document?: Json;
          document_hash?: string;
          created_at?: string;
          created_by?: string;
        };
        Relationships: [];
      };
      release_decisions: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          offer_id: string;
          decision: string;
          note: string;
          consent_version: string;
          actor_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          offer_id: string;
          decision: string;
          note: string;
          consent_version: string;
          actor_id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          offer_id?: string;
          decision?: string;
          note?: string;
          consent_version?: string;
          actor_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      release_invoices: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          contract_id: string;
          invoice_number: string;
          currency: string;
          total_minor: number;
          snapshot: Json;
          created_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          contract_id: string;
          invoice_number: string;
          currency: string;
          total_minor: number;
          snapshot: Json;
          created_at?: string;
          created_by?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          contract_id?: string;
          invoice_number?: string;
          currency?: string;
          total_minor?: number;
          snapshot?: Json;
          created_at?: string;
          created_by?: string;
        };
        Relationships: [];
      };
      release_ledger_entries: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          invoice_id: string;
          event_id: string | null;
          currency: string;
          debit_account: string;
          credit_account: string;
          amount_minor: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          invoice_id: string;
          event_id?: string | null;
          currency: string;
          debit_account: string;
          credit_account: string;
          amount_minor: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          invoice_id?: string;
          event_id?: string | null;
          currency?: string;
          debit_account?: string;
          credit_account?: string;
          amount_minor?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      release_messages: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          offer_id: string;
          channel: string;
          subject: string;
          body: string;
          created_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          offer_id: string;
          channel?: string;
          subject: string;
          body: string;
          created_at?: string;
          created_by?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          offer_id?: string;
          channel?: string;
          subject?: string;
          body?: string;
          created_at?: string;
          created_by?: string;
        };
        Relationships: [];
      };
      release_offers: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          version_id: string;
          snapshot: Json;
          expires_at: string;
          created_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          version_id: string;
          snapshot: Json;
          expires_at: string;
          created_at?: string;
          created_by?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          version_id?: string;
          snapshot?: Json;
          expires_at?: string;
          created_at?: string;
          created_by?: string;
        };
        Relationships: [];
      };
      release_payment_events: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          invoice_id: string;
          authorization_id: string;
          amount_minor: number;
          currency: string;
          kind: string;
          adjusts_event_id: string | null;
          idempotency_key: string;
          provider: string;
          created_at: string;
          actor_id: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          invoice_id: string;
          authorization_id: string;
          amount_minor: number;
          currency: string;
          kind: string;
          adjusts_event_id?: string | null;
          idempotency_key: string;
          provider?: string;
          created_at?: string;
          actor_id?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          invoice_id?: string;
          authorization_id?: string;
          amount_minor?: number;
          currency?: string;
          kind?: string;
          adjusts_event_id?: string | null;
          idempotency_key?: string;
          provider?: string;
          created_at?: string;
          actor_id?: string;
        };
        Relationships: [];
      };
      release_signatures: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          contract_id: string;
          typed_name: string;
          document_hash: string;
          consent_version: string;
          actor_id: string;
          signed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          contract_id: string;
          typed_name: string;
          document_hash: string;
          consent_version: string;
          actor_id?: string;
          signed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          contract_id?: string;
          typed_name?: string;
          document_hash?: string;
          consent_version?: string;
          actor_id?: string;
          signed_at?: string;
          created_at?: string;
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
      time_entries: {
        Row: {
          id: string;
          organization_id: string;
          worker_id: string;
          job_id: string | null;
          overhead_center: string | null;
          task: string;
          kind: string;
          started_at: string;
          ended_at: string | null;
          submitted: boolean;
          billable: boolean;
          corrects_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          worker_id: string;
          job_id?: string | null;
          overhead_center?: string | null;
          task: string;
          kind: string;
          started_at: string;
          ended_at?: string | null;
          submitted?: boolean;
          billable?: boolean;
          corrects_id?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          worker_id?: string;
          job_id?: string | null;
          overhead_center?: string | null;
          task?: string;
          kind?: string;
          started_at?: string;
          ended_at?: string | null;
          submitted?: boolean;
          billable?: boolean;
          corrects_id?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      time_reviews: {
        Row: {
          id: string;
          organization_id: string;
          entry_id: string;
          decision: string;
          reason: string;
          reviewed_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          entry_id: string;
          decision: string;
          reason: string;
          reviewed_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          entry_id?: string;
          decision?: string;
          reason?: string;
          reviewed_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      worker_profiles: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          display_name: string;
          worker_type: string;
          cost_source: string;
          active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          display_name: string;
          worker_type: string;
          cost_source: string;
          active?: boolean;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          display_name?: string;
          worker_type?: string;
          cost_source?: string;
          active?: boolean;
        };
        Relationships: [];
      };
      worker_supervisors: {
        Row: { organization_id: string; worker_id: string; user_id: string };
        Insert: { organization_id: string; worker_id: string; user_id: string };
        Update: {
          organization_id?: string;
          worker_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      workforce_policies: {
        Row: {
          organization_id: string;
          currency: string;
          timezone: string;
          week_start: number;
          overtime_after_seconds: number;
          overtime_multiplier_bps: number;
          review_reference: string;
          overhead_centers: string[];
        };
        Insert: {
          organization_id: string;
          currency?: string;
          timezone?: string;
          week_start?: number;
          overtime_after_seconds?: number;
          overtime_multiplier_bps?: number;
          review_reference?: string;
          overhead_centers?: string[];
        };
        Update: {
          organization_id?: string;
          currency?: string;
          timezone?: string;
          week_start?: number;
          overtime_after_seconds?: number;
          overtime_multiplier_bps?: number;
          review_reference?: string;
          overhead_centers?: string[];
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_invitation: { Args: { p_token: string | null }; Returns: string };
      adjust_payroll: {
        Args: { p_org: string | null; p_adjustment: Json | null };
        Returns: string;
      };
      apply_material_import: {
        Args: {
          p_org: string | null;
          p_estimate: string | null;
          p_version: string | null;
          p_lock: number | null;
          p_approval: string | null;
        };
        Returns: Json;
      };
      approve_and_apply_material_import: {
        Args: {
          p_org: string | null;
          p_batch: string | null;
          p_batch_lock: number | null;
          p_estimate: string | null;
          p_version: string | null;
          p_lock: number | null;
          p_review: Json | null;
        };
        Returns: Json;
      };
      approve_job: {
        Args: { p_org: string | null; p_version: string | null };
        Returns: string;
      };
      approve_job_change: {
        Args: {
          p_org: string | null;
          p_change: string | null;
          p_authorization: string | null;
        };
        Returns: undefined;
      };
      approve_material_import: {
        Args: {
          p_org: string | null;
          p_batch: string | null;
          p_lock: number | null;
          p_review: Json | null;
        };
        Returns: Json;
      };
      archive_estimate: {
        Args: {
          p_org: string | null;
          p_estimate: string | null;
          p_archived: boolean | null;
        };
        Returns: undefined;
      };
      assign_intake: {
        Args: {
          p_org: string | null;
          p_id: string | null;
          p_assignee: string | null;
          p_status: string | null;
        };
        Returns: undefined;
      };
      assign_job: {
        Args: {
          p_org: string | null;
          p_job: string | null;
          p_user: string | null;
          p_active: boolean | null;
        };
        Returns: undefined;
      };
      assign_supervisor: {
        Args: {
          p_org: string | null;
          p_worker: string | null;
          p_user: string | null;
          p_active: boolean | null;
        };
        Returns: undefined;
      };
      assigned_job_labels: { Args: { p_org: string | null }; Returns: Json };
      begin_job_material_import: {
        Args: {
          p_org: string | null;
          p_job: string | null;
          p_files: Json | null;
        };
        Returns: Json;
      };
      begin_material_import: {
        Args: {
          p_org: string | null;
          p_estimate: string | null;
          p_files: Json | null;
        };
        Returns: Json;
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
      configure_workforce: {
        Args: { p_org: string | null; p_policy: Json | null };
        Returns: undefined;
      };
      create_estimate: {
        Args: {
          p_org: string | null;
          p_payload: Json | null;
          p_key: string | null;
        };
        Returns: Json;
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
      customer_decision_context: {
        Args: {
          p_org: string | null;
          p_customer: string | null;
          p_location: string | null;
          p_version: string | null;
        };
        Returns: Json;
      };
      customer_estimate_review: {
        Args: {
          p_org: string | null;
          p_customer: string | null;
          p_location: string | null;
          p_version: string | null;
        };
        Returns: Json;
      };
      customer_portal_discover: { Args: Record<string, never>; Returns: Json };
      customer_property_reports: {
        Args: {
          p_org: string | null;
          p_customer: string | null;
          p_location: string | null;
          p_before?: string | null;
        };
        Returns: Json;
      };
      customer_publication_preview: {
        Args: { p_org: string | null; p: Json | null };
        Returns: Json;
      };
      customer_publication_receipt: {
        Args: {
          p_org: string | null;
          p_request: string | null;
          p_publication?: string | null;
        };
        Returns: Json;
      };
      customer_publish_estimate: {
        Args: { p_org: string | null; p: Json | null };
        Returns: Json;
      };
      customer_record_decision: {
        Args: {
          p_org: string | null;
          p_publication: string | null;
          p_digest: string | null;
          p_choice: string | null;
          p_ack: string | null;
          p_request: string | null;
        };
        Returns: Json;
      };
      customer_revoke_publication: {
        Args: { p_org: string | null; p_publication: string | null };
        Returns: undefined;
      };
      customer_runtime_status: { Args: Record<string, never>; Returns: Json };
      customer_session_status: { Args: Record<string, never>; Returns: Json };
      duplicate_estimate: {
        Args: {
          p_org: string | null;
          p_source: string | null;
          p_key: string | null;
        };
        Returns: Json;
      };
      estimate_defaults: { Args: { p_org: string | null }; Returns: Json };
      intake_profile: { Args: { p_slug: string | null }; Returns: Json };
      issue_estimate: {
        Args: {
          p_org: string | null;
          p_estimate: string | null;
          p_version: string | null;
          p_lock: number | null;
        };
        Returns: Json;
      };
      job_labor_summary: {
        Args: { p_org: string | null; p_job: string | null };
        Returns: Json;
      };
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
      material_worker_control: {
        Args: {
          p_org: string | null;
          p_operation: string | null;
          p_source?: string | null;
          p_lease?: string | null;
          p_payload?: Json | null;
        };
        Returns: Json;
      };
      platform_access: { Args: Record<string, never>; Returns: boolean };
      platform_activity: { Args: Record<string, never>; Returns: Json };
      prepare_payroll: {
        Args: {
          p_org: string | null;
          p_start: string | null;
          p_end: string | null;
          p_deductions: Json | null;
          p_lock: boolean | null;
        };
        Returns: Json;
      };
      property_command: {
        Args: {
          p_org: string | null;
          p_action: string | null;
          p_id: string | null;
          p_lock: number | null;
          p: Json | null;
        };
        Returns: Json;
      };
      property_reports: {
        Args: {
          p_org: string | null;
          p_customer: string | null;
          p_location: string | null;
          p_before?: string | null;
        };
        Returns: Json;
      };
      property_workspace: { Args: { p_org: string | null }; Returns: Json };
      propose_job_change: {
        Args: {
          p_org: string | null;
          p_job: string | null;
          p_change: Json | null;
        };
        Returns: string;
      };
      provision_company: {
        Args: {
          p_name: string | null;
          p_slug: string | null;
          p_industry: 'property_services' | 'construction' | 'roofing' | null;
          p_owner: string | null;
        };
        Returns: string;
      };
      queue_material_source: {
        Args: { p_org: string | null; p_source: string | null };
        Returns: undefined;
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
      record_reviewed_purchase: {
        Args: {
          p_org: string | null;
          p_job: string | null;
          p_batch: string | null;
          p_lock: number | null;
          p_review: Json | null;
          p_kind: string | null;
        };
        Returns: Json;
      };
      record_time: {
        Args: {
          p_org: string | null;
          p_worker: string | null;
          p_entry: Json | null;
        };
        Returns: string;
      };
      release_command: {
        Args: {
          p_org: string | null;
          p_action: string | null;
          p_input: Json | null;
        };
        Returns: Json;
      };
      release_contexts: { Args: Record<string, never>; Returns: Json };
      release_workspace: { Args: { p_org: string | null }; Returns: Json };
      resolve_clock: {
        Args: {
          p_org: string | null;
          p_worker: string | null;
          p_end: string | null;
          p_reason: string | null;
        };
        Returns: undefined;
      };
      review_job_expense: {
        Args: {
          p_org: string | null;
          p_job: string | null;
          p_expense: string | null;
          p_decision: string | null;
          p_reason: string | null;
        };
        Returns: string;
      };
      review_time: {
        Args: {
          p_org: string | null;
          p_entry: string | null;
          p_decision: string | null;
          p_reason: string | null;
        };
        Returns: undefined;
      };
      revise_estimate: {
        Args: {
          p_org: string | null;
          p_estimate: string | null;
          p_source: string | null;
        };
        Returns: Json;
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
      save_estimate: {
        Args: {
          p_org: string | null;
          p_estimate: string | null;
          p_version: string | null;
          p_lock: number | null;
          p_payload: Json | null;
        };
        Returns: Json;
      };
      save_estimate_template: {
        Args: {
          p_org: string | null;
          p_name: string | null;
          p_payload: Json | null;
          p_id?: string | null;
        };
        Returns: string;
      };
      save_worker: {
        Args: {
          p_org: string | null;
          p_worker: Json | null;
          p_rate: Json | null;
        };
        Returns: string;
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
      submit_job_expense: {
        Args: {
          p_org: string | null;
          p_job: string | null;
          p_expense: Json | null;
        };
        Returns: string;
      };
      submit_time: {
        Args: { p_org: string | null; p_entry: string | null };
        Returns: undefined;
      };
      time_clock: {
        Args: {
          p_org: string | null;
          p_worker: string | null;
          p_action: string | null;
          p_target: Json | null;
        };
        Returns: string;
      };
      time_period_labels: { Args: { p_org: string | null }; Returns: Json };
      update_job_projection: {
        Args: {
          p_org: string | null;
          p_job: string | null;
          p_lock: number | null;
          p_projection: Json | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      industry_template: 'property_services' | 'construction' | 'roofing';
      staff_role: 'owner' | 'admin' | 'staff';
    };
    CompositeTypes: { [_ in never]: never };
  };
}
