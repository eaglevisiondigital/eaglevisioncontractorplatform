// Controlled test document only; no App route, connected client or new business store.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { sampleCompanies } from '../../../src/domain/platform';
import { Operations } from '../../../src/lib/operations';
import { IntakeQueue } from '../../../src/components/IntakeQueue';
import '../../../src/styles.css';

const operations = new Operations(true);
const list = operations.listIntake.bind(operations);
const assign = operations.assignIntake.bind(operations);
type HeldRead = {
  org: string;
  status: string;
  page: number;
  summaries: string[];
  ids: string[];
};
const held: { input: HeldRead; release: () => void }[] = [];
let holdNext = false;
let assignmentCalls = 0;
const assignmentInputs: {
  org: string;
  id: string;
  assignee: string | null;
  status: string;
}[] = [];
let notify = () => {};
operations.listIntake = async (...args) => {
  const result = await list(...args);
  if (holdNext) {
    holdNext = false;
    await new Promise<void>((release) => {
      held.push({
        input: {
          org: args[0],
          status: args[1] ?? '',
          page: args[2] ?? 0,
          summaries: result.rows.map((row) => row.summary),
          ids: result.rows.map((row) => row.id),
        },
        release,
      });
      notify();
    });
  }
  return result;
};
operations.assignIntake = async (...args) => {
  assignmentCalls++;
  assignmentInputs.push({
    org: args[0],
    id: args[1],
    assignee: args[2],
    status: args[3],
  });
  return assign(...args);
};
async function canonical(org: string) {
  const first = await list(org);
  const rows = [...first.rows];
  for (let page = 1; page * 10 < first.count; page++)
    rows.push(...(await list(org, '', page)).rows);
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}
const baseline = new Map<string, string>();

void (async () => {
  for (const company of sampleCompanies) {
    for (let i = 0; i < 16; i++) {
      await operations.sampleSubmit(company.slug, {
        name: `Synthetic inquiry ${i}`,
        email: `intake-${i}@example.test`,
        phone: '555-0100',
        address: `${i} Example Street`,
        city: 'Example City',
        region: 'IL',
        postal_code: '00000',
        country_code: 'US',
        property_type: 'residential',
        service_category: 'Synthetic source-context inquiry',
        description: `${company.id} original inquiry ${String(i).padStart(2, '0')}`,
        preferred_appointment: '',
        contact_preference: 'email',
        email_consent: true,
        sms_consent: false,
        consent_version: 'contact-v1',
      });
      if (i < 6) {
        const request = (await list(company.id)).rows[0];
        await assign(
          company.id,
          request.id,
          null,
          i < 3 ? 'closed' : 'qualified',
        );
      }
    }
    baseline.set(company.id, JSON.stringify(await canonical(company.id)));
  }
  function Harness() {
    const [brand, setBrand] = useState(0);
    const [readOnly, setReadOnly] = useState(false);
    const [, refresh] = useState(0);
    const company = sampleCompanies[brand];
    notify = () => refresh((value) => value + 1);
    (
      window as unknown as { intakeSourceContextTest: unknown }
    ).intakeSourceContextTest = {
      inspect: async () => {
        const rows = await canonical(company.id);
        return {
          organization_id: company.id,
          held: held.map((item) => item.input),
          assignment_calls: assignmentCalls,
          assignments: [...assignmentInputs],
          canonical_rows: rows,
          canonical_unchanged:
            JSON.stringify(rows) === baseline.get(company.id),
        };
      },
    };
    return (
      <main>
        <h1>Original intake source-context test</h1>
        <label>
          Fixture contractor
          <select
            value={brand}
            onChange={(event) => setBrand(Number(event.target.value))}
          >
            {sampleCompanies.map((item, index) => (
              <option key={item.id} value={index}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(event) => setReadOnly(event.target.checked)}
          />
          Read-only fixture view
        </label>
        <button
          onClick={() => {
            holdNext = true;
          }}
        >
          Hold next original read
        </button>
        <button
          onClick={() => {
            const item = held.shift();
            item?.release();
            notify();
          }}
        >
          Release oldest original read
        </button>
        <output aria-label="Held original intake reads">{held.length}</output>
        <IntakeQueue
          key={company.id}
          repo={operations}
          org={company.id}
          canManage={!readOnly}
        />
      </main>
    );
  }
  createRoot(document.getElementById('root')!).render(<Harness />);
})();
