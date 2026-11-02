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
        const jobs = repo.jobs.bind(repo);
        let pauseNext = false;
        let release: (() => void) | null = null;
        repo.jobs = async (...args) => {
          const result = await jobs(...args);
          if (pauseNext) {
            pauseNext = false;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            release = null;
          }
          return result;
        };
        return {
          pauseNext: () => {
            pauseNext = true;
          },
          release: () => {
            release?.();
          },
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
        [completionVisible, showCompletion] = useState(true),
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
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError('');
              void (async () => {
                let payment = '';
                for (const [kind, amount] of [
                  ['commitment', 10000],
                  ['payment', 4000],
                  ['credit', 1000],
                ] as const) {
                  const id = await workspace.repo.submitExpense(
                    workspace.company.id,
                    currentScope.jobId,
                    {
                      kind,
                      category: 'equipment',
                      amount_minor: amount,
                      supplier: 'Synthetic equipment supplier',
                      purchase_key: 'completion-review-example',
                      reference: crypto.randomUUID(),
                      description: 'Synthetic source review',
                      estimate_line_id: null,
                      quantity_milli: 1000,
                      unit: 'each',
                      unit_cost_minor: amount,
                      document_ids: [],
                      material_approval_id: null,
                      adjusts_expense_id: kind === 'credit' ? payment : null,
                    },
                  );
                  if (kind === 'payment') payment = id;
                  await workspace.repo.reviewExpense(
                    workspace.company.id,
                    currentScope.jobId,
                    id,
                    'approved',
                    'Explicit synthetic review',
                  );
                }
                const job = (
                  await workspace.repo.jobs(workspace.company.id)
                ).find((row) => row.id === currentScope.jobId)!;
                updateScopes((old) => ({
                  ...old,
                  [workspace.company.id]: {
                    ...currentScope,
                    jobRevision: job.lock_revision,
                  },
                }));
              })()
                .catch((cause) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'Synthetic source preparation unavailable',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            Prepare synthetic commitment and credit example
          </button>
          <button onClick={() => workspace.pauseNext()}>
            Pause next job-source read
          </button>
          <button
            onClick={() =>
              workspaces.forEach((workspace) => workspace.release())
            }
          >
            Release paused source reads
          </button>
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
          <button onClick={() => showCompletion(!completionVisible)}>
            Toggle cost completion extension
          </button>
          <JobMarginAnalysis
            completionEnabled={completionVisible}
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
