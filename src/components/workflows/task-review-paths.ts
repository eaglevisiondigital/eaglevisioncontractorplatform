import { cycle14ContinuityGroups } from './OperatingCenterCycleFourteen';
import type {
  OperatingReviewGroup,
  OperatingReviewPanel,
} from './OperatingCenterPreview';

/** Presentation slots only. Source readers retain independent authority checks. */
export function taskReviewGroups(
  renders: Readonly<Record<string, OperatingReviewPanel['render']>>,
): readonly OperatingReviewGroup[] {
  const ids = cycle14ContinuityGroups.flatMap((g) => g.panels.map((p) => p.id));
  if (
    new Set(ids).size !== ids.length ||
    Object.keys(renders).length !== ids.length ||
    ids.some(
      (id) => !Object.hasOwn(renders, id) || typeof renders[id] !== 'function',
    ) ||
    Object.keys(renders).some((id) => !ids.includes(id))
  )
    throw Error('Exact existing continuity review slots required');
  return cycle14ContinuityGroups.map((group) => ({
    ...group,
    panels: group.panels.map((panel) => ({
      ...panel,
      render: renders[panel.id],
    })),
  }));
}
