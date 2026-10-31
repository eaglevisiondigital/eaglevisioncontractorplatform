import type { PropertyRepository } from './property';
import type { InspectionPlan } from '../domain/property/inspections';
const preparations = new WeakMap<
  PropertyRepository,
  Map<string, 'running' | 'complete' | 'failed'>
>();
/** Explicit disposable examples through existing CRM/plan/visit/publication commands.
 * Never modifies prior visits, reports, jobs or issued financial snapshots. */
export async function prepareMaintenanceExamples(
  repo: PropertyRepository,
  org: string,
  actor: string,
) {
  repo.maintenance(org, actor); // Local-only membership boundary, before any example changes.
  const registry = preparations.get(repo) ?? new Map();
  preparations.set(repo, registry);
  if (registry.get(org) === 'complete') return;
  if (registry.has(org))
    throw Error(
      'Example preparation already attempted. Inspect retained records; reload the disposable preview to start over.',
    );
  registry.set(org, 'running');
  try {
    const state = repo.read(org),
      context = state.contexts[0];
    if (!context) throw Error('Existing CRM property required.');
    let location = (
      await repo.operations.listLocations(org, context.customer_id)
    ).find((l) => l.address_line1 === '200 Synthetic Maintenance Court');
    if (!location) {
      repo.maintenance(org, actor);
      await repo.operations.saveLocation(org, context.customer_id, {
        address_line1: '200 Synthetic Maintenance Court',
        address_line2: '',
        city: 'Example City',
        region: 'FL',
        postal_code: '00000',
        country_code: 'US',
      });
      location = (
        await repo.operations.listLocations(org, context.customer_id)
      ).find((l) => l.address_line1 === '200 Synthetic Maintenance Court');
    }
    await repo.refreshContexts(org);
    repo.maintenance(org, actor);
    const current = repo.read(org),
      second = current.contexts.find((c) => c.location_id === location?.id);
    if (!second) throw Error('Synthetic CRM location unavailable.');
    const plans = [
      repo.createPlan(org, context, 'Synthetic maintenance evidence'),
      repo.createPlan(org, second, 'Synthetic secondary-property evidence'),
    ];
    const finding = crypto.randomUUID();
    const publish = (plan: InspectionPlan, date: string, later: boolean) => {
      const visit = repo.addVisit(org, plan.id, date);
      repo.saveVisit(org, visit, {
        summary: 'Synthetic maintenance inspection · ' + date,
        internal_notes: 'INTERNAL crew planning only',
        checklist: plan.checklist.map((c) => ({ ...c, completed: true })),
        findings: [
          {
            id: plan === plans[0] ? finding : crypto.randomUUID(),
            category: 'Maintenance',
            location: plan === plans[0] ? 'East window joint' : 'Garden gate',
            severity: later ? 'urgent' : 'moderate',
            description: later
              ? 'Water marks documented beside the joint.'
              : 'Weathered joint material documented.',
            recommendation:
              'Arrange a follow-up inspection before proposing repairs.',
            customer_visible: true,
          },
        ],
      });
      repo.submit(
        org,
        repo.read(org).visits.find((v) => v.id === visit.id)!,
      );
      repo.publish(
        org,
        repo.read(org).visits.find((v) => v.id === visit.id)!,
      );
    };
    publish(plans[0], '2026-11-06', false);
    publish(plans[0], '2026-11-13', true);
    publish(plans[1], '2026-11-07', false);
    registry.set(org, 'complete');
  } catch (e) {
    registry.set(org, 'failed');
    throw e;
  }
}
