// Controlled test document only. No App import, product route, credentials or persistent store.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Operations } from '../../../src/lib/operations';
import { Phase3Repository } from '../../../src/lib/phase3';
import { sampleCompanies } from '../../../src/domain/platform';
import { Estimates } from '../../../src/components/phase3/Estimates';
import { blankEstimate } from '../../../src/domain/estimating/calculation';
import '../../../src/styles.css';

void (async () => {
  const operations = new Operations(true),
    repo = new Phase3Repository(operations);
  const drafts: import('../../../src/domain/estimating/types').EstimateBundle[] =
    [];
  for (const company of sampleCompanies) {
    await repo.initialize(company);
    const customer = (await operations.listCustomers(company.id)).rows[0];
    for (let i = 0; i < 12; i++)
      await operations.saveCustomer(company.id, {
        display_name: `${company.id} customer ${String(i).padStart(2, '0')}`,
        email: null,
        phone: null,
        customer_type: 'residential',
        preferred_contact: 'email',
      });
    for (let i = 0; i < 13; i++)
      await operations.saveLocation(company.id, customer.id, {
        address_line1: `${company.id} Property ${String(i).padStart(2, '0')}`,
        address_line2: null,
        city: 'Example',
        region: 'IL',
        postal_code: '00000',
        country_code: 'US',
      });
    const property = (
      await operations.listLocationPage(company.id, customer.id, '', 1)
    ).rows[2];
    const input = blankEstimate(customer.id);
    input.location_id = property.id;
    input.project.name = `${company.id} CRM selection draft`;
    drafts.push(await repo.create(company, input));
  }
  const list = operations.listCustomers.bind(operations);
  let hold = false,
    fail = false,
    release: () => void = () => {};
  operations.listCustomers = async (...args) => {
    const value = await list(...args);
    if (fail) throw Error('Synthetic CRM reader unavailable');
    if (hold && args[1] === 'delay')
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return value;
  };
  function Harness() {
    const [index, select] = useState(0);
    const company = sampleCompanies[index];
    return (
      <main
        style={
          {
            '--company-color': company.primary_color,
          } as import('react').CSSProperties
        }
      >
        <h1>Existing estimate CRM pagination test</h1>
        <label>
          Fixture contractor
          <select
            value={index}
            onChange={(e) => select(Number(e.target.value))}
          >
            {sampleCompanies.map((c, i) => (
              <option key={c.id} value={i}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            hold = true;
          }}
        >
          Hold CRM response
        </button>
        <button
          onClick={() => {
            hold = false;
            release();
          }}
        >
          Release CRM response
        </button>
        <button
          onClick={() => {
            fail = true;
          }}
        >
          Fail next CRM read
        </button>
        <button
          onClick={() => {
            fail = false;
          }}
        >
          Restore CRM reads
        </button>
        <Estimates
          key={company.id}
          repo={repo}
          company={company}
          canIssue={false}
          initialBundle={drafts[index]}
        />
      </main>
    );
  }
  createRoot(document.getElementById('root')!).render(<Harness />);
})();
