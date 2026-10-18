import { PropertyRepository, propertyRepository } from './property';
import { previewOperations } from './operations';
import { sampleCompanies, type CompanyProfile } from '../domain/platform';
import { ReleasePreview } from '../domain/release/preview';
import {
  projectIssuedReview,
  type CustomerContext,
} from '../domain/customer/review';
import type { EstimateVersion } from '../domain/estimating/types';
/** UI laboratory only: reuses existing synthetic CRM/property/estimate and decision engines. No Supabase import. */
export class CustomerPortalPreviewModel {
  private active = false;
  private epoch = 0;
  private engines = new Map<string, ReleasePreview>();
  private versions: EstimateVersion[] = [];
  readonly repo: PropertyRepository;
  constructor(
    readonly company: CompanyProfile,
    repo = propertyRepository(previewOperations),
  ) {
    if (
      !sampleCompanies.some((c) => c.id === company.id) ||
      !repo.operations.sample
    )
      throw Error('Synthetic customer preview only');
    this.repo = repo;
  }
  async login() {
    const epoch = ++this.epoch;
    await this.repo.initialize(this.company);
    if (epoch !== this.epoch) throw Error('Customer session unavailable');
    this.active = true;
  }
  logout() {
    this.epoch++;
    this.active = false;
  }
  private context(): CustomerContext {
    if (!this.active) throw Error('Customer session unavailable');
    const s = this.repo.read(this.company.id),
      c = s.contexts[0];
    return {
      organization_id: this.company.id,
      customer_id: c.customer_id,
      location_id: c.location_id,
      company_name: this.company.name,
      primary_color: this.company.primary_color,
      property_label: c.location_label,
      reports: true,
      version_ids: this.versions.map((v) => v.id),
    };
  }
  async prepare() {
    const c = this.context(),
      s = this.repo.read(c.organization_id);
    let report = s.reports.find(
      (r) => r.customer_id === c.customer_id && r.location_id === c.location_id,
    );
    if (!report) {
      let visit = s.visits[0];
      if (visit.status === 'draft') {
        this.repo.saveVisit(c.organization_id, visit, {
          ...visit.content,
          checklist: visit.content.checklist.map((x) => ({
            ...x,
            completed: true,
          })),
        });
        visit = this.repo.read(c.organization_id).visits[0];
        this.repo.submit(c.organization_id, visit);
      }
      visit = this.repo.read(c.organization_id).visits[0];
      report = this.repo.publish(c.organization_id, visit);
    }
    if (this.versions.length) return;
    this.versions = [s.bundle.version];
    const finding = report.findings[0];
    let bundle = await this.repo.findingEstimate(
      c.organization_id,
      report.visit_id,
      finding.id,
    );
    const lines = bundle.version.payload.lines.map((l, i, a) =>
      i === a.length - 1
        ? { ...l, unit_price_minor: 12500, unit_cost_minor: 10000 }
        : l,
    );
    bundle = await this.repo.estimates.save(c.organization_id, bundle, {
      ...bundle.version.payload,
      location_id: c.location_id,
      lines,
    });
    bundle = await this.repo.estimates.issue(c.organization_id, bundle);
    this.versions.push(bundle.version);
    for (const version of this.versions) {
      const engine = new ReleasePreview(c.organization_id, version);
      await engine.command('staff', 'publish_offer', {
        version_id: version.id,
      });
      this.engines.set(version.id, engine);
    }
  }
  read() {
    const c = this.context(),
      s = this.repo.read(c.organization_id),
      report = s.reports.find(
        (r) =>
          r.customer_id === c.customer_id && r.location_id === c.location_id,
      );
    const binding = {
      organization_id: c.organization_id,
      customer_id: c.customer_id,
      location_id: c.location_id,
      estimate_id: s.bundle.estimate.id,
    };
    return {
      context: c,
      reports: this.repo
        .portal(c.organization_id, c.customer_id)
        .reports.filter((r) => r.location_id === c.location_id),
      reviews: this.versions.map((v, i) =>
        projectIssuedReview(
          v,
          c,
          i && report
            ? {
                source_report_id: report.id,
                finding_id: report.findings[0].id,
                source_line_id: v.payload.lines.at(-1)!.id,
              }
            : null,
          binding,
        ),
      ),
      responses: this.versions.map((v) => ({
        version_id: v.id,
        decision:
          this.engines.get(v.id)?.read('customer').release_decisions.at(-1)
            ?.decision ?? null,
      })),
    };
  }
  async respond(
    version: string,
    decision: 'accepted' | 'declined',
    consent = false,
  ) {
    const c = this.context();
    if (
      consent !== true ||
      !c.version_ids.includes(version) ||
      !['accepted', 'declined'].includes(decision)
    )
      throw Error('Customer review unavailable');
    const e = this.engines.get(version)!,
      offer = e.read('customer').release_offers[0];
    await e.command('customer', 'decide_offer', {
      offer_id: offer.id,
      decision,
      note: 'Synthetic preference only; no financial or legal execution',
      consent: true,
    });
  }
}
