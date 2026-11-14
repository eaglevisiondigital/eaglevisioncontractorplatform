import { types } from 'node:util';
import {
  CustomerBrokerAuth,
  brokerActor,
  type BrokerActor,
} from '../../server/customer/broker-auth';
import {
  customerInvoiceSnapshot,
  type InvoiceViewer,
} from '../../src/components/invoices/customer-invoice-contract';
import {
  commercialCustomerTarget,
  type CommercialCustomerTarget,
  type CommercialCustomerResponse,
} from '../../src/components/invoices/commercial-customer-read';

/** UNWIRED TEST PORT ONLY. No implementation, SQL/grant or connection factory.
 * authorize must independently verify CURRENT server mapping/access for this exact
 * actor and target; readIssued must read the original issued record and its exact
 * private-hash-verified customer-safe scope. Existing staff SQL alone cannot do so.
 */
export interface CommercialCustomerReaderPort {
  kind: 'unwired-test-port';
  authorize(
    actor: Readonly<BrokerActor>,
    target: CommercialCustomerTarget['invoice'],
    signal: AbortSignal,
  ): Promise<unknown>;
  readIssued(
    actor: Readonly<BrokerActor>,
    target: CommercialCustomerTarget['invoice'],
    signal: AbortSignal,
  ): Promise<unknown>;
}
const unavailable = () =>
  Error('Current commercial customer read unavailable · UNKNOWN');
const authenticate = CustomerBrokerAuth.prototype.verify;
function data(value: unknown, depth = 0): unknown {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value))
    return value;
  if (!value || typeof value !== 'object' || depth > 20 || types.isProxy(value))
    throw unavailable();
  if (
    !Array.isArray(value) &&
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const output: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (Array.isArray(value) && key === 'length') continue;
    if (typeof key !== 'string' || !('value' in descriptors[key]))
      throw unavailable();
    Object.defineProperty(output, key, {
      value: data(descriptors[key].value, depth + 1),
      enumerable: true,
    });
  }
  if (!Array.isArray(value)) return output;
  if (
    value.length > 500 ||
    Object.keys(output).length !== value.length ||
    !Object.keys(output).every((k, i) => k === String(i))
  )
    throw unavailable();
  return Object.values(output);
}
function record(value: unknown, keys: string[]) {
  const row = data(value) as Record<string, unknown>;
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    Object.keys(row).length !== keys.length ||
    !keys.every((k) => Object.hasOwn(row, k))
  )
    throw unavailable();
  return row;
}
/** Reuses actual opaque Auth verification with a controlled test transport. AAL2
 * is retained conservatively; no login/refresh, network default or real API exists.
 */
