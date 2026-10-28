import { supabase } from './supabase';
import type { Database, Json } from './database.types';
import {
  sampleCompanies,
  type CompanyProfile,
  type StaffRole,
} from '../domain/platform';
import { validateIntake, type IntakePayload } from '../domain/intake';
export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Customer = Row<'customers'>;
export type CustomerDraft = Pick<
  Customer,
  'display_name' | 'email' | 'phone' | 'customer_type' | 'preferred_contact'
>;
export type LocationDraft = Pick<
  Row<'service_locations'>,
  | 'address_line1'
  | 'address_line2'
  | 'city'
  | 'region'
  | 'postal_code'
  | 'country_code'
>;
export interface Invitation {
  id: string;
  email: string;
  role: StaffRole;
  staff_type: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}
export interface Metric {
  organization_id: string;
  members: number;
  customers: number;
  new_requests: number;
  documents: number;
}
export interface PlatformEvent {
  id: string;
  organization_id: string;
  actor_id: string;
  action: string;
  occurred_at: string;
}
export interface CustomerHistory {
  notes: Row<'customer_notes'>[];
  requests: Row<'intake_requests'>[];
  consents: Row<'communication_consents'>[];
}
export interface Page<T> {
  rows: T[];
  count: number;
}
const now = () => new Date().toISOString();
function requireClient() {
  if (!supabase) throw new Error('Connected service unavailable');
  return supabase;
}
function checked<T>(result: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> {
  if (result.error)
    throw new Error(
      'Operation denied or invalid. Check your permissions and entered values.',
    );
  return result.data as NonNullable<T>;
}
function json<T>(value: Json): T {
  return value as unknown as T;
}
const match = (s: string, q: string) =>
  s.toLowerCase().includes(q.toLowerCase());

export class Operations {
  readonly sample: boolean;
  private companies = structuredClone(sampleCompanies);
  private customers: Customer[] = [];
  private locations: Row<'service_locations'>[] = [];
  private requests: Row<'intake_requests'>[] = [];
  private notes: Row<'customer_notes'>[] = [];
  private consents: Row<'communication_consents'>[] = [];
  private members: Row<'memberships'>[] = [];
  private invitations: (Invitation & {
    organization_id: string;
    token: string;
  })[] = [];
  private settings: Row<'company_settings'>[] = [];
  private modules: Row<'company_modules'>[] = [];
  private events: PlatformEvent[] = [];
  constructor(sample: boolean) {
    this.sample = sample;
    if (sample)
      for (const c of this.companies) {
        this.members.push(
          {
            organization_id: c.id,
            user_id: `${c.id}-owner`,
            role: 'owner',
            staff_type: 'office_manager',
            active: true,
            created_at: now(),
          },
          {
            organization_id: c.id,
            user_id: `${c.id}-estimator`,
            role: 'staff',
            staff_type: 'estimator',
            active: true,
            created_at: now(),
          },
          {
            organization_id: c.id,
            user_id: `${c.id}-field`,
            role: 'staff',
            staff_type: 'field_staff',
            active: true,
            created_at: now(),
          },
        );
        this.settings.push(this.defaultSettings(c.id));
        for (const module of [
          'crm',
          'intake',
          'team',
          'settings',
          'documents',
          'estimates',
          'contracts',
          'invoices',
          'payments',
        ])
          this.modules.push({
            organization_id: c.id,
            module,
            enabled: [
              'crm',
              'intake',
              'team',
              'settings',
              'documents',
              'estimates',
            ].includes(module),
          });
        const customer = {
          id: crypto.randomUUID(),
          organization_id: c.id,
          display_name: 'Jordan Example',
          email: `jordan+${c.slug}@example.test`,
          phone: '555-0100',
          customer_type: 'residential',
          preferred_contact: 'email',
          created_at: now(),
        };
        this.customers.push(customer);
        this.requests.push({
          id: crypto.randomUUID(),
          organization_id: c.id,
          customer_id: customer.id,
          service_location_id: null,
          assigned_to: null,
          summary:
            'Synthetic inquiry: repair and improve an exterior entryway.',
          status: 'new',
          source: 'website',
          service_category: 'General inquiry',
          preferred_appointment: 'Weekday mornings',
          contact_preference: 'email',
          created_at: now(),
          updated_at: now(),
        });
      }
  }
  private defaultSettings(org: string): Row<'company_settings'> {
    return {
      organization_id: org,
      business_address: '100 Example Lane',
      contact_email: 'office@example.test',
      contact_phone: '555-0100',
      website: '',
      service_areas: 'Local service area',
      specialties: '',
      license_metadata: '',
      insurance_metadata: '',
      estimate_prefix: 'EST',
      estimate_next_number: 1,
      default_terms: '',
      expiration_days: 30,
      material_markup_bps: 0,
      labor_rate_minor: 0,
      currency: 'USD',
      intake_enabled: true,
      service_categories: [
        'General inquiry',
        'Repairs',
        'Remodeling',
        'Roofing',
      ],
      updated_at: now(),
    };
  }
  async companyAccess(org: string) {
    if (this.sample)
      return {
        crm: true,
        estimates: true,
        intake_manage: true,
        intake_read: true,
        settings: true,
        team: true,
      };
    const client = requireClient();
    const {
      data: { session },
    } = await client.auth.getSession();
    const membership = checked(
      await client
        .from('memberships')
        .select('*')
        .eq('organization_id', org)
        .eq(
          'user_id',
          session?.user.id ?? '00000000-0000-0000-0000-000000000000',
        )
        .eq('active', true)
        .maybeSingle(),
    );
    const privileged =
      membership?.role === 'owner' || membership?.role === 'admin';
    const office =
      membership?.role === 'staff' &&
      ['office_manager', 'estimator'].includes(membership.staff_type);
    return {
      crm: privileged || office,
      estimates: privileged || office,
      intake_manage: privileged || office,
      intake_read: !!membership,
      settings: privileged,
      team: privileged,
    };
  }
  async listCompanies() {
    return this.sample
      ? structuredClone(this.companies)
      : checked(
          await requireClient().from('organizations').select('*').order('name'),
        );
  }
  async listCustomers(
    org: string,
    q = '',
    kind = '',
    page = 0,
  ): Promise<Page<Customer>> {
    if (this.sample) {
      const all = this.customers.filter(
        (c) =>
          c.organization_id === org &&
          (!kind || c.customer_type === kind) &&
          match(`${c.display_name} ${c.email ?? ''} ${c.phone ?? ''}`, q),
      );
      return {
        rows: structuredClone(all.slice(page * 10, page * 10 + 10)),
        count: all.length,
      };
    }
    let query = requireClient()
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('organization_id', org);
    const search = q.replace(/[^\p{L}\p{N} @+_-]/gu, '').slice(0, 100);
    if (search)
      query = query.or(
        `display_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
      );
    if (kind) query = query.eq('customer_type', kind);
    const result = await query
      .order('created_at', { ascending: false })
      .order('id')
      .range(page * 10, page * 10 + 9);
    return { rows: checked(result), count: result.count ?? 0 };
  }
  async saveCustomer(org: string, draft: CustomerDraft, id?: string) {
    if (!draft.display_name.trim() || draft.display_name.length > 200)
      throw new Error('Enter a customer name');
    const values = {
      ...draft,
      email: draft.email?.trim().toLowerCase() || null,
      phone: draft.phone?.trim() || null,
    };
    if (this.sample) {
      if (id) {
        const target = this.customers.find(
          (c) => c.organization_id === org && c.id === id,
        );
        if (!target) throw new Error('Customer unavailable');
        Object.assign(target, values);
        return structuredClone(target);
      }
      const row = {
        ...values,
        id: crypto.randomUUID(),
        organization_id: org,
        created_at: now(),
      };
      this.customers.unshift(row);
      return structuredClone(row);
    }
    return id
      ? checked(
          await requireClient()
            .from('customers')
            .update(values)
            .eq('organization_id', org)
            .eq('id', id)
            .select()
            .single(),
        )
      : checked(
          await requireClient()
            .from('customers')
            .insert({ ...values, organization_id: org })
            .select()
            .single(),
        );
  }
  async duplicates(
    org: string,
    email: string,
    phone: string,
    exclude?: string,
  ) {
    if (this.sample)
      return this.customers.filter(
        (c) =>
          c.organization_id === org &&
          c.id !== exclude &&
          ((!!email && c.email === email.trim().toLowerCase()) ||
            (!!phone && c.phone === phone.trim())),
      );
    const client = requireClient();
    const results = await Promise.all([
      email
        ? client
            .from('customers')
            .select('*')
            .eq('organization_id', org)
            .eq('email', email.trim().toLowerCase())
            .limit(5)
        : Promise.resolve({ data: [], error: null }),
      phone
        ? client
            .from('customers')
            .select('*')
            .eq('organization_id', org)
            .eq('phone', phone.trim())
            .limit(5)
        : Promise.resolve({ data: [], error: null }),
    ]);
    return [
      ...new Map(
        results
          .flatMap((r) => checked(r))
          .filter((c) => c.id !== exclude)
          .map((c) => [c.id, c]),
      ).values(),
    ];
  }
  async customerHistory(
    org: string,
    customer: string,
  ): Promise<CustomerHistory> {
    if (this.sample)
      return structuredClone({
        notes: this.notes.filter(
          (n) => n.organization_id === org && n.customer_id === customer,
        ),
        requests: this.requests.filter(
          (n) => n.organization_id === org && n.customer_id === customer,
        ),
        consents: this.consents.filter(
          (n) => n.organization_id === org && n.customer_id === customer,
        ),
      });
    const client = requireClient();
    const [notes, requests, consents] = await Promise.all([
      client
        .from('customer_notes')
        .select('*')
        .eq('organization_id', org)
        .eq('customer_id', customer)
        .order('created_at', { ascending: false })
        .limit(50),
      client
        .from('intake_requests')
        .select('*')
        .eq('organization_id', org)
        .eq('customer_id', customer)
        .order('created_at', { ascending: false })
        .limit(50),
      client
        .from('communication_consents')
        .select('*')
        .eq('organization_id', org)
        .eq('customer_id', customer)
        .order('recorded_at', { ascending: false })
        .limit(50),
    ]);
    return {
      notes: checked(notes),
      requests: checked(requests),
      consents: checked(consents),
    };
  }
  async addNote(org: string, customer: string, body: string) {
    if (!body.trim() || body.length > 5000)
      throw new Error('Enter a note (maximum 5,000 characters)');
    if (this.sample) {
      this.notes.unshift({
        id: crypto.randomUUID(),
        organization_id: org,
        customer_id: customer,
        body,
        created_by: `${org}-owner`,
        created_at: now(),
      });
      return;
    }
    checked(
      await requireClient()
        .from('customer_notes')
        .insert({ organization_id: org, customer_id: customer, body }),
    );
  }
  async recordConsent(
    org: string,
    customer: string,
    email: boolean,
    sms: boolean,
  ) {
    if (this.sample) {
      this.consents.unshift({
        id: crypto.randomUUID(),
        organization_id: org,
        customer_id: customer,
        email_allowed: email,
        sms_allowed: sms,
        policy_version: 'contact-v1',
        source: 'staff',
        recorded_by: `${org}-owner`,
        recorded_at: now(),
      });
      return;
    }
    checked(
      await requireClient().rpc('record_consent', {
        p_org: org,
        p_customer: customer,
        p_email: email,
        p_sms: sms,
      }),
    );
  }
  async listLocations(org: string, customer: string) {
    return this.sample
      ? structuredClone(
          this.locations.filter(
            (l) => l.organization_id === org && l.customer_id === customer,
          ),
        )
      : checked(
          await requireClient()
            .from('service_locations')
            .select('*')
            .eq('organization_id', org)
            .eq('customer_id', customer)
            .order('created_at', { ascending: false }),
        );
  }
  async saveLocation(
    org: string,
    customer: string,
    draft: LocationDraft,
    id?: string,
  ) {
    if (this.sample) {
      if (id) {
        const target = this.locations.find(
          (l) =>
            l.organization_id === org &&
            l.customer_id === customer &&
            l.id === id,
        );
        if (!target) throw new Error('Location unavailable');
        Object.assign(target, draft);
        return;
      }
      this.locations.push({
        ...draft,
        id: crypto.randomUUID(),
        organization_id: org,
        customer_id: customer,
        created_at: now(),
      });
      return;
    }
    const query = requireClient().from('service_locations');
    checked(
      id
        ? await query
            .update(draft)
            .eq('organization_id', org)
            .eq('customer_id', customer)
            .eq('id', id)
            .select('id')
            .single()
        : await query
            .insert({
              ...draft,
              organization_id: org,
              customer_id: customer,
            })
            .select('id')
            .single(),
    );
  }
  async listIntake(
    org: string,
    status = '',
    page = 0,
  ): Promise<Page<Row<'intake_requests'>>> {
    if (this.sample) {
      const all = this.requests.filter(
        (r) => r.organization_id === org && (!status || r.status === status),
      );
      return {
        rows: structuredClone(all.slice(page * 10, page * 10 + 10)),
        count: all.length,
      };
    }
    let query = requireClient()
      .from('intake_requests')
      .select('*', { count: 'exact' })
      .eq('organization_id', org);
    if (status) query = query.eq('status', status);
    const r = await query
      .order('created_at', { ascending: false })
      .order('id')
      .range(page * 10, page * 10 + 9);
    return { rows: checked(r), count: r.count ?? 0 };
  }
  async assignIntake(
    org: string,
    id: string,
    assignee: string | null,
    status: string,
  ) {
    if (this.sample) {
      if (
        assignee &&
        !this.members.some(
          (m) =>
            m.organization_id === org && m.user_id === assignee && m.active,
        )
      )
        throw new Error('Assignee unavailable');
      const row = this.requests.find(
        (r) => r.organization_id === org && r.id === id,
      );
      if (!row) throw new Error('Request unavailable');
      row.assigned_to = assignee;
      row.status = status;
      row.updated_at = now();
      return;
    }
    checked(
      await requireClient().rpc('assign_intake', {
        p_org: org,
        p_id: id,
        p_assignee: assignee,
        p_status: status,
      }),
    );
  }
  /** Current in-memory relationships only; never queries connected membership data. */
  syntheticMemberships(org: string) {
    if (!this.sample) throw Error('Synthetic memberships unavailable');
    return structuredClone(
      this.members.filter((m) => m.organization_id === org),
    );
  }
  async listMembers(org: string) {
    return this.sample
      ? this.syntheticMemberships(org)
      : checked(
          await requireClient()
            .from('memberships')
            .select('*')
            .eq('organization_id', org)
            .order('created_at'),
        );
  }
  async manageMember(
    org: string,
    user: string,
    active: boolean,
    role: StaffRole,
    staff_type: string,
  ) {
    if (this.sample) {
      const m = this.members.find(
        (m) => m.organization_id === org && m.user_id === user,
      );
      if (!m || m.role === 'owner' || role === 'owner')
        throw new Error('Owner changes require platform authorization');
      Object.assign(m, { active, role, staff_type });
      return;
    }
    checked(
      await requireClient().rpc('manage_member', {
        p_org: org,
        p_user: user,
        p_active: active,
        p_role: role,
        p_staff_type: staff_type,
      }),
    );
  }
  async listInvitations(org: string) {
    return this.sample
      ? structuredClone(
          this.invitations.filter((i) => i.organization_id === org),
        )
      : json<Invitation[]>(
          checked(
            await requireClient().rpc('list_invitations', { p_org: org }),
          ),
        );
  }
  async createInvitation(
    org: string,
    email: string,
    role: StaffRole,
    staff_type: string,
  ): Promise<{ id: string; token: string }> {
    if (this.sample) {
      const invitation = {
        id: crypto.randomUUID(),
        organization_id: org,
        email,
        role,
        staff_type,
        token: crypto.randomUUID(),
        expires_at: new Date(Date.now() + 72 * 3600000).toISOString(),
        accepted_at: null,
        revoked_at: null,
      };
      this.invitations.unshift(invitation);
      return { id: invitation.id, token: invitation.token };
    }
    return json(
      checked(
        await requireClient().rpc('create_invitation', {
          p_org: org,
          p_email: email,
          p_role: role,
          p_staff_type: staff_type,
        }),
      ),
    );
  }
  async revokeInvitation(org: string, id: string) {
    if (this.sample) {
      const target = this.invitations.find(
        (i) => i.organization_id === org && i.id === id,
      );
      if (target) target.revoked_at = now();
      return;
    }
    checked(
      await requireClient().rpc('revoke_invitation', { p_org: org, p_id: id }),
    );
  }
  async getSettings(org: string) {
    return this.sample
      ? structuredClone(this.settings.find((s) => s.organization_id === org)!)
      : checked(
          await requireClient()
            .from('company_settings')
            .select('*')
            .eq('organization_id', org)
            .single(),
        );
  }
  async saveSettings(
    org: string,
    profile: Pick<
      CompanyProfile,
      | 'name'
      | 'industry'
      | 'primary_color'
      | 'accent_color'
      | 'logo_document_id'
    >,
    settings: Partial<Row<'company_settings'>>,
  ) {
    if (this.sample) {
      Object.assign(
        this.companies.find((c) => c.id === org)!,
        profile,
      );
      Object.assign(
        this.settings.find((c) => c.organization_id === org)!,
        settings,
      );
      return;
    }
    checked(
      await requireClient().rpc('save_company_profile', {
        p_org: org,
        p_profile: profile as unknown as Json,
        p_settings: settings as Json,
      }),
    );
  }
  async listModules(org: string) {
    return this.sample
      ? structuredClone(this.modules.filter((m) => m.organization_id === org))
      : checked(
          await requireClient()
            .from('company_modules')
            .select('*')
            .eq('organization_id', org)
            .order('module'),
        );
  }
  async listCleanImages(org: string) {
    return this.sample
      ? []
      : checked(
          await requireClient()
            .from('documents')
            .select('*')
            .eq('organization_id', org)
            .eq('scan_status', 'clean')
            .in('content_type', ['image/jpeg', 'image/png', 'image/webp'])
            .limit(100),
        );
  }
  async metrics(): Promise<Metric[]> {
    return this.sample
      ? this.companies.map((c) => ({
          organization_id: c.id,
          members: this.members.filter(
            (m) => m.organization_id === c.id && m.active,
          ).length,
          customers: this.customers.filter((r) => r.organization_id === c.id)
            .length,
          new_requests: this.requests.filter(
            (r) => r.organization_id === c.id && r.status === 'new',
          ).length,
          documents: 0,
        }))
      : json(checked(await requireClient().rpc('company_metrics')));
  }
  async platformActivity() {
    return this.sample
      ? structuredClone(this.events)
      : json<PlatformEvent[]>(
          checked(await requireClient().rpc('platform_activity')),
        );
  }
  async provision(
    name: string,
    slug: string,
    industry: CompanyProfile['industry'],
    owner: string,
  ) {
    if (this.sample) {
      if (this.companies.some((c) => c.slug === slug))
        throw new Error('Choose a unique company slug');
      const id = crypto.randomUUID();
      this.companies.push({
        id,
        name,
        slug,
        industry,
        primary_color: '#247364',
        accent_color: '#dfb461',
        logo_document_id: null,
        business_info: {},
        status: 'onboarding',
        subscription_plan: 'pilot',
      });
      this.settings.push(this.defaultSettings(id));
      this.members.push({
        organization_id: id,
        user_id: owner,
        role: 'owner',
        staff_type: 'office_manager',
        active: true,
        created_at: now(),
      });
      for (const module of [
        'crm',
        'intake',
        'team',
        'settings',
        'documents',
        'estimates',
        'contracts',
        'invoices',
        'payments',
      ])
        this.modules.push({
          organization_id: id,
          module,
          enabled: ['crm', 'intake', 'team', 'settings', 'documents'].includes(
            module,
          ),
        });
      this.events.unshift({
        id: crypto.randomUUID(),
        organization_id: id,
        actor_id: 'sample-platform',
        action: 'organization.provisioned',
        occurred_at: now(),
      });
      return id;
    }
    return checked(
      await requireClient().rpc('provision_company', {
        p_name: name,
        p_slug: slug,
        p_industry: industry,
        p_owner: owner,
      }),
    );
  }
  async configure(
    org: string,
    status: string,
    plan: string,
    modules: Record<string, boolean>,
    owner?: string,
  ) {
    if (modules.payments || modules.invoices)
      throw new Error('Financial execution remains disabled');
    if (this.sample) {
      Object.assign(
        this.companies.find((c) => c.id === org)!,
        { status, subscription_plan: plan },
      );
      if (owner) {
        const existing = this.members.find(
          (m) => m.organization_id === org && m.user_id === owner,
        );
        if (existing) Object.assign(existing, { role: 'owner', active: true });
        else
          this.members.push({
            organization_id: org,
            user_id: owner,
            role: 'owner',
            active: true,
            staff_type: 'office_manager',
            created_at: now(),
          });
      }
      for (const m of this.modules.filter((m) => m.organization_id === org))
        if (m.module in modules) m.enabled = modules[m.module];
      this.events.unshift({
        id: crypto.randomUUID(),
        organization_id: org,
        actor_id: 'sample-platform',
        action: 'organization.configured',
        occurred_at: now(),
      });
      return;
    }
    checked(
      await requireClient().rpc('configure_company', {
        p_org: org,
        p_status: status,
        p_plan: plan,
        p_modules: modules,
        p_owner: owner || null,
      }),
    );
  }
  async revokeOwner(org: string, user: string) {
    if (this.sample) {
      const owners = this.members.filter(
        (m) => m.organization_id === org && m.role === 'owner' && m.active,
      );
      if (owners.length <= 1) throw new Error('An active owner must remain');
      const target = owners.find((m) => m.user_id === user);
      if (!target) throw new Error('Owner unavailable');
      target.active = false;
      this.events.unshift({
        id: crypto.randomUUID(),
        organization_id: org,
        actor_id: 'sample-platform',
        action: 'owner.revoked',
        occurred_at: now(),
      });
      return;
    }
    checked(
      await requireClient().rpc('revoke_owner', { p_org: org, p_user: user }),
    );
  }
  async sampleSubmit(slug: string, payload: IntakePayload) {
    if (!this.sample) throw new Error('Sample only');
    validateIntake(payload);
    const c = this.companies.find((c) => c.slug === slug);
    if (!c) throw new Error('Company unavailable');
    const customer = await this.saveCustomer(c.id, {
      display_name: payload.name,
      email: payload.email,
      phone: payload.phone,
      customer_type: payload.property_type,
      preferred_contact: payload.contact_preference,
    });
    await this.saveLocation(c.id, customer.id, {
      address_line1: payload.address,
      address_line2: null,
      city: payload.city,
      region: payload.region,
      postal_code: payload.postal_code,
      country_code: payload.country_code,
    });
    this.requests.unshift({
      id: crypto.randomUUID(),
      organization_id: c.id,
      customer_id: customer.id,
      service_location_id: this.locations.at(-1)!.id,
      assigned_to: null,
      summary: payload.description,
      status: 'new',
      source: 'website',
      service_category: payload.service_category,
      preferred_appointment: payload.preferred_appointment,
      contact_preference: payload.contact_preference,
      created_at: now(),
      updated_at: now(),
    });
    await this.recordConsent(
      c.id,
      customer.id,
      payload.email_consent,
      payload.sms_consent,
    );
  }
}
// One isolated in-memory session for the explicit preview routes; never persisted.
export const previewOperations = new Operations(true);
export const connectedOperations = new Operations(false);
