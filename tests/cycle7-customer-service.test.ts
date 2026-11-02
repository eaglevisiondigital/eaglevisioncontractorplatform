import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { emptyHistoryFilters } from '../src/domain/property/history-search';
import {
  prepareLocalJourney,
  type LocalJourney,
} from '../src/lib/workflows/journey-runtime';
import {
  assertCustomerServiceCurrentNow,
  readCustomerService,
} from '../src/lib/workflows/customer-service';
import * as customer from '../src/lib/workflows/customer-workflow';
import { CustomerService } from '../src/components/workflows/CustomerService';

const gate = () => ({ enabled: true, confirmed: true });
const filters = () => ({ ...emptyHistoryFilters });
async function fixture(index = 0) {
  const j = await prepareLocalJourney(sampleCompanies[index], gate());
  return {
    ...j,
    selection: {
      report_id: j.report_id,
      published_version: j.published_version,
    },
  };
}
function publish(
  j: LocalJourney,
  plan = j.plan_id,
  day = '2026-12-14',
  summary = 'New roof observation',
) {
  let visit = j.property.addVisit(j.company.id, plan, day, 'during');
  j.property.saveVisit(j.company.id, visit, {
    summary,
    internal_notes: 'PRIVATE supplier margin payroll 87654321',
    checklist: [],
    findings: [
      {
        id: crypto.randomUUID(),
        category: 'Damage',
        location: 'North roof',
        severity: 'urgent',
        description: 'Gap near flashing.',
        recommendation: 'Arrange flashing assessment.',
        customer_visible: true,
      },
      {
        id: crypto.randomUUID(),
        category: 'Maintenance',
        location: 'Garden',
        severity: 'low',
        description: 'Leaves documented.',
        recommendation: 'Clear leaf debris.',
        customer_visible: true,
      },
      {
        id: crypto.randomUUID(),
        category: 'Office',
        location: 'Private room',
        severity: 'urgent',
        description: 'PRIVATE supplier payroll 87654321',
        recommendation: 'PRIVATE margin review',
        customer_visible: false,
      },
    ],
  });
  visit = j.property.read(j.company.id).visits.find((v) => v.id === visit.id)!;
  j.property.submit(j.company.id, visit);
  visit = j.property.read(j.company.id).visits.find((v) => v.id === visit.id)!;
  return j.property.publish(j.company.id, visit);
}
afterEach(() => vi.restoreAllMocks());
describe('customer service evidence navigator over actual existing sources', () => {
  for (const index of [0, 1, 2]) {
    it(`uses brand ${index}'s exact property, issued job and published version without business effects`, async () => {
      const j = await fixture(index),
        f = filters(),
        before = j.property.read(j.company.id),
        release = j.release.read('staff');
      const writes = [
        vi.spyOn(j.property, 'publish'),
        vi.spyOn(j.property, 'saveVisit'),
        vi.spyOn(j.property, 'savePlan'),
        vi.spyOn(j.estimates, 'issue'),
        vi.spyOn(j.estimates, 'approveJob'),
        vi.spyOn(j.release, 'command'),
        vi.spyOn(j.customerModel, 'respond'),
        vi.spyOn(j.customerModel, 'prepareHistory'),
      ];
      const r = await readCustomerService(
        j.customerModel,
        j.target,
        j.selection,
        f,
        gate(),
      );
      expect(r.status).toBe('CURRENT');
      expect(r.matching).toBe(1);
      expect(r.available).toBe(1);
      expect(r.reports[0]).toMatchObject({
        id: j.report_id,
        version: j.published_version,
      });
      expect(r.issued_scope).toMatchObject({
        job_id: j.target.job_id,
        estimate_id: j.target.estimate_id,
        issued_version_id: j.target.version_id,
        issued_version_number: j.issued.version.version_number,
      });
      expect(() =>
        assertCustomerServiceCurrentNow(
          j.customerModel,
          j.target,
          j.selection,
          f,
          r,
        ),
      ).not.toThrow();
      expect(r.history_completeness).toBe('UNKNOWN');
      expect(r.physical_completion).toBe('UNVERIFIED');
      expect(JSON.stringify(r)).not.toMatch(
        /PRIVATE|unit_cost_minor|amount_minor|internal_notes|payroll|worker_id|actor_id|supplier|margin|87654321/,
      );
      expect(Object.isFrozen(r.reports[0].snapshot.findings)).toBe(true);
      expect(j.property.read(j.company.id)).toEqual(before);
      expect(j.release.read('staff')).toEqual(release);
      writes.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    });
  }
  it('combines inclusive dates, text, cadence and same-finding evidence with accurate counts', async () => {
    const j = await fixture(),
      second = publish(j),
      f = {
        ...filters(),
        query: 'gap flashing',
        from: '2026-12-14',
        to: '2026-12-14',
        frequency: 'weekly',
        category: 'Damage',
        severity: 'urgent',
        location: 'North roof',
        recommendation: 'assessment',
      };
    const r = await readCustomerService(
      j.customerModel,
      j.target,
      j.selection,
      f,
      gate(),
    );
    expect(r.status).toBe('CURRENT');
    expect(r.available).toBe(2);
    expect(r.matching).toBe(1);
    expect(r.reports.map((x) => [x.id, x.version])).toEqual([
      [second.id, second.version],
    ]);
    expect(r.options?.categories).toEqual(['Damage', 'Maintenance']);
    expect(r.frequencies[second.id]).toBe('weekly');
  });
  it('does not combine distinct findings to invent a match', async () => {
    const j = await fixture();
    publish(j);
    const r = await readCustomerService(
      j.customerModel,
      j.target,
      j.selection,
      {
        ...filters(),
        category: 'Damage',
        severity: 'low',
        recommendation: 'debris',
      },
      gate(),
    );
    expect(r.status).toBe('CURRENT');
    expect(r.matching).toBe(0);
    expect(r.available).toBe(2);
  });
  it('clears individual filters and resets to the available reports without claiming complete history', async () => {
    const j = await fixture();
    publish(j);
    for (const f of [
      { ...filters(), query: 'no matching observation' },
      { ...filters(), query: '' },
      filters(),
    ]) {
      const r = await readCustomerService(
        j.customerModel,
        j.target,
        j.selection,
        f,
        gate(),
      );
      expect(r.matching).toBe(f.query ? 0 : 2);
      expect(r.history_completeness).toBe('UNKNOWN');
    }
  });
  it('opens exactly the selected published report/version after filtering', async () => {
    const j = await fixture(),
      report = publish(j),
      exact = { report_id: report.id, published_version: report.version };
    const r = await readCustomerService(
      j.customerModel,
      j.target,
      exact,
      { ...filters(), recommendation: 'flashing' },
      gate(),
    );
    expect(r.status).toBe('CURRENT');
    expect(r.reports.map((x) => x.id)).toEqual([report.id]);
    expect(
      (
        await readCustomerService(
          j.customerModel,
          j.target,
          { ...exact, published_version: report.version + 1 },
          filters(),
          gate(),
        )
      ).status,
    ).toBe('UNKNOWN');
  });
  it('excludes an actual different issued job on the same customer property despite identical wording', async () => {
    const j = await fixture(),
      d = await j.estimates.create(
        j.company,
        structuredClone(j.issued.version.payload),
      ),
      issued = await j.estimates.issue(j.company.id, d),
      job = await j.estimates.approveJob(j.company.id, issued);
    await j.property.refreshContexts(j.company.id);
    const context = j.property
      .read(j.company.id)
      .contexts.find((c) => c.job_id === job)!;
    const plan = j.property.createPlan(
      j.company.id,
      context,
      'Actual different job',
    );
    const report = publish(
      j,
      plan.id,
      '2026-12-15',
      j.customerModel.read().reports[0].summary,
    );
    const r = await readCustomerService(
      j.customerModel,
      j.target,
      j.selection,
      filters(),
      gate(),
    );
    expect(r.status).toBe('CURRENT');
    expect(r.available).toBe(1);
    expect(r.reports.map((x) => x.id)).not.toContain(report.id);
    expect(
      (
        await readCustomerService(
          j.customerModel,
          j.target,
          { report_id: report.id, published_version: report.version },
          filters(),
          gate(),
        )
      ).status,
    ).toBe('UNKNOWN');
  });
  it('never indexes private notes, hidden findings, issued costs or workforce values', async () => {
    const j = await fixture();
    publish(j);
    for (const query of [
      'PRIVATE',
      '87654321',
      'payroll',
      'supplier',
      'margin',
      'Private room',
    ]) {
      const r = await readCustomerService(
        j.customerModel,
        j.target,
        j.selection,
        { ...filters(), query },
        gate(),
      );
      expect(r.status).toBe('CURRENT');
      expect(r.matching).toBe(0);
      expect(JSON.stringify(r)).not.toContain('87654321');
    }
  });
  it('is default OFF before any model read', async () => {
    const j = await fixture(),
      read = vi.spyOn(j.customerModel, 'read');
    expect(
      (
        await readCustomerService(
          j.customerModel,
          j.target,
          j.selection,
          filters(),
        )
      ).status,
    ).toBe('UNKNOWN');
    expect(read).not.toHaveBeenCalled();
    expect(
      renderToStaticMarkup(
        createElement(CustomerService, {
          model: j.customerModel,
          target: j.target,
          selection: j.selection,
        }),
      ),
    ).toBe('');
  });
  for (const key of [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ] as const)
    it(`rejects incorrect ${key} without a fallback`, async () => {
      const j = await fixture(),
        r = await readCustomerService(
          j.customerModel,
          { ...j.target, [key]: 'foreign-source' },
          j.selection,
          filters(),
          gate(),
        );
      expect(r.status).toBe('UNKNOWN');
      expect(r.reports).toEqual([]);
      expect(r.issued_scope).toBeNull();
    });
  for (const f of [
    { from: '2026-02-30' },
    { from: '2026-12-20', to: '2026-12-01' },
    { severity: 'critical' },
    { frequency: 'daily' },
    { category: 'private' },
    { location: 'missing' },
    { query: 'x'.repeat(201) },
  ])
    it(`fails closed on invalid/unavailable filters ${JSON.stringify(f).slice(0, 60)}`, async () => {
      const j = await fixture(),
        r = await readCustomerService(
          j.customerModel,
          j.target,
          j.selection,
          { ...filters(), ...f },
          gate(),
        );
      expect(r.status).toBe('UNKNOWN');
      expect(r.reports).toEqual([]);
    });
  it('rejects accessors and extra input fields without running caller code', async () => {
    const j = await fixture();
    let called = false;
    const f = Object.defineProperty(filters(), 'query', {
      enumerable: true,
      get() {
        called = true;
        return 'gap';
      },
    });
    expect(
      (
        await readCustomerService(
          j.customerModel,
          j.target,
          j.selection,
          f,
          gate(),
        )
      ).status,
    ).toBe('UNKNOWN');
    expect(called).toBe(false);
    expect(
      (
        await readCustomerService(
          j.customerModel,
          j.target,
          { ...j.selection, extra: true } as typeof j.selection,
          filters(),
          gate(),
        )
      ).status,
    ).toBe('UNKNOWN');
  });
  it('rejects revoked and foreign synthetic staff independently of retained customer context', async () => {
    const j = await fixture(),
      f = filters(),
      r = await readCustomerService(
        j.customerModel,
        j.target,
        j.selection,
        f,
        gate(),
      );
    await j.operations.configure(
      j.company.id,
      'active',
      'starter',
      {},
      j.company.id + '-backup-owner',
    );
    await j.operations.revokeOwner(j.company.id, j.target.actor_id);
    expect(() =>
      assertCustomerServiceCurrentNow(
        j.customerModel,
        j.target,
        j.selection,
        f,
        r,
      ),
    ).toThrow();
    expect(
      (
        await readCustomerService(
          j.customerModel,
          j.target,
          j.selection,
          f,
          gate(),
        )
      ).status,
    ).toBe('UNKNOWN');
  });
  for (const change of [
    'target',
    'selection',
    'filters',
    'gate',
    'logout',
    'published-source',
  ] as const)
    it(`hides late evidence when ${change} changes at the underlying final await`, async () => {
      const j = await fixture(),
        f = filters(),
        g = gate(),
        original = customer.readCustomerWorkflow;
      let changed = false;
      vi.spyOn(customer, 'readCustomerWorkflow').mockImplementation(
        async (...args) => {
          const r = await original(...args);
          if (!changed) {
            changed = true;
            if (change === 'target') j.target.location_id = crypto.randomUUID();
            if (change === 'selection') j.selection.published_version++;
            if (change === 'filters') f.query = 'new';
            if (change === 'gate') g.confirmed = false;
            if (change === 'logout') j.customerModel.logout();
            if (change === 'published-source') publish(j);
          }
          return r;
        },
      );
      expect(
        (
          await readCustomerService(
            j.customerModel,
            j.target,
            j.selection,
            f,
            g,
          )
        ).status,
      ).toBe('UNKNOWN');
      expect(changed).toBe(true);
    });
  it('does not trust copied results or original results with changed current caller context', async () => {
    const j = await fixture(),
      f = filters(),
      r = await readCustomerService(
        j.customerModel,
        j.target,
        j.selection,
        f,
        gate(),
      );
    expect(() =>
      assertCustomerServiceCurrentNow(
        j.customerModel,
        j.target,
        j.selection,
        f,
        structuredClone(r),
      ),
    ).toThrow();
    expect(() =>
      assertCustomerServiceCurrentNow(
        j.customerModel,
        { ...j.target, job_id: 'foreign' },
        j.selection,
        f,
        r,
      ),
    ).toThrow();
    expect(() =>
      assertCustomerServiceCurrentNow(
        j.customerModel,
        j.target,
        j.selection,
        { ...f, query: 'new' },
        r,
      ),
    ).toThrow();
  });
  it('renders labeled keyboard controls with no customer action or message facility', async () => {
    const j = await fixture(),
      html = renderToStaticMarkup(
        createElement(CustomerService, {
          model: j.customerModel,
          target: j.target,
          selection: j.selection,
          enabled: true,
        }),
      );
    expect(html).toContain('Customer service evidence navigator');
    expect(html).toContain('Search observations and report text');
    expect(html).toContain('Reset service filters');
    expect(html).not.toMatch(
      /mailto:|tel:|Send message|Create request|Accept estimate/,
    );
  });
});
