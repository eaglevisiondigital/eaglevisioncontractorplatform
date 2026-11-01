import { afterEach, expect, it, vi } from 'vitest';
import type {
  SupabaseClient,
  AuthChangeEvent,
  Session,
} from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';
import { PropertyReportSession } from '../src/lib/property-report-session';
import { parsePropertyReportPage } from '../src/domain/property/report-page';
const id = () => crypto.randomUUID();
const boundary = {
    organization_id: id(),
    customer_id: id(),
    location_id: id(),
  },
  user = id();
function report() {
  return {
    id: id(),
    version: 1,
    published_at: '2026-10-18T00:00:00+00:00',
    snapshot: {
      visited_on: '2026-10-16',
      phase: 'before',
      summary: 'Published inspection',
      checklist: [{ label: 'Exterior', completed: true }],
      findings: [
        {
          id: 'finding',
          category: 'Damage',
          location: 'Rear entry',
          severity: 'moderate',
          description: 'Weathered seal',
          recommendation: 'Review repair estimate',
        },
      ],
      media: [],
    },
  };
}
function page(reports = [report()]) {
  return {
    ...boundary,
    reports,
    media: [],
    mode: 'internal-development',
    report_only: true,
  };
}
function fixture() {
  const getUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: user } }, error: null });
  const rpc = vi.fn().mockResolvedValue({ data: page(), error: null });
  let change: (
    event: AuthChangeEvent,
    session: Session | null,
  ) => void = () => {};
  const unsubscribe = vi.fn();
  const client = {
    auth: {
      getUser,
      onAuthStateChange: (fn: typeof change) => {
        change = fn;
        return { data: { subscription: { unsubscribe } } };
      },
    },
    rpc,
  } as unknown as SupabaseClient<Database>;
  const session = new PropertyReportSession(client, {
    ...boundary,
    user_id: user,
  });
  return {
    session,
    getUser,
    rpc,
    unsubscribe,
    change: () => change('SIGNED_OUT', null),
  };
}
afterEach(() => vi.useRealTimers());
it('binds an existing genuine caller to only the narrow report RPC and clones validated snapshots', async () => {
  const f = fixture();
  await f.session.load();
  expect(f.session.snapshot().status).toBe('ready');
  expect(f.rpc).toHaveBeenCalledExactlyOnceWith('property_reports', {
    p_org: boundary.organization_id,
    p_customer: boundary.customer_id,
    p_location: boundary.location_id,
    p_before: null,
  });
  expect(f.getUser.mock.calls.length).toBe(3);
  f.session.close();
  expect(f.unsubscribe).toHaveBeenCalledOnce();
  expect(f.session.snapshot().reports).toEqual([]);
});
it('rejects a different authenticated UID without making a report request', async () => {
  const f = fixture();
  f.getUser.mockResolvedValue({ data: { user: { id: id() } }, error: null });
  await f.session.load();
  expect(f.rpc).not.toHaveBeenCalled();
  expect(f.session.snapshot().status).toBe('denied');
  f.session.close();
});
it('discards an in-flight response after an Auth event; an old request cannot repopulate history', async () => {
  const f = fixture();
  let finish!: (v: unknown) => void;
  f.rpc.mockImplementation(() => new Promise((r) => (finish = r)));
  const pending = f.session.load();
  await vi.waitFor(() => expect(f.rpc).toHaveBeenCalledOnce());
  f.change();
  finish({ data: page(), error: null });
  await pending;
  expect(f.session.snapshot()).toEqual({
    status: 'denied',
    reports: [],
    hasMore: false,
  });
  f.session.close();
});
it('denies a caller switch after the RPC even without an Auth event', async () => {
  const f = fixture();
  f.getUser
    .mockResolvedValueOnce({ data: { user: { id: user } }, error: null })
    .mockResolvedValueOnce({ data: { user: { id: user } }, error: null })
    .mockResolvedValueOnce({ data: { user: { id: id() } }, error: null });
  await f.session.load();
  expect(f.session.snapshot().reports).toEqual([]);
  expect(f.session.snapshot().status).toBe('denied');
  f.session.close();
});
it('clears on revocation/lease denial and does not retry or substitute sample data', async () => {
  const f = fixture();
  await f.session.load();
  f.rpc.mockResolvedValue({ data: null, error: { message: 'lease expired' } });
  await f.session.load();
  expect(f.rpc).toHaveBeenCalledTimes(2);
  expect(f.session.snapshot()).toEqual({
    status: 'denied',
    reports: [],
    hasMore: false,
  });
  f.session.close();
});
it('uses the exact authorized report cursor, retains immutable prior versions and rejects repeated pages', async () => {
  const f = fixture(),
    rows = Array.from({ length: 50 }, report);
  f.rpc.mockResolvedValue({ data: page(rows), error: null });
  await f.session.load();
  expect(f.session.snapshot().hasMore).toBe(true);
  const older = report();
  f.rpc.mockResolvedValue({ data: page([older]), error: null });
  await f.session.load(true);
  expect(f.rpc.mock.calls[1][1].p_before).toBe(rows.at(-1)!.id);
  expect(f.session.snapshot().reports).toHaveLength(51);
  await f.session.load();
  await f.session.load(true);
  expect(f.rpc).toHaveBeenCalledTimes(3);
  f.session.close();
});
it('duplicate report IDs across pages fail closed', async () => {
  const f = fixture(),
    rows = Array.from({ length: 50 }, report);
  f.rpc.mockResolvedValue({ data: page(rows), error: null });
  await f.session.load();
  f.rpc.mockResolvedValue({ data: page([rows[0]]), error: null });
  await f.session.load(true);
  expect(f.session.snapshot().status).toBe('denied');
  expect(f.session.snapshot().reports).toEqual([]);
  f.session.close();
});
it('clears display cache after thirty seconds without issuing an automatic request or extending authority', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.session.load();
  vi.advanceTimersByTime(30_000);
  expect(f.session.snapshot().status).toBe('denied');
  expect(f.rpc).toHaveBeenCalledOnce();
  f.session.close();
});
it('closed sessions and concurrent loads cannot issue late or duplicate reads', async () => {
  const f = fixture();
  await Promise.all([f.session.load(), f.session.load()]);
  expect(f.rpc).toHaveBeenCalledOnce();
  f.session.close();
  await f.session.load();
  expect(f.rpc).toHaveBeenCalledOnce();
});
it.each([
  'foreign-tenant',
  'foreign-customer',
  'foreign-property',
  'private-field',
  'media',
  'financial',
  'bad-date',
  'bad-timestamp',
  'bad-severity',
  'duplicate-findings',
  'duplicate-reports',
  'oversized',
  'missing-field',
])('rejects unsafe report projection: %s', (attack) => {
  const p = page();
  if (attack === 'foreign-tenant') p.organization_id = id();
  if (attack === 'foreign-customer') p.customer_id = id();
  if (attack === 'foreign-property') p.location_id = id();
  if (attack === 'private-field')
    Object.assign(p.reports[0].snapshot.findings[0], {
      internal_notes: 'SECRET',
    });
  if (attack === 'media')
    Object.assign(p.reports[0].snapshot, {
      media: [{ url: 'https://example.test/private' }],
    });
  if (attack === 'financial') Object.assign(p, { invoices: [] });
  if (attack === 'bad-date') p.reports[0].snapshot.visited_on = '2026-02-31';
  if (attack === 'bad-timestamp') p.reports[0].published_at = 'yesterday';
  if (attack === 'bad-severity')
    p.reports[0].snapshot.findings[0].severity = 'unknown';
  if (attack === 'duplicate-findings')
    p.reports[0].snapshot.findings.push(p.reports[0].snapshot.findings[0]);
  if (attack === 'duplicate-reports') p.reports.push(p.reports[0]);
  if (attack === 'oversized') p.reports[0].snapshot.summary = 'x'.repeat(2001);
  if (attack === 'missing-field')
    Reflect.deleteProperty(p.reports[0].snapshot, 'summary');
  expect(() => parsePropertyReportPage(p, boundary)).toThrow('report-only');
});
it('keeps plain-text findings as data and does not share mutable response objects', () => {
  const p = page();
  p.reports[0].snapshot.summary = '<script>untrusted text</script>';
  const parsed = parsePropertyReportPage(p, boundary);
  p.reports[0].snapshot.summary = 'changed';
  expect(parsed.reports[0].snapshot.summary).toBe(
    '<script>untrusted text</script>',
  );
});
