// Standalone development/browser-test composition only; never imported by App.
// The /preview-prefixed HTML keeps the existing staff Supabase/Auth initializer closed.
import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { Operations } from '../../../src/lib/operations';
import { Phase3Repository } from '../../../src/lib/phase3';
import { LocalJobMarginReader } from '../../../src/lib/job-margin-analysis';
import { sampleCompanies } from '../../../src/domain/platform';
import { JobMarginAnalysis } from '../../../src/components/finance/JobMarginAnalysis';
import type { MarginScope } from '../../../src/domain/jobs/margin-analysis';

const allowed =
  import.meta.env.DEV === true &&
  import.meta.env.VITE_JOB_MARGIN_PREVIEW === 'true' &&
  window.location.hostname === '127.0.0.1';
if (allowed)
  void (async () => {
    const workspaces = await Promise.all(
      sampleCompanies.map(async (company) => {
        const operations = new Operations(true),
          repo = new Phase3Repository(operations);
        await repo.initialize(company);
        const job = (await repo.jobs(company.id))[0],
          estimate = (await repo.list(company.id))[0];
        const issued = (await repo.history(company.id, estimate.id)).find(
          (v) => v.id === job.baseline.issued_version_id,
        )!;
        const scope: MarginScope = {
          organizationId: company.id,
          jobId: job.id,
          jobRevision: job.lock_revision,
          estimateId: estimate.id,
          issuedVersionId: issued.id,
          customerId: issued.payload.customer_id,
          propertyId: issued.payload.location_id,
          currency: job.baseline.currency,
        };
        return {
          company,
          repo,
          scope,
          reader: new LocalJobMarginReader(repo, true),
          disabled: new LocalJobMarginReader(repo),
        };
      }),
    );
    function Harness() {
      const [index, select] = useState(0),
        [role, actor] = useState('owner'),
        [missing, absent] = useState(false),
        [enabled, enable] = useState(true),
        [scopes, updateScopes] = useState<Record<string, MarginScope>>({}),
        [busy, setBusy] = useState(false),
        [error, setError] = useState('');
      const workspace = workspaces[index],
        currentScope = scopes[workspace.company.id] ?? workspace.scope;
      return (
        <main
          className="company-shell p3-workspace"
          style={
            {
              '--company-color': workspace.company.primary_color,
            } as CSSProperties
          }
        >
          <h1>Isolated job costing component test</h1>
          <label>
            Contractor example
            <select
              value={index}
              onChange={(e) => {
                select(Number(e.target.value));
                actor('owner');
                absent(false);
              }}
            >
              {workspaces.map((w, i) => (
                <option key={w.company.id} value={i}>
                  {w.company.name}
                </option>
              ))}
            </select>
          </label>
          <h2>{workspace.company.name}</h2>
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError('');
              void (async () => {
                const job = (
                  await workspace.repo.jobs(workspace.company.id)
                ).find((row) => row.id === currentScope.jobId);
                if (!job) throw Error('Synthetic job unavailable');
                const projection = structuredClone(job.projection);
                projection.remaining.materials =
                  job.baseline.revenue_minor + job.baseline.costs.materials;
                await workspace.repo.projection(
                  workspace.company.id,
                  job,
                  projection,
                );
                updateScopes((old) => ({
                  ...old,
                  [workspace.company.id]: {
                    ...currentScope,
                    jobRevision: job.lock_revision + 1,
                  },
                }));
              })()
                .catch((cause) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'Unable to prepare local example',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            Prepare synthetic cost-risk example
          </button>
          {error && <p role="alert">{error}</p>}
          <button onClick={() => actor('field')}>Use field identity</button>
          <button onClick={() => actor('estimator')}>
            Use estimator identity
          </button>
          <button onClick={() => actor('owner')}>Use owner identity</button>
          <button onClick={() => absent(!missing)}>
            Toggle missing exact job
          </button>
          <button onClick={() => enable(!enabled)}>
            Toggle default-off reader
          </button>
          <JobMarginAnalysis
            reader={enabled ? workspace.reader : workspace.disabled}
            scope={
              missing
                ? {
                    ...currentScope,
                    jobId: '11111111-1111-4111-8111-111111111111',
                  }
                : currentScope
            }
            actor={`${workspace.company.id}-${role}`}
          />
        </main>
      );
    }
    createRoot(document.getElementById('root')!).render(<Harness />);
  })();
