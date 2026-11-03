import { taskReviewGroups } from './task-review-paths';
import {
  SavedRevisionWorkbench,
  type SavedWorkbenchPanels,
} from './SavedRevisionWorkbench';
import { TaskCustodyReview } from './TaskCustodyReview';
import { CostCoveragePath } from './CostCoveragePath';
import { PropertyServiceContinuity } from './PropertyServiceContinuity';
import { MaintenanceRequirementsReview } from './MaintenanceRequirementsReview';
import { CurrentOwnerPriorities } from './CurrentOwnerPriorities';
import { PriorityActions } from './PriorityActions';
const panels: SavedWorkbenchPanels = Object.freeze({
  field: TaskCustodyReview,
  finance: CostCoveragePath,
  customer: PropertyServiceContinuity,
  maintenance: MaintenanceRequirementsReview,
  priorities: CurrentOwnerPriorities,
});
/** Original host, repositories, custody and five panel slots; all modes default OFF. */
export const cycle22RequirementGroups = taskReviewGroups({
  'schedule-work-order-continuity': (props) => (
    <SavedRevisionWorkbench {...props} reviewPanels={panels} />
  ),
  'finance-case-continuity': (props) => <CostCoveragePath {...props} />,
  'service-source-continuity': (props) => (
    <PropertyServiceContinuity {...props} />
  ),
  'maintenance-planning-continuity': (props) => (
    <MaintenanceRequirementsReview {...props} />
  ),
  'verified-task-handoff': (props) => <CurrentOwnerPriorities {...props} />,
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
