// Controlled browser test document only; never imported by App or a product route.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { sampleCompanies } from '../../../src/domain/platform';
import { SalesApprovalHandoff } from '../../../src/components/phase3/SalesApprovalHandoff';
import type { Decision } from '../../../src/domain/release/types';
import type { SalesHandoffTarget } from '../../../src/lib/sales-approval-handoff';
import { salesHandoffFixture } from '../../helpers/sales-handoff';
import '../../../src/styles.css';

type Fixture = Awaited<ReturnType<typeof salesHandoffFixture>>;
interface ControlledRead {
  fixture: Fixture;
  target: SalesHandoffTarget;
  hold: boolean;
  fail: boolean;
  waiting: (() => void)[];
}
function Harness() {
  const [index, company] = useState(0),
    [choice, choose] = useState<Decision['decision'] | 'missing'>('accepted');
  const [context, setContext] = useState<ControlledRead>(),
    [enabled, enable] = useState(false),
    [busy, working] = useState(false),
    [error, setError] = useState('');
  const [held, setHeld] = useState<ControlledRead>();
  const [preparationEnabled, allowPreparation] = useState(false);
  async function prepare() {
    working(true);
    setError('');
    enable(false);
    allowPreparation(false);
    setContext(undefined);
    try {
      const fixture = await salesHandoffFixture(
        index,
        choice === 'missing' ? null : choice,
      );
      const controlled: ControlledRead = {
        fixture,
        target: fixture.target,
        hold: false,
        fail: false,
        waiting: [],
      };
      const get = fixture.repo.get.bind(fixture.repo);
      fixture.repo.get = async (...args) => {
        const value = await get(...args);
        if (controlled.fail) throw Error('Controlled reader unavailable');
        if (controlled.hold)
          await new Promise<void>((resolve) =>
            controlled.waiting.push(resolve),
          );
        return value;
      };
      setContext(controlled);
      enable(true);
    } catch {
      setError('Unable to prepare controlled evidence.');
    }
    working(false);
  }
  const f = context?.fixture;
  return (
    <main
      style={
        {
          '--company-color': sampleCompanies[index].primary_color,
          padding: 16,
          maxWidth: 1180,
          margin: 'auto',
        } as import('react').CSSProperties
      }
    >
      <h1>Sales handoff controlled test</h1>
      <p>
        Default off. Preparation below creates actual local test-engine
        evidence; no customer delivery, legal signing, work or financial action.
      </p>
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'end',
          marginBottom: 20,
        }}
      >
        <label>
          Fixture contractor
          <select
            value={index}
            disabled={busy}
            onChange={(e) => {
              company(Number(e.target.value));
              allowPreparation(false);
              setContext(undefined);
              enable(false);
            }}
          >
            {sampleCompanies.map((c, i) => (
              <option value={i} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Test preference
          <select
            value={choice}
            disabled={busy}
            onChange={(e) => choose(e.target.value as typeof choice)}
          >
            <option value="accepted">Accepted test preference</option>
            <option value="declined">Declined</option>
            <option value="changes_requested">Changes requested</option>
            <option value="missing">Missing receipt</option>
          </select>
        </label>
        <button disabled={busy} onClick={() => void prepare()}>
          Prepare local test evidence
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {f && context && (
        <details>
          <summary>Controlled evidence fault controls</summary>
          <label>
            <input
              type="checkbox"
              checked={preparationEnabled}
              onChange={(e) => allowPreparation(e.target.checked)}
            />
            Enable preparation checklist
          </label>
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 20,
            }}
          >
            <button onClick={() => enable((v) => !v)}>
              Toggle component off/on
            </button>
            <button
              onClick={() => {
                context.hold = true;
                setHeld(context);
              }}
            >
              Hold source reads
            </button>
            <button
              onClick={() => {
                context.hold = false;
                for (const release of context.waiting.splice(0)) release();
              }}
            >
              Release source reads
            </button>
            <button
              onClick={() => {
                context.fail = true;
              }}
            >
              Fail source reads
            </button>
            <button
              onClick={() => {
                context.fail = false;
              }}
            >
              Restore source reads
            </button>
            <button
              onClick={() =>
                void f.operations.manageMember(
                  f.company.id,
                  f.target.actor_id,
                  false,
                  'staff',
                  'estimator',
                )
              }
            >
              Revoke reviewer
            </button>
            <button onClick={() => void f.repo.revise(f.company.id, f.issued)}>
              Prepare newer private draft
            </button>
            <button
              onClick={() =>
                setContext({
                  ...context,
                  target: { ...context.target, receipt_id: null },
                })
              }
            >
              Inspect missing exact receipt
            </button>
          </div>
        </details>
      )}
      {held && (
        <button
          onClick={() => {
            held.hold = false;
            for (const release of held.waiting.splice(0)) release();
          }}
        >
          Release prior held response
        </button>
      )}
      {f && context && (
        <SalesApprovalHandoff
          enabled={enabled}
          repo={f.repo}
          release={f.release}
          target={context.target}
          preparationEnabled={preparationEnabled}
        />
      )}
    </main>
  );
}
const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(
  location.hostname,
);
if (
  import.meta.env.DEV &&
  import.meta.env.VITE_SALES_HANDOFF_TEST === 'true' &&
  loopback
)
  createRoot(document.getElementById('root')!).render(<Harness />);
else
  document.getElementById('root')!.textContent =
    'Sales handoff test is off. Use the explicitly enabled local development harness.';
