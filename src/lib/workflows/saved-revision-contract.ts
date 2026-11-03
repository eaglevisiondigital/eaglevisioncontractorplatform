import type { DailyWorkbenchProps } from './daily-workbench-contract';
/** Existing source host and navigation hints only. Adoption is read-only local
 * presentation; it never invokes onContinue or renews original held actions. */
export type SavedRevisionPanelProps = DailyWorkbenchProps;
export type {
  SavedRevisionKind,
  SavedRevisionIdentity,
  SavedRevisionSnapshot,
  SavedRevisionComparison,
  SavedRevisionSelection,
} from './saved-revision-runtime';
