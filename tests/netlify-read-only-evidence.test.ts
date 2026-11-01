import { expect, it } from 'vitest';
import {
  assessNetlifyReadOnlyObservations,
} from '../server/netlify/read-only-evidence';

const target = {
  siteId: '757117d4-e660-40f2-8076-ddd207237006',
  siteName: 'eaglevision-contractor-staging',
  teamId: '6a674f7a0e2cdcc2b838db89',
  originalDeployId: '6ad21fa5d00779389b042b97',
};
const site = {
  id: target.siteId,
  name: target.siteName,
  _enrichedFields: {
    teamId: target.teamId,
    projectAccessControls: {
      requiresPassword: false,
      requiresSSOTeamLogin: true,
      whichProjectsRequireSSOTeamLogin: 'all',
    },
    currentDeploy: { state: 'current', currentDeploy: {} },
  },
};
const oldDeploy = {
  id: target.originalDeployId,
  site_id: target.siteId,
  state: 'uploading',
  context: 'deploy-preview',
  manual_deploy: true,
  published_at: null,
  build_id: null,
  skew_protection_token: 'DO_NOT_RETAIN',
};
const assess = (s: unknown = site, d: unknown = oldDeploy, t = target) =>
  assessNetlifyReadOnlyObservations(s, d, t);

it('records limited connector evidence without claiming readiness', () => {
  const result = assess(JSON.stringify([site]), JSON.stringify(oldDeploy));
  expect(result.site.connectorReportsTeamLoginAllDeploys).toBe(true);
  expect(result.original).toMatchObject({
    state: 'uploading',
    unpublished: true,
    manualPreview: true,
  });
  expect(result.executorSnapshotAvailable).toBe(false);
  expect(result.deploymentAuthorized).toBe(false);
  expect(result.site.primaryIndependentlyEstablished).toBe(false);
  expect(result.blockers).toContain(
    'INDEPENDENT_DASHBOARD_PROTECTION_WITNESS_MISSING',
  );
  expect(JSON.stringify(result)).not.toContain('DO_NOT_RETAIN');
});

it('rejects incorrect site, team and original deploy identities', () => {
  const wrongTarget = { ...target, siteId: crypto.randomUUID() };
  expect(() => assess(site, oldDeploy, wrongTarget)).toThrow('IDENTITY_DRIFT');
  const wrongTeam = structuredClone(site);
  wrongTeam._enrichedFields.teamId = 'wrong-team';
  expect(() => assess(wrongTeam)).toThrow('IDENTITY_DRIFT');
  const wrongDeploy = { ...oldDeploy, id: 'f'.repeat(24) };
  expect(() => assess(site, wrongDeploy)).toThrow('IDENTITY_DRIFT');
});

it('reports changed protection and original state without approval', () => {
  const changedSite = structuredClone(site);
  changedSite._enrichedFields.projectAccessControls.whichProjectsRequireSSOTeamLogin =
    'production';
  const changedDeploy = {
    ...oldDeploy,
    state: 'ready',
    published_at: '2026-10-31T01:00:00Z',
  };
  const result = assess(changedSite, changedDeploy);
  expect(result.blockers).toContain('CONNECTOR_PROTECTION_NOT_CONFIRMED');
  expect(result.blockers).toContain(
    'ORIGINAL_DEPLOY_STATE_CHANGED_OR_UNVERIFIED',
  );
  expect(result.deploymentAuthorized).toBe(false);
});

it('rejects malformed, ambiguous or empty provider results', () => {
  for (const invalid of ['not json', '[]', '[{},{}]', '{}', null]) {
    expect(() => assess(invalid)).toThrow();
  }
});
