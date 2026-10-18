import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';
import type { VisitContent } from '../domain/property/inspections';
import {
  parsePropertyReportPage,
  type PropertyReportPage,
} from '../domain/property/report-page';
export type { PropertyReportPage } from '../domain/property/report-page';

export type PropertyCommand =
  | {
      action: 'create_plan';
      id: null;
      revision: null;
      payload: {
        customer_id: string;
        location_id: string;
        job_id: string | null;
        name: string;
        cadence: 'once' | 'weekly' | 'monthly' | 'custom';
        interval_days: number;
        timezone: string;
        starts_on: string;
        checklist: VisitContent['checklist'];
      };
    }
  | {
      action: 'create_visit';
      id: string;
      revision: null;
      payload: { visited_on: string; phase: 'before' | 'during' | 'after' };
    }
  | {
      action: 'save_visit';
      id: string;
      revision: number;
      payload: VisitContent;
    }
  | {
      action: 'submit_visit' | 'publish_visit' | 'revise_visit';
      id: string;
      revision: number;
      payload: Record<string, never>;
    }
  | {
      action: 'update_plan' | 'quote_snapshot' | 'unbilled_review';
      id: string;
      revision: number | null;
      payload: Json;
    };
export interface ConnectedPropertyWorkspace {
  plans: Json[];
  visits: Json[];
  reports?: Json[];
  comparisons?: Json[];
  material_reviews?: Json[];
  supplemental_drafts?: Json[];
}
function objectKeys(
  value: unknown,
  allowed: string[],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((k) => allowed.includes(k))
  );
}
const uuid = (s: string) =>
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(s);
/** Prepared transport only. Not registered in application navigation or the sample repository. */
export class ConnectedPropertyOperations {
  constructor(private readonly client: SupabaseClient<Database>) {}
  private async verified() {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user?.id)
      throw Error('Verified authenticated property session required');
  }
  private org(id: string) {
    if (!uuid(id)) throw Error('Invalid property organization');
  }
  async command(org: string, input: PropertyCommand): Promise<{ id: string }> {
    this.org(org);
    const actions = [
      'create_plan',
      'create_visit',
      'save_visit',
      'submit_visit',
      'publish_visit',
      'revise_visit',
      'update_plan',
      'quote_snapshot',
      'unbilled_review',
    ];
    if (
      !actions.includes(input.action) ||
      (input.id !== null && !uuid(input.id))
    )
      throw Error('Invalid property command');
    if (
      [
        'save_visit',
        'submit_visit',
        'publish_visit',
        'revise_visit',
        'update_plan',
        'unbilled_review',
      ].includes(input.action) &&
      (!Number.isSafeInteger(input.revision) || input.revision! < 1)
    )
      throw Error('Positive current revision required');
    await this.verified();
    const r = await this.client.rpc('property_command', {
      p_org: org,
      p_action: input.action,
      p_id: input.id,
      p_lock: input.revision,
      p: input.payload as Json,
    });
    if (r.error) throw Error('Property command denied or stale');
    const result = r.data as { id?: unknown } | null;
    if (!result || typeof result.id !== 'string' || !uuid(result.id))
      throw Error('Invalid property command response');
    return { id: result.id };
  }
  async workspace(org: string): Promise<ConnectedPropertyWorkspace> {
    this.org(org);
    await this.verified();
    const r = await this.client.rpc('property_workspace', { p_org: org });
    if (r.error) throw Error('Property workspace denied or disabled');
    const v = r.data as unknown as ConnectedPropertyWorkspace;
    if (
      !v ||
      !Array.isArray(v.plans) ||
      !Array.isArray(v.visits) ||
      !objectKeys(v, [
        'plans',
        'visits',
        'reports',
        'comparisons',
        'material_reviews',
        'supplemental_drafts',
      ]) ||
      Object.values(v).some(
        (rows) =>
          !Array.isArray(rows) ||
          rows.some(
            (row) =>
              !row ||
              typeof row !== 'object' ||
              Array.isArray(row) ||
              row.organization_id !== org,
          ),
      )
    )
      throw Error('Invalid property workspace response');
    return v;
  }
  async reports(
    org: string,
    customer: string,
    location: string,
    before: string | null = null,
  ): Promise<PropertyReportPage> {
    for (const id of [org, customer, location, ...(before ? [before] : [])])
      if (!uuid(id)) throw Error('Invalid report boundary');
    await this.verified();
    const r = await this.client.rpc('property_reports', {
      p_org: org,
      p_customer: customer,
      p_location: location,
      p_before: before,
    });
    if (r.error) throw Error('Published property reports denied or disabled');
    return parsePropertyReportPage(r.data, {
      organization_id: org,
      customer_id: customer,
      location_id: location,
    });
  }
}
