import { it, expect, vi } from 'vitest';
import {
  P1Safety,
  type CleanupObservation,
} from '../server/property/execution/safety';
const clean: CleanupObservation = {
  approvedActiveFeatures: 0,
  unexpectedActiveFeatures: 0,
  sessions: 0,
  customerMappings: 0,
  reportLeases: 0,
  activePlatformGrants: 0,
  releaseGrants: 0,
  providerWorkloads: 0,
};
function setup() {
  let wall = 100000,
    mono = 0;
  const ports = {
    deactivate: vi.fn(async () => {}),
    signOutAll: vi.fn(async () => {}),
    observe: vi.fn(async () => ({ ...clean })),
  };
  return {
    ports,
    s: new P1Safety(
      ports,
      () => wall,
      () => mono,
    ),
    advance: (n: number) => {
      mono += n;
      wall += n;
    },
    wall: (v: number) => {
      wall = v;
    },
  };
}
it.each(['heartbeat', 'operator', 'deadline', 'wall-forward', 'wall-backward'])(
  'independently contains on %s loss without widening the30-minute window',
  async (which) => {
    const x = setup();
    x.s.arm();
    if (which === 'heartbeat') x.advance(5001);
    if (which === 'operator') {
      for (let i = 0; i < 60; i++) {
        x.s.heartbeat();
        x.advance(1000);
      }
    }
    if (which === 'deadline') {
      for (let i = 0; i < 1740; i++) {
        x.s.heartbeat();
        if (i % 20 === 0) x.s.supervise();
        x.advance(1000);
      }
    }
    if (which === 'wall-forward') x.wall(2000000);
    if (which === 'wall-backward') {
      x.wall(0);
      x.advance(5001);
    }
    expect((await x.s.tick())?.status).toBe('VERIFIED');
    expect(x.ports.deactivate).toHaveBeenCalledTimes(1);
    expect(x.ports.signOutAll).toHaveBeenCalledTimes(1);
    expect(() => x.s.arm()).toThrow();
  },
);
it('cleans once on concurrent stop requests and still closes sessions when database cleanup fails', async () => {
  const x = setup();
  x.s.arm();
  x.ports.deactivate.mockRejectedValueOnce(Error('Unknown or locked'));
  const [a, b] = await Promise.all([x.s.close(), x.s.close()]);
  expect(a).toEqual(b);
  expect(a.status).toBe('CONTAINMENT_REQUIRED');
  expect(x.ports.deactivate).toHaveBeenCalledTimes(1);
  expect(x.ports.signOutAll).toHaveBeenCalledTimes(1);
});
it.each(Object.keys(clean) as (keyof CleanupObservation)[])(
  'never calls remaining %s clean',
  async (key) => {
    const x = setup();
    x.s.arm();
    x.ports.observe.mockResolvedValue({ ...clean, [key]: 1 });
    expect((await x.s.close()).status).toBe('CONTAINMENT_REQUIRED');
  },
);
it('does not race deactivation ahead of an in-flight activation; UNKNOWN activation remains containment-required', async () => {
  const x = setup();
  let reject!: (e: Error) => void;
  const gate = new Promise<void>((_, r) => {
    reject = r;
  });
  const activation = x.s.activate(() => gate);
  const closing = x.s.close();
  await Promise.resolve();
  expect(x.ports.deactivate).not.toHaveBeenCalled();
  reject(Error('Response lost after possible commit'));
  await expect(activation).rejects.toThrow();
  expect((await closing).status).toBe('CONTAINMENT_REQUIRED');
  expect(x.ports.deactivate).toHaveBeenCalledTimes(1);
});
it('does not extend a session after expiry during an asynchronous identity wait', async () => {
  const x = setup();
  x.s.arm();
  x.advance(5001);
  expect(() => x.s.heartbeat()).toThrow();
  expect(() => x.s.supervise()).toThrow();
  expect((await x.s.close()).status).toBe('VERIFIED');
});
