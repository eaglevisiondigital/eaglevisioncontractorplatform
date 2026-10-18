import { expect, it, vi } from 'vitest';
import { PreparedCustomerAccess } from '../src/lib/customer-access';
import {
  PreparedCustomerDecision,
  type ReviewDecisionRequest,
} from '../src/lib/customer-decision';
import { projectIssuedReview } from '../src/domain/customer/review';
import { releasePreviewVersion } from '../src/lib/release';
import { sampleCompanies } from '../src/domain/platform';
function fixture() {
  const id = () => crypto.randomUUID(),
    user = id(),
    version = releasePreviewVersion(sampleCompanies[0]);
  version.organization_id = id();
  version.payload.location_id = id();
  const c = {
    organization_id: version.organization_id,
    customer_id: version.payload.customer_id,
    location_id: version.payload.location_id,
    company_name: 'Synthetic company',
    primary_color: '#00543e',
    property_label: 'Synthetic property',
    reports: false,
    version_ids: [version.id],
  };
  const review = projectIssuedReview(version, c),
    hash = 'a'.repeat(64);
  const subscribers = new Set<() => void>();
  const getUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: user } }, error: null });
  const auth = {
    getUser,
    onAuthStateChange: (fn: () => void) => {
      subscribers.add(fn);
      return {
        data: { subscription: { unsubscribe: () => subscribers.delete(fn) } },
      };
    },
  };
  const access = new PreparedCustomerAccess(auth, {
    discover: async () => ({
      user_id: user,
      contexts: [c],
      mode: 'internal-development',
    }),
    review: async () => review,
  });
  const context = vi.fn().mockResolvedValue({
    publication_id: id(),
    scope_sha256: hash,
    review,
    decision: null,
    financial_execution: false,
  });
  const record = vi.fn(async (p: ReviewDecisionRequest) => ({
    id: id(),
    request_id: p.request_id,
    choice: p.choice,
    recorded_at: new Date().toISOString(),
    scope_sha256: p.scope_sha256,
  }));
  const decisions = new PreparedCustomerDecision(auth, access, {
    context,
    record,
  });
  return {
    c,
    version,
    review,
    user,
    hash,
    access,
    context,
    record,
    decisions,
    getUser,
    change: () => subscribers.forEach((f) => f()),
    close: () => {
      decisions.close();
      access.close();
    },
  };
}
it('prepared review persistence requires current read authority, exact scope digest and explicit nonfinancial acknowledgment', async () => {
  const f = fixture();
  await f.access.discover();
  await f.decisions.load(f.c, f.version.id);
  await expect(f.decisions.record('approve_review', false)).rejects.toThrow();
  expect(f.record).not.toHaveBeenCalled();
  const result = await f.decisions.record('approve_review', true);
  expect(result.choice).toBe('approve_review');
  expect(f.decisions.outcome).toBe('confirmed');
  expect(f.record.mock.calls[0][0]).toMatchObject({
    scope_sha256: f.hash,
    acknowledgment: 'review-only-v1',
    organization_id: f.c.organization_id,
  });
  await expect(f.decisions.record('decline_review', true)).rejects.toThrow();
  expect(f.record).toHaveBeenCalledOnce();
  f.close();
});
it('UNKNOWN response never auto-retries and read-only exact receipt reconciliation resolves the attempt', async () => {
  const f = fixture();
  await f.access.discover();
  await f.decisions.load(f.c, f.version.id);
  f.record.mockRejectedValueOnce(Error('lost response'));
  await expect(f.decisions.record('decline_review', true)).rejects.toThrow(
    'UNKNOWN',
  );
  await expect(f.decisions.record('decline_review', true)).rejects.toThrow();
  expect(f.record).toHaveBeenCalledOnce();
  const attempt = f.record.mock.calls[0][0],
    packet = await f.context();
  f.context.mockResolvedValue({
    ...packet,
    decision: {
      id: crypto.randomUUID(),
      request_id: attempt.request_id,
      choice: attempt.choice,
      scope_sha256: attempt.scope_sha256,
      recorded_at: new Date().toISOString(),
    },
  });
  await f.decisions.load(f.c, f.version.id);
  expect(f.decisions.outcome).toBe('confirmed');
  expect(f.record).toHaveBeenCalledOnce();
  f.close();
});
it('concurrent preparation calls cause at most one decision transport attempt', async () => {
  const f = fixture();
  await f.access.discover();
  await f.decisions.load(f.c, f.version.id);
  const r = await Promise.allSettled([
    f.decisions.record('approve_review', true),
    f.decisions.record('decline_review', true),
  ]);
  expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(f.record).toHaveBeenCalledOnce();
  f.close();
});
it('account change during a late decision response clears display and leaves a reconciliation-only UNKNOWN attempt', async () => {
  const f = fixture();
  await f.access.discover();
  await f.decisions.load(f.c, f.version.id);
  let finish!: (v: Awaited<ReturnType<typeof f.record>>) => void;
  f.record.mockImplementation(() => new Promise((r) => (finish = r)));
  const pending = f.decisions.record('approve_review', true);
  await vi.waitFor(() => expect(f.record).toHaveBeenCalledOnce());
  const p = f.record.mock.calls[0][0];
  f.change();
  finish({
    id: crypto.randomUUID(),
    request_id: p.request_id,
    choice: p.choice,
    scope_sha256: p.scope_sha256,
    recorded_at: new Date().toISOString(),
  });
  await expect(pending).rejects.toThrow('UNKNOWN');
  expect(f.decisions.outcome).toBe('unknown');
  f.close();
});
it.each([
  'extra financial field',
  'wrong property',
  'bad digest',
  'financial activation',
  'missing publication',
])('prepared customer decision denies %s', async (attack) => {
  const f = fixture();
  await f.access.discover();
  const p = await f.context();
  if (attack === 'extra financial field')
    p.review = { ...p.review, unit_cost_minor: 10 };
  if (attack === 'wrong property')
    p.review = { ...p.review, location_id: crypto.randomUUID() };
  if (attack === 'bad digest') p.scope_sha256 = 'no';
  if (attack === 'financial activation') p.financial_execution = true;
  if (attack === 'missing publication') p.publication_id = null;
  f.context.mockResolvedValue(p);
  await expect(f.decisions.load(f.c, f.version.id)).rejects.toThrow(
    'unavailable',
  );
  expect(f.record).not.toHaveBeenCalled();
  f.close();
});
it('an existing immutable review preference blocks another attempt; closing is terminal', async () => {
  const f = fixture();
  await f.access.discover();
  const p = await f.context();
  p.decision = {
    id: crypto.randomUUID(),
    request_id: crypto.randomUUID(),
    choice: 'decline_review',
    recorded_at: new Date().toISOString(),
    scope_sha256: f.hash,
  };
  f.context.mockResolvedValue(p);
  await f.decisions.load(f.c, f.version.id);
  await expect(f.decisions.record('approve_review', true)).rejects.toThrow();
  expect(f.record).not.toHaveBeenCalled();
  f.close();
  await expect(f.decisions.load(f.c, f.version.id)).rejects.toThrow();
});

it('a confirmed decision does not block a separately authorized issued version; UNKNOWN still blocks all new writes', async () => {
  const f = fixture();
  await f.access.discover();
  await f.decisions.load(f.c, f.version.id);
  await f.decisions.record('approve_review', true);
  const version = crypto.randomUUID();
  f.c.version_ids.push(version);
  f.review.version_id = version;
  f.review.version_number++;
  const packet = await f.context();
  f.context.mockResolvedValue({
    ...packet,
    publication_id: crypto.randomUUID(),
    scope_sha256: 'b'.repeat(64),
    review: f.review,
  });
  await f.decisions.load(f.c, version);
  await f.decisions.record('decline_review', true);
  expect(f.record).toHaveBeenCalledTimes(2);
  f.close();
});
