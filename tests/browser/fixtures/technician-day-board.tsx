import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { sampleCompanies } from '../../../src/domain/platform';
import { Operations } from '../../../src/lib/operations';
import { PropertyRepository } from '../../../src/lib/property';
import {
  readFieldWorkOrders,
  type WorkOrderModel,
} from '../../../src/lib/field-work-orders';
import { technicianDayBoardEnabled } from '../../../src/lib/field-day-board';
import { TechnicianDayBoard } from '../../../src/components/field/TechnicianDayBoard';
import '../../../src/styles.css';
import '../../../src/components/field/field-scheduling.css';
import '../../../src/components/field/field-work-orders.css';
const enabled = technicianDayBoardEnabled({
  development: import.meta.env.DEV,
  flag: import.meta.env.VITE_TECHNICIAN_DAY_BOARD_PREVIEW,
  hostname: location.hostname,
  protocol: location.protocol,
});
async function prepare(index: number) {
  const company = sampleCompanies[index],
    repo = new PropertyRepository(new Operations(true));
  await repo.initialize(company);
  const actor = company.id + '-owner',
    model = await readFieldWorkOrders(repo, company.id, actor);
  await repo.estimates.assignJob(
    company.id,
    model.orders[0].source.job_id,
    company.id + '-field',
    true,
  );
  return {
    company,
    repo,
    model: await readFieldWorkOrders(repo, company.id, actor),
  };
}
function Fixture({
  sources,
}: {
  sources: Awaited<ReturnType<typeof prepare>>[];
}) {
  const [source, setSource] = useState(sources[0]),
    [model, setModel] = useState<WorkOrderModel>(sources[0].model),
    [status, setStatus] = useState('Ready'),
    [open, setOpen] = useState('');
  const [parentDay, setParentDay] = useState('2026-10-16');
  const [release, setRelease] = useState<(() => void) | null>(null);
  async function pause() {
    const original = source.repo.estimates.workforce.bind(
      source.repo.estimates,
    );
    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });
    source.repo.estimates.workforce = async (org) => {
      const value = await original(org);
      setStatus('Real reader paused');
      await gate;
      return value;
    };
    setRelease(() => () => {
      source.repo.estimates.workforce = original;
      resolve();
      setStatus('Released');
    });
    setStatus('Next read will pause');
  }
  async function changeStaff() {
    await source.repo.operations.manageMember(
      source.company.id,
      source.company.id + '-field',
      true,
      'staff',
      'field_staff',
    );
    setModel(
      await readFieldWorkOrders(
        source.repo,
        source.company.id,
        source.company.id + '-field',
      ),
    );
  }
  return (
    <main
      className="field-schedule"
      style={
        { '--field-brand': source.company.primary_color } as React.CSSProperties
      }
    >
      <h1>Actual-model day-board regression fixture</h1>
      <p>{source.company.name}</p>
      <div>
        <button
          onClick={() => {
            const next = sources[source === sources[0] ? 1 : 0];
            setSource(next);
            setModel(next.model);
            setOpen('');
          }}
        >
          Replace actual company model without key
        </button>
        <button onClick={() => void pause()}>
          Pause next actual source read
        </button>
        <button disabled={!release} onClick={() => release?.()}>
          Release actual read
        </button>
        <button onClick={() => void changeStaff()}>
          Read actual technician model
        </button>
        <button onClick={() => setParentDay('2026-12-31')}>
          Change parent day without key
        </button>
        <p role="status">{status}</p>
      </div>
      <h2>Current crew context</h2>
      {enabled ? (
        <TechnicianDayBoard
          repo={source.repo}
          model={model}
          day={parentDay}
          onSource={(order) => setOpen(order.source.job_id)}
        />
      ) : (
        <p>Day board disabled</p>
      )}
      <output aria-label="Opened exact job">{open}</output>
    </main>
  );
}
if (!enabled)
  createRoot(document.getElementById('root')!).render(
    <main>
      <h1>Day board disabled</h1>
    </main>,
  );
else
  Promise.all([prepare(0), prepare(1)]).then((sources) =>
    createRoot(document.getElementById('root')!).render(
      <Fixture sources={sources} />,
    ),
  );