export function commercialCustomerReadProposal(
  auth: CustomerBrokerAuth,
  bearer: string,
  port: CommercialCustomerReaderPort,
  options: { enabled: boolean; mode: 'fictional-local' } = {
    enabled: false,
    mode: 'fictional-local',
  },
) {
  return async (
    input: CommercialCustomerTarget,
    signal: AbortSignal,
  ): Promise<CommercialCustomerResponse> => {
    if (options.enabled !== true || options.mode !== 'fictional-local')
      throw unavailable();
    if (!(auth instanceof CustomerBrokerAuth) || types.isProxy(port))
      throw unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(port);
    if (
      Reflect.ownKeys(descriptors).length !== 3 ||
      ['kind', 'authorize', 'readIssued'].some(
        (k) => !descriptors[k] || !('value' in descriptors[k]),
      ) ||
      descriptors.kind.value !== 'unwired-test-port' ||
      typeof descriptors.authorize.value !== 'function' ||
      typeof descriptors.readIssued.value !== 'function'
    )
      throw unavailable();
    const authorize = descriptors.authorize.value.bind(
      port,
    ) as CommercialCustomerReaderPort['authorize'];
    const readIssued = descriptors.readIssued.value.bind(
      port,
    ) as CommercialCustomerReaderPort['readIssued'];
    const viewer = commercialCustomerTarget(data(input));
    const viewerIdentity = JSON.stringify(viewer);
    const local = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = Date.now(),
      deadline = start + 5000;
    let lastTime = start;
    const abort = () => local.abort();
    signal.addEventListener('abort', abort, { once: true });
    const check = () => {
      const now = Date.now();
      if (
        signal.aborted ||
        local.signal.aborted ||
        now < lastTime ||
        now >= deadline ||
        JSON.stringify(data(input)) !== viewerIdentity
      )
        throw unavailable();
      lastTime = now;
    };
    const work = async () => {
      let originalActor: BrokerActor | undefined,
        originalMapping: string | undefined;
      let until = Infinity;
      let verifiedSourceHash: string | undefined;
      const current = async () => {
        check();
        const proof = await authenticate.call(auth, bearer);
        check();
        const actor = Object.freeze(brokerActor(proof));
        if (
          actor.aal !== 'aal2' ||
          (originalActor &&
            JSON.stringify(actor) !== JSON.stringify(originalActor))
        )
          throw unavailable();
        originalActor = actor;
        const raw = await authorize(
          actor,
          Object.freeze({ ...viewer.invoice }),
          local.signal,
        );
        check();
        const mapping = record(raw, [
          'mode',
          'active',
          'userId',
          'sessionId',
          'organizationId',
          'customerId',
          'locationId',
          'invoiceId',
          'sourceVersionId',
          'sourceHash',
          'revision',
          'mappingRevision',
          'expiresAt',
        ]);
        if (
          mapping.mode !== 'fictional-local' ||
          mapping.active !== true ||
          mapping.userId !== actor.user_id ||
          mapping.sessionId !== actor.session_id ||
          typeof mapping.sourceHash !== 'string' ||
          !/^[a-f0-9]{64}$/.test(mapping.sourceHash) ||
          Object.entries(viewer.invoice).some(([k, v]) => mapping[k] !== v) ||
          typeof mapping.mappingRevision !== 'string' ||
          !mapping.mappingRevision.trim() ||
          !Number.isSafeInteger(mapping.expiresAt) ||
          Number(mapping.expiresAt) <= Date.now()
        )
          throw unavailable();
        const identity = JSON.stringify(mapping);
        if (originalMapping && identity !== originalMapping)
          throw unavailable();
        originalMapping = identity;
        verifiedSourceHash = mapping.sourceHash as string;
        // Mapping is an awaited boundary too. A last mapping call must not hide
        // a session revoked while that trusted read was in progress.
        const afterProof = await authenticate.call(auth, bearer);
        check();
        if (JSON.stringify(brokerActor(afterProof)) !== JSON.stringify(actor))
          throw unavailable();
        until = Math.min(
          Number(mapping.expiresAt),
          actor.expires_at * 1000,
          start + 30_000,
        );
        return actor;
      };
      const actor = await current();
      // Only the trusted server mapping supplies this private digest, after Auth.
      const privateViewer: InvoiceViewer = {
        ...viewer,
        invoice: { ...viewer.invoice, sourceHash: verifiedSourceHash! },
      };
      const first = data(
        await readIssued(
          actor,
          Object.freeze({ ...viewer.invoice }),
          local.signal,
        ),
      );
      check();
      const snapshot = customerInvoiceSnapshot(first, privateViewer);
      if (!snapshot.scope) throw unavailable();
      await current();
      const second = data(
        await readIssued(
          actor,
          Object.freeze({ ...viewer.invoice }),
          local.signal,
        ),
      );
      check();
      if (JSON.stringify(first) !== JSON.stringify(second)) throw unavailable();
      customerInvoiceSnapshot(second, privateViewer);
      await current();
      check();
      if (until <= Date.now()) throw unavailable();
      return Object.freeze({
        schema: 'commercial-customer-issued-read-v1' as const,
        mode: 'fictional-local' as const,
        sourceCategory: 'commercial-issued-proposal' as const,
        invoice: Object.freeze({
          invoiceId: snapshot.invoiceId,
          organizationId: snapshot.organizationId,
          customerId: snapshot.customerId,
          locationId: snapshot.locationId,
          sourceVersionId: snapshot.sourceVersionId,
          revision: snapshot.revision,
          number: snapshot.number,
          title: snapshot.title,
          currency: snapshot.currency,
          amountMinor: snapshot.amountMinor,
          issuedAt: snapshot.issuedAt,
          issuanceReceiptId: snapshot.issuanceReceiptId,
        }),
        observedAt: Date.now(),
        expiresAt: until,
        payment: Object.freeze({
          status: 'UNKNOWN' as const,
          balanceMinor: null,
          receipt: null,
        }),
        link: Object.freeze({
          status: 'DISABLED' as const,
          href: null,
          expiresAt: until,
        }),
        delivery: 'DISABLED' as const,
        resend: 'DISABLED' as const,
      });
    };
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          local.abort();
          reject(unavailable());
        }, 5000);
      });
      return await Promise.race([work(), timeout]);
    } catch {
      throw unavailable();
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      local.abort();
    }
  };
}
