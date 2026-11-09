import { afterEach, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../src/lib/supabase', () => ({ supabase: { rpc } }));
import { Phase3Repository } from '../../src/lib/phase3';
import { Operations } from '../../src/lib/operations';
import type { Job, JobProjection } from '../../src/domain/jobs/financials';
afterEach(() => rpc.mockReset());
it('unchanged connected writer forwards exact org/job/CAS and full reviewed forecast, without sample-only gating', async () => {
  const repo = new Phase3Repository(new Operations(false));
  const job = {
    id: 'exact-job',
    organization_id: 'exact-org',
    lock_revision: 17,
  } as Job;
  const projection: JobProjection = {
    remaining: {
      materials: 321,
      labor: 654,
      subcontractors: 0,
      equipment: 0,
      other: 0,
    },
    overrun_bps: 1000,
    erosion_bps: 500,
    costs_complete: false,
  };
  rpc.mockResolvedValue({ data: null, error: null });
  await repo.projection('exact-org', job, projection);
  expect(repo.sample).toBe(false);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('update_job_projection', {
    p_org: 'exact-org',
    p_job: 'exact-job',
    p_lock: 17,
    p_projection: projection,
  });
});
it('connected permission/stale rejection propagates without a second RPC or fallback writer', async () => {
  const repo = new Phase3Repository(new Operations(false));
  rpc.mockResolvedValue({ data: null, error: { message: 'Denied or stale' } });
  await expect(
    repo.projection(
      'org',
      { id: 'job', lock_revision: 2 } as Job,
      {} as JobProjection,
    ),
  ).rejects.toThrow(/denied, invalid, or changed/);
  expect(rpc).toHaveBeenCalledTimes(1);
});
