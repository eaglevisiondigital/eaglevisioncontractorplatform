// Fictional existing-engine customer-to-private-draft fixture; no connected client.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Estimates } from '../../../src/components/phase3/Estimates';
import { prototypeFixture } from '../../program/prototype-fixture';
import { sampleCompanies } from '../../../src/domain/platform';
import type { Customer } from '../../../src/lib/operations';
import '../../../src/styles.css';
declare global {
  interface Window {
    estimateCustomerStart: {
      ids: () => { first: string; chosen: string; template: string };
      counts: () => {
        creates: number;
        otherWrites: number;
        customerReads: number;
      };
      created: () => {
        organization: string;
        payloadCustomer: string;
        snapshotCustomer: string;
        project: string;
        terms: string;
        currency: string;
        markup: number;
      }[];
      corrupt: (kind: string) => void;
      lookup: (kind: string) => void;
      hold: () => void;
      holdCreate: () => void;
      waiting: () => boolean;
      waitingCreate: () => boolean;
      release: () => void;
      removeLoaded: () => void;
      company: (index: number) => void;
      replaceRepo: () => void;
      deny: () => void;
      disable: () => void;
      sameIdReload: () => void;
      prepareInputs: () => void;
      mutateInputs: () => void;
    };
  }
}
void (async () => {
  const fixtures = await Promise.all(
    sampleCompanies.slice(0, 2).map(async (company) => {
      const f = await prototypeFixture(company);
      const chosen = await f.ops.saveCustomer(company.id, {
        display_name: 'Fictional chosen customer',
        email: 'chosen' + company.id.slice(-4) + '@example.test',
        phone: '555-0202',
        customer_type: 'commercial',
        preferred_contact: 'email',
      });
      const first = await f.ops.saveCustomer(company.id, {
        display_name: 'Fictional first customer',
        email: 'first@example.test',
        phone: '555-0101',
        customer_type: 'residential',
        preferred_contact: 'phone',
      });
      const templates = await f.repo.templates(company.id);
      return { ...f, chosen, first, template: templates[0].id };
    }),
  );
  let selected = 0,
    replacement = false,
    creates = 0,
    otherWrites = 0,
    customerReads = 0;
  let loaded: Customer[] = [];
  let loadedDefaults:
    | Awaited<ReturnType<(typeof fixtures)[number]['repo']['defaults']>>
    | undefined;
  let loadedTemplates: Awaited<
    ReturnType<(typeof fixtures)[number]['repo']['templates']>
  > = [];
  const state = {
    corrupt: '',
    lookup: '',
    hold: false,
    holdCreate: false,
    waitingCreate: false,
    waiting: false,
    release: () => {},
    denied: false,
    disabled: false,
  };
  const outcomes: {
    organization: string;
    payloadCustomer: string;
    snapshotCustomer: string;
    project: string;
    terms: string;
    currency: string;
    markup: number;
  }[] = [];
  for (const f of fixtures) {
    const list = f.ops.listCustomers.bind(f.ops);
    f.ops.listCustomers = async (...args) => {
      const value = await list(...args);
      if (state.corrupt === 'foreign')
        value.rows[0].organization_id = 'FOREIGN_COMPANY';
      if (state.corrupt === 'duplicate')
        value.rows.push(structuredClone(value.rows[0]));
      if (state.corrupt === 'empty') value.rows = [];
      if (state.corrupt === 'sparse') value.rows = new Array<Customer>(1);
      if (state.corrupt === 'malformed')
        Reflect.set(value.rows[0], 'display_name', 7);
      loaded = value.rows;
      return value;
    };
    const get = f.ops.getCustomer.bind(f.ops);
    f.ops.getCustomer = async (...args) => {
      customerReads++;
      const row = await get(...args);
      if (state.hold) {
        state.hold = false;
        state.waiting = true;
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
        state.waiting = false;
      }
      if (state.lookup === 'missing')
        throw Error('PRIVATE removed-customer diagnostic');
      if (state.lookup === 'foreign') row.organization_id = 'FOREIGN_COMPANY';
      if (state.lookup === 'wrong') row.id = f.first.id;
      if (state.lookup === 'changed') row.display_name += ' changed';
      if (state.lookup === 'malformed') Reflect.set(row, 'display_name', 7);
      return row;
    };
    const access = f.ops.companyAccess.bind(f.ops);
    f.ops.companyAccess = async (...args) => ({
      ...(await access(...args)),
      estimates: !state.denied,
    });
    const modules = f.ops.listModules.bind(f.ops);
    f.ops.listModules = async (...args) =>
      (await modules(...args)).map((m) => ({
        ...m,
        enabled: m.module === 'estimates' ? !state.disabled : m.enabled,
      }));
    const create = f.repo.create.bind(f.repo);
    const defaults = f.repo.defaults.bind(f.repo);
    f.repo.defaults = async (...args) => {
      loadedDefaults = await defaults(...args);
      return loadedDefaults;
    };
    const templates = f.repo.templates.bind(f.repo);
    f.repo.templates = async (...args) => {
      loadedTemplates = await templates(...args);
      return loadedTemplates;
    };
    f.repo.create = async (...args) => {
      creates++;
      const bundle = await create(...args);
      outcomes.push({
        organization: bundle.estimate.organization_id,
        payloadCustomer: bundle.version.payload.customer_id,
        snapshotCustomer: bundle.version.customer_snapshot.id,
        project: bundle.version.payload.project.name,
        terms: bundle.version.payload.terms,
        currency: bundle.version.payload.currency,
        markup: bundle.version.payload.lines[0].markup_bps,
      });
      if (state.holdCreate) {
        state.holdCreate = false;
        state.waitingCreate = true;
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
        state.waitingCreate = false;
      }
      return bundle;
    };
    for (const name of [
      'save',
      'issue',
      'revise',
      'approveJob',
      'duplicate',
      'archive',
    ] as const) {
      const original = f.repo[name].bind(f.repo);
      Reflect.set(f.repo, name, (...args: unknown[]) => {
        otherWrites++;
        return Reflect.apply(original, undefined, args);
      });
    }
  }
  const root = createRoot(document.getElementById('root')!);
  const render = () => {
    const f = fixtures[selected];
    root.render(
      <main>
        <h1>Fictional customer-to-estimate workflow</h1>
        <Estimates
          repo={replacement ? Object.create(f.repo) : f.repo}
          company={f.company}
          canIssue={false}
        />
      </main>,
    );
  };
  window.estimateCustomerStart = {
    ids: () => ({
      first: fixtures[selected].first.id,
      chosen: fixtures[selected].chosen.id,
      template: fixtures[selected].template,
    }),
    counts: () => ({ creates, otherWrites, customerReads }),
    created: () => structuredClone(outcomes),
    corrupt: (kind) => {
      state.corrupt = kind;
    },
    lookup: (kind) => {
      state.lookup = kind;
    },
    hold: () => {
      state.hold = true;
    },
    holdCreate: () => {
      state.holdCreate = true;
    },
    waiting: () => state.waiting,
    waitingCreate: () => state.waitingCreate,
    release: () => state.release(),
    removeLoaded: () => {
      loaded.splice(
        0,
        loaded.length,
        ...loaded.filter((c) => c.id !== fixtures[selected].chosen.id),
      );
    },
    company: (index) => {
      selected = index;
      replacement = false;
      flushSync(() => render());
    },
    replaceRepo: () => {
      replacement = true;
      flushSync(() => render());
    },
    deny: () => {
      state.denied = true;
    },
    disable: () => {
      state.disabled = true;
    },
    sameIdReload: () => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Refresh estimates',
      )!;
      flushSync(() => button.click());
    },
    prepareInputs: () => {
      if (!loadedDefaults) throw Error('Fixture defaults not loaded');
      loadedDefaults.default_terms = 'CLICK DEFAULT TERMS';
      loadedDefaults.currency = 'USD';
      loadedDefaults.material_markup_bps = 1234;
      const f = fixtures[selected];
      const template = loadedTemplates.find((t) => t.id === f.template)!;
      template.content.project = {
        ...f.bundle.version.payload.project,
        name: 'CLICK TEMPLATE PROJECT',
      };
      template.content.terms = 'CLICK TEMPLATE TERMS';
      template.content.currency = 'USD';
      template.content.customer_id = f.first.id;
      template.content.lines = structuredClone(f.bundle.version.payload.lines);
      template.content.lines[0].markup_bps = 2345;
    },
    mutateInputs: () => {
      if (!loadedDefaults) throw Error('Fixture defaults not loaded');
      loadedDefaults.default_terms = 'MUTATED AFTER CLICK';
      loadedDefaults.currency = 'CAD';
      loadedDefaults.material_markup_bps = 9876;
      const template = loadedTemplates.find(
        (t) => t.id === fixtures[selected].template,
      )!;
      template.content.project!.name = 'MUTATED AFTER CLICK';
      template.content.terms = 'MUTATED AFTER CLICK';
      template.content.currency = 'CAD';
      template.content.lines![0].markup_bps = 9876;
    },
  };
  render();
})();
