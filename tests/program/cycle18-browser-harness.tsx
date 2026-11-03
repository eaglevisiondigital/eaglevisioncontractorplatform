/** Disposable browser-only test harness. Never imported by the application. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareOperatingSources } from '../../src/lib/workflows/operating-center-runtime';
import { DailyWorkbench } from '../../src/components/workflows/DailyWorkbench';
export async function mountDailyWorkbench(brand: number) {
  const source = await prepareOperatingSources(sampleCompanies[brand], {
    enabled: true,
    confirmed: true,
  });
  const job = source.entries[0].target.job_id!;
  const rootEl = document.getElementById('root')!;
  rootEl.hidden = true;
  const el = document.createElement('main');
  document.body.append(el);
  const h1 = document.createElement('h1');
  h1.textContent = 'Disposable daily workflow browser fixture';
  el.append(h1);
  const mount = document.createElement('div');
  el.append(mount);
  const root = createRoot(mount);
  let generation = 0;
  const render = () =>
    root.render(
      <StrictMode>
        <DailyWorkbench
          key={generation}
          sources={source}
          selectedJobId={job}
          enabled
        />
      </StrictMode>,
    );
  render();
  return {
    job,
    company: source.company.id,
    revoke() {
      const read = source.operations.syntheticMemberships.bind(
        source.operations,
      );
      source.operations.syntheticMemberships = (org) =>
        read(org).map((member) => ({ ...member, active: false }));
      generation++;
      render();
    },
    dispose() {
      root.unmount();
      el.remove();
      rootEl.hidden = false;
    },
  };
}
