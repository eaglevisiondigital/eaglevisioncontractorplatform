import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import {
  ConnectedPropertyOperations,
  type PropertyReportPage,
} from './property-connected';
import {
  reportUuid,
  type ReportBoundary,
} from '../domain/property/report-page';

export interface ReportSessionState {
  status: 'idle' | 'loading' | 'ready' | 'denied' | 'closed';
  reports: PropertyReportPage['reports'];
  hasMore: boolean;
}
/** Prepared read-only composition. No URL-selected authority, login, token storage or feature activation. */
export class PropertyReportSession {
  private readonly boundary: Readonly<ReportBoundary & { user_id: string }>;
  private readonly reader: ConnectedPropertyOperations;
  private readonly subscription: { unsubscribe(): void };
  private generation = 0;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private state: ReportSessionState = {
    status: 'idle',
    reports: [],
    hasMore: false,
  };
  private listeners = new Set<() => void>();
  constructor(
    private readonly client: SupabaseClient<Database>,
    boundary: ReportBoundary & { user_id: string },
  ) {
    if (
      Object.keys(boundary).length !== 4 ||
      !Object.values(boundary).every(reportUuid)
    )
      throw Error('Exact customer report binding required');
    this.boundary = Object.freeze({ ...boundary });
    this.reader = new ConnectedPropertyOperations(client);
    this.subscription = client.auth.onAuthStateChange(() => {
      this.invalidate();
    }).data.subscription;
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(next: ReportSessionState) {
    this.state = next;
    this.listeners.forEach((x) => x());
  }
  private invalidate() {
    if (this.state.status === 'closed') return;
    clearTimeout(this.expiry);
    this.generation++;
    this.emit({ status: 'denied', reports: [], hasMore: false });
  }
  private async identity() {
    const { data, error } = await this.client.auth.getUser();
    if (error || data.user?.id !== this.boundary.user_id)
      throw Error('Customer session changed');
  }
  async load(older = false) {
    if (this.state.status === 'closed' || this.state.status === 'loading')
      return;
    if (older && (this.state.status !== 'ready' || !this.state.hasMore)) return;
    const generation = ++this.generation;
    clearTimeout(this.expiry);
    const previous = older ? this.state.reports : [];
    // Do not retain stale visible reports while revalidating access.
    this.emit({ status: 'loading', reports: [], hasMore: false });
    try {
      await this.identity();
      if (generation !== this.generation) return;
      const b = this.boundary;
      const page = await this.reader.reports(
        b.organization_id,
        b.customer_id,
        b.location_id,
        previous.at(-1)?.id ?? null,
      );
      await this.identity();
      if (generation !== this.generation) return;
      const reports = [...previous, ...page.reports];
      if (
        reports.length > 500 ||
        new Set(reports.map((r) => r.id)).size !== reports.length
      )
        throw Error('Report history boundary');
      this.emit({
        status: 'ready',
        reports,
        hasMore: page.reports.length === 50 && reports.length < 500,
      });
      // Bounded display cache only; this timer is never an authorization lease.
      this.expiry = setTimeout(() => this.invalidate(), 30_000);
    } catch {
      if (generation === this.generation) this.invalidate();
    }
  }
  close() {
    clearTimeout(this.expiry);
    this.generation++;
    this.subscription.unsubscribe();
    this.emit({ status: 'closed', reports: [], hasMore: false });
    this.listeners.clear();
  }
}
