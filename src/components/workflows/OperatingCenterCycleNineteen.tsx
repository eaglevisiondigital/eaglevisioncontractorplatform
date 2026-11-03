import { taskReviewGroups } from './task-review-paths';
import { SavedRevisionWorkbench } from './SavedRevisionWorkbench';
import { CostSavedRevisions } from './CostSavedRevisions';
import { ServiceRevisionReview } from './ServiceRevisionReview';
import { MaintenanceSavedRevisions } from './MaintenanceSavedRevisions';
import { PrioritySavedRevisions } from './PrioritySavedRevisions';
import { PriorityActions } from './PriorityActions';
export const cycle19SavedGroups = taskReviewGroups({
  'schedule-work-order-continuity': (props) => (
    <SavedRevisionWorkbench {...props} />
  ),
  'finance-case-continuity': (props) => <CostSavedRevisions {...props} />,
  'service-source-continuity': (props) => <ServiceRevisionReview {...props} />,
  'maintenance-planning-continuity': (props) => (
    <MaintenanceSavedRevisions {...props} />
  ),
  'verified-task-handoff': (props) => <PrioritySavedRevisions {...props} />,
  'source-bound-addons': (props) => (
    <PriorityActions {...props} view="advanced" />
  ),
}).map((group) => ({
  ...group,
  label: 'Saved source review',
  panels: group.panels.map((panel) =>
    panel.id === 'schedule-work-order-continuity'
      ? { ...panel, label: 'Saved work revisions' }
      : panel,
  ),
}));
