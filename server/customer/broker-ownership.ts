import type { CustomerSqlConnection } from './request-gateway';
const requiredOwners = {
  customer_request_body: 'customer4b_core',
  customer_request_roles_ok: 'customer4b_core',
  customer_request_principal_integrity: 'customer4b_core',
  customer_request_principal: 'customer4b_core',
  customer_request_reference: 'customer4b_core',
  customer_request_exact: 'customer4b_core',
  customer_decision_integrity: 'customer4b_core',
  customer_request_receipt_row: 'customer4b_core',
  customer_record_decision: 'customer4b_core',
  customer_review_request_receipt: 'customer4b_core',
  customer_review_request_status: 'customer4b_core',
  customer_broker_runtime_role: 'customer4b_core',
  customer_broker_role_review: 'customer4b_core',
  customer_broker_transaction: 'customer4b_core',
  customer_request_claim: 'customer4b_core',
  customer_record_review_request: 'customer4b_core',
  customer_broker_endpoint: 'customer4b_core',
  customer_broker_claim_integrity: 'customer4b_core',
  customer_broker_admit: 'customer4b_admission_owner',
  customer_broker_identity: 'customer4b_reader_owner',
  customer_broker_receipt: 'customer4b_reader_owner',
  customer_broker_staff_read: 'customer4b_reader_owner',
} as const;
/** Read-only catalog evidence. NEVER turns local ownership into operational authority. */
export async function reviewCustomerBrokerOwnership(
  connection: CustomerSqlConnection,
) {
  const functions = (
    await connection.query<{
      name: string;
      owner: string;
      login: boolean;
      elevated: boolean;
      definer: boolean;
      settings: string[] | null;
      exposed: boolean;
    }>(
      `select p.proname name,r.rolname owner,r.rolcanlogin login,
    (r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolinherit) elevated,
    p.prosecdef definer,p.proconfig settings,
    exists(select 1 from unnest(array['anon','authenticated','service_role']) u where has_function_privilege(u,p.oid,'EXECUTE')) exposed
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
    where n.nspname='private' and p.proname=any($1::text[])`,
      [Object.keys(requiredOwners)],
    )
  ).rows;
  if (
    functions.length !== Object.keys(requiredOwners).length ||
    functions.some(
      (f) =>
        f.owner !== requiredOwners[f.name as keyof typeof requiredOwners] ||
        f.login ||
        f.elevated ||
        f.definer !==
          !['customer_request_body', 'customer_request_reference'].includes(
            f.name,
          ) ||
        f.exposed ||
        !f.settings?.includes('search_path=""'),
    )
  )
    throw Error('Broker ownership or API privilege drift');
  const policies = (
    await connection.query<{
      name: string;
      rls: boolean;
      forced: boolean;
      owned: boolean;
    }>(
      `select c.relname name,c.relrowsecurity rls,c.relforcerowsecurity forced,
    r.rolname in('customer4b_core','customer4b_admission_owner','customer4b_reader_owner') owned
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner
    where n.nspname='private' and c.relname=any($1::text[])`,
      [
        [
          'customer_request_principals',
          'customer_request_intents',
          'customer_request_outcomes',
          'customer_broker_admissions',
        ],
      ],
    )
  ).rows;
  if (
    policies.length !== 4 ||
    policies.some((x) => !x.rls || !x.forced || x.owned)
  )
    throw Error('Broker default-deny table ownership drift');
  const memberships = (
    await connection.query<{
      member: string;
      parent: string;
      inherit: boolean;
      can_set: boolean;
    }>(
      `select b.rolname member,a.rolname parent,m.inherit_option inherit,m.set_option can_set from pg_auth_members m join pg_roles a on a.oid=m.roleid join pg_roles b on b.oid=m.member where b.rolname=any($1::text[])`,
      [
        [
          'customer4b_core',
          'customer4b_admission_owner',
          'customer4b_reader_owner',
          'customer4b_registrar',
          'customer4b_reader',
        ],
      ],
    )
  ).rows;
  if (
    memberships.length !== 1 ||
    memberships[0].member !== 'customer4b_core' ||
    memberships[0].parent !== 'pg_read_all_stats' ||
    !memberships[0].inherit ||
    memberships[0].can_set
  )
    throw Error('Broker role inheritance/SET authority drift');
  // Definers need identity columns, never private estimate payloads or Auth PII.
  for (const [role, table, allowed] of [
    [
      'customer4b_core',
      'public.estimate_versions',
      ['id', 'organization_id', 'estimate_id', 'version_number'],
    ],
    ['customer4b_core', 'auth.sessions', ['id', 'user_id', 'not_after']],
    [
      'customer4b_reader_owner',
      'auth.users',
      [
        'id',
        'email_confirmed_at',
        'deleted_at',
        'is_anonymous',
        'banned_until',
      ],
    ],
  ] as const) {
    const columns = (
      await connection.query<{ name: string; readable: boolean }>(
        `select a.attname name,has_column_privilege($1,c.oid,a.attnum,'SELECT') readable
        from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
        where n.nspname||'.'||c.relname=$2 and a.attnum>0 and not a.attisdropped`,
        [role, table],
      )
    ).rows;
    if (
      columns.length < allowed.length ||
      columns.some(
        (c) => c.readable !== (allowed as readonly string[]).includes(c.name),
      )
    )
      throw Error('Broker private-column privilege drift');
  }
  const dependencies = (
    await connection.query<{ name: string; elevated: boolean }>(
      `select p.proname name,(r.rolsuper or r.rolbypassrls) elevated from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='private' and p.proname=any($1::text[])`,
      [
        [
          'customer_portal_guard',
          'customer_issued_review',
          'property_connected_session',
          'customer_change_request_queue',
          'audit_change',
          'release_immutable',
        ],
      ],
    )
  ).rows;
  return {
    scopedOwnershipVerified: true as const,
    operationalReady: false as const,
    historicalPrivilegedDependencies: dependencies
      .filter((x) => x.elevated)
      .map((x) => x.name)
      .sort(),
    remainingTrust: [
      'Genuine Auth and session provider acceptance',
      'Historical helper/installer TCB review',
      'Core private-schema CREATE and cluster statistics access',
      'Dedicated connection/credential custody',
      'External database-restore/rollback detection and recovery',
      'Exact target, grants and owner authorization',
    ],
  };
}
