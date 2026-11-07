import { expect, it } from 'vitest';
import featureEvidence from '../../docs/FEATURE_ACCEPTANCE_EVIDENCE.json';
import scopeProposal from '../../docs/program/CYCLE33_V1_SCOPE_MATRIX.md?raw';
import owners from '../../docs/program/CYCLE31_OPERATIONAL_OWNER_DECISIONS.json';
import { sampleCompanies } from '../../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../../src/lib/workflows/operating-center-runtime';
import {
  readPilotScorecard,
  projectV1ScopeProposal,
  filterPilotFeatures,
  type PilotEvidenceFilter,
} from '../../src/lib/workflows/pilot-scorecard';

const ids = featureEvidence.features.map((feature) => feature.id);
for (const company of sampleCompanies) {
  it(`denies dashboard evidence after actual native owner revocation / ${company.slug}`, async () => {
    const gate = { enabled: true, confirmed: true };
    const sources = await prepareOperatingSources(company, gate);
    await sources.operations.configure(
      company.id,
      'active',
      'synthetic',
      {},
      company.id + '-dashboard-remaining-owner',
    );
    readPilotScorecard(sources, gate);
    await sources.operations.revokeOwner(
      company.id,
      sources.entries[0].target.actor_id,
    );
    expect(() => readPilotScorecard(sources, gate)).toThrow();
  });
  it(`preserves all original acceptance stages and real decision boundaries / ${company.slug}`, async () => {
    const gate = { enabled: true, confirmed: true };
    const sources = await prepareOperatingSources(company, gate);
    const view = readPilotScorecard(sources, gate);
    expect(view.organization_id).toBe(company.id);
    expect(view.features.map((feature) => feature.id)).toEqual(ids);
    expect(view.phase_one).toHaveLength(8);
    for (const feature of view.features) {
      const original = featureEvidence.features.find(
        (item) => item.id === feature.id,
      )!;
      expect([
        feature.design,
        feature.local,
        feature.hosted,
        feature.release,
        feature.ci.state,
      ]).toEqual([
        original.design,
        original.local,
        original.hosted,
        original.release,
        original.ci.state,
      ]);
      expect(feature.v1.decision).toBe('PROPOSED_OWNER_DECISION_REQUIRED');
      expect(feature.v1.operational).toBe('NOT_ACCEPTED');
      expect(Object.isFrozen(feature.v1)).toBe(true);
    }
    expect(
      view.v1_dashboard.roles.map((role) => [
        role.role,
        role.person,
        role.boundary,
        role.cases,
      ]),
    ).toEqual(
      owners.roles.map((role) => [
        role.role,
        role.accountable_person,
        role.required_decision_and_evidence,
        role.acceptance_cases,
      ]),
    );
    expect(view.v1_dashboard.acceptance).toEqual(owners.acceptance);
    expect(view.v1_dashboard.ci.operationalAcceptance).toBe('NOT_ACCEPTED');
    expect(view.v1_dashboard.ci.freshness).toContain(
      'not CI for this dashboard commit',
    );
    expect(
      Object.values(view.authority).every((allowed) => allowed === false),
    ).toBe(true);
    expect(JSON.stringify(view)).not.toContain(
      sources.entries[0].target.customer_id,
    );
    expect(JSON.stringify(view)).not.toContain(
      sources.entries[0].target.job_id,
    );
  });
  it(`requires current original admission and rejects another tenant / ${company.slug}`, async () => {
    const gate = { enabled: true, confirmed: true };
    const sources = await prepareOperatingSources(company, gate);
    gate.confirmed = false;
    expect(() => readPilotScorecard(sources, gate)).toThrow();
    gate.confirmed = true;
    const other = sampleCompanies.find((item) => item.id !== company.id)!;
    expect(() =>
      readPilotScorecard({ ...sources, company: other }, gate),
    ).toThrow();
  });
  it(`filters evidence without promoting unknown or mixed scope / ${company.slug}`, async () => {
    const sources = await prepareOperatingSources(company, {
      enabled: true,
      confirmed: true,
    });
    const view = readPilotScorecard(sources, {
      enabled: true,
      confirmed: true,
    });
    expect(filterPilotFeatures(view.features, '', 'all')).toHaveLength(25);
    expect(filterPilotFeatures(view.features, '', 'operational')).toEqual([]);
    expect(filterPilotFeatures(view.features, '', 'owner')).toHaveLength(25);
    expect(
      filterPilotFeatures(view.features, '', 'ci').map((item) => item.id),
    ).not.toContain('QA-001');
    expect(
      filterPilotFeatures(view.features, '', 'local').map((item) => item.id),
    ).not.toContain('AI-001');
    expect(
      filterPilotFeatures(view.features, '', 'security').every(
        (item) => item.hosted === 'blocked',
      ),
    ).toBe(true);
    expect(
      filterPilotFeatures(view.features, 'FIN-002', 'optional').map(
        (item) => item.id,
      ),
    ).toEqual(['FIN-002']);
    expect(
      filterPilotFeatures(view.features, 'GRO-002', 'post-launch').map(
        (item) => item.id,
      ),
    ).toEqual(['GRO-002']);
    expect(filterPilotFeatures(view.features, '[.*', 'all')).toEqual([]);
    expect(() =>
      filterPilotFeatures(view.features, '', 'ready' as PilotEvidenceFilter),
    ).toThrow();
  });
}

