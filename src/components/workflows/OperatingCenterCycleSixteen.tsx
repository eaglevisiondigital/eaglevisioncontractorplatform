import { taskReviewGroups } from './task-review-paths';
import { SharedRecordSearch } from './SharedRecordSearch';
import { DailyFieldGuide } from './DailyFieldGuide';
import { DailyFinanceGuide } from './DailyFinanceGuide';
import { ServiceCompletionGuide } from './ServiceCompletionGuide';
import { RetentionReviewGuide } from './RetentionReviewGuide';
import { OwnerBriefingGuide } from './OwnerBriefingGuide';
import { AddonReadinessGuide } from './AddonReadinessGuide';

/** The same six presentation slots and repository host; no new source authority. */
export const cycle16DailyGroups = taskReviewGroups({
  'schedule-work-order-continuity': (props) => (
    <>
      <SharedRecordSearch {...props} />
      <DailyFieldGuide {...props} />
    </>
  ),
  'finance-case-continuity': (props) => (
    <>
      <SharedRecordSearch {...props} />
      <DailyFinanceGuide {...props} />
    </>
  ),
  'service-source-continuity': (props) => (
    <>
      <SharedRecordSearch {...props} />
      <ServiceCompletionGuide {...props} />
    </>
  ),
  'maintenance-planning-continuity': (props) => (
    <>
      <SharedRecordSearch {...props} />
      <RetentionReviewGuide {...props} />
    </>
  ),
  'verified-task-handoff': (props) => (
    <>
      <SharedRecordSearch {...props} />
      <OwnerBriefingGuide {...props} />
    </>
  ),
  'source-bound-addons': (props) => (
    <>
      <SharedRecordSearch {...props} />
      <AddonReadinessGuide {...props} />
    </>
  ),
});
