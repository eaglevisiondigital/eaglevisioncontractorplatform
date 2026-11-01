// Disposable process fixture only. No Supabase connection, credentials or hosted writes.
import { writeFileSync } from 'node:fs';
import { P1Safety } from '../../server/property/execution/safety.ts';
const output = process.argv[2];
const events: string[] = [];
const safety = new P1Safety({
  deactivate: async () => {
    events.push('exact-tenant-deactivation');
  },
  signOutAll: async () => {
    events.push('all-session-signout');
  },
  observe: async () => ({
    approvedActiveFeatures: 0,
    unexpectedActiveFeatures: 0,
    sessions: 0,
    customerMappings: 0,
    reportLeases: 0,
    activePlatformGrants: 0,
    releaseGrants: 0,
    providerWorkloads: 0,
  }),
});
safety.arm();
process.send?.({ ready: true });
process.on('disconnect', () => {
  void safety.close().then((r) => {
    writeFileSync(output, JSON.stringify({ events, status: r.status }), {
      mode: 0o600,
    });
    process.exit(0);
  });
});
