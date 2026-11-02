import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { sampleCompanies } from '../../../src/domain/platform';
import { PropertyRepository } from '../../../src/lib/property';
import { FieldWorkflow } from '../../../src/components/workflows/FieldWorkflow';
import { Operations } from '../../../src/lib/operations';
import { Phase3Repository } from '../../../src/lib/phase3';
import { industryEstimate } from '../../../src/domain/estimating/fixtures';
import type { FieldWorkflowHandoff } from '../../../src/lib/workflows/field-workflow';
import '../../../src/styles.css';
const enabled =
  import.meta.env.DEV &&
  import.meta.env.VITE_CYCLE6_FIELD_TEST === 'true' &&
  window.location.hostname === '127.0.0.1';
async function sources(index: number) {
  const company = sampleCompanies[index],
    operations = new Operations(true),
    estimates = new Phase3Repository(operations),
    repo = new PropertyRepository(operations, estimates),
    day = '2026-12-07';
  await repo.initialize(company);
  const initial = repo.read(company.id).contexts[0],
    payload = industryEstimate(company, initial.customer_id);
  payload.location_id = initial.location_id;
  payload.expires_on = '2099-12-31';
  payload.tax_policy_id = (await estimates.taxes(company.id))[0].id;
  const draft = await estimates.create(company, payload),
    issued = await estimates.issue(company.id, draft),
    job = await estimates.approveJob(company.id, issued);
  await repo.refreshContexts(company.id);
  const context = repo
    .read(company.id)
    .contexts.find(
      (c) => c.job_id === job && c.location_id === initial.location_id,
    )!;
  const f = {
    company,
    target: {
      organization_id: company.id,
      actor_id: company.id + '-owner',
      customer_id: initial.customer_id,
      location_id: initial.location_id,
      estimate_id: issued.estimate.id,
      version_id: issued.version.id,
      job_id: job,
    },
  };
  const plan = repo.createPlan(
    f.company.id,
    context,
    'Source-card navigation regression',
  );
  let visit = repo.addVisit(f.company.id, plan.id, day, 'after');
  repo.saveVisit(f.company.id, visit, {
    summary: 'Published original Field source',
    internal_notes: 'PRIVATE notes',
    checklist: visit.content.checklist.map((c) => ({ ...c, completed: true })),
    findings: [],
  });
  visit = repo.read(f.company.id).visits.find((v) => v.id === visit.id)!;
  repo.submit(f.company.id, visit);
  visit = repo.read(f.company.id).visits.find((v) => v.id === visit.id)!;
  const report = repo.publish(f.company.id, visit);
  return { repo, target: f.target, day, report, timezone: 'America/Chicago' };
}
function Harness() {
  const [index, setIndex] = useState(0),
    [ready, setReady] = useState<Awaited<ReturnType<typeof sources>> | null>(
      null,
    ),
    [handoff, setHandoff] = useState<{
      destination: string;
      target: FieldWorkflowHandoff;
    } | null>(null),
    [error, setError] = useState('');
  return (
    <main>
      <h1>Local Field workflow test</h1>
      <label>
        Contractor
        <select
          value={index}
          onChange={(event) => {
            setIndex(Number(event.target.value));
            setReady(null);
            setHandoff(null);
          }}
        >
          {sampleCompanies.map((company, i) => (
            <option key={company.id} value={i}>
              {company.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={!enabled}
        onClick={() => {
          void sources(index)
            .then(setReady)
            .catch(() => setError('Synthetic source preparation unavailable'));
        }}
      >
        Prepare actual Field sources
      </button>
      {error && <p role="alert">{error}</p>}
      {ready && (
        <>
          <FieldWorkflow
            {...ready}
            enabled={enabled}
            onReport={(target) => setHandoff({ destination: 'report', target })}
            onProofOfWork={(target) =>
              setHandoff({ destination: 'proof', target })
            }
          />
          <output aria-label="Expected report identity">
            {JSON.stringify({
              report_id: ready.report.id,
              published_version: ready.report.version,
            })}
          </output>
        </>
      )}
      {handoff && (
        <output aria-label="Navigation handoff">
          {JSON.stringify(handoff)}
        </output>
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
