// Explicit existing-engine synthetic browser fixture; no product route or client.
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { Estimates } from '../../../src/components/phase3/Estimates';
import { Phase3Repository } from '../../../src/lib/phase3';
import { prototypeFixture } from '../../program/prototype-fixture';
import { sampleCompanies } from '../../../src/domain/platform';
import type { EstimateSummary } from '../../../src/domain/estimating/types';
import '../../../src/styles.css';
declare global {
  interface Window {
    estimateNavigation: {
      deny: () => void;
      disable: () => void;
      reset: () => void;
      holdRead: () => void;
      holdAuthority: () => void;
      release: () => void;
      company: (index: number) => void;
      replaceRepo: () => void;
      corruptBundle: (kind: string) => void;
      corruptList: (kind: string) => void;
      mutateLoaded: () => void;
      shrink: () => void;
      initial: () => string;
      counts: () => { reads: number; writes: number };
    };
  }
}
void (async () => {
  const fixtures = await Promise.all(
    sampleCompanies.slice(0, 2).map((c) => prototypeFixture(c)),
  );
  const rows: EstimateSummary[][] = [];
  for (const [brand, fixture] of fixtures.entries()) {
    rows[brand] = [];
    for (let index = 0; index < 12; index++) {
      const input = structuredClone(fixture.bundle.version.payload);
      input.project.name = `B${brand} Navigation estimate ${String(index).padStart(2, '0')}`;
      let bundle = await fixture.repo.create(fixture.company, input);
      bundle = await fixture.repo.issue(fixture.company.id, bundle);
      rows[brand].push(bundle.estimate);
    }
  }
  const state = {
    denied: false,
    disabled: false,
    holdRead: false,
    holdAuthority: false,
    corruptBundle: '',
    corruptList: '',
    release: () => {},
  };
  let company = 0,
    reads = 0,
    writes = 0,
    loaded: EstimateSummary[] = [],
    initial = false,
    mount = 0;
  const wait = () =>
    new Promise<void>((resolve) => {
      state.release = resolve;
    });
  const repos = fixtures.map((fixture) => fixture.repo);
  for (const [index, fixture] of fixtures.entries()) {
    const access = fixture.ops.companyAccess.bind(fixture.ops);
    fixture.ops.companyAccess = async (...args) => {
      if (state.holdAuthority && reads > 0) {
        state.holdAuthority = false;
        await wait();
      }
      return { ...(await access(...args)), estimates: !state.denied };
    };
    const modules = fixture.ops.listModules.bind(fixture.ops);
    fixture.ops.listModules = async (...args) =>
      (await modules(...args)).map((m) => ({
        ...m,
        enabled: m.module === 'estimates' ? !state.disabled : m.enabled,
      }));
    fixture.repo.list = async () => {
      loaded = structuredClone(rows[index]);
      if (state.corruptList === 'foreign')
        loaded.push({
          ...loaded[0],
          organization_id: 'OTHER_COMPANY',
          project_name: 'PRIVATE_FOREIGN_NAME',
        });
      if (state.corruptList === 'duplicate')
        loaded.push(structuredClone(loaded[0]));
      return loaded;
    };
    const get = fixture.repo.get.bind(fixture.repo);
    fixture.repo.get = async (...args) => {
      reads++;
      if (state.holdRead) {
        state.holdRead = false;
        await wait();
      }
      if (state.corruptBundle === 'error') throw Error('PRIVATE_READ_ERROR');
      const bundle = await get(...args);
      if (state.corruptBundle === 'foreign')
        bundle.estimate.organization_id = 'OTHER_COMPANY';
      if (state.corruptBundle === 'estimate')
        bundle.estimate.id = crypto.randomUUID();
      if (state.corruptBundle === 'version')
        bundle.version.id = crypto.randomUUID();
      if (state.corruptBundle === 'customer')
        bundle.version.payload.customer_id = crypto.randomUUID();
      if (state.corruptBundle === 'stale')
        bundle.estimate.updated_at = '1999-01-01T00:00:00Z';
      return bundle;
    };
    for (const name of [
      'create',
      'save',
      'issue',
      'revise',
      'approveJob',
      'duplicate',
      'archive',
    ] as const)
      Reflect.set(fixture.repo, name, () => {
        writes++;
        throw Error('No writer belongs in navigation');
      });
  }
  const root = createRoot(document.getElementById('root')!);
  function render() {
    const fixture = fixtures[company];
    root.render(
      <StrictMode>
        <main>
          <h1>Controlled estimate navigation</h1>
          <p data-testid="company">{fixture.company.name}</p>
          <Estimates
            key={mount}
            repo={repos[company]}
            company={fixture.company}
            canIssue={false}
            initialBundle={initial ? fixtures[company].bundle : undefined}
          />
        </main>
      </StrictMode>,
    );
  }
  window.estimateNavigation = {
    deny: () => {
      state.denied = true;
    },
    disable: () => {
      state.disabled = true;
    },
    reset: () => {
      state.denied = false;
      state.disabled = false;
      state.corruptBundle = '';
      state.corruptList = '';
    },
    holdRead: () => {
      state.holdRead = true;
    },
    holdAuthority: () => {
      state.holdAuthority = true;
    },
    release: () => state.release(),
    company: (index) => {
      company = index;
      render();
    },
    replaceRepo: () => {
      const original = repos[company];
      const next = new Phase3Repository(fixtures[company].ops);
      for (const key of [
        'list',
        'get',
        'defaults',
        'templates',
        'catalog',
        'taxes',
        'history',
        'customerRevisionOrigin',
        'repairOrigin',
      ] as const)
        Reflect.set(next, key, Reflect.get(original, key).bind(original));
      for (const key of [
        'create',
        'save',
        'issue',
        'revise',
        'approveJob',
        'duplicate',
        'archive',
      ] as const)
        Reflect.set(next, key, () => {
          writes++;
          throw Error('No writer belongs in navigation');
        });
      repos[company] = next;
      render();
    },
    corruptBundle: (kind) => {
      state.corruptBundle = kind;
    },
    corruptList: (kind) => {
      state.corruptList = kind;
    },
    mutateLoaded: () => {
      loaded[0].project_name = 'CHANGED_DURING_READ';
    },
    shrink: () => {
      rows[company].splice(1);
    },
    initial: () => {
      initial = true;
      mount++;
      render();
      return fixtures[company].bundle.version.payload.project.name;
    },
    counts: () => ({ reads, writes }),
  };
  render();
})();
