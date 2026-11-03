import type { OperatingSources } from './operating-center-runtime';
import type { OperatingJobSection } from './operating-navigation';

/** Presentation destinations only; none grants execution or source authority. */
export const dailyWorkbenchSteps = [
  'priorities',
  'field',
  'finance',
  'invoice',
  'customer',
  'maintenance',
  'advanced',
] as const;
export type DailyWorkbenchStep = (typeof dailyWorkbenchSteps)[number];
export interface DailyWorkbenchProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
  /** Independently source-checked local continuation; never a business command. */
  onContinue?: (jobId: string, step: DailyWorkbenchStep) => void;
  /** Finance's existing evidence view can focus invoice requirements. */
  focus?: 'review' | 'invoice';
  /** Intelligence owns priorities and the original advanced-mode entry. */
  view?: 'priorities' | 'advanced';
}
