import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { sampleCompanies } from '../../domain/platform';
import { productBrand } from '../../domain/brand';
import {
  prepareOperatingSources,
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { OperatingSelection } from './OperatingSelection';
import { PortfolioScheduling } from './PortfolioScheduling';
import { PortfolioFinance } from './PortfolioFinance';
import { PortfolioService } from './PortfolioService';
import { PortfolioMaintenance } from './PortfolioMaintenance';
import { BusinessBriefing } from './BusinessBriefing';
import { OperatingAddons } from './OperatingAddons';
import { WeeklyCrew } from './WeeklyCrew';
import { FinanceDesk } from './FinanceDesk';
import { SalesDesk } from './SalesDesk';
import { CompletionReview } from './CompletionReview';
import { MaintenanceDesk } from './MaintenanceDesk';
import { DailyOperations } from './DailyOperations';
import type { OperatingJobSection } from '../../lib/workflows/operating-navigation';
import './operating-center.css';

type Attempt = {
  state: 'PENDING' | 'UNKNOWN' | 'READY';
  gate: { enabled: boolean; confirmed: boolean };
  result?: OperatingSources;
};
const panels = [
  ['selection', 'Sources'],
  ['field', 'Weekly schedule'],
  ['finance', 'Financial review'],
  ['service', 'Property history'],
  ['growth', 'Maintenance'],
  ['briefing', 'Daily briefing'],
  ['detail', 'Selected job'],
  ['advanced', 'Advanced reviews'],
] as const;
type Panel = (typeof panels)[number][0];
export interface OperatingReviewPanel {
  id: string;
  label: string;
  render: (props: {
    sources: OperatingSources;
    enabled: boolean;
    selectedJobId?: string;
    onSelectJob: (jobId: string, section?: OperatingJobSection) => void;
  }) => ReactNode;
}
export interface OperatingReviewGroup {
  label: string;
  initiallyOpen?: boolean;
  panels: readonly OperatingReviewPanel[];
}
export type OperatingSourcePreparer = typeof prepareOperatingSources;
export function OperatingCenterPreview({
  prepareSources = prepareOperatingSources,
  additionalPanels = [],
  additionalReviewGroups = [],
}: {
  prepareSources?: OperatingSourcePreparer;
  additionalPanels?: readonly OperatingReviewPanel[];
  additionalReviewGroups?: readonly OperatingReviewGroup[];
} = {}) {
  const [companyId, setCompanyId] = useState(sampleCompanies[0].id),
    [confirmed, setConfirmed] = useState(false),
    [epoch, setEpoch] = useState(0),
    [tab, setTab] = useState<Panel | string>('selection'),
    [error, setError] = useState('');
  const attempts = useRef(new Map<string, Attempt>()),
    generation = useRef(0);
  const preparer = useRef(prepareSources);
  useLayoutEffect(() => {
    if (preparer.current === prepareSources) return;
    preparer.current = prepareSources;
    for (const a of attempts.current.values()) {
      if (a.state === 'PENDING') {
        a.gate.enabled = false;
        a.gate.confirmed = false;
        a.state = 'UNKNOWN';
      }
    }
    generation.current++;
  }, [prepareSources]);
  const [selected, setSelected] = useState<{
    company: string;
    entry: LocalJourney;
    check: () => void;
    section?: OperatingJobSection;
  } | null>(null);
  const company = sampleCompanies.find((c) => c.id === companyId)!;
  const [visibleAttempt, setVisibleAttempt] = useState<{
    company: string;
    attempt: Attempt;
  } | null>(null);
  const attempt =
      visibleAttempt?.company === companyId
        ? visibleAttempt.attempt
        : undefined,
    sources =
      confirmed && attempt?.state === 'READY' ? attempt.result : undefined;
  useEffect(
    () => () => {
      generation.current++;
      for (const a of attempts.current.values()) {
        a.gate.confirmed = false;
        if (a.state === 'PENDING') {
          a.state = 'UNKNOWN';
          a.gate.enabled = false;
        }
      }
    },
    [],
  );
  useEffect(() => {
    if (selected && tab === 'detail')
      document
        .getElementById(
          selected.section
            ? `operating-selected-${selected.section}`
            : 'operating-selected-heading',
        )
        ?.focus();
  }, [selected, tab]);
  function withdraw() {
    const a = attempts.current.get(companyId);
    if (a) {
      a.gate.confirmed = false;
      if (a.state === 'PENDING') {
        a.state = 'UNKNOWN';
        a.gate.enabled = false;
        setVisibleAttempt({ company: companyId, attempt: { ...a } });
      }
    }
    generation.current++;
    setSelected(null);
    setError('');
  }
  async function prepare() {
    if (!confirmed || attempts.current.has(companyId)) return;
    const token = ++generation.current,
      id = companyId;
    const a: Attempt = {
      state: 'PENDING',
      gate: { enabled: true, confirmed: true },
    };
    attempts.current.set(id, a);
    setVisibleAttempt({ company: id, attempt: { ...a } });
    setEpoch((v) => v + 1);
    setError('');
    try {
      const result = await prepareSources(company, a.gate);
      if (generation.current !== token || !a.gate.confirmed) {
        a.state = 'UNKNOWN';
      } else {
        a.result = result;
        a.state = 'READY';
      }
    } catch {
      a.state = 'UNKNOWN';
      if (generation.current === token)
        setError(
          'Preparation outcome UNKNOWN. No retry or replacement is available in this session.',
        );
    } finally {
      setVisibleAttempt((previous) =>
        previous?.company === id
          ? { company: id, attempt: { ...a } }
          : previous,
      );
      if (generation.current === token) setEpoch((v) => v + 1);
    }
  }
  function openJob(jobId: string, section?: OperatingJobSection) {
    if (!sources) return;
    try {
      if (
        section !== undefined &&
        ![
          'sales',
          'field',
          'finance',
          'completion',
          'maintenance',
          'daily',
        ].includes(section)
      )
        throw Error('Unknown local job section');
      const capture = captureOperatingSources(sources, sources.gate);
      const matches = capture.entries.filter((e) => e.target.job_id === jobId);
      if (matches.length !== 1) throw Error('Exact job unavailable');
      capture.check();
      setSelected({
        company: companyId,
        entry: matches[0],
        check: capture.check,
        section,
      });
      setTab('detail');
      setError('');
    } catch {
      setSelected(null);
      setError(
        'Source changed or access unavailable. Read the exact current source again.',
      );
    }
  }
  let detail: LocalJourney | undefined;
  if (selected?.company === companyId && sources) {
    try {
      selected.check();
      detail = selected.entry;
    } catch {
      /* Stale retained context stays withheld. */
    }
  }
  const crm = detail
    ? sources!.operations.syntheticEstimateCrm(
        companyId,
        detail.target.customer_id,
        detail.target.location_id,
      )
    : null;
  return (
    <main
      className="operating-center"
      style={
        {
          '--journey-primary': company.primary_color,
          '--journey-accent': company.accent_color,
        } as CSSProperties
      }
      data-render={epoch}
    >
      <header className="oc-header">
        <div>
          <p className="oc-eyebrow">
            {company.industry.replaceAll('_', ' ')} · STAFF PREVIEW
          </p>
          <h1>{company.name}</h1>
          <p>Multi-job operating center</p>
        </div>
        <span className="oc-badge">LOCAL ONLY · EXECUTION OFF</span>
      </header>
      <details className="oc-development" open={!sources}>
        <summary>Disposable development controls</summary>
        <label>
          Contractor
          <select
            value={companyId}
            onChange={(e) => {
              withdraw();
              setConfirmed(false);
              setCompanyId(e.target.value);
              const retained = attempts.current.get(e.target.value);
              setVisibleAttempt(
                retained
                  ? { company: e.target.value, attempt: { ...retained } }
                  : null,
              );
              setTab('selection');
              setEpoch((v) => v + 1);
            }}
          >
            {sampleCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="oc-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => {
              if (!e.target.checked) withdraw();
              const a = attempts.current.get(companyId);
              if (a) a.gate.confirmed = e.target.checked;
              setConfirmed(e.target.checked);
              setEpoch((v) => v + 1);
            }}
          />
          I confirm this disposable multi-job simulation; no dispatch, contract,
          invoice, payment or message is authorized.
        </label>
        <button
          disabled={!confirmed || !!attempt}
          onClick={() => void prepare()}
        >
          Prepare multi-job local environment
        </button>
        <p>
          Four explicit synthetic jobs reuse the existing CRM, estimate, job and
          inspection engines. Reload loses this same-tab environment. This is
          not genuine authentication or durable custody.
        </p>
      </details>
      {attempt?.state === 'PENDING' && (
        <p role="status">Preparing exact synthetic source records…</p>
      )}
      {attempt?.state === 'UNKNOWN' && (
        <p role="alert">
          Preparation UNKNOWN. Exact read-only reconciliation is unavailable; no
          replay is permitted.
        </p>
      )}
      {error && (
        <p role="alert" className="oc-error">
          {error}
        </p>
      )}
      {sources && (
        <>
          <section
            aria-label="Shared operating environment"
            className="oc-context"
          >
            <h2>One company. One set of source records.</h2>
            <div className="oc-metrics">
              <p>
                <strong>{sources.entries.length}</strong> admitted jobs
              </p>
              <p>
                <strong>
                  {
                    new Set(sources.entries.map((e) => e.target.customer_id))
                      .size
                  }
                </strong>{' '}
                customers
              </p>
              <p>
                <strong>
                  {
                    new Set(sources.entries.map((e) => e.target.location_id))
                      .size
                  }
                </strong>{' '}
                properties
              </p>
              <p>
                <strong>
                  {new Set(sources.entries.map((e) => e.worker_id)).size}
                </strong>{' '}
                assigned workers
              </p>
            </div>
            <p>
              Prepared, authorized source handles only. Counts do not imply
              complete company coverage. Recorded dates do not establish
              availability, dispatch or physical completion.
            </p>
          </section>
          <nav aria-label="Operating center sections" className="oc-nav">
            {panels.map(([id, label]) => (
              <button
                key={id}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {additionalPanels.length > 0 && (
            <details className="oc-development" open>
              <summary>Daily workflow reviews</summary>
              <nav aria-label="Daily workflow reviews" className="oc-nav">
                {additionalPanels.map((panel) => (
                  <button
                    key={panel.id}
                    aria-current={tab === panel.id ? 'page' : undefined}
                    onClick={() => setTab(panel.id)}
                  >
                    {panel.label}
                  </button>
                ))}
              </nav>
            </details>
          )}
          {additionalReviewGroups.map((group) => (
            <details
              className="oc-development"
              open={group.initiallyOpen ?? true}
              key={group.label}
            >
              <summary>{group.label}</summary>
              <nav className="oc-nav" aria-label={group.label}>
                {group.panels.map((panel) => (
                  <button
                    key={panel.id}
                    aria-current={tab === panel.id ? 'page' : undefined}
                    onClick={() => setTab(panel.id)}
                  >
                    {panel.label}
                  </button>
                ))}
              </nav>
            </details>
          ))}
          <section
            key={`${companyId}:${tab}`}
            className="oc-panel"
            aria-label="Current operating desk"
          >
            {selected && !detail ? (
              <p role="alert">
                Retained selected job context is UNKNOWN. Continuity controls
                are withheld; no other job is substituted.
              </p>
            ) : (
              [
                ...additionalPanels,
                ...additionalReviewGroups.flatMap((group) => group.panels),
              ]
                .find((panel) => panel.id === tab)
                ?.render({
                  sources,
                  enabled: true,
                  selectedJobId: detail?.target.job_id ?? undefined,
                  onSelectJob: openJob,
                })
            )}
            {tab === 'selection' && (
              <OperatingSelection
                sources={sources}
                enabled
                onSelectJob={openJob}
              />
            )}
            {tab === 'field' && (
              <PortfolioScheduling
                sources={sources}
                enabled
                onSelectJob={openJob}
              />
            )}
            {tab === 'finance' && (
              <PortfolioFinance
                sources={sources}
                enabled
                onSelectJob={openJob}
              />
            )}
            {tab === 'service' && (
              <PortfolioService
                sources={sources}
                enabled
                onSelectJob={openJob}
              />
            )}
            {tab === 'growth' && (
              <PortfolioMaintenance
                sources={sources}
                enabled
                onSelectJob={openJob}
              />
            )}
            {tab === 'briefing' && (
              <BusinessBriefing
                sources={sources}
                enabled
                onSelectJob={openJob}
              />
            )}
            {tab === 'advanced' && (
              <OperatingAddons sources={sources} enabled />
            )}
            {tab === 'detail' &&
              (detail && crm ? (
                <>
                  <h2 id="operating-selected-heading" tabIndex={-1}>
                    Exact selected job
                  </h2>
                  <p>
                    {crm.customer.display_name} · {crm.location?.address_line1}
                  </p>
                  <dl className="oc-identities">
                    <dt>Company</dt>
                    <dd>{detail.target.organization_id}</dd>
                    <dt>Customer / property</dt>
                    <dd>
                      {detail.target.customer_id} / {detail.target.location_id}
                    </dd>
                    <dt>Job</dt>
                    <dd>{detail.target.job_id}</dd>
                    <dt>Issued source / version</dt>
                    <dd>
                      {detail.target.version_id} /{' '}
                      {detail.issued.version.version_number}
                    </dd>
                  </dl>
                  <p>
                    Existing single-job review controls below use these same
                    canonical source instances. No navigation creates or
                    replaces a record.
                  </p>
                  <section
                    id="operating-selected-sales"
                    tabIndex={-1}
                    aria-label="Selected job sales review"
                  >
                    <SalesDesk sources={detail} enabled />
                  </section>
                  <section
                    id="operating-selected-field"
                    tabIndex={-1}
                    aria-label="Selected job field review"
                  >
                    <WeeklyCrew sources={detail} enabled />
                  </section>
                  <section
                    id="operating-selected-finance"
                    tabIndex={-1}
                    aria-label="Selected job finance review"
                  >
                    <FinanceDesk sources={detail} enabled />
                  </section>
                  <section
                    id="operating-selected-completion"
                    tabIndex={-1}
                    aria-label="Selected job completion review"
                  >
                    <CompletionReview sources={detail} enabled />
                  </section>
                  <section
                    id="operating-selected-maintenance"
                    tabIndex={-1}
                    aria-label="Selected job maintenance review"
                  >
                    <MaintenanceDesk sources={detail} enabled />
                  </section>
                  <section
                    id="operating-selected-daily"
                    tabIndex={-1}
                    aria-label="Selected job daily review"
                  >
                    <DailyOperations sources={detail} enabled />
                  </section>
                </>
              ) : (
                <p>
                  Select an exact current job from a source desk. Stale or
                  unavailable retained sources are withheld.
                </p>
              ))}
          </section>
        </>
      )}
      <footer>
        <img src={productBrand.transparentPortalLogo} alt={productBrand.name} />
        <p>
          Propel Contractor Suite · independent contractor identity · Release
          1.0 NOT READY / NOT AUTHORIZED
        </p>
        <a href="/preview/contractor-journey">Single-job reference preview</a>
      </footer>
    </main>
  );
}
