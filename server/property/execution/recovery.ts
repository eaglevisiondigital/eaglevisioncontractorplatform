import type { acceptanceJournal } from '../acceptance-journal.ts';
import { requireFrozen, type FrozenP1 } from './package.ts';
/** Read-only recovery inventory. No replay, receipt fabrication or automatic adoption of a matching hosted row. */
export function inspectP1Recovery(
  p: FrozenP1,
  journal: ReturnType<typeof acceptanceJournal>,
) {
  requireFrozen(p);
  return p.plan.companies.flatMap((c) =>
    [
      ...c.steps.map((s) => s.id),
      ...c.probes
        .filter((s) => s.rpc !== 'property_workspace')
        .map((s) => 'probe-' + s.id),
    ].map((step) => ({
      organization: c.organization_id,
      step,
      ...journal.read(c.organization_id, step),
    })),
  );
}
