import { useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { readPilotScorecard } from '../../lib/workflows/pilot-scorecard';
import './pilot-scorecard.css';
export function PilotScorecard({
  sources,
  enabled = false,
}: {
  sources: OperatingSources;
  enabled?: boolean;
}) {
  const [query, setQuery] = useState('');
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
  const matches = view.features.filter((f) =>
    (f.id + ' ' + f.capability).toLowerCase().includes(query.toLowerCase()),
  );
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
