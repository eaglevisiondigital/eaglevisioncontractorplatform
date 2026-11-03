import { taskReviewGroups } from './task-review-paths';
import {
  SavedRevisionWorkbench,
  type SavedWorkbenchPanels,
} from './SavedRevisionWorkbench';
import { TaskCorrectionReview } from './TaskCorrectionReview';
import { CostCorrectionReview } from './CostCorrectionReview';
import { PublishedServiceNavigator } from './PublishedServiceNavigator';
import { MaintenancePlanCorrection } from './MaintenancePlanCorrection';
import { RecordedOwnerActions } from './RecordedOwnerActions';
import { PriorityActions } from './PriorityActions';
const panels: SavedWorkbenchPanels = Object.freeze({
  field: TaskCorrectionReview,
  finance: CostCorrectionReview,
  customer: PublishedServiceNavigator,
  maintenance: MaintenancePlanCorrection,
  priorities: RecordedOwnerActions,
});
/** Same admitted host and native source handles; no second state restoration layer. */
export const cycle21CorrectionGroups = taskReviewGroups({
  'schedule-work-order-continuity': (props) => (
    <SavedRevisionWorkbench {...props} reviewPanels={panels} />
  ),
  'finance-case-continuity': (props) => <CostCorrectionReview {...props} />,
  'service-source-continuity': (props) => (
    <PublishedServiceNavigator {...props} />
  ),
  'maintenance-planning-continuity': (props) => (
    <MaintenancePlanCorrection {...props} />
  ),
  'verified-task-handoff': (props) => <RecordedOwnerActions {...props} />,
  'source-bound-addons': (props) => (
    <PriorityActions {...props} view="advanced" />
  ),
}).map((group) => ({
  ...group,
  label: 'Canonical correction review',
  panels: group.panels.map((panel) =>
    panel.id === 'schedule-work-order-continuity'
      ? { ...panel, label: 'Task correction workflow' }
      : panel,
  ),
}));
