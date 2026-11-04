import { taskReviewGroups } from './task-review-paths';
import {
  SavedRevisionWorkbench,
  type SavedWorkbenchPanels,
} from './SavedRevisionWorkbench';
import { TaskRevisionConsistency } from './TaskRevisionConsistency';
import { RecordedCostRequirements } from './RecordedCostRequirements';
import { ServiceSourceReview } from './ServiceSourceReview';
import { MaintenanceRevisionRequirements } from './MaintenanceRevisionRequirements';
import { VerifiedOwnerBriefing } from './VerifiedOwnerBriefing';
import { PriorityActions } from './PriorityActions';
import { TaskReceiptActions } from './TaskReceiptActions';
import { CostCoverageActions } from './CostCoverageActions';
import { ServiceRequestActions } from './ServiceRequestActions';
import { MaintenanceCancellationActions } from './MaintenanceCancellationActions';
import { OwnerActionVerification } from './OwnerActionVerification';

const panels: SavedWorkbenchPanels = Object.freeze({
  field: TaskRevisionConsistency,
  finance: RecordedCostRequirements,
  customer: ServiceSourceReview,
  maintenance: MaintenanceRevisionRequirements,
  priorities: VerifiedOwnerBriefing,
});
const taskActions: SavedWorkbenchPanels = Object.freeze({
  field: TaskReceiptActions,
  finance: CostCoverageActions,
  customer: ServiceRequestActions,
  maintenance: MaintenanceCancellationActions,
  priorities: OwnerActionVerification,
});

/** Same host and panel identities; source preparation and original custody stay native. */
export const cycle23ConsistencyGroups = taskReviewGroups({
  'schedule-work-order-continuity': (props) => (
    <SavedRevisionWorkbench
      {...props}
      reviewPanels={panels}
      taskActions={taskActions}
    />
  ),
  'finance-case-continuity': (props) => <RecordedCostRequirements {...props} />,
  'service-source-continuity': (props) => <ServiceSourceReview {...props} />,
  'maintenance-planning-continuity': (props) => (
    <MaintenanceRevisionRequirements {...props} />
  ),
  'verified-task-handoff': (props) => <VerifiedOwnerBriefing {...props} />,
  'source-bound-addons': (props) => (
    <PriorityActions {...props} view="advanced" />
  ),
}).map((group) => ({
  ...group,
  label: 'Current source requirements',
  panels: group.panels.map((panel) =>
    panel.id === 'schedule-work-order-continuity'
      ? { ...panel, label: 'Current task requirements' }
      : panel,
  ),
}));
