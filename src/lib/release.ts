import { supabase } from './supabase';
import type { Json } from './database.types';
import { sampleCompanies, type CompanyProfile } from '../domain/platform';
import { industryEstimate } from '../domain/estimating/fixtures';
import { calculateEstimate } from '../domain/estimating/calculation';
import { ReleasePreview } from '../domain/release/preview';
import type { EstimateVersion } from '../domain/estimating/types';
import type {
  ReleaseAction,
  ReleaseActor,
  ReleaseContext,
  ReleaseInput,
  ReleaseWorkspace,
} from '../domain/release/types';
export function releasePreviewVersion(
  company: CompanyProfile,
): EstimateVersion {
  const customerId = crypto.randomUUID(),
    p = industryEstimate(company, customerId);
  p.expires_on = '2030-01-01';
  p.terms =
    'Internal synthetic scope only. No external delivery or production execution.';
  return {
    id: crypto.randomUUID(),
    organization_id: company.id,
    estimate_id: crypto.randomUUID(),
    version_number: 1,
    lock_revision: 1,
    status: 'issued',
    payload: p,
    calculation: calculateEstimate(p, 0),
    company_snapshot: {
      name: company.name,
      primary_color: company.primary_color,
      accent_color: company.accent_color,
      business_address: 'Synthetic business address',
      contact_email: 'office@example.test',
      contact_phone: '555-0100',
      website: 'https://example.test',
      logo_document_id: null,
    },
    customer_snapshot: {
      id: customerId,
      display_name: 'Synthetic Customer',
      email: 'customer@example.test',
      phone: '555-0101',
    },
    location_snapshot: null,
    tax_policy_snapshot: null,
    attachment_snapshots: [],
    supersedes_version_id: null,
    created_at: new Date().toISOString(),
    issued_at: new Date().toISOString(),
  };
}
export class ReleaseRepository {
  private previews = new Map<string, ReleasePreview>();
  constructor(readonly sample: boolean) {}
  async contexts(): Promise<ReleaseContext[]> {
    if (this.sample)
      return sampleCompanies.map((c) => ({
        id: c.id,
        name: c.name,
        actor: 'staff',
      }));
    if (!supabase) throw new Error('Connected configuration unavailable');
    const r = await supabase.rpc('release_contexts');
    if (r.error) throw new Error('Internal release access unavailable');
    return r.data as unknown as ReleaseContext[];
  }
  private preview(org: string) {
    const company = sampleCompanies.find((c) => c.id === org);
    if (!company) throw new Error('Unknown sample company');
    if (!this.previews.has(org))
      this.previews.set(
        org,
        new ReleasePreview(org, releasePreviewVersion(company)),
      );
    return this.previews.get(org)!;
  }
  async versions(org: string): Promise<{ id: string; label: string }[]> {
    if (this.sample) {
      const v = this.preview(org).version;
      return [{ id: v.id, label: `Issued sample: ${v.payload.project.name}` }];
    }
    if (!supabase) throw new Error('Connected configuration unavailable');
    const r = await supabase
      .from('estimate_versions')
      .select('id,version_number')
      .eq('organization_id', org)
      .eq('status', 'issued')
      .order('created_at', { ascending: false })
      .limit(100);
    if (r.error) throw new Error('Unable to load issued versions');
    return r.data.map((v) => ({
      id: v.id,
      label: `Issued version ${v.version_number} · ${v.id.slice(0, 8)}`,
    }));
  }
  async read(org: string, actor: ReleaseActor): Promise<ReleaseWorkspace> {
    if (this.sample) return this.preview(org).read(actor);
    if (!supabase) throw new Error('Connected configuration unavailable');
    const r = await supabase.rpc('release_workspace', { p_org: org });
    if (r.error || !r.data)
      throw new Error('Internal workspace access unavailable');
    const w = r.data as unknown as ReleaseWorkspace;
    if (w.internal_test !== true || !['staff', 'customer'].includes(w.actor))
      throw new Error('Invalid workspace response');
    return w;
  }
  async command(
    org: string,
    actor: ReleaseActor,
    action: ReleaseAction,
    input: ReleaseInput,
  ) {
    if (this.sample) return this.preview(org).command(actor, action, input);
    if (!supabase) throw new Error('Connected configuration unavailable');
    const r = await supabase.rpc('release_command', {
      p_org: org,
      p_action: action,
      p_input: input as Json,
    });
    if (r.error)
      throw new Error(
        'The requested transition was denied or changed. Refresh and review its prerequisites.',
      );
  }
}
