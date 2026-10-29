import { BackOfficeText } from './back-office-copy';
import { backOfficeLabel } from './back-office-labels';
import { useCallback, useState, useContext } from 'react';
import { BackOfficeConcept } from './back-office-presentation';
import type { Phase3Repository } from '../../lib/phase3';
import type {
  RepairReadinessInput,
  RepairMeasurement,
  RepairReviewSection,
} from '../../domain/property/repair-readiness';
import { formatMinor } from '../../domain/estimating/calculation';
import { useResource, useTask } from '../forms-state';
import './repair-readiness.css';

type State = ReturnType<Phase3Repository['repairReadiness']>;
export function RepairScopeReadiness({
  repo,
  org,
  estimate,
  version,
  revision,
  dirty,
}: {
  repo: Phase3Repository;
  org: string;
  estimate: string;
  version: string;
  revision: number;
  dirty: boolean;
}) {
  const concept = useContext(BackOfficeConcept);
  const resource = useResource(
    useCallback(async () => {
      const actor = repo.syntheticReadinessReviewer(org);
      const value = repo.repairReadiness(org, actor, estimate, version);
      if (value.lock_revision !== revision)
        throw Error(
          'Saved draft changed. Reopen the exact repair estimate before reviewing.',
        );
      return { actor, value };
    }, [repo, org, estimate, version, revision]),
  );
  const task = useTask();
  const data = !resource.loading && !resource.error ? resource.data : undefined;
  return (
    <section
      className="repair-readiness"
      aria-label={backOfficeLabel('Repair scope readiness', concept)}
      id={concept ? 'concept-repair-readiness' : undefined}
    >
      <div className="section-title">
        <h3>
          <BackOfficeText text="Repair scope readiness" />
        </h3>
        <button
          className="secondary"
          disabled={task.busy}
          onClick={resource.reload}
        >
          <BackOfficeText text="Reload repair readiness" />
        </button>
      </div>
      <p>
        {concept ? (
          'Internal draft review only. Six confirmations never authorize issuance, work or customer obligations.'
        ) : (
          <>
            Internal draft review only. Completing all sections never authorizes
            issuance, publication, customer approval, work execution or debt.
            Measurement references are staff statements, not independent
            verification.
          </>
        )}
      </p>
      {dirty ? (
        <p role="status">
          Unsaved estimate changes. Save the draft before reviewing readiness;
          previous confirmations do not cover these edits.
        </p>
      ) : resource.loading ? (
        <p role="status">Loading saved repair evidence and current policies…</p>
      ) : !data ? (
        <p role="alert">
          Readiness unavailable. {resource.error} Reload before reviewing.
        </p>
      ) : (
        <>
          <p role="status" data-readiness-revision={data.value.lock_revision}>
            <strong>
              <BackOfficeText
                text={
                  data.value.ready
                    ? 'Internal review complete · issuance remains blocked'
                    : 'Internal review outstanding'
                }
              />
            </strong>{' '}
            · {data.value.confirmed} of 6 sections confirmed for saved revision{' '}
            {data.value.lock_revision}.
          </p>
          <p className="muted">
            {concept ? (
              'Current saved evidence only · changes invalidate confirmations. Session-only staff review.'
            ) : (
              <>
                Synthetic reviewer: {data.actor}. Any saved revision or source,
                calculation, selected catalog or tax-policy change invalidates
                the prior confirmations. Session-only evidence.
              </>
            )}
          </p>
          {concept && (
            <nav
              className="concept-review-progress"
              aria-label="Six-section review progress"
            >
              {data.value.sections.map((s, i) => (
                <a
                  key={s.id}
                  data-state={
                    s.confirmed
                      ? 'confirmed'
                      : s.stale
                        ? 'stale'
                        : 'outstanding'
                  }
                  href={'#concept-review-' + s.id}
                  onClick={() =>
                    document
                      .getElementById('concept-review-' + s.id)
                      ?.setAttribute('open', '')
                  }
                >
                  <span aria-hidden="true">
                    {s.confirmed ? '✓' : String(i + 1).padStart(2, '0')}
                  </span>
                  <BackOfficeText text={s.label} />
                  <small>
                    <BackOfficeText
                      text={
                        s.confirmed
                          ? 'Confirmed'
                          : s.stale
                            ? 'Review stale'
                            : 'Needs review'
                      }
                    />
                  </small>
                </a>
              ))}
            </nav>
          )}
          <details>
            <summary>
              <BackOfficeText text="Observed condition and exact source" />
            </summary>
            {concept && (
              <p>
                Measurement references are staff statements, not independent
                verification. Published source evidence and current reviewer,
                policy, catalog and calculation checks remain required.
              </p>
            )}
            <p>Observed: {data.value.evidence.finding.description}</p>
            <p>
              Contractor recommendation in source:{' '}
              {data.value.evidence.finding.recommendation || 'None recorded'}
            </p>
            <p>
              Report {data.value.origin.source.report_id} · Published v
              {data.value.origin.source.report_version} · Finding{' '}
              {data.value.origin.source.finding_id}. Observations remain
              immutable and separate from proposed estimate scope.
            </p>
          </details>
          <div className="readiness-grid">
            {data.value.sections.map((section) => (
              <ReviewSection
                key={
                  section.id +
                  ':' +
                  data.value.snapshot +
                  ':' +
                  (section.last?.sequence ?? 0)
                }
                section={section}
                state={data.value}
                busy={task.busy}
                onRecord={(input) =>
                  void task.run(async () => {
                    repo.confirmRepairReadiness(org, data.actor, estimate, {
                      request_id: crypto.randomUUID(),
                      draft_version_id: version,
                      lock_revision: data.value.lock_revision,
                      expected_sequence: data.value.sequence,
                      snapshot: data.value.snapshot,
                      section: section.id,
                      input,
                    });
                    resource.reload();
                  }, 'Internal review evidence recorded for the exact saved state. Issuance remains blocked.')
                }
              />
            ))}
          </div>
          <details>
            <summary>
              <BackOfficeText text="Review history (" />
              {data.value.history.length})
            </summary>
            {!data.value.history.length && (
              <p>No staff readiness reviews recorded.</p>
            )}
            {data.value.history.map((entry) => (
              <article key={entry.sequence} className="readiness-history">
                <strong>
                  Review {entry.sequence} ·{' '}
                  <BackOfficeText text={entry.request.section} /> ·{' '}
                  {concept
                    ? backOfficeLabel(entry.request.input.decision, true)
                    : entry.request.input.decision.replaceAll('_', ' ')}
                </strong>
                <p>
                  Draft {entry.request.draft_version_id} · Saved revision{' '}
                  {entry.request.lock_revision} · {entry.actor} ·{' '}
                  {entry.recorded_at}
                </p>
                <p>
                  Tax policy: {entry.policy_id || 'Unverified'} · Policy version{' '}
                  {entry.policy_version ?? 'unverified'} ·{' '}
                  <BackOfficeText
                    text={
                      entry.request.snapshot === data.value.snapshot
                        ? 'Matches current saved evidence'
                        : 'Historical only · stale for current evidence'
                    }
                  />
                </p>
                <p>
                  Calculation engine v{entry.calculation.engine_version} at
                  review: cost{' '}
                  {formatMinor(
                    entry.calculation.cost_minor,
                    entry.calculation.currency,
                  )}{' '}
                  · selling total{' '}
                  {formatMinor(
                    entry.calculation.total_minor,
                    entry.calculation.currency,
                  )}{' '}
                  · estimated gross margin{' '}
                  {(entry.calculation.profit_margin_bps / 100).toFixed(2)}%.
                  Historical calculations do not establish tax applicability or
                  financial authority.
                </p>
                <p>{entry.request.input.note}</p>
                {entry.request.input.measurements.map((m) => (
                  <p key={m.line_id}>
                    Staff measurement: {m.quantity_milli / 1000} {m.unit} ·{' '}
                    {m.reference}
                  </p>
                ))}
              </article>
            ))}
          </details>
        </>
      )}
      {task.message && <p role="status">{task.message}</p>}
    </section>
  );
}
function ReviewSection({
  section,
  state,
  busy,
  onRecord,
}: {
  section: State['sections'][number];
  state: State;
  busy: boolean;
  onRecord(input: RepairReadinessInput): void;
}) {
  const concept = useContext(BackOfficeConcept);
  const Container = concept ? 'details' : 'section';
  const [note, setNote] = useState(''),
    [attested, setAttested] = useState(section.confirmed);
  const [measurements, setMeasurements] = useState<RepairMeasurement[]>(() =>
    state.lines.map((l) => ({
      line_id: l.id,
      quantity_milli: l.quantity_milli,
      unit: l.unit,
      basis: 'placeholder',
      reference: '',
    })),
  );
  const money = (n: number) => formatMinor(n, state.currency);
  const measurementComplete = measurements.every(
    (m) => m.basis === 'measured' && m.reference.trim().length >= 8,
  );
  const blocked =
    section.id === 'measurements'
      ? !measurementComplete
      : section.blockers.length > 0;
  function record(decision: RepairReadinessInput['decision']) {
    onRecord({
      decision,
      attested: decision === 'confirmed' && attested,
      note,
      measurements:
        section.id === 'measurements' && decision === 'confirmed'
          ? measurements
          : [],
    });
  }
  const prompts: Record<RepairReviewSection, string> = {
    scope:
      'I reviewed the exact customer, property, job and source, defined proposed repair scope and addressed outstanding scope questions.',
    measurements:
      'I recorded measured quantities, units and supporting references for every saved line; no unmeasured placeholders remain.',
    resources:
      'I reviewed materials, labor, hours/rates, allowances, costs and catalog substitutions or overrides, including any packaged scope.',
    pricing:
      'I reviewed calculated costs, markup, selling prices, discounts and estimated gross profit and margin, including any warnings.',
    tax: 'I reviewed applicability of the selected current policy to this property and work, including jurisdiction and any zero-tax treatment.',
    terms:
      'I reviewed project terms, scope details and expiration and identified no outstanding completeness questions.',
  };
  return (
    <Container
      open={concept ? section.id === 'scope' && !section.confirmed : undefined}
      id={concept ? 'concept-review-' + section.id : undefined}
      data-review-state={
        section.confirmed
          ? 'confirmed'
          : section.stale
            ? 'stale'
            : 'outstanding'
      }
      className="readiness-card"
      aria-label={backOfficeLabel(section.label, concept)}
      data-review-section={section.id}
    >
      {concept ? (
        <summary>
          <span>
            <BackOfficeText text={section.label} />
          </span>
          <small>
            <BackOfficeText
              text={
                section.confirmed
                  ? 'Confirmed for saved revision'
                  : section.stale
                    ? 'Stale · review again'
                    : 'Needs contractor review'
              }
            />
          </small>
        </summary>
      ) : (
        <h4>
          <BackOfficeText text={section.label} />
        </h4>
      )}
      <p>
        <strong>
          <BackOfficeText
            text={
              section.confirmed
                ? 'Confirmed for current saved state'
                : section.stale
                  ? 'Previous review is stale'
                  : 'Needs contractor review'
            }
          />
        </strong>
      </p>
      {section.blockers.length > 0 && (
        <ul>
          {section.blockers.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {section.warnings.length > 0 && (
        <ul>
          {section.warnings.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {section.last?.request.input.decision === 'needs_review' && (
        <p>Last recorded staff question: {section.last.request.input.note}</p>
      )}
      {section.id === 'scope' && (
        <p>
          Proposed scope:{' '}
          {state.lines.find((l) => l.id === state.origin.line_id)?.description}.
          Review source observations separately; omission never proves repair.
        </p>
      )}
      {section.id === 'resources' && (
        <ul>
          {state.lines.map((l) => (
            <li key={l.id}>
              {l.description} · {l.kind} · {l.quantity_milli / 1000} {l.unit} ·
              Unit cost {money(l.unit_cost_minor)}
              {l.catalog_item_id
                ? ' · Linked company catalog item'
                : ' · Manual scope'}
            </li>
          ))}
        </ul>
      )}
      {section.id === 'pricing' && (
        <dl className="readiness-totals">
          <dt>
            <BackOfficeText text="Calculated cost" />
          </dt>
          <dd>{money(state.calculation.cost_minor)}</dd>
          <dt>
            <BackOfficeText text="Calculated selling total" />
          </dt>
          <dd>{money(state.calculation.total_minor)}</dd>
          <dt>
            <BackOfficeText text="Estimated gross profit" />
          </dt>
          <dd>{money(state.calculation.gross_profit_minor)}</dd>
          <dt>
            <BackOfficeText text="Estimated gross margin" />
          </dt>
          <dd>{(state.calculation.profit_margin_bps / 100).toFixed(2)}%</dd>
          <dt>
            <BackOfficeText text="Line markup" />
          </dt>
          <dd>
            {state.lines
              .map(
                (l) =>
                  `${l.markup_bps / 100}%${l.unit_price_minor !== null ? ' (explicit selling price)' : ''}`,
              )
              .join(', ')}
          </dd>
        </dl>
      )}
      {section.id === 'tax' && (
        <p>
          {state.validPolicy && state.policy
            ? `${state.policy.name} · policy v${state.policy.policy_version} · ${state.policy.rate_bps / 100}% · ${state.policy.jurisdiction}. ${state.policy.reference}`
            : 'Tax applicability is unresolved. Provisional calculations do not establish a tax rate.'}
        </p>
      )}
      <fieldset disabled={busy}>
        <legend>
          {concept
            ? 'Record ' + backOfficeLabel(section.label, true) + ' Review'
            : 'Record ' + section.label.toLowerCase() + ' review'}
        </legend>
        {section.id === 'measurements' &&
          !section.confirmed &&
          measurements.map((m, i) => (
            <div className="readiness-measurement" key={m.line_id}>
              <p>
                {state.lines[i].description} · Saved quantity{' '}
                {m.quantity_milli / 1000} {m.unit}
              </p>
              <label className="p3-field">
                <BackOfficeText text="Measurement basis " />
                {i + 1}
                <select
                  value={m.basis}
                  onChange={(e) =>
                    setMeasurements((prev) =>
                      prev.map((v, n) =>
                        n === i
                          ? {
                              ...v,
                              basis: e.target
                                .value as RepairMeasurement['basis'],
                            }
                          : v,
                      ),
                    )
                  }
                >
                  <option value="placeholder">
                    <BackOfficeText text="Unmeasured / placeholder" />
                  </option>
                  <option value="measured">
                    <BackOfficeText text="Measured by staff" />
                  </option>
                </select>
              </label>
              <label className="p3-field">
                <BackOfficeText text="Supporting measurement reference " />
                {i + 1}
                <input
                  value={m.reference}
                  maxLength={300}
                  onChange={(e) =>
                    setMeasurements((prev) =>
                      prev.map((v, n) =>
                        n === i ? { ...v, reference: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
        <label className="p3-field">
          <BackOfficeText
            text={
              section.id === 'scope'
                ? 'Scope review note or outstanding questions'
                : 'Supporting review note'
            }
          />
          <textarea
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="readiness-confirmation">
          <input
            type="checkbox"
            checked={attested}
            disabled={section.confirmed}
            onChange={(e) => setAttested(e.target.checked)}
          />
          {prompts[section.id]}
        </label>
        <div className="readiness-actions">
          <button
            disabled={
              section.confirmed ||
              blocked ||
              !attested ||
              note.trim().length < 8
            }
            onClick={() => record('confirmed')}
          >
            {concept
              ? 'Confirm ' + backOfficeLabel(section.label, true)
              : 'Confirm ' + section.label.toLowerCase()}
          </button>
          <button
            className="secondary"
            disabled={note.trim().length < 8}
            onClick={() => record('needs_review')}
          >
            {concept
              ? 'Record Outstanding ' +
                backOfficeLabel(section.id, true) +
                ' Review'
              : 'Record outstanding ' + section.id + ' review'}
          </button>
        </div>
      </fieldset>
    </Container>
  );
}
