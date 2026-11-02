import { OperatingCenterCycleTen } from './OperatingCenterCycleTen';
import type { OperatingReviewGroup } from './OperatingCenterPreview';
import { CrewAssignmentLab } from './CrewAssignmentLab';
import { FinancialCorrectionReview } from './FinancialCorrectionReview';
import { ServiceContinuity } from './ServiceContinuity';
import { AtomicConsentLab } from './AtomicConsentLab';
import { DailyActionCenter } from './DailyActionCenter';
import { SyncAdmissionReview } from './SyncAdmissionReview';
import { PilotScorecard } from './PilotScorecard';
const groups: readonly OperatingReviewGroup[] = [
  {
    label: 'Cycle 11 workflow labs',
    panels: [
      {
        id: 'crew-assignment-lab',
        label: 'Crew assignment lab',
        render: (p) => <CrewAssignmentLab {...p} />,
      },
      {
        id: 'financial-correction-review',
        label: 'Financial corrections',
        render: (p) => <FinancialCorrectionReview {...p} />,
      },
      {
        id: 'service-continuity',
        label: 'Service continuity',
        render: (p) => <ServiceContinuity {...p} />,
      },
      {
        id: 'atomic-consent-lab',
        label: 'Consent boundary lab',
        render: (p) => <AtomicConsentLab {...p} />,
      },
      {
        id: 'daily-action-center',
        label: 'Daily action center',
        render: (p) => <DailyActionCenter {...p} />,
      },
      {
        id: 'sync-admission-review',
        label: 'Reference admission',
        render: (p) => <SyncAdmissionReview {...p} />,
      },
      {
        id: 'pilot-scorecard',
        label: 'Pilot acceptance',
        render: (p) => <PilotScorecard {...p} />,
      },
    ],
  },
];
export function OperatingCenterCycleEleven() {
  return <OperatingCenterCycleTen additionalReviewGroups={groups} />;
}
