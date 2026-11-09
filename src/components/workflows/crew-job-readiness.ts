import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import {
  readWeeklyCrew,
  reconcileWeeklyCrew,
  type WeeklyCrewInput,
} from '../../lib/workflows/weekly-crew';
import {
  readFieldWorkOrders,
  fieldWorkOrderBinding,
} from '../../lib/field-work-orders';
import { readProcurementJobEvidence } from './procurement-job-evidence';
/** Original engines own scheduling/cost facts. This review grants no readiness authority. */
export async function readCrewJobReadiness(
  j: LocalJourney,
  input: WeeklyCrewInput,
) {
  const signature = JSON.stringify(input);
  const materials = await readProcurementJobEvidence(j);
  materials.check();
  if (JSON.stringify(input) !== signature)
    throw Error('Original proposal changed during source read');
  const weekly = await readWeeklyCrew(j, input, j.gate);
  materials.check();
  const model = await readFieldWorkOrders(
    j.property,
    j.target.organization_id,
    j.target.actor_id,
  );
  materials.check();
  const fences = model.orders.map((o) =>
    fieldWorkOrderBinding(
      j.property,
      j.target.organization_id,
      j.target.actor_id,
      o,
    ),
  );
  const cost = await materials.cost.reader.read(
    materials.cost.scope,
    j.target.actor_id,
  );
  materials.check();
  if ((await reconcileWeeklyCrew(weekly)).status !== 'CURRENT_REVIEW_ONLY')
    throw Error('UNKNOWN weekly source');
  let held = false;
  const check = () => {
    if (held) throw Error('UNKNOWN readiness held');
    try {
      materials.check();
      if (
        JSON.stringify(input) !== signature ||
        model.orders.some(
          (o, i) =>
            fieldWorkOrderBinding(
              j.property,
              j.target.organization_id,
              j.target.actor_id,
              o,
            ) !== fences[i],
        )
      )
        throw Error('Original proposal or work order changed');
    } catch (e) {
      held = true;
      throw e;
    }
  };
  check();
  const inspect = async () => {
    check();
    try {
      if ((await reconcileWeeklyCrew(weekly)).status !== 'CURRENT_REVIEW_ONLY')
        throw Error('UNKNOWN global crew model');
      check();
    } catch (e) {
      held = true;
      throw e;
    }
  };
  await inspect();
  return { weekly, materials, cost, check, inspect };
}
