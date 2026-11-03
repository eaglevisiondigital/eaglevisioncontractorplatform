import type { OperatingSourcePreparer } from './OperatingCenterPreview';
import { OperatingCenterCycleEleven } from './OperatingCenterCycleEleven';
import type { OperatingReviewGroup } from './OperatingCenterPreview';
import { ScheduleProposalRevisions } from './ScheduleProposalRevisions';
import { FinancialEvidenceReview } from './FinancialEvidenceReview';
import { ServiceLifecycleReview } from './ServiceLifecycleReview';
import { ExternalProposalLifecycle } from './ExternalProposalLifecycle';
import { VerifiedOperatingSuggestions } from './VerifiedOperatingSuggestions';
import { ConsentCancellationReview } from './ConsentCancellationReview';
const groups: readonly OperatingReviewGroup[] = [
  {
    label: 'Cycle 12 workflow reviews',
    initiallyOpen: false,
    panels: [
      {
        id: 'schedule-proposal-revisions',
        label: 'Schedule revisions',
        render: (p) => <ScheduleProposalRevisions {...p} />,
      },
      {
        id: 'financial-evidence-review',
        label: 'Financial source evidence',
        render: (p) => <FinancialEvidenceReview {...p} />,
      },
      {
        id: 'service-lifecycle-review',
        label: 'Service lifecycle',
        render: (p) => <ServiceLifecycleReview {...p} />,
      },
      {
        id: 'consent-cancellation-review',
        label: 'Consent cancellation',
        render: (p) => <ConsentCancellationReview {...p} />,
      },
      {
        id: 'verified-operating-suggestions',
        label: 'Verified daily suggestions',
        render: (p) => <VerifiedOperatingSuggestions {...p} />,
      },
      {
        id: 'external-proposal-lifecycle',
        label: 'External proposal controls',
        render: (p) => <ExternalProposalLifecycle {...p} />,
      },
    ],
  },
];
export function OperatingCenterCycleTwelve({
  additionalReviewGroups = [],
  prepareSources,
}: {
  additionalReviewGroups?: readonly OperatingReviewGroup[];
  prepareSources?: OperatingSourcePreparer;
} = {}) {
  return (
    <OperatingCenterCycleEleven
      prepareSources={prepareSources}
      additionalReviewGroups={[...groups, ...additionalReviewGroups]}
    />
  );
}
