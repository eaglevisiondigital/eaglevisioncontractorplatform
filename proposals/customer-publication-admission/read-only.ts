import { isProxy } from 'node:util/types';
import {
  runWithCommercialCaller,
  type CommercialCallerConnection,
} from '../../server/invoices/commercial-caller-connection';
import type { GatewaySql } from '../../server/payments/postgres-store';
import { customerPaymentPublicationReader } from '../customer-payment-publication/reader';
import {
  paymentPublicationTarget,
  type PaymentPublicationTarget,
} from '../customer-payment-publication/contract';
import { assertPublicationSources } from './source';
const unavailable = () =>
  Error('Current restricted customer publication unavailable');
const retired = new WeakSet<GatewaySql>();
// Catalog qualification only. It neither grants permissions nor trusts a caller DTO.
export const customerPublicationRoleQuery = `select session_user::text login,current_user::text current_role,
 r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
 (select count(*)::integer from pg_auth_members m where m.member=r.oid) memberships,
 (select p.proowner<>r.oid and has_function_privilege(session_user,p.oid,'EXECUTE') and exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=r.oid and a.privilege_type='EXECUTE') and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where (a.grantee=0 or (a.grantee=r.oid and a.is_grantable)) and a.privilege_type='EXECUTE') from pg_proc p where p.oid='private.customer_payment_receipt(uuid,uuid,uuid,uuid,uuid)'::regprocedure) receipt_execute,
 (select n.nspowner<>r.oid and exists(select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where a.grantee=r.oid and a.privilege_type='USAGE') and not exists(select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where (a.grantee=0 or (a.grantee=r.oid and a.is_grantable)) and a.privilege_type='USAGE') from pg_namespace n where n.nspname='private') schema_usage,
 exists(select 1 from pg_namespace n where n.nspname in ('private','public','auth','storage') and has_schema_privilege(session_user,n.oid,'CREATE')) schema_create,
 exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('private','public','auth','storage') and c.relkind in ('r','p','v','m','f') and (has_table_privilege(session_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(session_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) raw_table_access,
 exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public','auth','storage') and p.prosecdef and p.oid<>'private.customer_payment_receipt(uuid,uuid,uuid,uuid,uuid)'::regprocedure and has_schema_privilege(session_user,n.oid,'USAGE') and has_function_privilege(session_user,p.oid,'EXECUTE')) other_definer
 from pg_roles r where r.rolname=session_user`;
function data(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    isProxy(value) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(value))
  )
    throw unavailable();
  const d = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(d).length !== keys.length ||
    keys.some((k) => !d[k] || !('value' in d[k]))
  )
    throw unavailable();
  return Object.fromEntries(keys.map((k) => [k, d[k].value])) as Record<
    string,
    unknown
  >;
}
function profile(value: unknown) {
  const r = data(value, [
    'login',
    'current_role',
    'rolcanlogin',
    'rolsuper',
    'rolbypassrls',
    'rolcreatedb',
    'rolcreaterole',
    'rolreplication',
    'memberships',
    'receipt_execute',
    'schema_usage',
    'schema_create',
    'raw_table_access',
    'other_definer',
  ]);
  if (
    typeof r.login !== 'string' ||
    !/^[a-z][a-z0-9_]{0,62}$/.test(r.login) ||
    [
      'postgres',
      'ev_test',
      'supabase_admin',
      'authenticator',
      'authenticated',
      'service_role',
      'anon',
    ].includes(r.login) ||
    r.current_role !== r.login ||
    r.rolcanlogin !== true ||
    r.memberships !== 0 ||
    r.receipt_execute !== true ||
    r.schema_usage !== true ||
    [
      'rolsuper',
      'rolbypassrls',
      'rolcreatedb',
      'rolcreaterole',
      'rolreplication',
      'schema_create',
      'raw_table_access',
      'other_definer',
    ].some((k) => r[k] !== false)
  )
    throw unavailable();
  return JSON.stringify(r);
}
/** Source-only, default OFF. Uses the existing opaque Auth/backend caller guard
 * and #480 exact receipt reader, never a connection/Auth/role/provisioning factory.
 * The supplied physical connection must be exclusively owned by the trusted host.
 * Local retirement is not durable custody, alias fencing or qualified pool discard.
 */
export function restrictedPublicationRead(
  connection: GatewaySql,
  caller: CommercialCallerConnection | undefined,
  options: { enabled: boolean; mode: 'disposable-proposal' } = {
    enabled: false,
    mode: 'disposable-proposal',
  },
) {
  return async (input: PaymentPublicationTarget, signal: AbortSignal) => {
    let timer: ReturnType<typeof setTimeout> | undefined,
      cancel: (() => void) | undefined;
    let began = false;
    const start = Date.now(),
      deadline = start + 5000;
    const gate = () => {
      const o = data(options, ['enabled', 'mode']);
      if (
        o.enabled !== true ||
        o.mode !== 'disposable-proposal' ||
        retired.has(connection) ||
        signal.aborted ||
        Date.now() < start ||
        Date.now() >= deadline
      )
        throw unavailable();
      assertPublicationSources();
      if (
        signal.aborted ||
        retired.has(connection) ||
        Date.now() < start ||
        Date.now() >= deadline
      )
        throw unavailable();
    };
    try {
      gate();
      if (isProxy(input) || isProxy(connection)) throw unavailable();
      const target = paymentPublicationTarget(input),
        identity = JSON.stringify(target);
      const current = () => {
        gate();
        if (JSON.stringify(paymentPublicationTarget(input)) !== identity)
          throw unavailable();
      };
      began = true;
      const work = runWithCommercialCaller(
        caller,
        connection,
        async (context) => {
          current();
          const inspect = async () => {
            current();
            const response = await context.query(customerPublicationRoleQuery);
            current();
            const envelope = data(response, ['rows']);
            const rows = envelope.rows;
            if (!Array.isArray(rows) || isProxy(rows) || rows.length !== 1)
              throw unavailable();
            const row = Object.getOwnPropertyDescriptor(rows, '0');
            if (!row || !('value' in row)) throw unavailable();
            return profile(row.value);
          };
          const before = await inspect();
          const read = customerPaymentPublicationReader(
            { query: context.query },
            { enabled: true, mode: 'disposable-proposal' },
          );
          const receipt = await read(target, signal);
          current();
          if ((await inspect()) !== before) throw unavailable();
          current();
          return receipt;
        },
      );
      const result = await new Promise<Awaited<typeof work>>(
        (resolve, reject) => {
          cancel = () => reject(unavailable());
          timer = setTimeout(cancel, Math.max(1, deadline - Date.now()));
          signal.addEventListener('abort', cancel, { once: true });
          if (signal.aborted) {
            cancel();
            return;
          }
          work.then(resolve, () => reject(unavailable()));
        },
      );
      current();
      return result;
    } catch {
      if (began && connection && typeof connection === 'object')
        retired.add(connection);
      throw unavailable();
    } finally {
      if (timer) clearTimeout(timer);
      if (cancel) signal.removeEventListener('abort', cancel);
    }
  };
}
