import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Operations } from '../../../src/lib/operations';
import { propertyRepository } from '../../../src/lib/property';
import { sampleCompanies } from '../../../src/domain/platform';
import { PropertyWorkspace } from '../../../src/components/property/PropertyWorkspace';
import '../../../src/styles.css';
if (
  import.meta.env.DEV &&
  import.meta.env.VITE_CONTRACTOR_JOURNEY_PREVIEW === 'true' &&
  location.hostname === '127.0.0.1'
)
  void (async () => {
    const ops = new Operations(true),
      company = sampleCompanies[0],
      repo = propertyRepository(ops),
      org = company.id;
    await repo.initialize(company);
    const first = repo.read(org).plans[0];
    repo.savePlan(org, {
      ...first,
      cadence: 'weekly',
      starts_on: '2026-10-16',
    });
    repo.addVisit(org, first.id, '2026-10-30');
    const second = repo.createPlan(
      org,
      repo.read(org).contexts[0],
      'Fictional independent second plan',
    );
    repo.savePlan(org, {
      ...second,
      cadence: 'custom',
      interval_days: 5,
      starts_on: '2026-10-01',
    });
    repo.addVisit(org, second.id, '2026-10-01');
    repo.addVisit(org, second.id, '2026-10-06');
    if (new URLSearchParams(location.search).get('history') === 'unknown') {
      const read = repo.read.bind(repo);
      repo.read = (id) => {
        const current = read(id);
        const visit = current.visits.find((v) => v.plan_id === first.id);
        if (visit) visit.status = 'unverified' as never;
        return current;
      };
    }
    function Fixture() {
      const [shown, setShown] = useState(true),
        [info, setInfo] = useState('');
      return (
        <main>
          <h1>Fictional exact-plan date preparation</h1>
          <p>
            Recorded dates are not physical completion, availability or
            bookings.
          </p>
          <output data-testid="first-plan">{first.id}</output>
          <output data-testid="second-plan">{second.id}</output>
          <button onClick={() => setShown(!shown)}>
            Close or reopen fixture workspace
          </button>
          <button
            onClick={() =>
              setInfo(
                repo
                  .read(org)
                  .visits.filter((v) => v.plan_id === first.id)
                  .map((v) => v.visited_on)
                  .join(','),
              )
            }
          >
            Inspect exact first plan dates
          </button>
          <output aria-label="Exact first plan dates">{info}</output>
          {shown && (
            <PropertyWorkspace
              operations={ops}
              company={company}
              section="Property operations"
            />
          )}
        </main>
      );
    }
    createRoot(document.getElementById('root')!).render(<Fixture />);
  })();
