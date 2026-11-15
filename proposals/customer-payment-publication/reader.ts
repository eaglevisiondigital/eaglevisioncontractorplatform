import { isProxy } from 'node:util/types';
import type { GatewaySql } from '../../server/payments/postgres-store';
import {
  customerPaymentReceipt,
  paymentPublicationTarget,
  type PaymentPublicationTarget,
} from './contract';
const sql =
  'select private.customer_payment_receipt($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) receipt';
/** Default OFF, disposable-only source candidate. No Auth/connection factory,
 * credentials, route or publisher. Backend customer/session/grant guards mandatory.
 * Logical cancellation withholds late data; SQL cancellation/pool reuse unqualified.
 */
export function customerPaymentPublicationReader(
  connection: GatewaySql,
  options: { enabled: boolean; mode: 'disposable-proposal' } = {
    enabled: false,
    mode: 'disposable-proposal',
  },
) {
  return async (input: PaymentPublicationTarget, signal: AbortSignal) => {
    const settings = () => {
      if (isProxy(options)) throw Error('Current payment receipt unavailable');
      const d = Object.getOwnPropertyDescriptors(options);
      if (
        Reflect.ownKeys(d).length !== 2 ||
        !d.enabled ||
        !('value' in d.enabled) ||
        d.enabled.value !== true ||
        !d.mode ||
        !('value' in d.mode) ||
        d.mode.value !== 'disposable-proposal'
      )
        throw Error('Current payment receipt unavailable');
    };
    settings();
    if (
      options.enabled !== true ||
      options.mode !== 'disposable-proposal' ||
      isProxy(connection) ||
      isProxy(input)
    )
      throw Error('Current payment receipt unavailable');
    const target = paymentPublicationTarget(input),
      identity = JSON.stringify(target),
      start = Date.now(),
      deadline = start + 5000;
    const descriptor = Object.getOwnPropertyDescriptor(connection, 'query');
    if (
      !descriptor ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'function'
    )
      throw Error('Current payment receipt unavailable');
    const query = descriptor.value.bind(connection) as GatewaySql['query'];
    let timer: ReturnType<typeof setTimeout> | undefined,
      cancel: (() => void) | undefined;
    const check = () => {
      settings();
      if (
        signal.aborted ||
        Date.now() < start ||
        Date.now() >= deadline ||
        JSON.stringify(paymentPublicationTarget(input)) !== identity
      )
        throw Error('Current payment receipt unavailable');
    };
    try {
      check();
      const response = await new Promise<{ rows: Record<string, unknown>[] }>(
        (resolve, reject) => {
          cancel = () => reject(Error('Current payment receipt unavailable'));
          timer = setTimeout(cancel, 5000);
          signal.addEventListener('abort', cancel, { once: true });
          if (signal.aborted) {
            cancel();
            return;
          }
          Promise.resolve(
            query(sql, [
              target.organizationId,
              target.customerId,
              target.locationId,
              target.invoiceId,
              target.publicationId,
            ]),
          ).then(resolve, () =>
            reject(Error('Current payment receipt unavailable')),
          );
        },
      );
      check();
      if (isProxy(response) || !response || typeof response !== 'object')
        throw Error('Current payment receipt unavailable');
      const d = Object.getOwnPropertyDescriptors(response);
      if (Reflect.ownKeys(d).length !== 1 || !d.rows || !('value' in d.rows))
        throw Error('Current payment receipt unavailable');
      const rows = d.rows.value;
      if (!Array.isArray(rows) || isProxy(rows) || rows.length !== 1)
        throw Error('Current payment receipt unavailable');
      const row = Object.getOwnPropertyDescriptor(rows, '0');
      if (!row || !('value' in row) || isProxy(row.value))
        throw Error('Current payment receipt unavailable');
      const item = Object.getOwnPropertyDescriptors(row.value);
      if (
        Reflect.ownKeys(item).length !== 1 ||
        !item.receipt ||
        !('value' in item.receipt) ||
        isProxy(item.receipt.value)
      )
        throw Error('Current payment receipt unavailable');
      const receipt = customerPaymentReceipt(item.receipt.value, target);
      if (receipt.observedAt < start)
        throw Error('Current payment receipt unavailable');
      check();
      return receipt;
    } catch {
      throw Error('Current payment receipt unavailable');
    } finally {
      if (timer) clearTimeout(timer);
      if (cancel) signal.removeEventListener('abort', cancel);
    }
  };
}
