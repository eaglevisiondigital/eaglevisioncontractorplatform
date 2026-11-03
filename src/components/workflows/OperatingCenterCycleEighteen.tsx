import { taskReviewGroups } from './task-review-paths';
import { DailyWorkbench } from './DailyWorkbench';
import { CostInvoiceReview } from './CostInvoiceReview';
import { ServiceUpdateReview } from './ServiceUpdateReview';
import { MaintenanceAgenda } from './MaintenanceAgenda';
import { PriorityActions } from './PriorityActions';
/** Existing six slots and one source host; all mutation authority remains closed. */
const groups = taskReviewGroups({
  'schedule-work-order-continuity': (props) => <DailyWorkbench {...props} />,
  'finance-case-continuity': (props) => <CostInvoiceReview {...props} />,
  'service-source-continuity': (props) => <ServiceUpdateReview {...props} />,
  'maintenance-planning-continuity': (props) => (
    <MaintenanceAgenda {...props} />
  ),
  'verified-task-handoff': (props) => (
    <PriorityActions {...props} view="priorities" />
  ),
  'source-bound-addons': (props) => (
    <PriorityActions {...props} view="advanced" />
  ),
});
export const cycle18WorkflowGroups = groups.map((group) => ({
  ...group,
  label: 'Retained daily workflow',
  panels: group.panels.map((panel) =>
    panel.id === 'schedule-work-order-continuity'
      ? { ...panel, label: 'Daily contractor workflow' }
      : panel,
  ),
}));
