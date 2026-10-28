import { PropertyRepository, propertyRepository } from './property';
import { previewOperations } from './operations';
import { sampleCompanies, type CompanyProfile } from '../domain/platform';
import { ReleasePreview } from '../domain/release/preview';
import {
  projectIssuedReview,
  type CustomerContext,
} from '../domain/customer/review';
import type { EstimateVersion } from '../domain/estimating/types';
import { projectPublishedHistory } from '../domain/property/report-page';
import { buildPropertyAttention } from '../domain/property/attention';
import {
  comparePublishedInspections,
  type ReportReference,
} from '../domain/property/inspection-comparison';
/** UI laboratory only: reuses existing synthetic CRM/property/estimate and decision engines. No Supabase import. */
export class CustomerPortalPreviewModel {
  private active = false;
  private epoch = 0;
  private engines = new Map<string, ReleasePreview>();
  private versions: EstimateVersion[] = [];
  private customerId = '';
  private primaryLocation = '';
  private locationId = '';
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
    const initial = this.repo.read(this.company.id).contexts[0];
    this.customerId = initial.customer_id;
    this.primaryLocation = initial.location_id;
    this.locationId = initial.location_id;
    this.active = true;
  }
  logout() {
    this.epoch++;
    this.active = false;
    this.locationId = '';
  }
  properties() {
    if (!this.active) throw Error('Customer session unavailable');
    const seen = new Set<string>();
    return this.repo
      .read(this.company.id)
      .contexts.filter((c) => c.customer_id === this.customerId)
      .filter((c) => {
        if (seen.has(c.location_id)) return false;
        seen.add(c.location_id);
        return true;
      })
      .map((c) => ({ id: c.location_id, label: c.location_label }));
  }
  selectProperty(location: string) {
    if (!this.properties().some((p) => p.id === location))
      throw Error('Customer property unavailable');
    this.locationId = location;
  }
  private context(): CustomerContext {
    if (!this.active) throw Error('Customer session unavailable');
    const s = this.repo.read(this.company.id),
      c = s.contexts.find(
        (x) =>
          x.customer_id === this.customerId &&
          x.location_id === this.locationId,
      );
    if (!c) throw Error('Customer property unavailable');
    return {
      organization_id: this.company.id,
      customer_id: c.customer_id,
      location_id: c.location_id,
      company_name: this.company.name,
      primary_color: this.company.primary_color,
      property_label: c.location_label,
      reports: true,
      version_ids:
        c.location_id === this.primaryLocation
          ? this.versions.map((v) => v.id)
          : [],
    };
  }
  /** Adds examples through the existing CRM and inspection workflows, never a parallel data store. */
  async prepareHistory() {
    const c = this.context(),
      epoch = this.epoch;
    if (c.location_id !== this.primaryLocation)
      throw Error('Select the original sample property');
    const locations = await this.repo.operations.listLocations(
      c.organization_id,
      c.customer_id,
    );
    if (!this.active || epoch !== this.epoch)
      throw Error('Customer session unavailable');
    if (!locations.some((l) => l.address_line1 === '200 Synthetic Garden Lane'))
      await this.repo.operations.saveLocation(
        c.organization_id,
        c.customer_id,
        {
          address_line1: '200 Synthetic Garden Lane',
          address_line2: '',
          city: 'Example City',
          region: 'FL',
          postal_code: '00000',
          country_code: 'US',
        },
      );
    if (!this.active || epoch !== this.epoch)
      throw Error('Customer session unavailable');
    await this.repo.refreshContexts(c.organization_id);
    if (!this.active || epoch !== this.epoch)
      throw Error('Customer session unavailable');
    const context = this.repo
      .read(c.organization_id)
      .contexts.find(
        (x) =>
          x.customer_id === c.customer_id && x.location_id === c.location_id,
      )!;
    for (const cadence of ['weekly', 'monthly'] as const) {
      const name = `${cadence} synthetic maintenance`;
      let plan = this.repo
        .read(c.organization_id)
        .plans.find(
          (p) =>
            p.customer_id === c.customer_id &&
            p.location_id === c.location_id &&
            p.name === name,
        );
      if (!plan) {
        plan = this.repo.createPlan(c.organization_id, context, name);
        this.repo.savePlan(c.organization_id, {
          ...plan,
          cadence,
          starts_on: '2026-10-16',
        });
      }
      for (const date of cadence === 'weekly'
        ? ['2026-10-16', '2026-10-23']
        : ['2026-11-16']) {
        if (
          this.repo
            .read(c.organization_id)
            .visits.some((v) => v.plan_id === plan.id && v.visited_on === date)
        )
          continue;
        let visit = this.repo.addVisit(c.organization_id, plan.id, date);
        this.repo.saveVisit(c.organization_id, visit, {
          summary: `${cadence === 'weekly' ? 'Weekly' : 'Monthly'} property check · ${date}`,
          internal_notes: 'INTERNAL supplier costs and payroll review',
          checklist: [
            {
              id: 'exterior',
              label: 'Exterior condition and safety',
              required: true,
              completed: true,
            },
          ],
          findings: [
            {
              id: crypto.randomUUID(),
              category: 'Damage',
              location:
                this.company.industry === 'roofing'
                  ? 'North roof flashing'
                  : 'Exterior joint',
              severity: 'moderate',
              description: 'Weathered exterior seal needs repair.',
              recommendation:
                'Inspect underlying surface and prepare a repair estimate.',
              customer_visible: true,
            },
            {
              id: crypto.randomUUID(),
              category: 'Office',
              location: 'Internal',
              severity: 'low',
              description: 'INTERNAL margin and purchasing',
              recommendation: 'Private review',
              customer_visible: false,
            },
          ],
        });
        visit = this.repo
          .read(c.organization_id)
          .visits.find((v) => v.id === visit.id)!;
        this.repo.submit(c.organization_id, visit);
        visit = this.repo
          .read(c.organization_id)
          .visits.find((v) => v.id === visit.id)!;
        this.repo.publish(c.organization_id, visit);
      }
    }
  }
  async prepare() {
    const c = this.context(),
      s = this.repo.read(c.organization_id);
    if (c.location_id !== this.primaryLocation)
      throw Error('No sample estimate for this property');
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
  /** Additional explicit synthetic observations; existing published examples are never rewritten. */
  prepareAttentionExamples() {
    const c = this.context();
    if (c.location_id !== this.primaryLocation)
      throw Error('Select the original sample property');
    const state = this.repo.read(c.organization_id);
    const name = 'Synthetic attention evidence';
    if (
      state.plans.some(
        (p) => p.name === name && p.location_id === c.location_id,
      )
    )
      return;
    const context = state.contexts.find(
      (x) => x.customer_id === c.customer_id && x.location_id === c.location_id,
    )!;
    const plan = this.repo.createPlan(c.organization_id, context, name);
    const seal = crypto.randomUUID(),
      maintenance = crypto.randomUUID(),
      missing = crypto.randomUUID();
    for (const date of ['2026-11-23', '2026-11-30']) {
      const last = date === '2026-11-30';
      let visit = this.repo.addVisit(c.organization_id, plan.id, date);
      this.repo.saveVisit(c.organization_id, visit, {
        summary: 'Synthetic attention check-in · ' + date,
        internal_notes:
          'INTERNAL supplier and crew rates must not enter attention',
        checklist: [
          {
            id: 'exterior',
            label: 'Exterior condition and safety',
            required: true,
            completed: true,
          },
        ],
        findings: [
          {
            id: seal,
            category: 'Damage',
            location: 'East window seal',
            severity: last ? 'urgent' : 'moderate',
            description: last
              ? 'Water marks documented below the same east window seal.'
              : 'A gap was documented at the east window seal.',
            recommendation:
              'Have the contractor assess the seal and surrounding surface.',
            customer_visible: true,
          },
          {
            id: maintenance,
            category: 'Maintenance',
            location: 'Garden drainage',
            severity: 'low',
            description: 'Leaves documented in the garden drain.',
            recommendation: 'Schedule routine drain clearing.',
            customer_visible: true,
          },
          ...(last
            ? [
                {
                  id: crypto.randomUUID(),
                  category: 'Damage',
                  location: 'Side gate hinge',
                  severity: 'moderate' as const,
                  description: 'A loose side gate hinge was documented.',
                  recommendation: 'Request a hinge assessment.',
                  customer_visible: true,
                },
              ]
            : [
                {
                  id: missing,
                  category: 'Damage',
                  location: 'West path',
                  severity: 'moderate' as const,
                  description: 'An uneven paving edge was documented.',
                  recommendation: 'Have the contractor assess the paving edge.',
                  customer_visible: true,
                },
              ]),
          {
            id: crypto.randomUUID(),
            category: 'Office',
            location: 'Internal',
            severity: 'low',
            description: 'INTERNAL payroll and margin',
            recommendation: 'Private review',
            customer_visible: false,
          },
        ],
      });
      visit = this.repo
        .read(c.organization_id)
        .visits.find((v) => v.id === visit.id)!;
      this.repo.submit(c.organization_id, visit);
      visit = this.repo
        .read(c.organization_id)
        .visits.find((v) => v.id === visit.id)!;
      this.repo.publish(c.organization_id, visit);
    }
  }
  attention() {
    const data = this.read();
    return buildPropertyAttention(data.context, data.reports, data.reviews);
  }
  compareReports(first: ReportReference, second: ReportReference) {
    const data = this.read();
    return comparePublishedInspections(
      data.context,
      data.reports,
      first,
      second,
      data.reviews,
      data.cadences,
    );
  }
  /** Optional comparison evidence uses new visits, never edits published snapshots. */
  prepareComparisonExamples() {
    const c = this.context(),
      state = this.repo.read(c.organization_id);
    if (c.location_id !== this.primaryLocation)
      throw Error('Select the original sample property');
    const name = 'Synthetic inspection comparison';
    if (
      state.plans.some(
        (p) => p.name === name && p.location_id === c.location_id,
      )
    )
      return;
    const context = state.contexts.find(
      (x) => x.customer_id === c.customer_id && x.location_id === c.location_id,
    )!;
    const plan = this.repo.createPlan(c.organization_id, context, name);
    const seal = crypto.randomUUID();
    for (const date of ['2026-12-07', '2026-12-14']) {
      const last = date === '2026-12-14';
      let visit = this.repo.addVisit(c.organization_id, plan.id, date);
      this.repo.saveVisit(c.organization_id, visit, {
        summary: 'Synthetic comparison check-in · ' + date,
        internal_notes: 'INTERNAL costs and private contractor notes',
        checklist: [
          {
            id: 'exterior',
            label: 'Exterior condition and safety',
            required: true,
            completed: true,
          },
          {
            id: 'drain',
            label: 'Drain access checked',
            required: false,
            completed: last,
          },
          ...(!last
            ? [
                {
                  id: 'side',
                  label: 'Side path observed',
                  required: false,
                  completed: true,
                },
              ]
            : []),
        ],
        findings: [
          {
            id: seal,
            category: 'Damage',
            location: 'Comparison window seal',
            severity: last ? 'urgent' : 'moderate',
            description: last
              ? 'Water marks documented below the window.'
              : 'A gap documented at the window.',
            recommendation: last
              ? 'Request an assessment of the seal and surrounding surface.'
              : 'Request a seal assessment.',
            customer_visible: true,
          },
          {
            id: 'generic-drain',
            category: 'Maintenance',
            location: 'Comparison drain',
            severity: 'low',
            description: 'Leaves documented in the drain.',
            recommendation: 'Schedule a drain assessment.',
            customer_visible: true,
          },
          ...(!last
            ? [
                {
                  id: crypto.randomUUID(),
                  category: 'Damage',
                  location: 'Comparison side path',
                  severity: 'moderate' as const,
                  description: 'An uneven edge was documented.',
                  recommendation: 'Request an edge assessment.',
                  customer_visible: true,
                },
              ]
            : []),
        ],
      });
      visit = this.repo
        .read(c.organization_id)
        .visits.find((v) => v.id === visit.id)!;
      this.repo.submit(c.organization_id, visit);
      visit = this.repo
        .read(c.organization_id)
        .visits.find((v) => v.id === visit.id)!;
      this.repo.publish(c.organization_id, visit);
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
    const reports = this.repo
      .portal(c.organization_id, c.customer_id)
      .reports.filter((r) => r.location_id === c.location_id);
    const cadences = Object.fromEntries(
      reports.map((r) => {
        const visit = s.visits.find((v) => v.id === r.visit_id);
        const plan = s.plans.find(
          (p) =>
            p.id === visit?.plan_id &&
            p.customer_id === c.customer_id &&
            p.location_id === c.location_id,
        );
        return [r.id, plan?.cadence ?? 'once'];
      }),
    );
    return {
      context: c,
      exampleAvailable: c.location_id === this.primaryLocation,
      reports,
      history: projectPublishedHistory(reports, c),
      cadences,
      reviews: this.versions
        .filter((v) => c.version_ids.includes(v.id))
        .map((v, i) =>
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
      responses: this.versions
        .filter((v) => c.version_ids.includes(v.id))
        .map((v) => ({
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
      this.read().reviews.find((r) => r.version_id === version)
        ?.review_state !== 'awaiting_action' ||
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
