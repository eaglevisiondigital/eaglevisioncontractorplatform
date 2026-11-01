import { expect, it, vi } from 'vitest';
import { PreparedCustomerAccess } from '../src/lib/customer-access';
import {
  projectIssuedReview,
  parseCustomerReview,
  compareCustomerVersions,
} from '../src/domain/customer/review';
import { releasePreviewVersion } from '../src/lib/release';
import { sampleCompanies } from '../src/domain/platform';
const id = () => crypto.randomUUID();
function fixture() {
  const version = releasePreviewVersion(sampleCompanies[0]);
  version.organization_id = id();
  version.payload.location_id = id();
  const context = {
    organization_id: version.organization_id,
    customer_id: version.payload.customer_id,
    location_id: version.payload.location_id,
    company_name: 'Synthetic contractor',
    primary_color: '#00543e',
    property_label: 'Synthetic property',
    reports: true,
    version_ids: [version.id],
  };
  const user = id(),
    packet = {
      user_id: user,
      contexts: [context],
      mode: 'internal-development',
    };
  const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: user } }, error: null }),
    discover = vi.fn().mockResolvedValue(packet),
    review = vi.fn().mockResolvedValue(projectIssuedReview(version, context));
  let changed = () => {};
  const unsubscribe = vi.fn();
  const access = new PreparedCustomerAccess(
    {
      getUser,
      onAuthStateChange: (fn) => {
        changed = fn;
        return { data: { subscription: { unsubscribe } } };
      },
    },
    { discover, review },
  );
  return {
    version,
    context,
    user,
    packet,
    getUser,
    discover,
    review,
    access,
    unsubscribe,
    changed: () => changed(),
  };
}
it('discovery has no tenant/email/route selector and reads re-discover exact server bindings', async () => {
  const f = fixture();
  const c = await f.access.discover();
  expect(f.discover).toHaveBeenCalledExactlyOnceWith();
  const r = await f.access.review(c[0], f.version.id);
  expect(r.scope.total_minor).toBe(f.version.calculation.total_minor);
  expect(f.discover).toHaveBeenCalledTimes(2);
  expect(f.review).toHaveBeenCalledExactlyOnceWith(f.context, f.version.id);
  f.access.close();
  expect(f.unsubscribe).toHaveBeenCalledOnce();
});
it.each([
  'unknown-user',
  'missing-mapping',
  'staff-denied',
  'expired-lease',
  'revoked',
  'bad-cursor',
])(
  'uniformly denies %s without account/company enumeration',
  async (attack) => {
    const f = fixture();
    if (attack === 'unknown-user')
      f.getUser.mockResolvedValue({ data: { user: null }, error: null });
    else f.discover.mockRejectedValue(Error(attack));
    await expect(f.access.discover()).rejects.toThrow(
      'Customer access unavailable',
    );
    expect(f.review).not.toHaveBeenCalled();
    f.access.close();
  },
);
it.each(['company', 'customer', 'property', 'version'])(
  'a forged %s route/context identifier cannot become authority',
  async (attack) => {
    const f = fixture();
    await f.access.discover();
    const c = { ...f.context };
    if (attack === 'company') c.organization_id = id();
    if (attack === 'customer') c.customer_id = id();
    if (attack === 'property') c.location_id = id();
    await expect(
      f.access.review(c, attack === 'version' ? id() : f.version.id),
    ).rejects.toThrow('Customer access unavailable');
    expect(f.review).not.toHaveBeenCalled();
    f.access.close();
  },
);
it('a lost mapping on the next read clears authority even after a successful first discovery', async () => {
  const f = fixture();
  await f.access.discover();
  f.discover.mockResolvedValue({ ...f.packet, contexts: [] });
  await expect(f.access.review(f.context, f.version.id)).rejects.toThrow();
  expect(f.review).not.toHaveBeenCalled();
  f.access.close();
});
it('an account switch during a late estimate response cannot publish the previous account data', async () => {
  const f = fixture();
  await f.access.discover();
  let finish!: (v: unknown) => void;
  f.review.mockImplementation(() => new Promise((r) => (finish = r)));
  const pending = f.access.review(f.context, f.version.id);
  await vi.waitFor(() => expect(f.review).toHaveBeenCalledOnce());
  f.changed();
  finish(projectIssuedReview(f.version, f.context));
  await expect(pending).rejects.toThrow('Customer access unavailable');
  f.access.close();
});
it('sign-out or close during discovery prevents late restoration and future calls', async () => {
  const f = fixture();
  let finish!: (v: unknown) => void;
  f.discover.mockImplementation(() => new Promise((r) => (finish = r)));
  const pending = f.access.discover();
  await vi.waitFor(() => expect(f.discover).toHaveBeenCalledOnce());
  f.access.close();
  finish(f.packet);
  await expect(pending).rejects.toThrow();
  await expect(f.access.discover()).rejects.toThrow();
});
it('checks the genuine caller again after a read and exposes no connected response operation', async () => {
  const f = fixture();
  await f.access.discover();
  f.getUser.mockResolvedValue({ data: { user: { id: id() } }, error: null });
  await expect(f.access.review(f.context, f.version.id)).rejects.toThrow();
  expect(() => f.access.respond()).toThrow('execution disabled');
  expect(f.review).not.toHaveBeenCalled();
  f.access.close();
});
it.each([
  'cost',
  'margin',
  'supplier',
  'payroll',
  'notes',
  'foreign-company',
  'foreign-property',
  'unissued-decision',
  'bad-total',
  'duplicate-lines',
])('rejects unsafe customer selling projection: %s', (attack) => {
  const f = fixture(),
    p = projectIssuedReview(f.version, f.context);
  if (['cost', 'margin', 'supplier', 'payroll', 'notes'].includes(attack))
    Object.assign(p.scope.lines[0], { [attack]: 123 });
  if (attack === 'foreign-company') p.organization_id = id();
  if (attack === 'foreign-property') p.location_id = id();
  if (attack === 'unissued-decision')
    Object.assign(p, { review_state: 'approved' });
  if (attack === 'bad-total') p.scope.total_minor++;
  if (attack === 'duplicate-lines') p.scope.lines.push(p.scope.lines[0]);
  expect(() => parseCustomerReview(p, f.context, f.version.id)).toThrow();
  f.access.close();
});
it('compares authorized immutable selling versions only, without costs and across no tenant/property boundaries', () => {
  const f = fixture(),
    a = projectIssuedReview(f.version, f.context),
    b = structuredClone(a);
  b.version_id = id();
  b.version_number++;
  b.scope.lines[0].quantity_milli += 1000;
  expect(compareCustomerVersions(a, b)).toHaveLength(1);
  expect(() =>
    compareCustomerVersions(a, { ...b, location_id: id() }),
  ).toThrow();
  expect(() => compareCustomerVersions(a, a)).toThrow();
  f.access.close();
});
it('local issued projection rejects draft, foreign customer and unrelated property bindings', () => {
  const f = fixture();
  expect(() =>
    projectIssuedReview({ ...f.version, status: 'draft' }, f.context),
  ).toThrow();
  expect(() =>
    projectIssuedReview(f.version, { ...f.context, customer_id: id() }),
  ).toThrow();
  expect(() =>
    projectIssuedReview(f.version, { ...f.context, location_id: id() }),
  ).toThrow();
  f.access.close();
});
