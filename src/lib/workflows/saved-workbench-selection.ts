import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { OperatingJobSection } from './operating-navigation';
/** Finite presentation mapping inside the existing workbench. No command,
 * source substitution, new navigation owner or business-state restoration. */
export function resolveSavedWorkbenchSelection(
  sources: OperatingSources,
  jobId: string,
  section?: OperatingJobSection,
) {
  if (typeof jobId !== 'string' || !jobId || jobId.length > 200)
    throw Error('Exact authorized job required');
  const sections = {
    field: 'field',
    finance: 'finance',
    completion: 'customer',
    maintenance: 'maintenance',
    daily: 'priorities',
  } as const;
  if (section !== undefined && !Object.hasOwn(sections, section))
    throw Error('Use the existing exact review destination');
  const current = captureOperatingSources(sources, {
    enabled: true,
    confirmed: true,
  });
  const matches = current.entries.filter((e) => e.target.job_id === jobId);
  if (matches.length !== 1) throw Error('Unique current job required');
  current.check();
  return Object.freeze({
    job_id: matches[0].target.job_id!,
    tab:
      section === undefined
        ? undefined
        : sections[section as keyof typeof sections],
  });
}
