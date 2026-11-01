import { expect, it } from 'vitest';
import { assessNetlifyReadOnlyObservations } from '../server/netlify/read-only-evidence';

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
const old = {
  id: target.originalDeployId,
  site_id: target.siteId,
  state: 'uploading',
  context: 'deploy-preview',
  manual_deploy: true,
  published_at: null,
  build_id: null,
  skew_protection_token: 'DO_NOT_RETAIN',
};

it('records connector protection and old deploy without claiming an independent deployment preflight', () => {
  const checked = assessNetlifyReadOnlyObservations(
    JSON.stringify([site]),
    JSON.stringify(old),
    target,
  );
  expect(checked.site.connectorReportsTeamLoginAllDeploys).toBe(true);
  expect(checked.original).toMatchObject({
    state: 'uploading',
    unpublished: true,
    manualPreview: true,
  });
  expect(checked.executorSnapshotAvailable).toBe(false);
  expect(checked.deploymentAuthorized).toBe(false);
  expect(checked.site.primaryIndependentlyEstablished).toBe(false);
  expect(checked.blockers).toContain(
    'INDEPENDENT_DASHBOARD_PROTECTION_WITNESS_MISSING',
  );
  expect(JSON.stringify(checked)).not.toContain('DO_NOT_RETAIN');
});
it('fails closed on wrong site, team and old deploy identity', () => {
  expect(() =>
    assessNetlifyReadOnlyObservations(site, old, {
      ...target,
      siteId: '00000000-0000-0000-0000-000000000000',
    }),
  ).toThrow('IDENTITY_DRIFT');
  expect(() =>
    assessNetlifyReadOnlyObservations(
      { ...site, _enrichedFields: { ...site._enrichedFields, teamId: 'bad' } },
      old,
      target,
    ),
  ).toThrow('IDENTITY_DRIFT');
  expect(() =>
    assessNetlifyReadOnlyObservations(
      site,
      { ...old, id: 'abcdefabcdefabcdefabcdef' },
      target,
    ),
  ).toThrow('IDENTITY_DRIFT');
});
it('reports protection or source drift as blockers, never a replacement approval', () => {
  const a = assessNetlifyReadOnlyObservations(
    { ...site, _enrichedFields: {
      ...site._enrichedFields,
      projectAccessControls: {
        requiresSSOTeamLogin: true,
        whichProjectsRequireSSOTeamLogin: 'production',
      },
    } },
    { ...old, state: 'ready', published_at: '2026-10-31T01:00:00Z' },
    target,
  );
  expect(a.blockers).toContain('CONNECTOR_PROTECTION_NOT_CONFIRMED');
  expect(a.blockers).toContain('ORIGINAL_DEPLOY_STATE_CHANGED_OR_UNVERIFIED');
  expect(a.deploymentAuthorized).toBe(false);
});
it('rejects malformed, empty or ambiguous connector result shapes', () => {
  for (const v of ['not json', '[]', '[{},{}]', '{}', null]) {
    expect(() =>
      assessNetlifyReadOnlyObservations(v, old, target),
    ).toThrow();
  }
});
