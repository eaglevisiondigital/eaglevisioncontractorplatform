import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import {
  readOperationsWorkflow,
  reconcileOperationsWorkflow,
  type OperationsWorkflowInput,
} from '../src/lib/workflows/operations-workflow';

const gate = () => ({ enabled: true, confirmed: true });
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const j = await prepareLocalJourney(sampleCompanies[index], gate()),
    orders = await readFieldWorkOrders(
      j.property,
      j.company.id,
      j.target.actor_id,
    ),
    order = orders.orders.find((o) => o.source.job_id === j.target.job_id)!,
    worker = order.crew.find((w) => w.worker_id === j.worker_id)!,
    visits = order.visits.filter((v) => v.date === j.day);
  if (visits.length !== 1) throw Error('Exact selected-day visit required');
  const selectedVisit = visits[0];
  const input: OperationsWorkflowInput = {
    operations: {
      day: j.day,
      timezone: j.timezone,
      booking: {
        order,
        worker_id: worker.worker_id,
        visit_id: selectedVisit.id,
        start: j.day + 'T10:00',
        end: j.day + 'T11:00',
      },
      other_windows: [],
      proposed_hours: [
        {
          worker_id: worker.worker_id,
          start: j.day + 'T08:00',
          end: j.day + 'T16:00',
        },
      ],
      route: [{ order, visit_id: selectedVisit.id }],
      capture: {
        order,
        visit_id: selectedVisit.id,
        note: 'Explicit human unsaved proposal',
      },
    },
    incident: {
      incident_label: 'Synthetic severe-weather source review',
      reported_on: j.day,
      manual_priority: 'high',
      conditions: ['CONDITION_NOT_YET_ASSESSED'],
      scope_line_ids: [
        j.issued.version.calculation.lines.find((l) => l.included)!.id,
      ],
      sharing_purpose: 'INTERNAL_COORDINATION_REVIEW',
    },
  };
  return { ...j, order, input };
}

it('independently composes actual existing job/work-order and incident sources across all brands without writers', async () => {
  for (const index of [0, 1, 2]) {
    const j = await fixture(index),
      before = {
        property: j.property.read(j.company.id),
        release: j.release.read('staff'),
        jobs: await j.estimates.jobs(j.company.id),
      },
      writes = [
        vi.spyOn(j.property, 'addVisit'),
        vi.spyOn(j.property, 'saveVisit'),
        vi.spyOn(j.property, 'publish'),
        vi.spyOn(j.estimates, 'assignJob'),
        vi.spyOn(j.estimates, 'recordTime'),
        vi.spyOn(j.estimates, 'submitExpense'),
      ];
    const view = await readOperationsWorkflow(
      j.property,
      j.target,
      j.input,
      gate(),
    );
    expect(view.operations.booking.source.job_id).toBe(j.target.job_id);
    expect(view.incident.source.job_id).toBe(j.target.job_id);
    expect(view.incident.source.content_sha256).toBe(view.source.source_sha256);
    expect(view.linkage.contractor_network).toBe(
      'SOURCE_REFERENCE_ONLY_NOT_ENDORSEMENT_OR_ACCESS',
    );
    expect(view.linkage.workforce_currentness).toBe('CAPTURED_NOT_ATOMIC');
    expect(view.linkage.capacity_authority).toBe('UNVERIFIED');
    expect(view.linkage.actual_availability).toBe('UNKNOWN');
    expect(view.incident.sharing_preview).toMatchObject({
      recipient: null,
      delivery: 'BLOCKED',
      cross_tenant_access: 'BLOCKED',
    });
    expect(view.operations.offline_capture.replay).toBe('FORBIDDEN');
    expect(view.operations.offline_capture.crash_durability).toBe(
      'NOT_PROVIDED',
    );
    expect(Object.values(view.authority).every((v) => v === false)).toBe(true);
    expect(await reconcileOperationsWorkflow(view)).toEqual({
      status: 'CURRENT_TARGET_REVIEW_ONLY',
      replacement: null,
      replay: 'FORBIDDEN',
    });
    expect(JSON.stringify(view.incident.sharing_preview)).not.toMatch(
      /PRIVATE|unit_cost|supplier|internal_notes|payroll|cash_hour/,
    );
    writes.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect({
      property: j.property.read(j.company.id),
      release: j.release.read('staff'),
      jobs: await j.estimates.jobs(j.company.id),
    }).toEqual(before);
  }
});

it('withholds results on original target, nested selection or confirmation mutation at the composition hash', async () => {
  for (const mode of ['target', 'nested', 'gate']) {
    const j = await fixture(),
      g = gate(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    const spy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (...args) => {
        const result = await digest(...args),
          body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
        if (body.mode === 'LOCAL_SYNTHETIC_OPERATIONS_COMPOSITION') {
          reached = true;
          if (mode === 'target') j.target.location_id = crypto.randomUUID();
          if (mode === 'nested') j.input.operations.capture.note += ' changed';
          if (mode === 'gate') g.confirmed = false;
        }
        return result;
      });
    await expect(
      readOperationsWorkflow(j.property, j.target, j.input, g),
    ).rejects.toThrow();
    expect(reached).toBe(true);
    spy.mockRestore();
  }
});

it('rejects a real second same-property job and withholds copied or revoked retained results without replay', async () => {
  const j = await fixture(),
    other = await j.estimates.issue(
      j.company.id,
      await j.estimates.create(
        j.company,
        structuredClone(j.issued.version.payload),
      ),
    ),
    otherJob = await j.estimates.approveJob(j.company.id, other);
  await j.property.refreshContexts(j.company.id);
  const orders = await readFieldWorkOrders(
      j.property,
      j.company.id,
      j.target.actor_id,
    ),
    foreign = orders.orders.find((o) => o.source.job_id === otherJob)!;
  j.input.operations.booking.order = foreign;
  await expect(
    readOperationsWorkflow(j.property, j.target, j.input, gate()),
  ).rejects.toThrow();
  j.input.operations.booking.order = j.order;
  const view = await readOperationsWorkflow(
    j.property,
    j.target,
    j.input,
    gate(),
  );
  expect(await reconcileOperationsWorkflow(structuredClone(view))).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  await j.operations.configure(
    j.company.id,
    'active',
    'starter',
    {},
    j.company.id + '-backup-owner',
  );
  await j.operations.revokeOwner(j.company.id, j.target.actor_id);
  expect(await reconcileOperationsWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
});
