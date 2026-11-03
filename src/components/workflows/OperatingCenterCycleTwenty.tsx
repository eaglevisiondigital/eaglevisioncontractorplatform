import { taskReviewGroups } from './task-review-paths';
import {
  SavedRevisionWorkbench,
  type SavedWorkbenchPanels,
} from './SavedRevisionWorkbench';
import { WorkOrderEvidenceContinuity } from './WorkOrderEvidenceContinuity';
import { RecordedCostContinuity } from './RecordedCostContinuity';
import { PublishedServiceContinuity } from './PublishedServiceContinuity';
import { MaintenanceRenewalEvidence } from './MaintenanceRenewalEvidence';
import { RecordedPriorityNavigation } from './RecordedPriorityNavigation';
import { PriorityActions } from './PriorityActions';

const panels: SavedWorkbenchPanels = Object.freeze({
  field: WorkOrderEvidenceContinuity,
  finance: RecordedCostContinuity,
  customer: PublishedServiceContinuity,
  maintenance: MaintenanceRenewalEvidence,
  priorities: RecordedPriorityNavigation,
});

/** Presentation composition over the same admitted host, job and original engines. */
export const cycle20EvidenceGroups = taskReviewGroups({
  'schedule-work-order-continuity': (props) => (
    <SavedRevisionWorkbench {...props} reviewPanels={panels} />
  ),
  'finance-case-continuity': (props) => <RecordedCostContinuity {...props} />,
  'service-source-continuity': (props) => (
    <PublishedServiceContinuity {...props} />
  ),
  'maintenance-planning-continuity': (props) => (
    <MaintenanceRenewalEvidence {...props} />
  ),
  'verified-task-handoff': (props) => <RecordedPriorityNavigation {...props} />,
  'source-bound-addons': (props) => (
    <PriorityActions {...props} view="advanced" />
  ),
}).map((group) => ({
  ...group,
  label: 'Saved evidence review',
  panels: group.panels.map((panel) =>
    panel.id === 'schedule-work-order-continuity'
      ? { ...panel, label: 'Saved work evidence' }
      : panel,
  ),
}));
