import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readServiceRequestActions,
  inspectServiceRequestActions,
  parseServiceRequestAction,
  reconcileServiceRequestAction,
  saveServiceRequestAction,
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
for (const brand of [0, 1, 2])
  it(`brand ${brand}: descriptor-switching request form cannot replace the confirmed review change`, async () => {
    const f = await fixture(brand),
      writer = vi.spyOn(f.sources.operations, 'assignIntake');
    let descriptorReads = 0;
    const input = new Proxy(f.input, {
      getOwnPropertyDescriptor(target, key) {
        const d = Reflect.getOwnPropertyDescriptor(target, key);
        return d && key === 'status'
          ? { ...d, value: ++descriptorReads === 1 ? 'reviewing' : 'qualified' }
          : d;
      },
    });
    const [result] = await Promise.allSettled([
      saveServiceRequestAction(f.view, input, true),
    ]);
    expect.soft(result.status).toBe('rejected');
    expect.soft(writer).not.toHaveBeenCalled();
    expect.soft(actual(f).status).toBe('new');
    expect(descriptorReads).toBeGreaterThan(0);
  });

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: ordinary six-field input stays the original live form and applies only its confirmed state`, async () => {
    const f = await fixture(brand),
      writer = vi.spyOn(f.sources.operations, 'assignIntake');
    expect(parseServiceRequestAction(f.view, f.input)).toBe(f.input);
    expect(Object.keys(f.input)).toHaveLength(6);
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).resolves.toMatchObject({
      status: 'SYNTHETIC_SOURCE_SAVED',
      request_id: f.input.request_id,
    });
    expect(writer).toHaveBeenCalledExactlyOnceWith(
      f.org,
      f.input.request_id,
      f.input.assigned_to,
      'reviewing',
    );
    expect(actual(f).status).toBe('reviewing');
    expect(await reconcileServiceRequestAction(f.view)).toMatchObject({
      state: 'KNOWN_SAVED',
      replay: 'FORBIDDEN',
      durable_receipt: false,
      native_cas: false,
    });
  });
  it(`brand ${brand}: ordinary live input mutation during hashing still consumes the original UNKNOWN hold without writing`, async () => {
    const f = await fixture(brand),
      writer = vi.spyOn(f.sources.operations, 'assignIntake'),
      native = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await native(...args);
      if (!changed) {
        changed = true;
        f.input.status = 'qualified';
      }
      return value;
    });
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).rejects.toThrow('Confirmed request input changed');
    expect(changed).toBe(true);
    expect(writer).not.toHaveBeenCalled();
    expect(actual(f).status).toBe('new');
    expect(await reconcileServiceRequestAction(f.view)).toMatchObject({
      state: 'UNKNOWN',
      replay: 'FORBIDDEN',
      durable_receipt: false,
    });
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  });
  it(`brand ${brand}: only six original own-data primitives pass without invoking untrusted form hooks`, async () => {
    const f = await fixture(brand),
      writer = vi.spyOn(f.sources.operations, 'assignIntake'),
      hook = vi.fn(() => 'reviewing'),
      accessor = Object.defineProperty({ ...f.input }, 'status', { get: hook });
    for (const bad of [
      accessor,
      { ...f.input, issue: true },
      { ...f.input, status: Symbol('not-a-status') },
      { ...f.input, assigned_to: () => f.input.assigned_to },
      Object.create(f.input),
    ])
      expect(() => parseServiceRequestAction(f.view, bad)).toThrow();
    expect(hook).not.toHaveBeenCalled();
    expect(writer).not.toHaveBeenCalled();
    expect(inspectServiceRequestActions(f.view)).toMatchObject({
      state: 'NOT_ATTEMPTED',
      can_edit: true,
    });
  });
  it(`brand ${brand}: a lost native ACK remains UNKNOWN after exact ordinary-form validation and cannot be replayed`, async () => {
    const f = await fixture(brand),
      native = f.sources.operations.assignIntake.bind(f.sources.operations),
      writer = vi
        .spyOn(f.sources.operations, 'assignIntake')
        .mockImplementation(async (...args) => {
          await native(...args);
          throw Error('lost exact original ACK');
        });
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).rejects.toThrow('lost exact original ACK');
    expect(actual(f).status).toBe('reviewing');
    expect(await reconcileServiceRequestAction(f.view)).toMatchObject({
      state: 'UNKNOWN',
      replay: 'FORBIDDEN',
      durable_receipt: false,
      attribution: 'CURRENT_ROW_OBSERVATION_ONLY',
    });
    await expect(
      saveServiceRequestAction(f.view, f.input, true),
    ).rejects.toThrow();
    expect(writer).toHaveBeenCalledTimes(1);
  });
}
