import featureEvidence from '../../../docs/FEATURE_ACCEPTANCE_EVIDENCE.json';
import customerApproval from '../../../docs/CUSTOMER_AUTHORIZATION_APPROVAL_REGISTER.json';
import scopeProposal from '../../../docs/program/CYCLE33_V1_SCOPE_MATRIX.md?raw';
import ownerDecisions from '../../../docs/program/CYCLE31_OPERATIONAL_OWNER_DECISIONS.json';
import ciCloseout from '../../../docs/program/CYCLE33_V1_INTEGRATION_CLOSEOUT.json';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import { freezePrototype } from '../program/prototype-source';
const phaseOne = [
  [
    'Independent physical recovery',
    'BLOCKED',
    'docs/TWO_COMPUTER_REHEARSAL.md',
    'Pairing, independent power/network and primary-loss acceptance remain separate.',
  ],
  [
    'Original P1 on thirteen histories',
    'BLOCKED',
    'docs/PROPERTY_P1_REAUTHORIZATION_PREFLIGHT.md',
    'Existing exact approval persists; mandatory recovery and action-time preflight remain.',
  ],
  [
    'Customer14 installation and acceptance',
    customerApproval.hostedMigration,
    'docs/CUSTOMER_AUTHORIZATION_APPROVAL_REGISTER.json',
    'No new grants, mappings, leases or real customer access.',
  ],
  [
    '4B / broker operational custody',
    'BLOCKED',
    'docs/CUSTOMER_BROKER_INTEGRATION.md',
    'Genuine principal, helper ownership, external restore and custody remain unverified.',
  ],
  [
    'Genuine Auth and MFA',
    'NOT_ACCEPTED',
    'SECURITY_MODEL.md',
    'Synthetic staff admission is not genuine session or MFA acceptance.',
  ],
  [
    'NMI / financial acceptance',
    'NOT_ACCEPTED',
    'docs/RELEASE_1_0_ACCEPTANCE.md',
    'Merchant, token, genuine settlement, reconciliation and provider acceptance remain separate.',
  ],
  [
    'Netlify runtime and protection',
    'BLOCKED',
    'docs/NETLIFY_REPLACEMENT_EXECUTOR.md',
    'Frozen package and offline executor do not authorize creation, upload or publication.',
  ],
  [
    'Production and release approval',
    'NOT_AUTHORIZED',
    'docs/RELEASE_1_0_ACCEPTANCE.md',
    'Local implementation and green CI never authorize launch.',
  ],
] as const;

/** Read the existing proposal table; never promote a proposed tier to approval. */
export function projectV1ScopeProposal(text: string, ids: readonly string[]) {
  const section = text.split('## Current bounded implementation package')[0];
  const entries = section.split('\n').flatMap((line) => {
    const cells = line.split('|').map((cell) => cell.trim());
    if (!/^[A-Z]{2,3}-\d{3}$/.test(cells[1] ?? '')) return [];
    const boundary = cells[2]?.replaceAll('**', '');
    if (!boundary || !/Essential|Optional|Post-Launch/.test(boundary))
      throw Error('Original explicit V1 scope proposal required');
    return [{ id: cells[1], boundary, next: cells[4] ?? '' }];
  });
  if (
    ids.length !== 25 ||
    new Set(ids).size !== 25 ||
    entries.length !== ids.length ||
    new Set(entries.map((entry) => entry.id)).size !== ids.length ||
    entries.some((entry) => !ids.includes(entry.id) || !entry.next)
  )
    throw Error('Exact25 original scope identities required');
  return entries;
}

export type PilotEvidenceFilter =
  | 'all'
  | 'local'
  | 'ci'
  | 'operational'
  | 'owner'
  | 'security'
  | 'optional'
  | 'post-launch';

