// Controlled SQL/SDK MODEL ONLY. No actual database principal or hosted Auth.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { commercialCustomerBridgeFixture } from './commercial-customer-bridge';
import { CommercialCallerConnection } from '../../server/invoices/commercial-caller-connection';
import type { GatewaySql } from '../../server/payments/postgres-store';
import { operatingReaderCatalog } from '../../proposals/commercial-customer-operating-reader/catalog';
import {
  renderReaderSQL,
  type ReaderScope,
} from '../../proposals/commercial-customer-operating-reader/binding';
import { operatingCustomerInvoiceRead } from '../../proposals/commercial-customer-operating-reader/reader';
const folder = 'proposals/commercial-customer-operating-reader/';
export function operatingReaderModel() {
  const f = commercialCustomerBridgeFixture(),
    claims = JSON.parse(
      Buffer.from(f.bearer.split('.')[1], 'base64url').toString(),
    );
  const scope: ReaderScope = {
    login: 'fixture_invoice_reader',
    owner: 'fixture_invoice_owner',
    userId: claims.sub,
    sessionId: claims.session_id,
    organizationId: f.viewer.invoice.organizationId,
    customerId: f.viewer.invoice.customerId,
    locationId: f.viewer.invoice.locationId!,
    invoiceId: f.viewer.invoice.invoiceId,
    sourceVersionId: f.viewer.invoice.sourceVersionId,
    sourceHash: f.mapping.sourceHash,
    revision: f.viewer.invoice.revision,
    issuanceReceiptId: f.value.invoice.receipt.commandId,
    reviewId: randomUUID(),
    expiresAt: Date.now() + 120000,
  };
  const rendered = renderReaderSQL(
    readFileSync(folder + 'read.proposed.sql.in', 'utf8'),
    readFileSync(folder + 'runtime-grants.sql.in', 'utf8'),
    scope,
  );
  const view = structuredClone(f.viewer),
    loc = f.version.location_snapshot!;
  view.propertyLabel = [
    loc.address_line1,
    loc.city,
    loc.region + ' ' + loc.postal_code,
  ].join(', ');
  const mapping = {
    ...f.mapping,
    mappingRevision: scope.reviewId,
    expiresAt: scope.expiresAt,
    issuedNumber: f.value.invoice.number,
    issuanceReceiptId: scope.issuanceReceiptId,
  };
  const profile = {
    login: scope.login,
    currentRole: scope.login,
    canLogin: true,
    superuser: false,
    bypassRls: false,
    createDb: false,
    createRole: false,
    replication: false,
    memberships: 0,
    isolation: 'read committed',
    schemaUsage: true,
    portalOwnerACL: true,
    portalPolicy: true,
    portalRls: true,
    schemaFallback: false,
    schemaCreate: false,
    rawAccess: false,
    otherDefiner: false,
    functions: Object.entries(rendered.bodyHashes).map(([name, bodyHash]) => ({
      name,
      bodyHash,
      owner: scope.owner,
      ownerLogin: false,
      ownerSuper: false,
      ownerBypass: false,
      definer: true,
      volatility: 'v',
      language: 'plpgsql',
      args: 0,
      result: 'jsonb',
      config: ['search_path=""'],
      directExecute: true,
      publicExecute: false,
      grantOption: false,
    })),
  };
  const inspect = {
    database: 'ev_test_model_only',
    pid: 1234,
    backend_start: 'model-only',
    login: scope.login,
    current_role: scope.login,
  };
  const calls: string[] = [];
  let active = true;
  const hooks = {
    afterRead: async () => {},
    afterCatalog: async () => {},
    mapping: (m: unknown) => m,
    packet: (p: unknown) => p,
    hang: false,
  };
  const connection: GatewaySql = {
    async query<T extends Record<string, unknown>>(text: string) {
      calls.push(text);
      let rows: unknown[];
      if (text.includes('from pg_stat_activity where pid=pg_backend_pid()'))
        rows = [{ ...inspect, claims: JSON.stringify(claims) }];
      else if (text === operatingReaderCatalog) {
        rows = [{ profile: structuredClone(profile) }];
        await hooks.afterCatalog();
      } else if (
        text === 'select private.commercial_customer_invoice_authorize() result'
      ) {
        if (!active) throw Error('revoked');
        rows = [{ result: hooks.mapping(structuredClone(mapping)) }];
      } else if (
        text ===
        'select private.commercial_customer_invoice_read_issued() result'
      ) {
        if (hooks.hang) return new Promise(() => {});
        if (!active) throw Error('revoked');
        rows = [
          {
            result: hooks.packet({
              mapping: structuredClone(mapping),
              invoice: structuredClone(f.value.invoice),
              version: structuredClone(f.version),
            }),
          },
        ];
        await hooks.afterRead();
      } else throw Error('Unexpected SQL operation');
      return { rows: rows as T[] };
    },
  };
  const caller = new CommercialCallerConnection(
    connection,
    f.auth,
    f.bearer,
    inspect,
  );
  const make = (
    options = { enabled: true, mode: 'disposable-proposal' as const },
  ) =>
    operatingCustomerInvoiceRead(
      f.auth,
      f.bearer,
      connection,
      inspect,
      scope,
      options,
    );
  return {
    ...f,
    view,
    scope,
    rendered,
    profile,
    claims,
    inspect,
    connection,
    caller,
    calls,
    hooks,
    make,
    revoke: () => {
      active = false;
    },
    restore: () => {
      active = true;
    },
  };
}
