import type { ChecklistItem } from '../../domain/property/inspections';
/** Existing textarea contract: each retained position keeps its item identity.
 * Label edits do not override an explicit required/optional choice. This does
 * not infer identity through label matching or change insert/remove semantics. */
export function inspectionChecklistLabels(
  previous: ChecklistItem[],
  text: string,
): ChecklistItem[] {
  return text
    .split('\n')
    .filter(Boolean)
    .map((label, index) => ({
      id: previous[index]?.id ?? crypto.randomUUID(),
      label,
      required: previous[index]?.required ?? true,
      completed: false,
    }));
}
