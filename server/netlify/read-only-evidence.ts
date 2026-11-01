/**
 * Read-only inspection of two Netlify connector observations.
 *
 * This does not construct the executor's Snapshot or independent-dashboard witness:
 * a site summary and one deploy are never sufficient to authorize a draft create.
 * No HTTP transport, credential reader, mutation or owner-approval issuer exists here.
 */
export interface NetlifyObservationTarget {
  siteId: string;
  siteName: string;
  teamId: string;
  originalDeployId: string;
}
export interface NetlifyReadOnlyObservation {
  source: 'NETLIFY_CONNECTOR_READ_ONLY';
  site: {
    id: string;
    name: string;
    teamId: string;
    connectorReportsTeamLoginAllDeploys: boolean;
    primaryIndependentlyEstablished: false;
  };
  original: {
    id: string;
    state: string;
    unpublished: boolean;
    manualPreview: boolean;
  };
  executorSnapshotAvailable: false;
  deploymentAuthorized: false;
  blockers: string[];
}
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function unwrap(raw: unknown, single = false): Record<string, unknown> {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      throw Error('NETLIFY_OBSERVATION_NOT_JSON');
    }
  }
  if (single && Array.isArray(value)) {
    if (value.length !== 1) throw Error('NETLIFY_SITE_RESULT_NOT_UNIQUE');
    value = value[0];
  }
  if (!isRecord(value)) throw Error('NETLIFY_OBSERVATION_NOT_OBJECT');
  return value;
}
function exactId(v: unknown) {
  return typeof v === 'string' && /^[a-f0-9-]{24,36}$/.test(v);
}
/** Never retain response headers, env values, URLs, skew tokens or private metadata. */
export function assessNetlifyReadOnlyObservations(
  siteInput: unknown,
  deployInput: unknown,
  target: NetlifyObservationTarget,
): NetlifyReadOnlyObservation {
  if (
    !exactId(target.siteId) ||
    !/^[a-z0-9-]{1,63}$/.test(target.siteName) ||
    !exactId(target.teamId) ||
    !/^[a-f0-9]{24}$/.test(target.originalDeployId)
  )
    throw Error('NETLIFY_TARGET_UNVERIFIED');
  const site = unwrap(siteInput, true);
  const deploy = unwrap(deployInput);
  const details = site._enrichedFields;
  if (
    site.id !== target.siteId ||
    site.name !== target.siteName ||
    !isRecord(details) ||
    details.teamId !== target.teamId ||
    deploy.id !== target.originalDeployId ||
    deploy.site_id !== target.siteId
  )
    throw Error('NETLIFY_SITE_OR_DEPLOY_IDENTITY_DRIFT');
  const controls = details.projectAccessControls;
  const teamLogin =
    isRecord(controls) &&
    controls.requiresSSOTeamLogin === true &&
    controls.whichProjectsRequireSSOTeamLogin === 'all';
  const oldUnpublished = deploy.published_at === null;
  const manualPreview =
    deploy.manual_deploy === true &&
    deploy.context === 'deploy-preview' &&
    deploy.build_id === null;
  const blockers = [
    'INDEPENDENT_DASHBOARD_PROTECTION_WITNESS_MISSING',
    'COMPLETE_PAGINATED_DEPLOY_INVENTORY_MISSING',
    'PUBLISHED_PRIMARY_BASELINE_NOT_INDEPENDENTLY_VERIFIED',
    'GIT_DOMAIN_BUILD_CONFIGURATION_UNVERIFIED',
    'COMPLETE_SITE_AND_SHARED_ENVIRONMENT_KEY_METADATA_MISSING',
    'LIVE_READ_WRITE_ADAPTER_AND_HUMAN_SUPERVISION_UNVERIFIED',
    'EXACT_TARGET_BOUND_OWNER_EXECUTION_APPROVAL_NOT_GIVEN',
  ];
  if (!teamLogin) blockers.unshift('CONNECTOR_PROTECTION_NOT_CONFIRMED');
  if (!oldUnpublished || !manualPreview || deploy.state !== 'uploading')
    blockers.unshift('ORIGINAL_DEPLOY_STATE_CHANGED_OR_UNVERIFIED');
  return {
    source: 'NETLIFY_CONNECTOR_READ_ONLY',
    site: {
      id: target.siteId,
      name: target.siteName,
      teamId: target.teamId,
      connectorReportsTeamLoginAllDeploys: teamLogin,
      primaryIndependentlyEstablished: false,
    },
    original: {
      id: target.originalDeployId,
      state: typeof deploy.state === 'string' ? deploy.state : 'unknown',
      unpublished: oldUnpublished,
      manualPreview,
    },
    executorSnapshotAvailable: false,
    deploymentAuthorized: false,
    blockers,
  };
}
