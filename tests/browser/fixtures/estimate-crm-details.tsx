// Explicit fictional CRM fixture; no connected client or product factory.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { EstimateCrmSelection } from '../../../src/components/phase3/EstimateCrmSelection';
import { Operations } from '../../../src/lib/operations';
import { sampleCompanies } from '../../../src/domain/platform';
import '../../../src/styles.css';

declare global {
  interface Window {
    estimateCrmDetails: {
      counts: () => {
        reads: number;
        writes: number;
        selections: number;
        waiting: boolean;
      };
      identities: () => {
        customer: string;
        property: string;
        otherCustomer: string;
      };
      hold: () => void;
      release: () => void;
      corrupt: (kind: string) => void;
      fail: () => void;
      select: (index: number) => void;
      replace: () => void;
      replacePending: () => {
        customerDisabled: boolean;
        customerOptions: string[];
        propertyOptions: string[];
      };
      target: (kind: string) => void;
      disable: () => void;
    };
  }
}
void (async () => {
  const fixtures = await Promise.all(
    sampleCompanies.slice(0, 2).map(async (company, index) => {
      const operations = new Operations(true);
      const selected = await operations.saveCustomer(company.id, {
        display_name: 'Taylor Example',
        email: index
          ? 'taylor.first.other-company@example.test'
          : 'taylor.first@example.test',
        phone: '555-0111',
        customer_type: 'residential',
        preferred_contact: 'email',
      });
      const other = await operations.saveCustomer(company.id, {
        display_name: 'Taylor Example',
        email: 'taylor.second@example.test',
        phone: '555-0222',
        customer_type: 'commercial',
        preferred_contact: 'phone',
      });
      await operations.saveLocation(company.id, selected.id, {
        address_line1: '100 Fictional Review Lane',
        address_line2: 'Suite B',
        city: 'Example City',
        region: 'TX',
        postal_code: '00001',
        country_code: 'US',
      });
      const property = (
        await operations.listLocations(company.id, selected.id)
      )[0];
      await operations.saveLocation(company.id, other.id, {
        address_line1: '100 Fictional Review Lane',
        address_line2: 'Suite C',
        city: 'Other City',
        region: 'TX',
        postal_code: '00002',
        country_code: 'US',
      });
      for (let i = 0; i < 11; i++)
        await operations.saveCustomer(company.id, {
          display_name: `Other fictional customer ${i}`,
          email: `other${i}@example.test`,
          phone: null,
          customer_type: 'residential',
          preferred_contact: 'email',
        });
      return { company, operations, selected, other, property };
    }),
  );
  let selected = 0,
    reads = 0,
    writes = 0,
    selections = 0,
    hold = false,
    waiting = false,
    release = () => {},
    corrupt = '',
    failed = false,
    replacement = false,
    disabled = false;
  let customer = fixtures[0].selected.id,
    location: string | null = fixtures[0].property.id;
  for (const f of fixtures) {
    const list = f.operations.listCustomers.bind(f.operations);
    f.operations.listCustomers = async (...args) => {
      reads++;
      const fromReplacement = replacement;
      const value = await list(...args);
      if (fromReplacement) {
        const row = value.rows.find((c) => c.id === f.selected.id);
        if (row) row.email = 'replacement-context@example.test';
      }
      if (corrupt === 'page-tenant' && value.rows.length)
        value.rows[0].organization_id = 'foreign-company';
      if (corrupt === 'page-duplicate' && value.rows.length)
        value.rows.push(structuredClone(value.rows[0]));
      if (corrupt === 'count') value.count = -1;
      if (corrupt === 'mixed') {
        const row = value.rows.find((c) => c.id === f.selected.id);
        if (row) row.email = 'conflicting-page@example.test';
      }
      return value;
    };
    const get = f.operations.getCustomer.bind(f.operations);
    f.operations.getCustomer = async (...args) => {
      reads++;
      const fromReplacement = replacement;
      const value = await get(...args);
      if (fromReplacement) value.email = 'replacement-context@example.test';
      if (hold) {
        hold = false;
        waiting = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        waiting = false;
      }
      if (failed)
        throw Error(
          'PRIVATE transport/account diagnostic must not be rendered',
        );
      if (corrupt === 'customer-tenant')
        value.organization_id = 'foreign-company';
      if (corrupt === 'customer-id') value.id = 'wrong-customer';
      return value;
    };
    const locations = f.operations.listLocationPage.bind(f.operations);
    f.operations.listLocationPage = async (...args) => {
      reads++;
      const value = await locations(...args);
      if (corrupt === 'location-page' && value.rows.length)
        value.rows[0].customer_id = 'wrong-customer';
      if (corrupt === 'incomplete')
        for (const row of value.rows) {
          row.address_line1 = '';
          row.city = '';
          row.region = '';
          row.postal_code = '';
          row.country_code = '';
        }
      return value;
    };
    const prop = f.operations.getLocation.bind(f.operations);
    f.operations.getLocation = async (...args) => {
      reads++;
      const value = await prop(...args);
      if (corrupt === 'property-tenant')
        value.organization_id = 'foreign-company';
      if (corrupt === 'property-customer') value.customer_id = 'wrong-customer';
      if (corrupt === 'property-id') value.id = 'wrong-property';
      if (corrupt === 'incomplete') {
        value.address_line1 = '';
        value.city = '';
        value.region = '';
        value.postal_code = '';
        value.country_code = '';
      }
      return value;
    };
    for (const name of [
      'saveCustomer',
      'saveLocation',
      'addNote',
      'recordConsent',
    ])
      Reflect.set(f.operations, name, () => {
        writes++;
        throw Error('Unexpected command');
      });
    for (const name of ['companyAccess', 'listModules'])
      Reflect.set(f.operations, name, () => {
        throw Error('No extra authority reads permitted in picker details');
      });
  }
  const root = createRoot(document.getElementById('root')!);
  const render = () => {
    const f = fixtures[selected];
    root.render(
      <main>
        <h1>Fictional estimate CRM selection</h1>
        <label>
          Unsaved project note
          <input defaultValue="" />
        </label>
        <EstimateCrmSelection
          operations={replacement ? Object.create(f.operations) : f.operations}
          org={f.company.id}
          customerId={customer}
          locationId={location}
          disabled={disabled}
          onChange={(c, l) => {
            selections++;
            customer = c;
            location = l;
            render();
          }}
        />
      </main>,
    );
  };
  window.estimateCrmDetails = {
    counts: () => ({ reads, writes, selections, waiting }),
    identities: () => ({
      customer,
      property: fixtures[selected].property.id,
      otherCustomer: fixtures[selected].other.id,
    }),
    hold: () => {
      hold = true;
    },
    release: () => release(),
    corrupt: (kind) => {
      corrupt = kind;
    },
    fail: () => {
      failed = true;
    },
    select: (index) => {
      selected = index;
      replacement = false;
      customer = fixtures[index].selected.id;
      location = fixtures[index].property.id;
      render();
    },
    replace: () => {
      replacement = true;
      render();
    },
    replacePending: () => {
      replacement = true;
      hold = true;
      flushSync(() => render());
      const selects = document.querySelectorAll('select');
      return {
        customerDisabled: selects[0].disabled,
        customerOptions: Array.from(selects[0].options, (o) => o.text),
        propertyOptions: Array.from(selects[1].options, (o) => o.text),
      };
    },
    target: (kind) => {
      if (kind === 'other') {
        customer = fixtures[selected].other.id;
        location = null;
      } else {
        customer = fixtures[selected].selected.id;
        location = null;
      }
      render();
    },
    disable: () => {
      disabled = true;
      render();
    },
  };
  render();
})();
