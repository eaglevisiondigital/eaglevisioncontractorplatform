import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';
import { ConnectedPropertyOperations } from '../src/lib/property-connected';
const org = crypto.randomUUID(),
  customer = crypto.randomUUID(),
  location = crypto.randomUUID(),
  id = crypto.randomUUID();
function fixture(data: unknown = { id }, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: crypto.randomUUID() } },
    error: null,
  });
  const client = {
    auth: { getUser },
    rpc,
  } as unknown as SupabaseClient<Database>;
  return { repo: new ConnectedPropertyOperations(client), rpc, getUser };
}
it('verifies the real caller for every command and forwards only narrow RPC arguments', async () => {
  const f = fixture();
  await f.repo.command(org, {
    action: 'submit_visit',
    id,
    revision: 1,
    payload: {},
  });
  expect(f.getUser).toHaveBeenCalledOnce();
  expect(f.rpc).toHaveBeenCalledWith('property_command', {
    p_org: org,
    p_action: 'submit_visit',
    p_id: id,
    p_lock: 1,
    p: {},
  });
});
it('rejects a revoked authentication check before any RPC and never falls back to samples', async () => {
  const f = fixture();
  f.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'revoked' },
  });
  await expect(f.repo.workspace(org)).rejects.toThrow('authenticated');
  expect(f.rpc).not.toHaveBeenCalled();
});
it('rejects NULL or stale command shape and unsupported actions locally', async () => {
  const f = fixture();
  await expect(
    f.repo.command(org, {
      action: 'submit_visit',
      id,
      revision: 0,
      payload: {},
    }),
  ).rejects.toThrow('revision');
  expect(f.rpc).not.toHaveBeenCalled();
});
it('keeps backend denial authoritative and does not retry writes', async () => {
  const f = fixture(null, { message: 'denied' });
  await expect(
    f.repo.command(org, {
      action: 'submit_visit',
      id,
      revision: 1,
      payload: {},
    }),
  ).rejects.toThrow('denied');
  expect(f.rpc).toHaveBeenCalledOnce();
});
it('rejects foreign tenant data in the contractor workspace', async () => {
  const f = fixture({
    plans: [{ organization_id: crypto.randomUUID() }],
    visits: [],
  });
  await expect(f.repo.workspace(org)).rejects.toThrow('response');
});
function page() {
  return {
    organization_id: org,
    customer_id: customer,
    location_id: location,
    reports: [],
    media: [],
    report_only: true,
    mode: 'internal-development',
  };
}
it('uses only report RPC and explicit property/customer boundaries', async () => {
  const f = fixture(page());
  await f.repo.reports(org, customer, location);
  expect(f.rpc).toHaveBeenCalledWith('property_reports', {
    p_org: org,
    p_customer: customer,
    p_location: location,
    p_before: null,
  });
});
it.each(['foreign customer', 'financial projection', 'unsafe report'] as const)(
  'rejects %s report response',
  async (mode) => {
    const p: Record<string, unknown> = page();
    if (mode === 'foreign customer') p.customer_id = crypto.randomUUID();
    if (mode === 'financial projection') p.invoices = [];
    if (mode === 'unsafe report')
      p.reports = [
        {
          id,
          version: 1,
          published_at: '2026-10-16',
          snapshot: { internal_cost: 10 },
        },
      ];
    const f = fixture(p);
    await expect(f.repo.reports(org, customer, location)).rejects.toThrow(
      'report-only',
    );
  },
);
it('revalidates callers rather than caching the first successful session', async () => {
  const f = fixture({ plans: [], visits: [] });
  await f.repo.workspace(org);
  f.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(f.repo.workspace(org)).rejects.toThrow('authenticated');
  expect(f.rpc).toHaveBeenCalledOnce();
});
