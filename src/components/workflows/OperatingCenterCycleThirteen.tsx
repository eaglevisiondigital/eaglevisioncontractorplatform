import type { OperatingSourcePreparer } from './OperatingCenterPreview';
import { OperatingCenterCycleTwelve } from './OperatingCenterCycleTwelve';
import type { OperatingReviewGroup } from './OperatingCenterPreview';
import { WorkOrderRevisions } from './WorkOrderRevisions';
import { FinancialCasework } from './FinancialCasework';
import { ServicePassportDesk } from './ServicePassportDesk';
import { FollowUpReadiness } from './FollowUpReadiness';
import { OperatingNavigation } from './OperatingNavigation';
import { AddonReviewDesk } from './AddonReviewDesk';
const groups: readonly OperatingReviewGroup[] = [
  {
    label: 'Cycle 13 operating desks',
    initiallyOpen: false,
    panels: [
      {
        id: 'work-order-revisions',
        label: 'Work-order revisions',
        render: (p) => <WorkOrderRevisions {...p} />,
      },
      {
        id: 'financial-casework',
        label: 'Financial casework',
        render: (p) => <FinancialCasework {...p} />,
      },
      {
        id: 'service-passport-desk',
        label: 'Service and Passport',
        render: (p) => <ServicePassportDesk {...p} />,
      },
      {
        id: 'follow-up-readiness',
        label: 'Follow-up readiness',
        render: (p) => <FollowUpReadiness {...p} />,
      },
      {
        id: 'operating-navigation',
        label: 'Daily task navigation',
        render: (p) => <OperatingNavigation {...p} />,
      },
      {
        id: 'addon-review-desk',
        label: 'Advanced review desk',
        render: (p) => <AddonReviewDesk {...p} />,
      },
    ],
  },
];
export function OperatingCenterCycleThirteen({
  additionalReviewGroups = [],
  prepareSources,
}: {
  additionalReviewGroups?: readonly OperatingReviewGroup[];
  prepareSources?: OperatingSourcePreparer;
} = {}) {
  return (
    <OperatingCenterCycleTwelve
      prepareSources={prepareSources}
      additionalReviewGroups={[...groups, ...additionalReviewGroups]}
    />
  );
}
