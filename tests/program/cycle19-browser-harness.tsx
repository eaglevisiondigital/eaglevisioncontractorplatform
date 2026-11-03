import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareOperatingSources } from '../../src/lib/workflows/operating-center-runtime';
import { SavedRevisionWorkbench } from '../../src/components/workflows/SavedRevisionWorkbench';
/** DEV test-only direct import. Not imported by application or production bundle. */
export async function mountSavedWorkbench(brand: number) {
  const sources = await prepareOperatingSources(sampleCompanies[brand], {
    enabled: true,
    confirmed: true,
  });
  const app = document.getElementById('root')!;
  app.hidden = true;
  const host = document.createElement('main');
  document.body.append(host);
  const heading = document.createElement('h1');
  heading.textContent = 'Disposable saved-source browser fixture';
  host.append(heading);
  const mount = document.createElement('div');
  host.append(mount);
  const root = createRoot(mount);
  let epoch = 0;
  const render = () =>
    root.render(
      <StrictMode>
        <SavedRevisionWorkbench
          key={epoch}
          sources={sources}
          enabled
          selectedJobId={sources.entries[2].target.job_id!}
        />
      </StrictMode>,
    );
  render();
  return {
    job: sources.entries[2].target.job_id!,
    revoke() {
      const original = sources.operations.syntheticMemberships.bind(
        sources.operations,
      );
      sources.operations.syntheticMemberships = (org) =>
        original(org).map((m) => ({ ...m, active: false }));
      epoch++;
      render();
    },
    dispose() {
      root.unmount();
      host.remove();
      app.hidden = false;
    },
  };
}
