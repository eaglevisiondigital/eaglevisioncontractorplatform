// Intercepted test document only. These sample capabilities are not caller Auth.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Operations } from '../../../src/lib/operations';
import { sampleCompanies } from '../../../src/domain/platform';
import { IntakeQueue } from '../../../src/components/IntakeQueue';
import '../../../src/styles.css';

interface Configuration {
  brand: number;
  members: 'normal' | 'hold' | 'fail';
}
const configuration = (
  window as unknown as { intakeAuthorityConfiguration: Configuration }
).intakeAuthorityConfiguration;
if (
  !configuration ||
  ![0, 1, 2].includes(configuration.brand) ||
  !['normal', 'hold', 'fail'].includes(configuration.members)
)
  throw Error('Exact test fixture configuration required');
const operations = new Operations(true);
const list = operations.listIntake.bind(operations),
  members = operations.listMembers.bind(operations),
  assign = operations.assignIntake.bind(operations);
let notify = () => {};
let memberMode = configuration.members;
let holdRead = false,
  failRead = false,
  memberErrors = 0,
  readErrors = 0;
const heldMembers: { ids: string[]; release: () => void }[] = [];
const heldReads: {
  org: string;
  status: string;
  page: number;
  ids: string[];
  summaries: string[];
  release: () => void;
}[] = [];
const assignments: {
  org: string;
  id: string;
  assignee: string | null;
  status: string;
  outcome: string;
  error?: string;
}[] = [];
operations.listMembers = async (...args) => {
  const result = await members(...args);
  const mode = memberMode;
  memberMode = 'normal';
  if (mode === 'fail') {
    memberErrors++;
    throw Error('Synthetic original member lookup unavailable');
  }
  if (mode === 'hold')
    await new Promise<void>((release) => {
      heldMembers.push({ ids: result.map((row) => row.user_id), release });
      notify();
    });
  return result;
};
operations.listIntake = async (...args) => {
  const result = await list(...args);
  if (failRead) {
    failRead = false;
    readErrors++;
    throw Error('Synthetic original intake read unavailable');
  }
  if (holdRead) {
    holdRead = false;
    await new Promise<void>((release) => {
      heldReads.push({
        org: args[0],
        status: args[1] ?? '',
        page: args[2] ?? 0,
        ids: result.rows.map((row) => row.id),
        summaries: result.rows.map((row) => row.summary),
        release,
      });
      notify();
    });
  }
  return result;
};
operations.assignIntake = async (...args) => {
  const observation = {
    org: args[0],
    id: args[1],
    assignee: args[2],
    status: args[3],
    outcome: 'PENDING',
  } as (typeof assignments)[number];
  assignments.push(observation);
  try {
    await assign(...args);
    observation.outcome = 'FULFILLED';
  } catch (error) {
    observation.outcome = 'REJECTED';
    observation.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
};
async function canonical(org: string) {
  const first = await list(org),
    rows = [...first.rows];
  for (let page = 1; page * 10 < first.count; page++)
    rows.push(...(await list(org, '', page)).rows);
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}
const baselines = new Map<string, string>();
void (async () => {
  for (const company of sampleCompanies) {
    for (let index = 0; index < 16; index++) {
      await operations.sampleSubmit(company.slug, {
        name: `Synthetic authority inquiry ${index}`,
        email: `authority-${index}@example.test`,
        phone: '555-0100',
        address: `${index} Example Street`,
        city: 'Example',
        region: 'IL',
        postal_code: '00000',
        country_code: 'US',
        property_type: 'residential',
        service_category: 'Synthetic authority inquiry',
        description: `${company.id} canonical authority inquiry ${String(index).padStart(2, '0')}`,
        preferred_appointment: '',
        contact_preference: 'email',
        email_consent: true,
        sms_consent: false,
        consent_version: 'contact-v1',
      });
      if (index < 6)
        await assign(
          company.id,
          (await list(company.id)).rows[0].id,
          null,
          index < 3 ? 'closed' : 'qualified',
        );
    }
    baselines.set(company.id, JSON.stringify(await canonical(company.id)));
  }
  function Harness() {
    const [brand, setBrand] = useState(configuration.brand),
      [readOnly, setReadOnly] = useState(false),
      [, refresh] = useState(0);
    const company = sampleCompanies[brand];
    notify = () => refresh((value) => value + 1);
    (
      window as unknown as { intakeAuthorityTest: unknown }
    ).intakeAuthorityTest = {
      inspect: async () => {
        const rows = await canonical(company.id);
        return {
          organization_id: company.id,
          rows,
          canonical_unchanged:
            JSON.stringify(rows) === baselines.get(company.id),
          members: await members(company.id),
          assignments: [...assignments],
          held_member_reads: heldMembers.map(({ ids }) => ({ ids })),
          held_intake_reads: heldReads.map(
            ({ org, status, page, ids, summaries }) => ({
              org,
              status,
              page,
              ids,
              summaries,
            }),
          ),
          member_errors: memberErrors,
          read_errors: readErrors,
          visibility_only_canManage: !readOnly,
          caller_authority: 'NOT_MODELED_BY_SAMPLE_OPERATIONS',
        };
      },
    };
    return (
      <main
        style={
          {
            '--company-color': company.primary_color,
          } as import('react').CSSProperties
        }
      >
        <h1>Original intake current-authority regression fixture</h1>
        <p>
          Local sample source/assignee controls only. Caller authority is
          separately tested in native SQL.
        </p>
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
          UI-only read visibility
        </label>
        <button
          type="button"
          onClick={() => {
            holdRead = true;
          }}
        >
          Hold next original inquiry read
        </button>
        <button
          type="button"
          onClick={() => {
            failRead = true;
          }}
        >
          Fail next original inquiry read
        </button>
        <button
          type="button"
          onClick={() => {
            heldReads.shift()?.release();
            notify();
          }}
        >
          Release original inquiry read
        </button>
        <button
          type="button"
          onClick={() => {
            heldMembers.shift()?.release();
            notify();
          }}
        >
          Release original member read
        </button>
        <button
          type="button"
          onClick={async () => {
            await operations.manageMember(
              company.id,
              `${company.id}-field`,
              false,
              'staff',
              'field_staff',
            );
            notify();
          }}
        >
          Revoke original field assignee
        </button>
        <output aria-label="Held inquiry reads">{heldReads.length}</output>
        <output aria-label="Held member reads">{heldMembers.length}</output>
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
