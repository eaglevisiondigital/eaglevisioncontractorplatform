import { OperatingCenterCycleThirteen } from './OperatingCenterCycleThirteen';
import type { OperatingReviewGroup } from './OperatingCenterPreview';
import { ScheduleWorkOrderContinuity } from './ScheduleWorkOrderContinuity';
import { FinanceCaseContinuity } from './FinanceCaseContinuity';
import { MaintenancePlanningContinuity } from './MaintenancePlanningContinuity';
import { VerifiedTaskHandoff } from './VerifiedTaskHandoff';
import { SourceBoundAddonEntry } from './SourceBoundAddons';
import { ServiceSourceContinuity } from './ServiceSourceContinuity';

const groups: readonly OperatingReviewGroup[] = [
  {
    label: 'Cycle 14 source continuity',
    initiallyOpen: false,
    panels: [
      {
        id: 'schedule-work-order-continuity',
        label: 'Schedule and work orders',
        render: (p) => <ScheduleWorkOrderContinuity {...p} />,
      },
      {
        id: 'finance-case-continuity',
        label: 'Financial source continuity',
        render: (p) => <FinanceCaseContinuity {...p} />,
      },
      {
        id: 'service-source-continuity',
        label: 'Service source continuity',
        render: (p) => <ServiceSourceContinuity {...p} />,
      },
      {
        id: 'maintenance-planning-continuity',
        label: 'Maintenance planning continuity',
        render: (p) => <MaintenancePlanningContinuity {...p} />,
      },
      {
        id: 'verified-task-handoff',
        label: 'Verified Copilot handoff',
        render: (p) => <VerifiedTaskHandoff {...p} />,
      },
      {
        id: 'source-bound-addons',
        label: 'Source-bound advanced workflows',
        render: (p) => <SourceBoundAddonEntry {...p} />,
      },
    ],
  },
];
export function OperatingCenterCycleFourteen() {
  return <OperatingCenterCycleThirteen additionalReviewGroups={groups} />;
}
