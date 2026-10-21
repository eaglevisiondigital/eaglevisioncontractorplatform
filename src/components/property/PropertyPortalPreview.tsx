import { useCallback, useState, type CSSProperties } from 'react';
import { sampleCompanies } from '../../domain/platform';
import { previewOperations } from '../../lib/operations';
import { propertyRepository } from '../../lib/property';
import { PropertyReportHistory } from './PropertyReportHistory';
import { useResource, useTask } from '../forms-state';
import { ResourceStatus } from '../forms';
import { CompanyLogo } from '../CompanyLogo';
import { PlatformBrand } from '../PlatformBrand';

/** Explicit synthetic preview reuses the existing property repository; no connected sample fallback. */
export function PropertyPortalPreview() {
  const [org, setOrg] = useState(sampleCompanies[0].id);
  const company = sampleCompanies.find((c) => c.id === org)!;
  return (
    <main
      className="property-portal-preview"
      style={{ '--company-color': company.primary_color } as CSSProperties}
    >
      <PlatformBrand />
      <p className="notice">
        SYNTHETIC CUSTOMER REPORT PREVIEW · No customer login, hosted records or
        financial activity.
      </p>
      <label>
        Sample contractor
        <select value={org} onChange={(e) => setOrg(e.target.value)}>
          {sampleCompanies.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <CompanyLogo company={company} sample />
      <h1>Your property reports</h1>
      <PreviewReports key={org} org={org} />
      <a href="/preview">Return to sample workspace</a>
    </main>
  );
}
function PreviewReports({ org }: { org: string }) {
  const repo = propertyRepository(previewOperations),
    company = sampleCompanies.find((c) => c.id === org)!;
  const data = useResource(
    useCallback(async () => {
      await repo.initialize(company);
      return repo.read(org);
    }, [repo, company, org]),
  );
  const task = useTask();
  if (!data.data || data.error) return <ResourceStatus {...data} />;
  const state = data.data,
    context = state.contexts[0];
  const reports = repo
    .portal(org, context.customer_id)
    .reports.filter((r) => r.location_id === context.location_id)
    .map((r) => ({
      id: r.id,
      version: r.version,
      published_at: r.published_at,
      snapshot: {
        summary: r.summary,
        visited_on: r.visited_on,
        phase: r.phase,
        findings: r.findings,
        checklist: r.checklist,
        media: [] as never[],
      },
    }));
  async function example() {
    if (reports.length) return;
    for (const cadence of ['weekly', 'monthly'] as const) {
      const plan = repo.createPlan(
        org,
        context,
        `${cadence} synthetic maintenance`,
      );
      repo.savePlan(org, { ...plan, cadence, starts_on: '2026-10-16' });
      for (const date of cadence === 'weekly'
        ? ['2026-10-16', '2026-10-23']
        : ['2026-11-16']) {
        const visit = repo.addVisit(org, plan.id, date);
        repo.saveVisit(org, visit, {
          summary: `${cadence === 'weekly' ? 'Weekly' : 'Monthly'} property check · ${date}`,
          internal_notes: 'INTERNAL rates, supplier costs and payroll review',
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
              id: 'repair',
              category: 'Damage',
              location: 'Exterior joint',
              severity: 'moderate',
              description: 'Weathered exterior seal needs repair.',
              recommendation: 'Request contractor review of a repair estimate.',
              customer_visible: true,
            },
            {
              id: 'office',
              category: 'Office',
              location: 'Internal',
              severity: 'low',
              description: 'INTERNAL margin and purchasing',
              recommendation: 'Private review',
              customer_visible: false,
            },
          ],
        });
        let current = repo.read(org).visits.find((v) => v.id === visit.id)!;
        repo.submit(org, current);
        current = repo.read(org).visits.find((v) => v.id === visit.id)!;
        repo.publish(org, current);
      }
    }
    data.reload();
  }
  return (
    <>
      <p>
        {company.name} · {context.customer_name}
      </p>
      <h2>{context.location_label}</h2>
      <button
        disabled={task.busy || reports.length > 0}
        onClick={() =>
          void task.run(
            example,
            'Synthetic weekly and monthly history prepared',
          )
        }
      >
        Load synthetic inspection history
      </button>
      {task.message && <p role="status">{task.message}</p>}
      <PropertyReportHistory reports={reports} />
      <p>
        Repair recommendations are informational. Estimates and approvals
        require separately authorized access.
      </p>
    </>
  );
}
