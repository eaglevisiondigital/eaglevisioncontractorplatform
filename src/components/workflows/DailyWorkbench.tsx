import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import {
  dailyWorkbenchSteps,
  type DailyWorkbenchProps,
  type DailyWorkbenchStep,
} from '../../lib/workflows/daily-workbench-contract';
import {
  readDailyWorkContext,
  assertDailyWorkContextNow,
  continueDailyWorkContext,
  reconcileDailyWorkContext,
  readNextDailyWorkContext,
  type DailyWorkContext,
} from '../../lib/workflows/daily-workbench-runtime';
import { SharedRecordSearch } from './SharedRecordSearch';
import { FieldAgenda } from './FieldAgenda';
import { CostInvoiceReview } from './CostInvoiceReview';
import { ServiceUpdateReview } from './ServiceUpdateReview';
import { MaintenanceAgenda } from './MaintenanceAgenda';
import { PriorityActions } from './PriorityActions';
import './daily-workbench.css';
const labels: Record<DailyWorkbenchStep, string> = {
  priorities: 'Today’s priorities',
  field: 'Work orders',
  finance: 'Cost review',
  invoice: 'Invoice preparation review',
  customer: 'Customer update review',
  maintenance: 'Maintenance opportunities',
  advanced: 'Advanced task review',
};
export function DailyWorkbench(props: DailyWorkbenchProps) {
  const admitted =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  let check: (() => void) | undefined;
  if (admitted)
    try {
      check = captureOperatingSources(props.sources, {
        enabled: true,
        confirmed: true,
      }).check;
      check();
    } catch {
      /* Current authorized source required. */
    }
  const [binding, setBinding] = useState({
    sources: props.sources,
    hint: props.selectedJobId,
    admitted: Boolean(check),
    check,
    epoch: 0,
  });
  let changed = false;
  if (binding.check)
    try {
      binding.check();
    } catch {
      changed = true;
    }
  if (
    binding.sources !== props.sources ||
    binding.hint !== props.selectedJobId ||
    binding.admitted !== Boolean(check) ||
    changed
  ) {
    setBinding({
      sources: props.sources,
      hint: props.selectedJobId,
      admitted: Boolean(check),
      check,
      epoch: binding.epoch + 1,
    });
    return null;
  }
  return admitted && check ? (
    <Workbench key={binding.epoch} {...props} />
  ) : (
    <section aria-label="Daily contractor workbench">
      <h2>Daily contractor workbench</h2>
      <p>
        Daily workflow is off or authorized sources are unavailable. No
        operational action is enabled.
      </p>
    </section>
  );
}
function Workbench({
  sources,
  selectedJobId,
  onSelectJob,
}: DailyWorkbenchProps) {
  const [context, setContext] = useState<DailyWorkContext | null>(null),
    [step, setStep] = useState<DailyWorkbenchStep>('priorities'),
    [visited, setVisited] = useState<DailyWorkbenchStep[]>(['priorities']),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(
      'Review priorities, then use Find another record to select an exact prepared job.',
    );
  const [admission] = useState(() => ({ enabled: true, confirmed: true }));
  const gate = useRef(admission),
    live = useRef(true),
    pending = useRef(false),
    selected = useRef<DailyWorkContext | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    serial = useRef(0);
  const [capture] = useState(() => captureOperatingSources(sources, admission));
  useLayoutEffect(() => {
    selected.current = context;
  }, [context]);
  useEffect(() => {
    const g = gate.current,
      generation = serial;
    g.enabled = true;
    g.confirmed = true;
    live.current = true;
    return () => {
      live.current = false;
      g.enabled = false;
      generation.current++;
    };
  }, []);
  const go = useCallback(
    async (jobId: string, destination: DailyWorkbenchStep) => {
      if (pending.current || !live.current) return;
      const token = ++serial.current;
      pending.current = true;
      setBusy(true);
      try {
        capture.check();
        if (!dailyWorkbenchSteps.includes(destination))
          throw Error('Unknown presentation step');
        const old = selected.current;
        const next =
          old?.job_id === jobId
            ? old
            : await readDailyWorkContext(sources, jobId, gate.current);
        if (!live.current || token !== serial.current)
          throw Error('Selection changed');
        capture.check();
        const dispatch = () => {
          if (!live.current || token !== serial.current)
            throw Error('Withdrawn local continuation');
          selected.current = next;
          setContext(next);
          setStep(destination);
          setVisited((previous) =>
            old?.job_id === jobId
              ? [...new Set([...previous, destination])]
              : [destination],
          );
        };
        const result = await continueDailyWorkContext(
          next,
          destination,
          dispatch,
          () =>
            live.current && token === serial.current ? dispatch : undefined,
        );
        if (result.status !== 'CURRENT_REVIEW_ONLY')
          throw Error('Outcome unknown');
        if (live.current) {
          setStatus(
            'Exact source retained. Visited steps are local review context, not completed work or authority.',
          );
          requestAnimationFrame(() => heading.current?.focus());
        }
      } catch {
        if (live.current)
          setStatus(
            'Source or navigation outcome UNKNOWN. No automatic retry or replacement; current evidence must be inspected read only.',
          );
      } finally {
        pending.current = false;
        if (live.current) setBusy(false);
      }
    },
    [capture, sources],
  );
  // Child continuations acknowledge a synchronous local view change only. Each
  // child independently verified its source before calling; no hidden async work.
  const continuation = useCallback(
    (id: string, destination: DailyWorkbenchStep) => {
      const active = selected.current;
      if (
        !live.current ||
        pending.current ||
        !active ||
        active.job_id !== id ||
        !dailyWorkbenchSteps.includes(destination)
      )
        throw Error('Exact current selected daily job required');
      capture.check();
      assertDailyWorkContextNow(active);
      setStep(destination);
      setVisited((previous) => [...new Set([...previous, destination])]);
      setStatus(
        'Exact local review step selected. Visited is not work, invoice or communication completion.',
      );
      capture.check();
      assertDailyWorkContextNow(active);
      requestAnimationFrame(() => heading.current?.focus());
    },
    [capture],
  );
  const select = useCallback(
    (id: string) => {
      void go(id, 'field');
    },
    [go],
  );
  useEffect(() => {
    // React StrictMode withdraws the first effect before its queued read starts.
    // This is a cancelled read admission, never a replay of an invoked action.
    let active = true;
    queueMicrotask(() => {
      if (active && selectedJobId) void go(selectedJobId, 'priorities');
    });
    return () => {
      active = false;
    };
  }, [selectedJobId, go]);
  let current = true;
  try {
    capture.check();
    if (context) assertDailyWorkContextNow(context);
  } catch {
    current = false;
  }
  async function nextJob() {
    if (!context || pending.current || !current) return;
    pending.current = true;
    setBusy(true);
    const token = ++serial.current;
    try {
      const next = await readNextDailyWorkContext(context);
      capture.check();
      if (!live.current || token !== serial.current)
        throw Error('Context changed');
      if (!next) {
        setStatus(
          'End of the available prepared job list. This does not claim complete company history.',
        );
        return;
      }
      const dispatch = () => {
        if (!live.current || token !== serial.current)
          throw Error('Withdrawn next job');
        selected.current = next;
        setContext(next);
        setStep('priorities');
        setVisited(['priorities']);
      };
      const result = await continueDailyWorkContext(
        context,
        'priorities',
        dispatch,
        () => (live.current && token === serial.current ? dispatch : undefined),
      );
      if (result.status !== 'CURRENT_REVIEW_ONLY')
        throw Error('Next outcome UNKNOWN');
      setStatus(
        'Next exact prepared job selected; previous review visits confer no completion or authority.',
      );
      requestAnimationFrame(() => heading.current?.focus());
    } catch {
      if (live.current)
        setStatus(
          'Next-job outcome UNKNOWN. No replay or guessed replacement.',
        );
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  const props: DailyWorkbenchProps = {
    sources,
    enabled: true,
    selectedJobId: current ? context?.job_id : undefined,
    onSelectJob,
    onContinue: context ? continuation : undefined,
  };
  return (
    <section
      className="daily-workbench"
      aria-label="Daily contractor workbench"
      aria-busy={busy}
    >
      <header>
        <p>Daily operating workflow · local synthetic review</p>
        <h2 ref={heading} tabIndex={-1}>
          One job context, related review steps
        </h2>
        <p>
          Use the original controls. Review visits never mean work completed,
          invoice issued or customer updated.
        </p>
      </header>
      <SharedRecordSearch
        sources={sources}
        enabled
        selectedJobId={current ? context?.job_id : undefined}
        onSelectJob={select}
      />
      {context && current && (
        <>
          <dl className="daily-workbench-context">
            <div>
              <dt>Customer</dt>
              <dd>{context.customer_label}</dd>
            </div>
            <div>
              <dt>Property</dt>
              <dd>{context.property_label}</dd>
            </div>
            <div>
              <dt>Job</dt>
              <dd>
                {context.job_label} · {context.job_id}
              </dd>
            </div>
            <div>
              <dt>Issued source</dt>
              <dd>
                {context.issued_version_id} · version{' '}
                {context.issued_version_number}
              </dd>
            </div>
          </dl>
          <button type="button" disabled={busy} onClick={() => void nextJob()}>
            Continue to next prepared job
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void reconcileDailyWorkContext(context).then((r) => {
                if (live.current)
                  setStatus(
                    `Exact read-only context: ${r.status}. Replay forbidden.`,
                  );
              })
            }
          >
            Inspect daily context read only
          </button>
        </>
      )}
      <nav aria-label="Daily review steps">
        {dailyWorkbenchSteps.map((destination) => (
          <button
            type="button"
            key={destination}
            aria-current={step === destination ? 'step' : undefined}
            disabled={
              busy || !current || (!context && destination !== 'priorities')
            }
            onClick={() =>
              context
                ? void go(context.job_id, destination)
                : setStep(destination)
            }
          >
            {labels[destination]}
            {visited.includes(destination) ? ' · visited' : ''}
          </button>
        ))}
      </nav>
      <p role="status">
        {current
          ? status
          : 'Current authorized context withheld. Previously visited steps are not completion evidence.'}
      </p>
      {current && (
        <div className="daily-workbench-panels">
          <div hidden={step !== 'priorities'}>
            <PriorityActions {...props} view="priorities" />
          </div>
          <div hidden={step !== 'field'}>
            <FieldAgenda {...props} />
          </div>
          <div hidden={step !== 'finance' && step !== 'invoice'}>
            <CostInvoiceReview
              {...props}
              focus={step === 'invoice' ? 'invoice' : 'review'}
            />
          </div>
          <div hidden={step !== 'customer'}>
            <ServiceUpdateReview {...props} />
          </div>
          <div hidden={step !== 'maintenance'}>
            <MaintenanceAgenda {...props} />
          </div>
          <div hidden={step !== 'advanced'}>
            <PriorityActions {...props} view="advanced" />
          </div>
        </div>
      )}
    </section>
  );
}
