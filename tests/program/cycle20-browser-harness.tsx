import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareOperatingSources } from '../../src/lib/workflows/operating-center-runtime';
import {
  SavedRevisionWorkbench,
  type SavedWorkbenchPanels,
} from '../../src/components/workflows/SavedRevisionWorkbench';
import { WorkOrderEvidenceContinuity } from '../../src/components/workflows/WorkOrderEvidenceContinuity';
import { RecordedCostContinuity } from '../../src/components/workflows/RecordedCostContinuity';
import { PublishedServiceContinuity } from '../../src/components/workflows/PublishedServiceContinuity';
import { MaintenanceRenewalEvidence } from '../../src/components/workflows/MaintenanceRenewalEvidence';
import { RecordedPriorityNavigation } from '../../src/components/workflows/RecordedPriorityNavigation';
const panels: SavedWorkbenchPanels = Object.freeze({
  field: WorkOrderEvidenceContinuity,
  finance: RecordedCostContinuity,
  customer: PublishedServiceContinuity,
  maintenance: MaintenanceRenewalEvidence,
  priorities: RecordedPriorityNavigation,
});
/** DEV direct-import fixture, never imported by the application or production bundle. */
export async function mountEvidenceWorkbench(brand: number, endedTime = false) {
  if (
    !import.meta.env.DEV ||
    location.hostname !== '127.0.0.1' ||
    location.protocol !== 'http:'
  )
    throw Error('Loopback DEV fixture only');
  const sources = await prepareOperatingSources(sampleCompanies[brand], {
    enabled: true,
    confirmed: true,
  });
  if (endedTime)
    for (const [index, entry] of [
      sources.entries[0],
      sources.entries[2],
    ].entries()) {
      const id = await sources.estimates.recordTime(
        sources.company.id,
        entry.worker_id,
        {
          job_id: entry.target.job_id!,
          overhead_center: null,
          task: 'PRIVATE_BROWSER_TIME_TASK',
          kind: 'work',
          started_at: `2026-02-03T${14 + index * 2}:00:00.000Z`,
          ended_at: `2026-02-03T${15 + index * 2}:00:00.000Z`,
          billable: true,
          corrects_id: null,
        },
      );
      if (typeof id !== 'string')
        throw Error('Exact recorded time acknowledgment required');
      await sources.estimates.submitTime(sources.company.id, id);
      await sources.estimates.reviewTime(
        sources.company.id,
        id,
        'approved',
        'PRIVATE_BROWSER_REVIEW_NOTE',
      );
    }
  const jobIds = (await sources.estimates.jobs(sources.company.id)).map(
    (j) => j.id,
  );
  const app = document.getElementById('root')!;
  app.hidden = true;
  const host = document.createElement('main');
  document.body.append(host);
  const heading = document.createElement('h1');
  heading.textContent = 'Disposable saved-evidence browser fixture';
  host.append(heading);
  const mount = document.createElement('div');
  host.append(mount);
  const root = createRoot(mount);
  const job = sources.entries[0].target.job_id!;
  const render = () =>
    root.render(
      <StrictMode>
        <SavedRevisionWorkbench
          sources={sources}
          enabled
          selectedJobId={job}
          reviewPanels={panels}
        />
      </StrictMode>,
    );
  render();
  return {
    job,
    jobIds,
    revoke() {
      const original = sources.operations.syntheticMemberships.bind(
        sources.operations,
      );
      sources.operations.syntheticMemberships = (org) =>
        original(org).map((m) => ({ ...m, active: false }));
      render();
    },
    dispose() {
      root.unmount();
      host.remove();
      app.hidden = false;
    },
  };
}
