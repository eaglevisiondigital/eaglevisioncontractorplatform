import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { sampleCompanies } from '../../domain/platform';
import { CompanyLogo } from '../CompanyLogo';
import { productBrand } from '../../domain/brand';
import {
  prepareLocalJourney,
  type LocalJourney,
} from '../../lib/workflows/journey-runtime';
import { SalesWorkflow } from './SalesWorkflow';
import { SalesJobPlanningReview } from './SalesJobPlanningReview';
import { OfflineCrewContext } from './OfflineCrewContext';
import { FieldWorkflow } from './FieldWorkflow';
import { FinanceWorkflow } from './FinanceWorkflow';
import { CustomerWorkflow } from './CustomerWorkflow';
import { ReceptionistSalesReview } from './ReceptionistSalesReview';
import { GrowthWorkflow } from './GrowthWorkflow';
import { IntelligenceWorkflow } from './IntelligenceWorkflow';
import { BookingScheduling } from './BookingScheduling';
import { JobReview } from './JobReview';
import { CustomerService } from './CustomerService';
import { WeeklyCrew } from './WeeklyCrew';
import { FinanceDesk } from './FinanceDesk';
import { SalesDesk } from './SalesDesk';
import { CompletionReview } from './CompletionReview';
import { MaintenanceDesk } from './MaintenanceDesk';
import { DailyOperations } from './DailyOperations';
import { ProcurementJobEvidence } from './ProcurementJobEvidence';
import { OwnerCostEvidence } from './OwnerCostEvidence';
import { Estimates } from '../phase3/Estimates';
import type { EstimateBundle } from '../../domain/estimating/types';
import {
  prepareIntelligenceWorkflow,
  inspectIntelligenceWorkflow,
  type IntelligenceWorkflowReview,
} from '../../lib/workflows/intelligence-workflow';
import {
  tradeEditions,
  type TradeEdition,
} from '../../lib/program/trade-editions';
import type { FieldWorkflowHandoff } from '../../lib/workflows/field-workflow';
import {
  readFinanceWorkflow,
  type FinanceWorkflowReview,
} from '../../lib/workflows/finance-workflow';
import './contractor-journey.css';

