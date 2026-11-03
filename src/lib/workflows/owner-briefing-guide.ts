/** Presentation names for the unchanged finite source review. There is no second
 * briefing, priority engine, reservation, deadline or business store here. */
export {
  explainableTaskLinksEnabled as ownerBriefingGuideEnabled,
  readExplainableTaskLinks as readOwnerBriefingGuide,
  openExplainableTaskLink as openOwnerBriefingTask,
  assertExplainableTaskLinkCurrent as assertOwnerBriefingTaskCurrent,
  inspectExplainableDestination as inspectOwnerBriefingDestination,
  assertExplainableDestinationCurrent as assertOwnerBriefingDestinationCurrent,
  returnExplainableTaskLink as returnOwnerBriefingTask,
  navigateExplainableTaskLink as navigateOwnerBriefingTask,
  type ExplainableTaskLink as OwnerBriefingTask,
  type ExplainableTaskDestination as OwnerBriefingDestination,
} from './explainable-task-links';
export {
  assertOperatingNavigationCurrent as assertOwnerBriefingGuideCurrent,
  filterOperatingNavigation as filterOwnerBriefingGuide,
  type OperatingNavigationReview as OwnerBriefingReview,
  type OperatingNavigationFilter as OwnerBriefingFilter,
} from './operating-navigation';
