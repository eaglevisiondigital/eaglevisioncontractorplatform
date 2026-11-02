import featureEvidence from '../../../docs/FEATURE_ACCEPTANCE_EVIDENCE.json';
import customerApproval from '../../../docs/CUSTOMER_AUTHORIZATION_APPROVAL_REGISTER.json';
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
/** Allowlisted source-evidenced pilot view. Not a new acceptance authority. */
export function readPilotScorecard(
  sources: OperatingSources,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const capture = captureOperatingSources(sources, gate);
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
  }));
  if (
    features.length !== 25 ||
    new Set(features.map((f) => f.id)).size !== 25 ||
    features.some((f) => f.release !== 'not_authorized')
  )
    throw Error('Original source-bound capability register required');
  capture.check();
  return freezePrototype({
    organization_id: capture.organization_id,
    contractor: sources.company.name,
    mode: 'LOCAL_PILOT_SCORECARD' as const,
    phase_one: phaseOne.map(([label, status, source, limit]) => ({
      label,
      status,
      source,
      limit,
    })),
    features,
    coverage:
      '25 retained capability records; not a completion percentage or exhaustive operational inventory.',
    ci_meaning:
      'Captured feature-register evidence only. UNKNOWN is not a failure or a current green result; exact Cycle11 CI is recorded separately.',
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
