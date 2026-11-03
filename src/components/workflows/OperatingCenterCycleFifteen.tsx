import { useState } from 'react';
import { OperatingCenterCycleThirteen } from './OperatingCenterCycleThirteen';
import { cycle14ContinuityGroups } from './OperatingCenterCycleFourteen';
import { taskReviewGroups } from './task-review-paths';
import { FieldTaskContinuity } from './FieldTaskContinuity';
import { FinanceReviewPath } from './FinanceReviewPath';
import { ServiceReviewPath } from './ServiceReviewPath';
import { MaintenanceReviewPath } from './MaintenanceReviewPath';
import { ExplainableTaskLinks } from './ExplainableTaskLinks';
import { AddonTaskContinuity } from './AddonTaskContinuity';
import './task-review-paths.css';

const guided = taskReviewGroups({
  'schedule-work-order-continuity': (props) => (
    <FieldTaskContinuity {...props} />
  ),
  'finance-case-continuity': (props) => <FinanceReviewPath {...props} />,
  'service-source-continuity': (props) => <ServiceReviewPath {...props} />,
  'maintenance-planning-continuity': (props) => (
    <MaintenanceReviewPath {...props} />
  ),
  'verified-task-handoff': (props) => <ExplainableTaskLinks {...props} />,
  'source-bound-addons': (props) => <AddonTaskContinuity {...props} />,
});

export function OperatingCenterCycleFifteen() {
  const [taskPaths, setTaskPaths] = useState(false);
  return (
    <>
      <section aria-label="Review path options">
        <fieldset className="task-review-options">
          <legend>Review options</legend>
          <label>
            <input
              type="checkbox"
              checked={taskPaths}
              onChange={(event) => setTaskPaths(event.target.checked)}
            />
            Use guided task paths
          </label>
          <p>
            Keep exact source context while reviewing a task. Separate review
            confirmations still apply.
          </p>
        </fieldset>
      </section>
      <OperatingCenterCycleThirteen
        additionalReviewGroups={taskPaths ? guided : cycle14ContinuityGroups}
      />
    </>
  );
}