export function filterPilotFeatures(
  features: ReturnType<typeof readPilotScorecard>['features'],
  query: string,
  filter: PilotEvidenceFilter,
) {
  if (
    ![
      'all',
      'local',
      'ci',
      'operational',
      'owner',
      'security',
      'optional',
      'post-launch',
    ].includes(filter)
  )
    throw Error('Declared evidence filter required');
  const literal = query.slice(0, 100).toLowerCase();
  return features.filter((feature) => {
    if (
      !(feature.id + ' ' + feature.capability).toLowerCase().includes(literal)
    )
      return false;
    if (filter === 'local') return feature.local !== 'none';
    if (filter === 'ci') return feature.ci.state === 'retained_baseline';
    if (filter === 'operational') return false; // No new genuine acceptance in this register.
    if (filter === 'owner') return true; // All proposed tiers still require the owner's decision.
    if (filter === 'security') return feature.hosted === 'blocked';
    if (filter === 'optional') return feature.v1.boundary.includes('Optional');
    if (filter === 'post-launch')
      return feature.v1.boundary.includes('Post-Launch');
    return true;
  });
}
/** Allowlisted source-evidenced pilot view. Not a new acceptance authority. */
export function readPilotScorecard(
  sources: OperatingSources,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const capture = captureOperatingSources(sources, gate);
  const tiers = projectV1ScopeProposal(
    scopeProposal,
    featureEvidence.features.map((f) => f.id),
  );
  const contractor = sources.company.name;
  const features = featureEvidence.features.map((f) => ({
    id: f.id,
    capability: f.capability,
    design: f.design,
    local: f.local,
    ci: {
      state: f.ci.state,
      commit: 'commit' in f.ci ? String(f.ci.commit) : null,
    },
    hosted: f.hosted,
    release: f.release,
    source: f.sources[0]?.path ?? null,
    evidence_sources: f.sources.map((s) => ({
      path: s.path,
      anchor: s.anchor,
    })),
    next: f.next,
    v1: {
      ...tiers.find((tier) => tier.id === f.id)!,
      decision: 'PROPOSED_OWNER_DECISION_REQUIRED' as const,
      operational: 'NOT_ACCEPTED' as const,
    },
  }));
  if (
    features.length !== 25 ||
    new Set(features.map((f) => f.id)).size !== 25 ||
    features.some((f) => f.release !== 'not_authorized')
  )
    throw Error('Original source-bound capability register required');
  if (
    ownerDecisions.roles.length !== 11 ||
    ownerDecisions.roles.some(
      (role) => role.accountable_person !== 'UNASSIGNED',
    ) ||
    ownerDecisions.acceptance.length !== 12 ||
    ownerDecisions.acceptance.some((item) => item.status !== 'NOT_RUN') ||
    ciCloseout.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    ciCloseout.operationalAcceptance !== 'NOT_ACCEPTED'
  )
    throw Error('Unpromoted owner and operational evidence required');
  capture.check();
  return freezePrototype({
    organization_id: capture.organization_id,
    contractor,
    mode: 'LOCAL_PILOT_SCORECARD' as const,
    phase_one: phaseOne.map(([label, status, source, limit]) => ({
      label,
      status,
      source,
      limit,
    })),
    features,
    v1_dashboard: {
      source: 'docs/program/CYCLE33_V1_SCOPE_MATRIX.md',
      decisions: ownerDecisions.decision_groups,
      roles: ownerDecisions.roles.map((role) => ({
        role: role.role,
        person: role.accountable_person,
        boundary: role.required_decision_and_evidence,
        cases: role.acceptance_cases,
      })),
      acceptance: ownerDecisions.acceptance,
      ci: ciCloseout,
      separation:
        'Separate registrar and issuer commits, original one-use custody, atomic canonical request/receipt, independently durable ACK/fence and independent evidence review. Role combinations require the owner’s explicit private decision; D2/D3 remain separate.',
      owner_form: 'docs/program/CYCLE33_V1_D1_RETURN_FORM.md',
      recovery:
        'OWNER-WITNESSED MAIN SYNTHETIC LOSS SCENARIO PASS only. Duplicate recovery UNKNOWN/UNVERIFIED; both private folders remain intact. Full R0, independent witness, hosted recovery and rollback-resistant durability remain unaccepted.',
    },
    coverage:
      '25 retained capability records; not a completion percentage or exhaustive operational inventory.',
    ci_meaning:
      'Captured feature-register baseline only. UNKNOWN is not a failure or a current green result. The separately dated hosted CI snapshot above records exact bounded scopes; neither record is genuine operational acceptance.',
    release: 'NOT_READY_NOT_AUTHORIZED' as const,
    authority: {
      activate: false,
      hosted: false,
      financial: false,
      dispatch: false,
      send: false,
      merge: false,
    },
  });
}
