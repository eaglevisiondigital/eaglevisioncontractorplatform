import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Operations } from '../../../src/lib/operations';
import { PropertyRepository } from '../../../src/lib/property';
import { sampleCompanies } from '../../../src/domain/platform';
import { prepareMaintenanceExamples } from '../../../src/lib/maintenance-examples';
import { MaintenanceCenter } from '../../../src/components/property/MaintenanceCenter';
import '../../../src/styles.css';
if (
  import.meta.env.DEV &&
  import.meta.env.VITE_CONTRACTOR_JOURNEY_PREVIEW === 'true' &&
  location.hostname === '127.0.0.1'
)
  void (async () => {
    const company = sampleCompanies[0],
      org = company.id,
      ops = new Operations(true),
      repo = new PropertyRepository(ops);
    await repo.initialize(company);
    await repo.refreshContexts(org);
    await prepareMaintenanceExamples(repo, org, org + '-owner');
    const rawSave = repo.saveMaintenance.bind(repo),
      rawSchedule = repo.scheduleMaintenance.bind(repo),
      members = ops.syntheticMemberships.bind(ops),
      initial = repo.read(org).visits.length;
    let revoke = false,
      revoked = false,
      loseSave = false,
      loseSchedule = false,
      saves = 0,
      schedules = 0;
    ops.syntheticMemberships = (id) =>
      members(id).map((m) => ({ ...m, active: revoked ? false : m.active }));
    repo.saveMaintenance = async (...args) => {
      saves++;
      const value = await rawSave(...args);
      if (revoke) revoked = true;
      if (loseSave) throw Error('PRIVATE fictional save failure');
      return value;
    };
    repo.scheduleMaintenance = async (...args) => {
      schedules++;
      const value = await rawSchedule(...args);
      if (loseSchedule) throw Error('PRIVATE fictional preparation failure');
      return value;
    };
    function Fixture() {
      const [counts, setCounts] = useState('0/0/0');
      return (
        <main>
          <h1>Fictional maintenance compound operation</h1>
          <p>Same-tab test only; no dispatch, repair or hosted persistence.</p>
          <button
            onClick={() => {
              revoke = true;
            }}
          >
            Revoke fixture reviewer after review save
          </button>
          <button
            onClick={() => {
              loseSave = true;
            }}
          >
            Lose fixture Save acknowledgment
          </button>
          <button
            onClick={() => {
              loseSchedule = true;
            }}
          >
            Lose fixture Prepare acknowledgment
          </button>
          <button
            onClick={() =>
              setCounts(
                `${saves}/${schedules}/${repo.read(org).visits.length - initial}`,
              )
            }
          >
            Inspect fixture Save/Prepare/drafts
          </button>
          <output aria-label="Fixture Save Prepare drafts">{counts}</output>
          <MaintenanceCenter
            repo={repo}
            company={company}
            onSource={() => {}}
            onVisit={() => {}}
          />
        </main>
      );
    }
    createRoot(document.getElementById('root')!).render(<Fixture />);
  })();