const firstRow = scopeProposal
  .split('\n')
  .find((line) => /^\|\s*SEC-001\s*\|/.test(line))!;
it('requires every original scope row once, with an explicit next requirement', () => {
  expect(projectV1ScopeProposal(scopeProposal, ids)).toHaveLength(25);
  expect(() =>
    projectV1ScopeProposal(scopeProposal.replace(firstRow, ''), ids),
  ).toThrow();
  expect(() =>
    projectV1ScopeProposal(
      scopeProposal.replace(firstRow, firstRow + '\n' + firstRow),
      ids,
    ),
  ).toThrow();
  expect(() =>
    projectV1ScopeProposal(
      scopeProposal.replace(firstRow, firstRow.replace('SEC-001', 'BAD-999')),
      ids,
    ),
  ).toThrow();
  expect(() => projectV1ScopeProposal(scopeProposal, ids.slice(1))).toThrow();
});
it('ignores later prose tables rather than fabricating another canonical scope', () => {
  const original = projectV1ScopeProposal(scopeProposal, ids);
  expect(projectV1ScopeProposal(scopeProposal + '\n' + firstRow, ids)).toEqual(
    original,
  );
});
it('retains scoped CI failures, cancellations and overlapping execution boundaries', async () => {
  const sources = await prepareOperatingSources(sampleCompanies[0], {
    enabled: true,
    confirmed: true,
  });
  const view = readPilotScorecard(sources, { enabled: true, confirmed: true });
  const [main, parser, history] = view.v1_dashboard.ci.scopes;
  expect(main.workflowCounts).toEqual({
    PASS: 22,
    FAIL: 3,
    CANCELLED: 4,
    PENDING: 0,
  });
  expect(parser.limit).toContain('without rerunning applications');
  expect(history.applicationCases).toBe(480);
  expect(history.limit).toContain('not added to Main1134');
  expect(history.workflowCounts).toEqual({
    PASS: 7,
    FAIL: 0,
    CANCELLED: 2,
    PENDING: 0,
  });
  expect(view.v1_dashboard.recovery).toContain(
    'Duplicate recovery UNKNOWN/UNVERIFIED',
  );
  expect(view.v1_dashboard.recovery).toContain('only');
});
it('default-off read does not execute an untrusted source accessor', () => {
  let reads = 0;
  const sources = Object.defineProperty({}, 'entries', {
    get() {
      reads++;
      throw Error('SOURCE_READ');
    },
  }) as OperatingSources;
  expect(() => readPilotScorecard(sources)).toThrow();
  expect(reads).toBe(0);
});
