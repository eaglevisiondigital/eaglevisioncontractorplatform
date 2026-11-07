import { useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  readPilotScorecard,
  filterPilotFeatures,
  type PilotEvidenceFilter,
} from '../../lib/workflows/pilot-scorecard';
import './pilot-scorecard.css';
export function PilotScorecard({
  sources,
  enabled = false,
}: {
  sources: OperatingSources;
  enabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PilotEvidenceFilter>('all');
  const admitted =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  let view: ReturnType<typeof readPilotScorecard> | null = null;
  if (admitted)
    try {
      captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      }).check();
      view = readPilotScorecard(sources, { enabled: true, confirmed: true });
    } catch {
      /* Fail closed before presentation. */
    }
  if (!view)
    return (
      <section
        className="pilot-scorecard"
        aria-label="Pilot acceptance scorecard"
      >
        <h2>Pilot acceptance scorecard</h2>
        <p>
          Off or current authorized sources unavailable. No capability is
          enabled.
        </p>
      </section>
    );
  const matches = filterPilotFeatures(view.features, query, filter);
  return (
    <section
      className="pilot-scorecard"
      aria-label="Pilot acceptance scorecard"
    >
      <h2>Phase One gates and full-platform evidence</h2>
      <p>
        {view.contractor} · Staff development review · Release NOT READY / NOT
        AUTHORIZED
      </p>
      <p>{view.coverage}</p>
      <h3>Unified V1 acceptance dashboard</h3>
      <p>
        Scope tiers remain proposals. Local implementation, hosted synthetic CI,
        genuine operational acceptance and owner decisions are separate. Mixed
        Essential/Optional rows do not make a completion percentage.
      </p>
      <details>
        <summary>Hosted CI evidence and incomplete coverage</summary>
        <p>{view.v1_dashboard.ci.freshness}</p>
        <p>Snapshot {view.v1_dashboard.ci.observedAt}</p>
        {view.v1_dashboard.ci.scopes.map((scope) => (
          <article key={scope.head}>
            <h4>{scope.label}</h4>
            <p>{scope.classification.replaceAll('_', ' ')}</p>
            <p>Exact source {scope.head}</p>
            <p>
              PASS {scope.workflowCounts.PASS} · FAIL{' '}
              {scope.workflowCounts.FAIL}
              {' · '}CANCELLED {scope.workflowCounts.CANCELLED} · PENDING{' '}
              {scope.workflowCounts.PENDING}
            </p>
            <p>{scope.limit}</p>
            <p>Independent proof {scope.proof}</p>
          </article>
        ))}
      </details>
      <details>
        <summary>D1 operational roles and separate owner decisions</summary>
        <p>{view.v1_dashboard.separation}</p>
        <p>
          Blank template: {view.v1_dashboard.owner_form}. Return the completed
          copy privately; keep people, target details and credentials out of
          Git.
        </p>
        {view.v1_dashboard.decisions.map((decision) => (
          <p key={decision.id}>
            {decision.id}: {decision.status} · {decision.decision}
          </p>
        ))}
        <ol>
          {view.v1_dashboard.roles.map((role) => (
            <li key={role.role}>
              <strong>
                {role.role}: {role.person}
              </strong>
              <p>
                {role.boundary} · {role.cases.join(', ')}
              </p>
            </li>
          ))}
        </ol>
        <p>
          All A01–A12 remain NOT RUN; no genuine operational acceptance
          supplied.
        </p>
      </details>
      <details>
        <summary>Recovery and security evidence still required</summary>
        <p>{view.v1_dashboard.recovery}</p>
        <p>Current source: docs/program/CYCLE33_PHYSICAL_CASE_STATUS.md</p>
      </details>
      <h3>Phase One acceptance gates</h3>
      <div className="pilot-gates">
        {view.phase_one.map((g) => (
          <article key={g.label}>
            <h4>{g.label}</h4>
            <strong>{g.status.replaceAll('_', ' ')}</strong>
            <p>{g.limit}</p>
            <details>
              <summary>Source record</summary>
              <p>{g.source}</p>
            </details>
          </article>
        ))}
      </div>
      <h3>Full-platform capability matrix</h3>
      <p>
        {view.ci_meaning} LOCAL partial describes the broad feature, even when a
        bounded prototype passes.
      </p>
      <label>
        Find capability
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={100}
        />
      </label>
      <label>
        Evidence category
        <select
          value={filter}
          onChange={(event) =>
            setFilter(event.target.value as PilotEvidenceFilter)
          }
          style={{ minHeight: 44 }}
        >
          <option value="all">All retained capabilities</option>
          <option value="local">
            Local implementation evidence (broad partial)
          </option>
          <option value="ci">Retained baseline CI evidence</option>
          <option value="operational">Genuinely operationally accepted</option>
          <option value="owner">Owner scope decision required</option>
          <option value="security">Baseline hosted blockers</option>
          <option value="optional">Optional scope, including mixed rows</option>
          <option value="post-launch">
            Post-launch scope, including mixed rows
          </option>
        </select>
      </label>
      <p>
        All eight global gates still apply; a category is not execution
        authority.
      </p>
      <p role="status">
        {matches.length} matching of {view.features.length} retained
        capabilities
      </p>
      {!matches.length && (
        <p>
          No matching capability. Clear the literal search to inspect the
          retained register.
        </p>
      )}
      <div
        className="pilot-matrix"
        role="region"
        aria-label="Capability evidence matrix"
        tabIndex={0}
      >
        <table>
          <caption>
            DESIGN, LOCAL, CI, HOSTED and RELEASE are independent evidence
            stages.
          </caption>
          <thead>
            <tr>
              {['Capability', 'DESIGN', 'LOCAL', 'CI', 'HOSTED', 'RELEASE'].map(
                (h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {matches.map((f) => (
              <tr key={f.id}>
                <th scope="row">
                  {f.id} · {f.capability}
                  <details>
                    <summary>Evidence and next gate</summary>
                    <p>{f.source}</p>
                    <ul aria-label={`Public source evidence for ${f.id}`}>
                      {f.evidence_sources.map((s) => (
                        <li key={`${s.path}:${s.anchor}`}>
                          {s.path} · {s.anchor}
                        </li>
                      ))}
                    </ul>
                    <p>{f.next}</p>
                    <p>Proposed V1 scope: {f.v1.boundary}</p>
                    <p>Owner decision: {f.v1.decision.replaceAll('_', ' ')}</p>
                    <p>Genuine operational acceptance: {f.v1.operational}</p>
                    <p>Source-specific next requirement: {f.v1.next}</p>
                    {f.ci.commit && <p>Retained CI commit {f.ci.commit}</p>}
                  </details>
                </th>
                <td>{f.design}</td>
                <td>{f.local}</td>
                <td>{f.ci.state}</td>
                <td>{f.hosted}</td>
                <td>{f.release}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
