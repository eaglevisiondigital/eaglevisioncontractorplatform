import { expect, it } from 'vitest';
import { blankEstimate } from '../src/domain/estimating/calculation';
import {
  validateRepairReservation,
  type RepairReservationRequest,
} from '../server/property/repair-persistence';
const uid = () => crypto.randomUUID();
function command(): RepairReservationRequest {
  const customer = uid(),
    location = uid(),
    payload = blankEstimate(customer);
  payload.location_id = location;
  return {
    request_id: uid(),
    source: {
      organization_id: uid(),
      customer_id: customer,
      location_id: location,
      report_id: uid(),
      report_version: 2,
      finding_id: 'exact published finding',
    },
    maintenance_revision: 2,
    plan_id: uid(),
    plan_revision: 3,
    job_id: null,
    job_baseline_version_id: null,
    estimate_id: uid(),
    draft_version_id: uid(),
    line_id: payload.lines[0].id,
    payload,
  };
}
it('accepts exact bounded reserved source, positive revisions and existing estimate payload', () =>
  expect(() => validateRepairReservation(command())).not.toThrow());
it('accepts an exact optional job/baseline pair without conferring job authority', () =>
  expect(() =>
    validateRepairReservation({
      ...command(),
      job_id: uid(),
      job_baseline_version_id: uid(),
    }),
  ).not.toThrow());
const invalid: [string, (c: RepairReservationRequest) => unknown][] = [
  ['caller actor', (c) => ({ ...c, actor_id: uid() })],
  ['caller role', (c) => ({ ...c, role: 'owner' })],
  ['6/6 counter', (c) => ({ ...c, ready: 6 })],
  ['issue flag', (c) => ({ ...c, issue: true })],
  ['missing request', (c) => ({ ...c, request_id: null })],
  ['coerced UUID', (c) => ({ ...c, request_id: [c.request_id] })],
  [
    'negative maintenance revision',
    (c) => ({ ...c, maintenance_revision: -1 }),
  ],
  ['zero maintenance revision', (c) => ({ ...c, maintenance_revision: 0 })],
  ['null maintenance revision', (c) => ({ ...c, maintenance_revision: null })],
  ['overflow plan revision', (c) => ({ ...c, plan_revision: 2147483647 })],
  ['fraction plan revision', (c) => ({ ...c, plan_revision: 1.2 })],
  ['duplicate target IDs', (c) => ({ ...c, draft_version_id: c.estimate_id })],
  [
    'wrong customer',
    (c) => ({ ...c, payload: { ...c.payload, customer_id: uid() } }),
  ],
  [
    'wrong property',
    (c) => ({ ...c, payload: { ...c.payload, location_id: uid() } }),
  ],
  ['missing exact source line', (c) => ({ ...c, line_id: uid() })],
  [
    'ambiguous exact source line',
    (c) => ({
      ...c,
      payload: {
        ...c.payload,
        lines: [...c.payload.lines, c.payload.lines[0]],
      },
    }),
  ],
  ['partial job binding', (c) => ({ ...c, job_id: uid() })],
  ['orphan baseline', (c) => ({ ...c, job_baseline_version_id: uid() })],
  [
    'invalid job UUID',
    (c) => ({ ...c, job_id: 'job', job_baseline_version_id: uid() }),
  ],
  [
    'missing source version',
    (c) => ({ ...c, source: { ...c.source, report_version: 0 } }),
  ],
  [
    'extra private source fields',
    (c) => ({ ...c, source: { ...c.source, private_notes: 'internal' } }),
  ],
  [
    'oversized payload',
    (c) => ({
      ...c,
      payload: { ...c.payload, internal_notes: 'x'.repeat(1048576) },
    }),
  ],
];
it.each(invalid)('rejects %s before any native/transport call', (_, change) =>
  expect(() =>
    validateRepairReservation(change(command()) as RepairReservationRequest),
  ).toThrow(),
);
