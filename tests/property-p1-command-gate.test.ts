import { it, expect, vi } from 'vitest';
import { P1CommandGate } from '../server/property/execution/command-gate';
import { P1Safety } from '../server/property/execution/safety';

it('shutdown waits for a delayed verified handoff before session revocation and clean observation', async () => {
  const gate = new P1CommandGate();
  const finish = gate.enter();
  const sessions: string[] = [];
  const events: string[] = [];
  const safety = new P1Safety({
    deactivate: async () => {},
    signOutAll: async () => {
      events.push('signout');
      sessions.splice(0);
    },
    observe: async () => {
      events.push('observe');
      return {
        approvedActiveFeatures: 0,
        unexpectedActiveFeatures: 0,
        sessions: sessions.length,
        customerMappings: 0,
        reportLeases: 0,
        activePlatformGrants: 0,
        releaseGrants: 0,
        providerWorkloads: 0,
      };
    },
  });
  const closing = (async () => {
    await gate.stop();
    return safety.close();
  })();
  await Promise.resolve();
  expect(events).toEqual([]);
  // Auth verification returned after disconnect. Custody precedes the stop check.
  sessions.push('late-verified-session');
  expect(() => gate.assertOpen()).toThrow();
  finish();
  expect((await closing).status).toBe('VERIFIED');
  expect(events).toEqual(['signout', 'observe']);
  expect(sessions).toEqual([]);
  expect(() => gate.enter()).toThrow();
});

it.each(['disconnect', 'supervision loss', 'emergency stop'])(
  'does not activate after %s during a delayed live-session check',
  async () => {
    const gate = new P1CommandGate();
    const finish = gate.enter();
    const activate = vi.fn();
    const closing = gate.stop();
    await Promise.resolve();
    expect(() => {
      gate.assertOpen();
      activate();
    }).toThrow();
    finish();
    await closing;
    expect(activate).not.toHaveBeenCalled();
  },
);

it('rejects concurrent commands and supports one idempotent release without reopening after shutdown', async () => {
  const gate = new P1CommandGate();
  const first = gate.enter();
  expect(() => gate.enter()).toThrow();
  first();
  first();
  const second = gate.enter();
  const stops = [gate.stop(), gate.stop()];
  second();
  await Promise.all(stops);
  expect(() => gate.enter()).toThrow();
});
