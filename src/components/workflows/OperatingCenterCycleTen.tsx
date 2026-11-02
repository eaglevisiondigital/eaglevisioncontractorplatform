import {
  OperatingCenterPreview,
  type OperatingReviewPanel,
  type OperatingReviewGroup,
} from './OperatingCenterPreview';
import { CrewPlanReview } from './CrewPlanReview';
import { FinancialExceptions } from './FinancialExceptions';
import { ServiceDesk } from './ServiceDesk';
import { FollowUpAdmission } from './FollowUpAdmission';
import { PriorityExplanations } from './PriorityExplanations';
import { AdvancedHandoffs } from './AdvancedHandoffs';

// Finite local composition only. The original host owns the single source environment,
// company admission, selected record and every original module. No new fixture/store.
const reviews: readonly OperatingReviewPanel[] = [
  {
    id: 'crew-review',
    label: 'Crew plan comparison',
    render: (p) => <CrewPlanReview {...p} />,
  },
  {
    id: 'exception-review',
    label: 'Financial exceptions',
    render: (p) => <FinancialExceptions {...p} />,
  },
  {
    id: 'service-review',
    label: 'Service request desk',
    render: (p) => <ServiceDesk {...p} />,
  },
  {
    id: 'follow-up-review',
    label: 'Follow-up admission',
    render: (p) => <FollowUpAdmission {...p} />,
  },
  {
    id: 'priority-review',
    label: 'Priority explanations',
    render: (p) => <PriorityExplanations {...p} />,
  },
  {
    id: 'handoff-review',
    label: 'Advanced handoffs',
    render: (p) => <AdvancedHandoffs {...p} />,
  },
];
export function OperatingCenterCycleTen({
  additionalReviewGroups = [],
}: { additionalReviewGroups?: readonly OperatingReviewGroup[] } = {}) {
  return (
    <OperatingCenterPreview
      additionalPanels={reviews}
      additionalReviewGroups={additionalReviewGroups}
    />
  );
}
