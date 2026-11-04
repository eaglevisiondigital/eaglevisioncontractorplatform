import { prepareCorrectionPreviewSources } from '../../lib/workflows/correction-preview-sources';
import { cycle21CorrectionGroups } from './OperatingCenterCycleTwentyOne';
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
import { cycle16DailyGroups } from './OperatingCenterCycleSixteen';
import { cycle17WorkspaceGroups } from './OperatingCenterCycleSeventeen';
import { cycle18WorkflowGroups } from './OperatingCenterCycleEighteen';
import { cycle20EvidenceGroups } from './OperatingCenterCycleTwenty';
import { cycle19SavedGroups } from './OperatingCenterCycleNineteen';
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
  const [corrections, setCorrections] = useState(false);
  const [savedEvidence, setSavedEvidence] = useState(false);
  const [savedRevisions, setSavedRevisions] = useState(false);
  const [dailyWorkbench, setDailyWorkbench] = useState(false);
  const [taskPaths, setTaskPaths] = useState(false);
  const [dailyGuides, setDailyGuides] = useState(false);
  const [retainedWorkspaces, setRetainedWorkspaces] = useState(false);
  const retained = taskPaths ? guided : cycle14ContinuityGroups;
  const baseline = dailyGuides ? cycle16DailyGroups : retained;
  const retainedGroups = retainedWorkspaces ? cycle17WorkspaceGroups : baseline;
  return (
    <>
      <section aria-label="Review path options">
        <fieldset className="task-review-options">
          <legend>Review options</legend>
          <label>
            <input
              type="checkbox"
              checked={corrections}
              onChange={(event) => setCorrections(event.target.checked)}
            />
            Use canonical correction workflows
          </label>
          <p>
            Enable before preparing sources to include original-engine reviewed
            time and pending material commitments in the disposable fixture. No
            payment, payroll posting or message is executed. Existing prepared
            sources are never reseeded.
          </p>
          <label>
            <input
              type="checkbox"
              checked={savedEvidence}
              onChange={(event) => setSavedEvidence(event.target.checked)}
            />
            Use saved evidence files
          </label>
          <label>
            <input
              type="checkbox"
              checked={savedRevisions}
              onChange={(event) => setSavedRevisions(event.target.checked)}
            />
            Use saved source continuity
          </label>
          <label>
            <input
              type="checkbox"
              checked={dailyWorkbench}
              onChange={(event) => setDailyWorkbench(event.target.checked)}
            />
            Use daily contractor workflow
          </label>
          <label>
            <input
              type="checkbox"
              checked={taskPaths}
              onChange={(event) => setTaskPaths(event.target.checked)}
            />
            Use guided task paths
          </label>
          <label>
            <input
              type="checkbox"
              checked={dailyGuides}
              onChange={(event) => setDailyGuides(event.target.checked)}
            />
            Use daily workflow guides
          </label>
          <label>
            <input
              type="checkbox"
              checked={retainedWorkspaces}
              onChange={(event) => setRetainedWorkspaces(event.target.checked)}
            />
            Use retained daily workspaces
          </label>
          <p>
            Keep exact source context while reviewing a task. Separate review
            confirmations still apply.
          </p>
        </fieldset>
      </section>
      <OperatingCenterCycleThirteen
        prepareSources={
          corrections ? prepareCorrectionPreviewSources : undefined
        }
        additionalReviewGroups={
          corrections
            ? cycle21CorrectionGroups
            : savedEvidence
              ? cycle20EvidenceGroups
              : savedRevisions
                ? cycle19SavedGroups
                : dailyWorkbench
                  ? cycle18WorkflowGroups
                  : retainedGroups
        }
      />
    </>
  );
}
