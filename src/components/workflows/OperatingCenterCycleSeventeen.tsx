import { taskReviewGroups } from './task-review-paths';
import { SharedRecordSearch } from './SharedRecordSearch';
import { FieldWorkspace } from './FieldWorkspace';
import { FinanceCaseDesk } from './FinanceCaseDesk';
import { ServicePassportPath } from './ServicePassportPath';
import { RetainedMaintenanceDesk } from './RetainedMaintenanceDesk';
import { OwnerActionDesk } from './OwnerActionDesk';
import { AddonTaskDesk } from './AddonTaskDesk';

/** Same six presentation slots and source host; no separate records or authority. */
export const cycle17WorkspaceGroups = taskReviewGroups({
  'schedule-work-order-continuity': (props) => (
    <>
      <SharedRecordSearch {...props} />
      <FieldWorkspace {...props} />
    </>
  ),
  'finance-case-continuity': (props) => (
    <>
      <SharedRecordSearch {...props} />
      <FinanceCaseDesk {...props} />
    </>
  ),
  'service-source-continuity': (props) => (
    <>
      <SharedRecordSearch {...props} />
      <ServicePassportPath {...props} />
    </>
  ),
  'maintenance-planning-continuity': (props) => (
    <>
      <SharedRecordSearch {...props} />
      <RetainedMaintenanceDesk {...props} />
    </>
  ),
  'verified-task-handoff': (props) => (
    <>
      <SharedRecordSearch {...props} />
      <OwnerActionDesk {...props} />
    </>
  ),
  'source-bound-addons': (props) => (
    <>
      <SharedRecordSearch {...props} />
      <AddonTaskDesk {...props} />
    </>
  ),
});
