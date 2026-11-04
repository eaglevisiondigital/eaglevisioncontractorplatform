// Offline source/evidence validation only. No network, credentials or business IO.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  cycle25Authors,
  cycle25Parent,
  cycle25SourcePorts,
  inspectCycle25Sources,
} from './cycle25-source-lineage.mjs';
import {
  checkCycle24Preservation,
  validateCycle24Manifest,
  cycle24ApplicationSuites,
} from './check-cycle24.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const operations = Object.freeze({
  task_correction: [
    'src/lib/workflows/saved-revision-exercise.ts',
    'src/lib/phase3.ts',
  ],
  material_labor_review: [
    'src/lib/phase3.ts',
    'src/domain/jobs/financials.ts',
    'src/lib/workflows/saved-revision-exercise.ts',
  ],
  intake_review: [
    'src/lib/operations.ts',
    'src/lib/workflows/saved-revision-exercise.ts',
  ],
  published_service_history: [
    'src/lib/property.ts',
    'src/lib/workflows/service-source-review.ts',
    'src/domain/customer/review.ts',
  ],
  maintenance_review: [
    'src/lib/property.ts',
    'src/lib/workflows/plan-cancellation-review.ts',
  ],
  owner_priority_navigation: [
    'src/lib/workflows/priority-actions.ts',
    'src/lib/workflows/verified-owner-briefing.ts',
  ],
  offline_source_admission: [
    'src/lib/workflows/offline-source-admission.ts',
    'src/lib/workflows/offline-source-protocol.ts',
  ],
  customer_decision_broker: [
    'src/lib/customer-requests.ts',
    'server/customer/request-gateway.ts',
    'server/customer/broker.ts',
    'server/customer/broker-auth.ts',
  ],
});
const receiptRequirements = [
  'original_canonical_owner',
  'exact_tenant_and_actor_session',
  'original_command_and_source_digest',
  'expected_and_result_revision',
  'native_event_and_result_ids',
  'atomic_consumer_commit',
  'append_only_uniqueness',
  'authenticated_integrity_and_key_witness',
  'success_ack_after_commit_and_required_custody_durability',
  'exact_read_only_unknown_reconciliation',
];
const recoveryRequirements = [
  'independent_spent_claim_epoch_or_fence',
  'all_writer_participation',
  'matched_database_timeline_schema_revision_receipt_watermark',
  'matched_object_versions_custody_epoch_protected_key_references',
  'current_external_revocation_after_restore',
  'fenced_quarantine_before_admission',
  'independent_measured_RPO_RTO',
  'no_unknown_replay_or_replacement_ids',
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function validateCycle25Readiness(r, supplied = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied };
  if (
    !r ||
    r.schema !== 'propel-cycle25-operational-readiness-v1' ||
    r.source_commit !== cycle25Parent ||
    r.scope !== 'DOCUMENTATION_ONLY_SOURCE_SPECIFIC_OPERATIONAL_DEPENDENCIES' ||
    r.status !== 'NO_GO_FOR_OPERATIONAL_IMPLEMENTATION' ||
    r.release !== 'NOT_READY_NOT_AUTHORIZED'
  )
    throw Error('Exact documentation-only NO_GO scope required');
  for (const key of [
    'operational_ready',
    'implementation_authorized',
    'schema_authorized',
    'genuine_auth_verified',
  ])
    if (r[key] !== false) throw Error('No operational authority accepted');
  if (
    r.hosted_acceptance !== 'NOT_RUN' ||
    r.operational_receipts !== 'NOT_ACCEPTED' ||
    r.external_rollback_fence !== 'OWNER_UNASSIGNED_NOT_ACCEPTED' ||
    r.matched_backup_set !== 'NOT_ACCEPTED' ||
    r.RPO !== 'UNMEASURED' ||
    r.RTO !== 'UNMEASURED'
  )
    throw Error('Unaccepted operational custody and recovery required');
  const priorPath = 'docs/program/CYCLE24_RESTART_READINESS.json',
    prior = ports.git(cycle25Parent, priorPath),
    priorRegister = JSON.parse(prior);
  const ids = Array.from(
    { length: 19 },
    (_, i) => `R${String(i + 1).padStart(2, '0')}`,
  );
  if (
    r.previous_register?.path !== priorPath ||
    r.previous_register.sha256 !== sha(prior) ||
    !same(r.previous_register.original_requirements, ids) ||
    !Buffer.from(ports.read(priorPath)).equals(Buffer.from(prior)) ||
    !same(
      priorRegister.requirements.map((x) => x.id),
      ids,
    )
  )
    throw Error('Original nineteen requirements preserved exactly');
  if (
    !Array.isArray(r.operations) ||
    !same(
      r.operations.map((x) => x.id),
      Object.keys(operations),
    )
  )
    throw Error(
      'Exactly eight source-specific native operation families required',
    );
  for (const op of r.operations) {
    if (!same(op.source_paths, operations[op.id]))
      throw Error('Exact finite native source references required');
    if (
      op.operational_owner !== 'UNASSIGNED_OR_UNVERIFIED' ||
      op.status !== 'NOT_ACCEPTED' ||
      op.operational_acceptance !== 'NOT_RUN' ||
      op.authority_granted !== false ||
      op.schema_authorized !== false ||
      op.adapter_authorized !== false
    )
      throw Error('Operational owner and authority remain unaccepted');
    const readOnly = [
      'published_service_history',
      'owner_priority_navigation',
      'offline_source_admission',
    ].includes(op.id);
    if (op.operation_kind !== (readOnly ? 'READ_ONLY' : 'MUTATION_FUTURE'))
      throw Error('Read-only sources cannot become mutation authority');
    if (
      !Array.isArray(op.requirements) ||
      !op.requirements.length ||
      new Set(op.requirements).size !== op.requirements.length ||
      op.requirements.some((x) => !ids.includes(x))
    )
      throw Error('Original exact dependency IDs required');
    for (const field of [
      'native_owner',
      'current_local_contract',
      'required_consistency_boundary',
      'required_evidence',
    ])
      if (typeof op[field] !== 'string' || !op[field].trim())
        throw Error('Specific owner, boundary and receipt gap required');
  }
  const sourcePaths = [...new Set(Object.values(operations).flat())].sort();
  if (
    !Array.isArray(r.source_evidence) ||
    !same(
      r.source_evidence.map((x) => x.path),
      sourcePaths,
    )
  )
    throw Error('Finite source evidence must be admitted before any file read');
  for (const f of r.source_evidence) {
    const bytes = ports.git(cycle25Parent, f.path);
    if (f.sha256 !== sha(bytes) || f.bytes !== bytes.length)
      throw Error('Exact original Git source bytes required');
  }
  if (
    !same(r.receipt_requirements, receiptRequirements) ||
    !same(r.recovery_requirements, recoveryRequirements)
  )
    throw Error(
      'All receipt, matching, fencing and no-replay requirements retained',
    );
  if (
    !same(r.physical_recovery, {
      status: 'UNVERIFIED_NOT_RUN',
      device_update: 'OWNER_LAST_REPORTED_UNAVAILABLE',
      kit_changed: false,
      prior_25_offline_checks_repeated: false,
      procedure: 'docs/program/CYCLE18_NOV4_MACBOOK_AIR_CHECKLIST.md',
      quickcard: 'docs/program/CYCLE19_NOV4_RECOVERY_QUICKCARD.md',
      credential_scope: 'SYNTHETIC_ONLY_NO_PRODUCTION_CREDENTIALS',
    })
  )
    throw Error('No physical recovery PASS or repeated setup may be inferred');
  if (
    !same(r.preserved_sequence, [
      'original_approved_frozen_P1_scope_remains_valid_after_original_recovery_prerequisites_on13',
      'customer14_requires_separate_exact_authorization',
      'original4B_and_broker_require_separate_exact_ownership_hash_grants_mapping_target_acceptance',
      'genuine_Auth_MFA_and_action_specific_hosted_recovery_remain_unverified',
      'NMI_settlement_financial_provider_Netlify_production_gates_remain_closed',
    ])
  )
    throw Error(
      'Original P1 approval and separate customer14/4B sequence preserved',
    );
  return {
    operations: 8,
    original_dependencies: 19,
    source_references: sourcePaths.length,
    operational_ready: false,
    restore_adapter: false,
    physical_recovery: 'UNVERIFIED_NOT_RUN',
  };
}
export function cycle25FeatureSuites() {
  return {
    ...cycle24ApplicationSuites(),
    ...Object.fromEntries(
      cycle25Authors.map((x) => [`tests/cycle25-${x.module}.test.ts`, x.cases]),
    ),
  };
}
export function cycle25ApplicationSuites() {
  return {
    ...cycle25FeatureSuites(),
    'tests/cycle25-source-lineage.test.ts': 26,
    'tests/cycle25-validation.test.ts': 27,
    'tests/cycle25-combined-integration.test.ts': 16,
  };
}
export function validateCycle25ApplicationReport(
  report,
  expected = cycle25ApplicationSuites(),
  cwd = process.cwd(),
) {
  const pending = new Set(Object.keys(expected)),
    names = new Set();
  let count = 0;
  if (
    !report ||
    report.success !== true ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    !Array.isArray(report.testResults)
  )
    throw Error('Actual complete application PASS required');
  for (const suite of report.testResults) {
    const path = relative(cwd, resolve(suite.name)).split('\\').join('/');
    if (
      !pending.delete(path) ||
      suite.status !== 'passed' ||
      !Number.isSafeInteger(expected[path]) ||
      expected[path] < 1 ||
      suite.assertionResults?.length !== expected[path]
    )
      throw Error('Exact unique current suites and counts required');
    for (const result of suite.assertionResults) {
      if (
        result.status !== 'passed' ||
        typeof result.fullName !== 'string' ||
        !result.fullName.trim() ||
        names.has(result.fullName)
      )
        throw Error('No skipped, pending, duplicate or failed assertions');
      names.add(result.fullName);
      count++;
    }
  }
  if (
    pending.size ||
    report.numTotalTests !== count ||
    report.numPassedTests !== count
  )
    throw Error('Omitted or extra cases cannot prove acceptance');
  return {
    suites: Object.keys(expected).length,
    cases: count,
    status: 'PASS',
    business_authority: false,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
  console.log(JSON.stringify(inspectCycle25Sources({ requireCombined: true })));
  console.log(
    JSON.stringify(
      validateCycle24Manifest(
        json('docs/program/CYCLE24_SOURCE_MANIFEST.json'),
        { requireIndependent: true },
      ),
    ),
  );
  console.log(JSON.stringify(checkCycle24Preservation()));
  console.log(
    JSON.stringify(
      validateCycle25Readiness(
        json('docs/program/CYCLE25_OPERATIONAL_READINESS.json'),
      ),
    ),
  );
  if (process.argv.includes('--application'))
    console.log(
      JSON.stringify(
        validateCycle25ApplicationReport(
          json('artifacts/cycle25/application-results.json'),
          process.argv.includes('--feature-only')
            ? cycle25FeatureSuites()
            : cycle25ApplicationSuites(),
        ),
      ),
    );
}
