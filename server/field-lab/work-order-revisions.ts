/** Test-only composition of the original C12 journal. No new database, table or business writer. */
import { createHash } from 'node:crypto';
import {
  executeScheduleRevision,
  reconcileScheduleRevision,
  type ScheduleRevisionCommand,
  type ScheduleRevisionAuthority,
} from './proposal-revisions.ts';

export interface WorkOrderRevisionCommand {
  schedule: ScheduleRevisionCommand;
  instructions: string;
  issued_scope_sha256: string;
}
export interface WorkOrderRevisionAuthority extends ScheduleRevisionAuthority {
  /** Independently retained canonical issued-scope/work-order witness. Never self-attestation. */
  checkWorkOrder: (command: WorkOrderRevisionCommand) => string;
}
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function data(value: unknown, active = new Set<object>()): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isSafeInteger(value))
  )
    return value;
  if (
    !value ||
    typeof value !== 'object' ||
    active.has(value) ||
    ![Object.prototype, Array.prototype, null].includes(
      Object.getPrototypeOf(value),
    )
  )
    throw Error('Exact primitive caller-held payload required');
  active.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value),
    keys = Reflect.ownKeys(value);
  if (
    keys.some(
      (k) => typeof k !== 'string' || !Object.hasOwn(descriptors[k], 'value'),
    )
  )
    throw Error('Payload getters/serializers unavailable');
  let result: unknown;
  if (Array.isArray(value)) {
    if (
      keys.length !== value.length + 1 ||
      Array.from({ length: value.length }, (_, i) => !descriptors[i]).some(
        Boolean,
      )
    )
      throw Error('Dense payload required');
    result = Array.from({ length: value.length }, (_, i) =>
      data(descriptors[i].value, active),
    );
  } else
    result = Object.fromEntries(
      (keys as string[]).map((k) => [k, data(descriptors[k].value, active)]),
    );
  active.delete(value);
  return result;
}
function on(a: ScheduleRevisionAuthority) {
  return (
    Object.getOwnPropertyDescriptor(a, 'enabled')?.value === true &&
    Object.getOwnPropertyDescriptor(a, 'test_only')?.value === true
  );
}
function payload(
  schedule: ScheduleRevisionCommand,
  instructions: string,
  scope: string,
) {
  if (
    typeof instructions !== 'string' ||
    !instructions ||
    instructions !== instructions.trim() ||
    instructions.length > 2000 ||
    typeof scope !== 'string' ||
    !/^[a-f0-9]{64}$/.test(scope)
  )
    throw Error(
      'Exact caller-held instructions and issued-scope digest required',
    );
  const s = data(schedule) as ScheduleRevisionCommand;
  if (
    !s ||
    Object.keys(s).sort().join(',') !==
      [
        'command_id',
        'expected_revision',
        'previous_receipt_id',
        'original',
        'proposal',
        'proposal_sha256',
        'action',
        'expires_at',
      ]
        .sort()
        .join(',')
  )
    throw Error('Exact C12 schedule command required');
  // Normalize command key order so equivalent own-data payloads bind identically.
  return {
    instructions,
    issued_scope_sha256: scope,
    schedule: {
      expected_revision: s.expected_revision,
      previous_receipt_id: s.previous_receipt_id,
      original: s.original,
      proposal: s.proposal,
      proposal_sha256: s.proposal_sha256,
      action: s.action,
      expires_at: s.expires_at,
    },
  };
}
/** Explicit preparation only. The digest is committed by C12 in its original command/receipt. */
export function bindWorkOrderRevisionCommand(
  schedule: ScheduleRevisionCommand,
  instructions: string,
  issued_scope_sha256: string,
  gate: { enabled?: boolean; test_only?: boolean },
): WorkOrderRevisionCommand {
  if (!on(gate as ScheduleRevisionAuthority))
    throw Error('Work-order lab is OFF');
  const p = payload(schedule, instructions, issued_scope_sha256);
  return {
    schedule: {
      ...(data(schedule) as ScheduleRevisionCommand),
      command_id: 'lab-workorder-' + hash(p),
    },
    instructions,
    issued_scope_sha256,
  };
}
function pin(command: WorkOrderRevisionCommand) {
  const c = data(command) as WorkOrderRevisionCommand;
  if (
    !c ||
    Object.keys(c).sort().join(',') !==
      'instructions,issued_scope_sha256,schedule'
  )
    throw Error('Complete exact caller-held work-order payload required');
  const p = payload(c.schedule, c.instructions, c.issued_scope_sha256);
  const digest = hash(p);
  if (c.schedule.command_id !== 'lab-workorder-' + digest)
    throw Error('Payload does not match the durable C12 command digest');
  const freeze = (value: unknown): void => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  };
  freeze(c);
  return { value: c, signature: hash(c), digest };
}
const unknown = () => ({
  status: 'UNKNOWN' as const,
  receipt: null,
  effective_state: 'UNKNOWN' as const,
  lineage: null,
  payload_custody: 'CALLER_HELD_DIGEST_ONLY' as const,
  replay: 'FORBIDDEN' as const,
  replacement: null,
});
function compose(
  command: WorkOrderRevisionCommand,
  authority: WorkOrderRevisionAuthority,
) {
  const pinned = pin(command);
  const callbacks = [
    'checkWorkOrder',
    'checkSource',
    'clock',
    'afterClaim',
    'beforeCommit',
    'afterCommit',
  ] as const;
  const captured = new Map<string, unknown>();
  for (const key of callbacks) {
    const d = Object.getOwnPropertyDescriptor(authority, key);
    const optional = ['afterClaim', 'beforeCommit', 'afterCommit'].includes(
      key,
    );
    if (
      (!d && !optional) ||
      (d &&
        (!Object.hasOwn(d, 'value') ||
          (typeof d.value !== 'function' &&
            !(optional && d.value === undefined))))
    )
      throw Error('Own-data trusted synthetic callbacks required');
    captured.set(key, d?.value);
  }
  const current = () => {
    if (
      !on(authority) ||
      pin(command).signature !== pinned.signature ||
      callbacks.some(
        (key) =>
          Object.getOwnPropertyDescriptor(authority, key)?.value !==
          captured.get(key),
      )
    )
      throw Error('Live work-order payload/gate/witness changed');
  };
  const check = () => {
    current();
    if (
      authority.checkWorkOrder(pinned.value) !==
      pinned.value.issued_scope_sha256
    )
      throw Error(
        'Current independent work-order source/staff/payload required',
      );
    current();
  };
  check();
  const a: ScheduleRevisionAuthority = {
    enabled: true,
    test_only: true,
    checkSource(envelope) {
      check();
      const sha = authority.checkSource(envelope);
      check();
      return sha;
    },
    clock() {
      check();
      const now = authority.clock();
      check();
      return now;
    },
  };
  for (const key of ['afterClaim', 'beforeCommit', 'afterCommit'] as const)
    if (authority[key])
      a[key] = () => {
        check();
        authority[key]?.();
        check();
      };
  return { ...pinned, check, authority: a };
}
function result(
  f: ReturnType<typeof compose>,
  r: ReturnType<typeof reconcileScheduleRevision>,
) {
  f.check();
  if (!r.receipt || r.status !== 'EXACT_RECEIPT') return unknown();
  const s = f.value.schedule,
    original = s.original.envelope,
    proposed = s.proposal;
  return {
    ...r,
    payload_custody: 'CALLER_HELD_DIGEST_ONLY' as const,
    lineage: Object.freeze({
      payload_sha256: f.digest,
      issued_scope_sha256: f.value.issued_scope_sha256,
      organization_id: original.organization_id,
      customer_id: original.customer_id,
      property_id: original.property_id,
      job_id: original.job_id,
      job_revision: original.job_revision,
      estimate_id: original.estimate_id,
      issued_version_id: original.issued_version_id,
      issued_version_number: original.issued_version_number,
      original_worker_id: original.worker_id,
      proposed_worker_id: proposed.worker_id,
      visit_id: original.visit_id,
      visit_revision: original.visit_revision,
      plan_id: original.plan_id,
      plan_revision: original.plan_revision,
      original_source_sha256: original.source_sha256,
      proposed_source_sha256: proposed.source_sha256,
      previous_receipt_id: s.previous_receipt_id,
      receipt_id: r.receipt.receipt_id,
      saved_revision: r.receipt.revision,
      instructions: f.value.instructions,
      full_content_persisted: false,
      business_write: false,
      dispatch: false,
    }),
  };
}
/** A finite test call through the actual C12 permanent claim/CAS/cancel/revoke APIs. */
export function executeWorkOrderRevision(
  crewPath: string,
  path: string,
  command: WorkOrderRevisionCommand,
  authority: WorkOrderRevisionAuthority,
) {
  if (!on(authority)) throw Error('Work-order lab is OFF');
  try {
    const f = compose(command, authority);
    return result(
      f,
      executeScheduleRevision(crewPath, path, command.schedule, f.authority),
    );
  } catch {
    return unknown();
  }
}
/** Exact caller-held payload and original receipts only. Missing content never triggers a write. */
export function reconcileWorkOrderRevision(
  crewPath: string,
  path: string,
  command: WorkOrderRevisionCommand,
  authority: WorkOrderRevisionAuthority,
) {
  if (!on(authority)) return unknown();
  try {
    const f = compose(command, authority);
    return result(
      f,
      reconcileScheduleRevision(crewPath, path, command.schedule, f.authority),
    );
  } catch {
    return unknown();
  }
}
