import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Operations } from '../../../src/lib/operations';
import { PropertyRepository } from '../../../src/lib/property';
import { sampleCompanies } from '../../../src/domain/platform';
import { UnbilledReview } from '../../../src/components/property/UnbilledReview';
import '../../../src/styles.css';
if (
  import.meta.env.DEV &&
  import.meta.env.VITE_CONTRACTOR_JOURNEY_PREVIEW === 'true' &&
  location.hostname === '127.0.0.1'
)
  void (async () => {
    const org = sampleCompanies[0].id,
      repo = new PropertyRepository(new Operations(true));
    await repo.initialize(sampleCompanies[0]);
    const job = (await repo.estimates.jobs(org))[0],
      expense = job.expenses.find(
        (e) => e.kind === 'payment' && e.category === 'materials',
      )!;
    const other = String(
      await repo.estimates.submitExpense(org, job.id, {
        ...expense,
        reference: crypto.randomUUID(),
        purchase_key: 'fictional-separate-material-purchase',
      }),
    );
    await repo.estimates.reviewExpense(
      org,
      job.id,
      other,
      'approved',
      'Fictional second source for no-fallback test',
    );
    const canonicalJobs = repo.estimates.jobs;
    const decide = repo.decide.bind(repo),
      access = repo.operations.companyAccess.bind(repo.operations);
    let writes = 0,
      revoked = false;
    repo.decide = async (...args) => {
      writes++;
      return decide(...args);
    };
    repo.operations.companyAccess = async (...args) => ({
      ...(await access(...args)),
      ...(revoked ? { estimates: false } : {}),
    });
    function Harness() {
      const [evidence, setEvidence] = useState('No fixture evidence inspected');
      return (
        <main>
          <h1>Material review source regression fixture</h1>
          <p>
            Fictional local values only; no invoice issuance, payment or
            customer authorization.
          </p>
          <button
            onClick={() =>
              void (async () => {
                const id = String(
                  await repo.estimates.submitExpense(org, job.id, {
                    ...expense,
                    kind: 'credit',
                    amount_minor: 1000,
                    reference: crypto.randomUUID(),
                    adjusts_expense_id: expense.id,
                  }),
                );
                await repo.estimates.reviewExpense(
                  org,
                  job.id,
                  id,
                  'approved',
                  'Fictional approved return',
                );
                setEvidence('Fixture credit approved');
              })()
            }
          >
            Apply fixture approved credit
          </button>
          <button
            onClick={() => {
              repo.estimates.jobs = async (...args) =>
                (await canonicalJobs.apply(repo.estimates, args)).map((j) => ({
                  ...j,
                  expenses: j.expenses.filter((e) => e.id !== expense.id),
                }));
              setEvidence('Fixture selected expense hidden from read');
            }}
          >
            Hide fixture selected expense
          </button>
          <button
            onClick={() => {
              repo.estimates.jobs = canonicalJobs;
              setEvidence('Fixture original expense restored to read');
            }}
          >
            Restore fixture selected expense
          </button>
          <button
            onClick={() => {
              revoked = true;
              setEvidence('Fixture review authority revoked');
            }}
          >
            Revoke fixture review access
          </button>
          <button
            onClick={() => {
              const decisions = repo.read(org).decisions;
              setEvidence(
                `Review writes: ${writes}; decisions: ${decisions.length}; selling: ${decisions.at(-1)?.selling_minor ?? 'UNKNOWN'}`,
              );
            }}
          >
            Inspect fixture review evidence
          </button>
          <p role="status">{evidence}</p>
          <UnbilledReview repo={repo} org={org} />
        </main>
      );
    }
    createRoot(document.getElementById('root')!).render(<Harness />);
  })();
