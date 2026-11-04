import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { ServiceRequestActions } from '../src/components/workflows/ServiceRequestActions';
import {
  readServiceRequestActions,
  inspectServiceRequestActions,
  parseServiceRequestAction,
  saveServiceRequestAction,
  reconcileServiceRequestAction,
  type ServiceRequestActionInput,
} from '../src/lib/workflows/service-request-actions';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0],
    org = sources.company.id,
    job = entry.target.job_id!,
    view = await readServiceRequestActions(sources, job, gate),
    read = inspectServiceRequestActions(view),
    input: ServiceRequestActionInput = {
      request_id: read.request_id,
      status: 'reviewing',
      assigned_to: entry.target.actor_id,
      expected_status: read.status,
      expected_assigned_to: read.assigned_to,
      expected_updated_at: read.updated_at,
    };
  return { gate, sources, entry, org, job, view, read, input };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function actual(f: Fixture) {
  return f.sources.operations.syntheticIntakeRequest(
    f.org,
    f.entry.target.customer_id,
    f.entry.target.location_id,
    f.entry.intake_request_id,
  );
}
function revoke(
  f: Fixture,
  type: 'inactive' | 'foreign' | 'estimator' = 'inactive',
) {
  const original = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id !== f.entry.target.actor_id
          ? m
          : type === 'inactive'
            ? { ...m, active: false }
            : type === 'foreign'
              ? { ...m, organization_id: 'foreign' }
              : { ...m, role: 'staff', staff_type: 'estimator' },
      ),
  );
}
function digestRace(change: () => void) {
  const native = crypto.subtle.digest.bind(crypto.subtle);
  let seen = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await native(...args);
    if (!seen) {
      seen = true;
      change();
    }
    return result;
  });
  return () => expect(seen).toBe(true);
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand} actually updates only the exact original native intake review and assignment`, async () => {
    const f = await fixture(brand),
      before = actual(f),
      property = f.sources.property.read(f.org),
      canonical = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      call = vi.spyOn(f.sources.operations, 'assignIntake');
    expect(f.read.request_id).toBe(f.entry.intake_request_id);
    expect(f.read.customer_id).toBe(f.entry.target.customer_id);
    expect(f.read.location_id).toBe(f.entry.target.location_id);
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).resolves.toEqual({
      status: 'SYNTHETIC_SOURCE_SAVED',
      kind: 'service-request',
      request_id: before.id,
    });
    expect(call).toHaveBeenCalledExactlyOnceWith(
      f.org,
      before.id,
      f.input.assigned_to,
      'reviewing',
    );
    const after = actual(f);
    expect(after).toEqual({
      ...before,
      status: 'reviewing',
      assigned_to: f.input.assigned_to,
      updated_at: after.updated_at,
    });
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(canonical);
    const observed = await reconcileServiceRequestAction(f.view);
    expect(observed).toMatchObject({
      state: 'KNOWN_SAVED',
      observed: 'EXACT_CURRENT_ROW_OBSERVED',
      native_cas: false,
      durable_receipt: false,
      attribution: 'CURRENT_ROW_OBSERVATION_ONLY',
      replay: 'FORBIDDEN',
    });
    expect(observed.current).toEqual({
      request_id: before.id,
      status: 'reviewing',
      assigned_to: f.input.assigned_to,
      updated_at: after.updated_at,
    });
  });
  it(`brand ${brand} supports the native closed intake state without completing or publishing work`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.org);
    await saveServiceRequestAction(
      f.view,
      { ...f.input, status: 'closed' },
      true,
    );
    expect(actual(f).status).toBe('closed');
    expect(f.sources.property.read(f.org)).toEqual(before);
    expect((await reconcileServiceRequestAction(f.view)).durable_receipt).toBe(
      false,
    );
  });
  it(`brand ${brand} denies duplicate simultaneous consumers before a second native invocation`, async () => {
    const f = await fixture(brand),
      second = await readServiceRequestActions(f.sources, f.job, f.gate),
      call = vi.spyOn(f.sources.operations, 'assignIntake');
    const result = await Promise.allSettled([
      saveServiceRequestAction(f.view, f.input, true),
      saveServiceRequestAction(
        second,
        { ...f.input, status: 'qualified' },
        true,
      ),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it(`brand ${brand} shares original request custody across different same-property job contexts`, async () => {
    const f = await fixture(brand),
      sibling = f.sources.entries.find(
        (e) =>
          e.target.job_id !== f.job &&
          e.intake_request_id === f.entry.intake_request_id &&
          e.target.customer_id === f.entry.target.customer_id &&
          e.target.location_id === f.entry.target.location_id,
      );
    expect(sibling).toBeTruthy();
    const second = await readServiceRequestActions(
        f.sources,
        sibling!.target.job_id!,
        f.gate,
      ),
      call = vi.spyOn(f.sources.operations, 'assignIntake');
    const results = await Promise.allSettled([
      saveServiceRequestAction(f.view, f.input, true),
      saveServiceRequestAction(
        second,
        { ...f.input, status: 'qualified' },
        true,
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it(`brand ${brand} retains UNKNOWN after a lost native acknowledgment and observes without replay or fabricated receipt`, async () => {
    const f = await fixture(brand),
      native = f.sources.operations.assignIntake.bind(f.sources.operations),
      call = vi
        .spyOn(f.sources.operations, 'assignIntake')
        .mockImplementation(async (...args) => {
          await native(...args);
          throw Error('lost ACK');
        });
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).rejects.toThrow('lost ACK');
    expect(actual(f).status).toBe('reviewing');
    const observed = await reconcileServiceRequestAction(f.view);
    expect(observed).toMatchObject({
      state: 'UNKNOWN',
      observed: 'EXACT_CURRENT_ROW_OBSERVED',
      attribution: 'CURRENT_ROW_OBSERVATION_ONLY',
      durable_receipt: false,
      replay: 'FORBIDDEN',
    });
    const fresh = await readServiceRequestActions(f.sources, f.job, f.gate),
      read = inspectServiceRequestActions(fresh);
    expect(read.can_edit).toBe(false);
    await expect(
      saveServiceRequestAction(
        fresh,
        {
          ...f.input,
          status: 'qualified',
          expected_status: read.status,
          expected_assigned_to: read.assigned_to,
          expected_updated_at: read.updated_at,
        },
        true,
      ),
    ).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
    expect((await reconcileServiceRequestAction(fresh)).state).toBe('UNKNOWN');
  });
  it(`brand ${brand} an unattributed later native change cannot become this attempt's receipt`, async () => {
    const f = await fixture(brand),
      native = f.sources.operations.assignIntake.bind(f.sources.operations);
    vi.spyOn(f.sources.operations, 'assignIntake').mockImplementation(
      async (...args) => {
        await native(...args);
        throw Error('lost');
      },
    );
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).rejects.toThrow();
    await native(f.org, f.input.request_id, null, 'qualified');
    expect(await reconcileServiceRequestAction(f.view)).toMatchObject({
      state: 'UNKNOWN',
      observed: 'SOURCE_CHANGED_UNATTRIBUTED',
      durable_receipt: false,
      attribution: 'CURRENT_ROW_OBSERVATION_ONLY',
      replay: 'FORBIDDEN',
    });
  });
  it(`brand ${brand} source change before invocation denies without applying the proposed change`, async () => {
    const f = await fixture(brand);
    await f.sources.operations.assignIntake(
      f.org,
      f.input.request_id,
      null,
      'qualified',
    );
    const call = vi.spyOn(f.sources.operations, 'assignIntake');
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
    expect(actual(f).status).toBe('qualified');
  });
  it(`brand ${brand} revocation during the first fingerprint await consumes the original hold without native execution`, async () => {
    const f = await fixture(brand),
      call = vi.spyOn(f.sources.operations, 'assignIntake'),
      seen = digestRace(() => revoke(f));
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).rejects.toThrow();
    seen();
    expect(call).not.toHaveBeenCalled();
    await expect(reconcileServiceRequestAction(f.view)).rejects.toThrow();
  });
  it(`brand ${brand} live input mutation during hashing cannot change the admitted operation`, async () => {
    const f = await fixture(brand),
      call = vi.spyOn(f.sources.operations, 'assignIntake'),
      seen = digestRace(() => {
        f.input.status = 'qualified';
      });
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).rejects.toThrow();
    seen();
    expect(call).not.toHaveBeenCalled();
    expect(actual(f).status).toBe('new');
    expect((await reconcileServiceRequestAction(f.view)).state).toBe('UNKNOWN');
  });
}
for (const role of ['inactive', 'foreign', 'estimator'] as const)
  it(`current ${role} staff cannot use retained request controls`, async () => {
    const f = await fixture();
    revoke(f, role);
    const call = vi.spyOn(f.sources.operations, 'assignIntake');
    expect(() => inspectServiceRequestActions(f.view)).toThrow();
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
for (const key of [
  'request_id',
  'expected_status',
  'expected_assigned_to',
  'expected_updated_at',
] as const)
  it(`exact original ${key} substitution is denied`, async () => {
    const f = await fixture(),
      call = vi.spyOn(f.sources.operations, 'assignIntake');
    await expect(
      saveServiceRequestAction(f.view, { ...f.input, [key]: 'foreign' }, true),
    ).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
for (const status of [
  'completed',
  'accepted',
  'paid',
  'dispatched',
  'published',
])
  it(`unsupported authority status ${status} is denied`, async () => {
    const f = await fixture(),
      call = vi.spyOn(f.sources.operations, 'assignIntake');
    expect(() =>
      parseServiceRequestAction(f.view, { ...f.input, status }),
    ).toThrow();
    expect(call).not.toHaveBeenCalled();
  });
it('explicit confirmation, a real change and a current local assignee are required', async () => {
  const f = await fixture(),
    call = vi.spyOn(f.sources.operations, 'assignIntake');
  await expect(
    saveServiceRequestAction(f.view, f.input, false),
  ).rejects.toThrow();
  await expect(
    saveServiceRequestAction(
      f.view,
      { ...f.input, status: f.read.status, assigned_to: f.read.assigned_to },
      true,
    ),
  ).rejects.toThrow();
  await expect(
    saveServiceRequestAction(
      f.view,
      { ...f.input, assigned_to: 'foreign' },
      true,
    ),
  ).rejects.toThrow();
  expect(call).not.toHaveBeenCalled();
});
it('default OFF rejects before source, selector or input getters', async () => {
  const getter = vi.fn(() => {
      throw Error('getter executed');
    }),
    value = Object.defineProperty({}, 'company', { get: getter });
  await expect(readServiceRequestActions(value as never, 'x')).rejects.toThrow(
    'OFF',
  );
  expect(getter).not.toHaveBeenCalled();
});
it('request form renders no controls or private source data when production or disabled', () => {
  const sources = {} as never;
  const html = renderToStaticMarkup(
    createElement(ServiceRequestActions, {
      sources,
      enabled: false,
      selectedJobId: 'foreign',
    }),
  );
  expect(html).toContain('actions are OFF');
  expect(html).not.toContain('Load exact service request');
  expect(html).not.toContain('foreign');
});
it('accessor or extra input fields are rejected without invocation or getter execution', async () => {
  const f = await fixture(),
    getter = vi.fn(() => 'reviewing'),
    call = vi.spyOn(f.sources.operations, 'assignIntake'),
    input = { ...f.input };
  Object.defineProperty(input, 'status', { get: getter });
  expect(() => parseServiceRequestAction(f.view, input)).toThrow();
  expect(() =>
    parseServiceRequestAction(f.view, {
      ...f.input,
      private_note: 'not accepted',
    }),
  ).toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(call).not.toHaveBeenCalled();
});
for (const brand of [0, 1, 2]) {
  for (const field of [
    'organization_id',
    'customer_id',
    'service_location_id',
  ] as const)
    it(`brand ${brand} canonical foreign ${field} custody is rejected without another request substitution`, async () => {
      const f = await fixture(brand),
        call = vi.spyOn(f.sources.operations, 'assignIntake'),
        rows = (
          f.sources.operations as unknown as {
            requests: {
              id: string;
              organization_id: string;
              customer_id: string | null;
              service_location_id: string | null;
            }[];
          }
        ).requests;
      rows.find((r) => r.id === f.input.request_id)![field] = 'foreign';
      await expect(
        saveServiceRequestAction(f.view, f.input, true),
      ).rejects.toThrow();
      await expect(
        readServiceRequestActions(f.sources, f.job, f.gate),
      ).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  it(`brand ${brand} duplicate canonical request identity is unavailable rather than selecting the first row`, async () => {
    const f = await fixture(brand),
      call = vi.spyOn(f.sources.operations, 'assignIntake'),
      rows = (f.sources.operations as unknown as { requests: unknown[] })
        .requests;
    rows.push(structuredClone(actual(f)));
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
  it(`brand ${brand} a foreign retained job never becomes the request context`, async () => {
    const f = await fixture(brand),
      call = vi.spyOn(f.sources.operations, 'assignIntake');
    await expect(
      readServiceRequestActions(f.sources, crypto.randomUUID(), f.gate),
    ).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
}
