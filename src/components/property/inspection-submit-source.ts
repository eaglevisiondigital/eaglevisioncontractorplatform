import type { PropertyRepository } from '../../lib/property';
import type { Visit, VisitContent } from '../../domain/property/inspections';

/** Submit only the displayed saved revision through the existing local writer.
 * Working edits are never silently discarded or implicitly saved/submitted.
 */
export function submitSavedInspection(
  repo: PropertyRepository,
  org: string,
  displayed: Visit,
  working: VisitContent,
) {
  if (JSON.stringify(working) !== JSON.stringify(displayed.content))
    throw Error(
      'Save the displayed visit changes before submitting for review',
    );
  const matches = repo
      .read(org)
      .visits.filter((visit) => visit.id === displayed.id),
    current = matches[0];
  if (
    matches.length !== 1 ||
    displayed.organization_id !== org ||
    current.organization_id !== org ||
    current.status !== 'draft' ||
    JSON.stringify(current) !== JSON.stringify(displayed)
  )
    throw Error('Saved inspection source changed; reopen the exact draft');
  return repo.submit(org, displayed);
}