type Attempt = {
  state: 'PENDING' | 'UNKNOWN' | 'READY';
  gate: { enabled: boolean; confirmed: boolean };
  result?: LocalJourney;
};
export function ContractorJourneyPreview() {
  const [companyId, setCompanyId] = useState(sampleCompanies[0].id);
  const company = sampleCompanies.find((c) => c.id === companyId)!;
  const [confirmed, setConfirmed] = useState(false),
    [epoch, setEpoch] = useState(0);
  const attempts = useRef(new Map<string, Attempt>()),
    generation = useRef(0);
  const intelligenceClaims = useRef(new Set<string>()),
    intelligenceGate = useRef<{ enabled: boolean; confirmed: boolean } | null>(
      null,
    );
  const [intelligenceAttempts, setIntelligenceAttempts] = useState<
    Record<string, boolean>
  >({});
  const [intelligence, setIntelligence] = useState<{
      company: string;
      review: IntelligenceWorkflowReview;
    } | null>(null),
    [intelligenceBusy, setIntelligenceBusy] = useState(false),
    [intelligenceError, setIntelligenceError] = useState(''),
    [intelligenceStatus, setIntelligenceStatus] = useState('');
  const [advanced, setAdvanced] = useState(false),
    [edition, setEdition] = useState<TradeEdition | ' '>(' '),
    [intelligenceConfirmed, setIntelligenceConfirmed] = useState(false);
  const [voiceInput, setVoiceInput] = useState({ transcript: '' });
  const transcript = voiceInput.transcript;
  const [estimateEditor, setEstimateEditor] = useState<{
    company: string;
    estimate: string;
    bundle: EstimateBundle;
  }>();
  const [voiceEditorBusy, setVoiceEditorBusy] = useState(false);
  const [error, setError] = useState(''),
    [finance, setFinance] = useState<FinanceWorkflowReview | null>(null),
    [financeBusy, setFinanceBusy] = useState(false);
  const [selectedReport, setSelectedReport] = useState<{
    company: string;
    report_id: string;
    published_version: number;
  } | null>(null);
  const [visibleAttempt, setVisibleAttempt] = useState<{
    company: string;
    state: Attempt['state'];
    result?: LocalJourney;
  } | null>(null);
  const attempt = visibleAttempt?.company === companyId ? visibleAttempt : null;
  const journey =
    confirmed && attempt?.state === 'READY' ? attempt.result : undefined;
  useEffect(
    () => () => {
      generation.current++;
      for (const a of attempts.current.values()) {
        a.gate.confirmed = false;
        if (a.state === 'PENDING') {
          a.gate.enabled = false;
          a.state = 'UNKNOWN';
        }
      }
      if (intelligenceGate.current) intelligenceGate.current.confirmed = false;
    },
    [],
  );
  useEffect(() => {
    if (selectedReport?.company === companyId)
      document.getElementById('journey-customer')?.focus();
  }, [selectedReport, companyId]);
  function proofHandoff(handoff: FieldWorkflowHandoff) {
    if (!journey) return;
    const t = journey.target;
    if (
      handoff.organization_id !== t.organization_id ||
      handoff.customer_id !== t.customer_id ||
      handoff.location_id !== t.location_id ||
      handoff.job_id !== t.job_id ||
      handoff.estimate_id !== t.estimate_id ||
      handoff.issued_version_id !== t.version_id ||
      handoff.issued_version_number !== journey.issued.version.version_number
    ) {
      setError('Exact source handoff unavailable.');
      return;
    }
    journey.estimates.readSyntheticPrototypeSources(t);
    setSelectedReport({
      company: companyId,
      report_id: handoff.report_id,
      published_version: handoff.published_version,
    });
    document.getElementById('journey-customer')?.focus();
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
    setVisibleAttempt({ company: id, state: a.state });
    setEpoch((v) => v + 1);
    setError('');
    try {
      const result = await prepareLocalJourney(company, a.gate);
      if (generation.current !== token || !a.gate.confirmed) {
        a.state = 'UNKNOWN';
      } else {
        a.result = result;
        a.state = 'READY';
      }
      if (generation.current === token) setEpoch((v) => v + 1);
    } catch {
      a.state = 'UNKNOWN';
      if (generation.current === token)
        setError(
          'Synthetic preparation outcome UNKNOWN. No retry or replacement is available in this session.',
        );
    } finally {
      setVisibleAttempt((previous) =>
        previous?.company === id
          ? { company: id, state: a.state, result: a.result }
          : previous,
      );
      if (generation.current === token) setEpoch((v) => v + 1);
    }
  }
  async function reviewFinance() {
    if (!journey || financeBusy) return false;
    const token = generation.current,
      j = journey;
    setFinanceBusy(true);
    setFinance(null);
    setError('');
    try {
      const source = j.estimates.readSyntheticPrototypeSources(j.target);
      const review = await readFinanceWorkflow(
        j.estimates,
        j.target,
        {
          job_revision: source.job!.lock_revision,
          currency: j.issued.version.payload.currency,
          release: null,
          accounting_aliases: null,
          procurement: null,
        },
        j.gate,
      );
      if (generation.current === token && j.gate.confirmed) {
        setFinance(review);
        return true;
      }
    } catch {
      if (generation.current === token)
        setError(
          'Finance source changed or is unavailable. Exact read-only review required.',
        );
    } finally {
      if (generation.current === token) setFinanceBusy(false);
    }
    return false;
  }
  async function openVoiceEditor() {
    if (!journey || voiceEditorBusy) return;
    const j = journey,
      token = generation.current;
    setVoiceEditorBusy(true);
    try {
      if (!j.gate.enabled || !j.gate.confirmed) throw Error();
      j.estimates.readSyntheticPrototypeSources(j.target);
      const bundle = await j.estimates.get(companyId, j.target.estimate_id);
      const current = j.estimates.readSyntheticPrototypeSources({
        ...j.target,
        version_id: bundle.version.id,
        job_id: null,
      });
      if (
        !j.gate.confirmed ||
        current.bundle.estimate.current_version_id !== bundle.version.id ||
        JSON.stringify(current.bundle.version) !==
          JSON.stringify(bundle.version)
      )
        throw Error();
      if (generation.current === token)
        setEstimateEditor({
          company: companyId,
          estimate: j.target.estimate_id,
          bundle,
        });
    } catch {
      if (generation.current === token)
        setError(
          'Exact estimate draft context is UNKNOWN. No replacement or revision was created.',
        );
    } finally {
      if (generation.current === token) setVoiceEditorBusy(false);
    }
  }
  function invalidateIntelligence() {
    if (intelligenceGate.current) intelligenceGate.current.confirmed = false;
    setIntelligenceConfirmed(false);
    setIntelligence(null);
    setIntelligenceError('');
    setIntelligenceStatus('');
  }
  async function reviewIntelligence() {
    if (
      !journey ||
      !intelligenceConfirmed ||
      intelligenceClaims.current.has(journey.target.estimate_id) ||
      (advanced && (!transcript.trim() || edition === ' '))
    )
      return;
    const j = journey,
      token = generation.current;
    intelligenceClaims.current.add(j.target.estimate_id);
    setIntelligenceAttempts((old) => ({
      ...old,
      [j.target.estimate_id]: true,
    }));
    const gate = { enabled: true, confirmed: true };
    intelligenceGate.current = gate;
    setIntelligenceBusy(true);
    setIntelligence(null);
    setIntelligenceError('');
    try {
      const review = await prepareIntelligenceWorkflow(
        j.estimates,
        j.target,
        {
          review_on: '2026-12-08',
          advanced:
            advanced && edition !== ' '
              ? { transcript, edition, catalog_item_ids: [], procurement: null }
              : null,
        },
        gate,
      );
      if (token === generation.current && gate.confirmed && j.gate.confirmed)
        setIntelligence({ company: companyId, review });
    } catch {
      if (token === generation.current)
        setIntelligenceError(
          'Review outcome UNKNOWN. No retry or replacement; retained evidence can only be inspected exactly.',
        );
    } finally {
      if (token === generation.current) setIntelligenceBusy(false);
    }
  }
  async function inspectIntelligence() {
    if (!intelligence || intelligence.company !== companyId) return;
    const token = generation.current;
    try {
      const result = await inspectIntelligenceWorkflow(intelligence.review);
      if (token === generation.current) {
        setIntelligenceStatus(result.status);
        if (result.status !== 'CURRENT_LOCAL_SOURCE')
          setIntelligenceError(
            'Retained review is stale or UNKNOWN; previous suggestions are withheld.',
          );
      }
    } catch {
      if (token === generation.current)
        setIntelligenceError('Retained review is UNKNOWN; no replay.');
    }
  }
  return (
    <main
      className="contractor-journey"
      style={
        {
          '--journey-primary': company.primary_color,
          '--journey-accent': company.accent_color,
          '--company-color': company.primary_color,
        } as CSSProperties
      }
      data-epoch={epoch}
    >
      <header className="journey-header">
        <CompanyLogo company={company} sample />
        <div>
          <p className="journey-eyebrow">{company.name} · LOCAL LAB</p>
          <h1>Connected contractor journey</h1>
          <p>One property. Exact source evidence across each review.</p>
        </div>
        <span className="journey-badge">Local synthetic only</span>
      </header>
      <aside
        className="journey-controls"
        aria-label="Synthetic journey controls"
      >
        <details open>
          <summary>Local development controls</summary>
          <label>
            Contractor
            <select
              value={companyId}
              onChange={(e) => {
                const a = attempts.current.get(companyId);
                if (a) {
                  a.gate.confirmed = false;
                  if (a.state === 'PENDING') {
                    a.gate.enabled = false;
                    a.state = 'UNKNOWN';
                  }
                }
                generation.current++;
                const nextCompany = e.target.value;
                setEstimateEditor(undefined);
                setVoiceEditorBusy(false);
                const retained = attempts.current.get(nextCompany);
                setCompanyId(nextCompany);
                setVisibleAttempt(
                  retained
                    ? {
                        company: nextCompany,
                        state: retained.state,
                        result: retained.result,
                      }
                    : null,
                );
                invalidateIntelligence();
                setIntelligenceBusy(false);
                setConfirmed(false);
                setFinance(null);
                setFinanceBusy(false);
                setError('');
              }}
            >
              {sampleCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="journey-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                generation.current++;
                setConfirmed(e.target.checked);
                if (!e.target.checked) {
                  setEstimateEditor(undefined);
                  setVoiceEditorBusy(false);
                }
                if (!e.target.checked) invalidateIntelligence();
                const a = attempts.current.get(companyId);
                if (a) {
                  if (a.state === 'PENDING' && !e.target.checked) {
                    a.gate.enabled = false;
                    a.state = 'UNKNOWN';
                    setVisibleAttempt({ company: companyId, state: 'UNKNOWN' });
                  }
                  a.gate.confirmed = e.target.checked;
                }
                setFinance(null);
                setFinanceBusy(false);
              }}
            />
            I confirm this disposable local simulation; no contract, dispatch,
            invoice or message is authorized.
          </label>
          <button
            disabled={!confirmed || !!attempt}
            onClick={() => void prepare()}
          >
            {attempt?.state === 'PENDING'
              ? 'Preparing exact local sources…'
              : 'Prepare local synthetic journey'}
          </button>
          <p>
            Same-tab memory only. UNKNOWN prevents retry. Refresh is not durable
            recovery.
          </p>
        </details>
      </aside>
      {error && (
        <p role="alert" className="journey-error">
          {error}
        </p>
      )}
      {!journey ? (
        <section className="journey-card">
          <h2>Prepare an exact-source demonstration</h2>
          <p>
            Confirm the local simulation to create actual records through
            existing engines. Connected access remains off.
          </p>
          {attempt?.state === 'UNKNOWN' && (
            <p role="status">Preparation UNKNOWN — no replay.</p>
          )}
        </section>
      ) : (
        <>
          <section
            className="journey-card journey-context"
            aria-label="Exact shared journey context"
          >
            <div>
              <p className="journey-eyebrow">EXACT SOURCE CONTEXT</p>
              <h2>{journey.issued.version.customer_snapshot.display_name}</h2>
              <p>{journey.issued.version.location_snapshot?.address_line1}</p>
            </div>
            <dl>
              <dt>Intake request</dt>
              <dd>{journey.intake_request_id}</dd>
              <dt>Issued estimate / version</dt>
              <dd>
                {journey.issued.estimate.estimate_number} · v
                {journey.issued.version.version_number} ·{' '}
                {journey.target.version_id}
              </dd>
              <dt>Job</dt>
              <dd>{journey.target.job_id}</dd>
            </dl>
            <p>
              Lead association is staff-selected. Job, crew assignment and
              published report are separately confirmed engineering fixtures;
              they are not authorized by a customer preference or contract
              review.
            </p>
          </section>
          <nav className="journey-nav" aria-label="Contractor journey stages">
            {[
              'Sales',
              'Field',
              'Booking',
              'Finance',
              'Customer',
              'Growth',
              'Intelligence',
            ].map((s) => (
              <a key={s} href={'#journey-' + s.toLowerCase()}>
                {s}
              </a>
            ))}
          </nav>
          <section id="journey-sales" className="journey-card">
            <h2>1 · Lead, scope & contract preparation</h2>
            <SalesWorkflow
              key={journey.intake_request_id}
              repo={journey.estimates}
              release={journey.release}
              target={{
                organization_id: companyId,
                actor_id: journey.target.actor_id,
                customer_id: journey.target.customer_id,
                location_id: journey.target.location_id,
                estimate_id: journey.target.estimate_id,
                version_id: journey.target.version_id,
                offer_id: journey.offer_id,
                receipt_id: journey.receipt_id,
                intake_request_id: journey.intake_request_id,
              }}
              enabled
            />
            <SalesDesk sources={journey} enabled />
            <SalesJobPlanningReview
              key={'job-planning-' + journey.intake_request_id}
              sources={journey}
              enabled
            />
          </section>
          <section id="journey-field" className="journey-card" tabIndex={-1}>
            <h2>2 · Work order, crew & field documentation</h2>
            <FieldWorkflow
              repo={journey.property}
              target={journey.target}
              day={journey.day}
              timezone={journey.timezone}
              enabled
              onProofOfWork={proofHandoff}
            />
            <WeeklyCrew sources={journey} enabled />
            <OfflineCrewContext sources={journey} />
          </section>
          <section id="journey-booking" className="journey-card">
            <h2>Booking &amp; scheduling review</h2>
            <BookingScheduling
              repo={journey.property}
              target={journey.target}
              sourceVisitId={journey.scheduled_visit_id}
              day={journey.day}
              timezone={journey.timezone}
              enabled
            />
          </section>
          <section id="journey-finance" className="journey-card" tabIndex={-1}>
            <h2>3 · Cost review & invoice preparation</h2>
            <button disabled={financeBusy} onClick={() => void reviewFinance()}>
              Review costs and invoice preparation
            </button>
            <FinanceWorkflow review={finance} enabled loading={financeBusy} />
            <JobReview sources={journey} enabled showFinanceDetails={false} />
            <FinanceDesk sources={journey} enabled />
            <ProcurementJobEvidence
              sources={journey}
              onFinance={reviewFinance}
            />
          </section>
          <section id="journey-customer" tabIndex={-1} className="journey-card">
            <h2>4 · Property history & completion documentation</h2>
            <p>
              Exact published report {journey.report_id} · v
              {journey.published_version}. Documentation does not verify
              physical completion.
            </p>
            <CustomerService
              model={journey.customerModel}
              target={journey.target}
              selection={{
                report_id: journey.report_id,
                published_version: journey.published_version,
              }}
              enabled
            />
            <CustomerWorkflow
              model={journey.customerModel}
              target={journey.target}
              selection={
                selectedReport?.company === companyId
                  ? {
                      report_id: selectedReport.report_id,
                      published_version: selectedReport.published_version,
                    }
                  : {
                      report_id: journey.report_id,
                      published_version: journey.published_version,
                    }
              }
              enabled
            />
            <CompletionReview sources={journey} enabled />
          </section>
          <section id="journey-growth" className="journey-card">
            <h2>5 · Maintenance opportunity</h2>
            <p>
              Planning review only. Enrollment, sending and billing remain
              blocked.
            </p>
            <GrowthWorkflow
              repo={journey.property}
              target={journey.target}
              window={{
                from: '2026-12-07',
                through: '2026-12-28',
                as_of: '2026-12-08T12:00:00.000Z',
                channel: 'email',
              }}
              enabled
            />
            <ReceptionistSalesReview sources={journey} />
            <MaintenanceDesk sources={journey} enabled />
          </section>
          <section id="journey-intelligence" className="journey-card">
            <h2>6 · Read-only Business Copilot</h2>
            <p>
              Source-linked suggestions require human review; no action
              authority.
            </p>
            <p>
              Synthetic review context: December 8, 2026. No model, microphone,
              provider or action execution.
            </p>
            <fieldset
              disabled={
                intelligenceBusy ||
                intelligenceAttempts[journey.target.estimate_id]
              }
            >
              <legend>Explicit intelligence review inputs</legend>
              <label className="journey-check">
                <input
                  type="checkbox"
                  checked={advanced}
                  onChange={(e) => {
                    invalidateIntelligence();
                    setAdvanced(e.target.checked);
                  }}
                />
                Include literal voice-transcript and trade review
              </label>
              {advanced && (
                <>
                  <label>
                    Literal synthetic transcript
                    <textarea
                      value={transcript}
                      maxLength={2000}
                      onChange={(e) => {
                        invalidateIntelligence();
                        setVoiceInput({ transcript: e.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Human-selected trade edition
                    <select
                      value={edition}
                      onChange={(e) => {
                        invalidateIntelligence();
                        setEdition(e.target.value as TradeEdition);
                      }}
                    >
                      <option value=" ">Select a review context</option>
                      {tradeEditions.map((t) => (
                        <option key={t} value={t}>
                          {t.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label className="journey-check">
                <input
                  type="checkbox"
                  checked={intelligenceConfirmed}
                  onChange={(e) => {
                    if (!e.target.checked) invalidateIntelligence();
                    setIntelligenceConfirmed(e.target.checked);
                  }}
                />
                I confirm review-only suggestions for this exact saved source.
              </label>
              <button
                disabled={
                  !intelligenceConfirmed ||
                  (advanced && (!transcript.trim() || edition === ' '))
                }
                onClick={() => void reviewIntelligence()}
              >
                Prepare source-linked Copilot review
              </button>
            </fieldset>
            <>
              {advanced && transcript.trim() && (
                <button
                  disabled={
                    voiceEditorBusy ||
                    (estimateEditor?.company === companyId &&
                      estimateEditor.estimate === journey.target.estimate_id)
                  }
                  onClick={() => void openVoiceEditor()}
                >
                  Open exact estimate draft controls
                </button>
              )}
              {estimateEditor?.company === companyId &&
                estimateEditor.estimate === journey.target.estimate_id && (
                  <section aria-label="Captured job estimate preparation">
                    <p>
                      The original issued version remains immutable. Use Create
                      draft revision, review captured scope, then Save estimate
                      draft explicitly. This does not replace the job baseline
                      or authorize issuance.
                    </p>
                    <Estimates
                      key={'voice-editor-' + journey.intake_request_id}
                      repo={journey.estimates}
                      company={company}
                      canIssue={false}
                      initialBundle={estimateEditor.bundle}
                      voiceDraft={{
                        target: journey.target,
                        input: voiceInput,
                        gate: journey.gate,
                      }}
                    />
                  </section>
                )}
            </>
            {intelligenceAttempts[journey.target.estimate_id] && (
              <p>
                One session attempt retained. No replay or new-version bypass.
              </p>
            )}
            <IntelligenceWorkflow
              review={
                intelligence?.company === companyId ? intelligence.review : null
              }
              enabled
              loading={intelligenceBusy}
              error={intelligenceError || null}
            />
            {intelligence?.company === companyId && (
              <button onClick={() => void inspectIntelligence()}>
                Inspect exact retained Copilot review
              </button>
            )}
            {intelligenceStatus && (
              <p role="status">Retained review: {intelligenceStatus}</p>
            )}
            <DailyOperations sources={journey} enabled />
            <OwnerCostEvidence
              key={'owner-cost-' + journey.intake_request_id}
              sources={journey}
              enabled
              onFinance={async () => {
                const opened = await reviewFinance();
                if (opened) document.getElementById('journey-finance')?.focus();
                return opened;
              }}
            />
          </section>
        </>
      )}
      <footer>
        <img
          src={productBrand.transparentPortalLogo}
          alt="Propel Contractor Suite by Eagle Vision"
        />
        <p>
          Release 1.0 NOT READY / NOT AUTHORIZED · No hosted or financial
          execution.
        </p>
      </footer>
    </main>
  );
}
