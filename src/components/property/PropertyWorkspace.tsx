import { useState, useCallback } from 'react';
import type { Operations } from '../../lib/operations';
import type { CompanyProfile } from '../../domain/platform';
import {
  propertyRepository,
  type PropertyRepository,
  type PropertyState,
} from '../../lib/property';
import {
  type Visit,
  type VisitContent,
  occurrence,
} from '../../domain/property/inspections';
import {
  compareSuppliers,
  requirementsFromLines,
  type SupplierQuote,
} from '../../domain/property/comparison';
import {
  parseMinor,
  minorText,
  formatMinor,
} from '../../domain/estimating/calculation';
import { useResource, useTask } from '../forms-state';
import { ResourceStatus } from '../forms';
import { Field, Money, Quantity } from '../phase3/fields';
import { UnbilledReview } from './UnbilledReview';
export function PropertyWorkspace({
  operations,
  company,
  section,
}: {
  operations: Operations;
  company: CompanyProfile;
  section: string;
}) {
  const repo = propertyRepository(operations);
  const data = useResource(
    useCallback(async () => {
      await repo.initialize(company);
      await repo.refreshContexts(company.id);
      return repo.read(company.id);
    }, [repo, company]),
  );
  if (!data.data || data.error)
    return (
      <article>
        <ResourceStatus {...data} />
      </article>
    );
  return (
    <article className="p3-workspace property-workspace">
      <div className="section-title">
        <div>
          <span className="eyebrow">PROPERTY & PROJECT OPERATIONS</span>
          <h2>{section}</h2>
        </div>
        <span className="badge">Local synthetic workspace</span>
      </div>
      <p className="p3-notice">
        Internal preview · changes stay in this browser session. Connected
        access, media ingestion and playback are disabled. No customer messages
        or charges.
      </p>
      {section === 'Property operations' ? (
        <Inspections
          repo={repo}
          org={company.id}
          state={data.data}
          refresh={data.reload}
        />
      ) : section === 'Supplier comparison' ? (
        <Comparison
          repo={repo}
          org={company.id}
          state={data.data}
          refresh={data.reload}
        />
      ) : (
        <ClientView
          repo={repo}
          org={company.id}
          state={data.data}
          refresh={data.reload}
        />
      )}
    </article>
  );
}
function Inspections({
  repo,
  org,
  state,
  refresh,
}: {
  repo: PropertyRepository;
  org: string;
  state: PropertyState;
  refresh: () => void;
}) {
  const [tab, setTab] = useState('Inspections'),
    [visitId, setVisitId] = useState(state.visits[0].id),
    [plan, setPlan] = useState(structuredClone(state.plans[0])),
    [date, setDate] = useState(
      occurrence(state.plans[0], state.visits.length) ??
        state.plans[0].starts_on,
    );
  const task = useTask(),
    v =
      state.visits.find((v) => v.id === visitId && v.plan_id === plan.id) ??
      state.visits.find((v) => v.plan_id === plan.id);
  const [visitPhase, setVisitPhase] = useState<Visit['phase']>('during');
  const [contextIndex, setContextIndex] = useState(0),
    [newName, setNewName] = useState('Initial property survey');
  const run = (f: () => Promise<void> | void, message = 'Local record saved') =>
    void task.run(async () => {
      await f();
      refresh();
    }, message);
  return (
    <>
      <div
        className="p3-tabs"
        role="group"
        aria-label="Property workspace views"
      >
        {['Inspections', 'Media & galleries', 'Unbilled materials'].map((t) => (
          <button
            key={t}
            className={tab === t ? '' : 'secondary'}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Unbilled materials' ? (
        <UnbilledReview repo={repo} org={org} />
      ) : tab === 'Media & galleries' ? (
        <MediaPanel />
      ) : (
        <>
          <div className="property-grid">
            <section>
              <h3>CRM property & inspection plans</h3>
              <Field label="Active inspection plan">
                <select
                  value={plan.id}
                  onChange={(e) =>
                    setPlan(
                      structuredClone(
                        state.plans.find((p) => p.id === e.target.value)!,
                      ),
                    )
                  }
                >
                  {state.plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ·{' '}
                      {
                        state.contexts.find(
                          (c) => c.location_id === p.location_id,
                        )?.location_label
                      }
                    </option>
                  ))}
                </select>
              </Field>
              <details>
                <summary>Create property inspection plan</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => {
                      const p = repo.createPlan(
                        org,
                        state.contexts[contextIndex],
                        newName,
                      );
                      setPlan(p);
                    });
                  }}
                >
                  <Field label="CRM customer / property / job">
                    <select
                      value={contextIndex}
                      onChange={(e) => setContextIndex(Number(e.target.value))}
                    >
                      {state.contexts.map((c, i) => (
                        <option key={i} value={i}>
                          {c.customer_name} · {c.location_label} ·{' '}
                          {c.job_id
                            ? 'Linked job'
                            : 'Property visit without job'}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="New survey name">
                    <input
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </Field>
                  <button>Create inspection plan</button>
                </form>
              </details>
              <h3>
                {
                  state.contexts.find((c) => c.customer_id === plan.customer_id)
                    ?.customer_name
                }
              </h3>
              <p>
                {
                  state.contexts.find((c) => c.location_id === plan.location_id)
                    ?.location_label
                }{' '}
                ·{' '}
                {plan.job_id
                  ? 'linked CRM property and job'
                  : 'CRM property visit'}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => {
                    repo.savePlan(org, plan);
                    setPlan(
                      repo.read(org).plans.find((p) => p.id === plan.id)!,
                    );
                  });
                }}
              >
                <Field label="Inspection plan">
                  <input
                    required
                    value={plan.name}
                    onChange={(e) => setPlan({ ...plan, name: e.target.value })}
                  />
                </Field>
                <div className="p3-grid">
                  <Field label="Visit frequency">
                    <select
                      value={plan.cadence}
                      onChange={(e) =>
                        setPlan({
                          ...plan,
                          cadence: e.target.value as typeof plan.cadence,
                        })
                      }
                    >
                      {['once', 'weekly', 'monthly', 'custom'].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Custom interval in days">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={plan.interval_days}
                      onChange={(e) =>
                        setPlan({
                          ...plan,
                          interval_days: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Schedule start">
                    <input
                      type="date"
                      required
                      value={plan.starts_on}
                      onChange={(e) =>
                        setPlan({ ...plan, starts_on: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Property timezone">
                    <input
                      required
                      value={plan.timezone}
                      onChange={(e) =>
                        setPlan({ ...plan, timezone: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="Checklist template (one item per line)">
                  <textarea
                    value={plan.checklist.map((x) => x.label).join('\n')}
                    onChange={(e) =>
                      setPlan({
                        ...plan,
                        checklist: e.target.value
                          .split('\n')
                          .filter(Boolean)
                          .map((label, i) => ({
                            id: plan.checklist[i]?.id ?? crypto.randomUUID(),
                            label,
                            required: true,
                            completed: false,
                          })),
                      })
                    }
                  />
                </Field>
                {plan.checklist.map((x, i) => (
                  <label className="property-check" key={x.id}>
                    <input
                      type="checkbox"
                      checked={x.required}
                      onChange={(e) =>
                        setPlan({
                          ...plan,
                          checklist: plan.checklist.map((c, j) =>
                            i === j ? { ...c, required: e.target.checked } : c,
                          ),
                        })
                      }
                    />
                    Require checklist item {i + 1}
                  </label>
                ))}
                <button disabled={task.busy}>Save inspection plan</button>
              </form>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => {
                    const next = repo.addVisit(org, plan.id, date, visitPhase);
                    setVisitId(next.id);
                  });
                }}
              >
                <Field label="Visit project stage">
                  <select
                    value={visitPhase}
                    onChange={(e) =>
                      setVisitPhase(e.target.value as Visit['phase'])
                    }
                  >
                    {['before', 'during', 'after'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Next visit date">
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
                <button className="secondary" disabled={task.busy}>
                  Schedule visit
                </button>
              </form>
            </section>
            <section>
              <h3>Service visit history</h3>
              <div className="property-history">
                {state.visits
                  .filter((x) => x.plan_id === plan.id)
                  .map((x) => (
                    <button
                      key={x.id}
                      className={x.id === v?.id ? '' : 'secondary'}
                      onClick={() => setVisitId(x.id)}
                    >
                      {x.visited_on} · {x.phase} · {x.status}
                    </button>
                  ))}
              </div>
              <p>
                {state.reports.length} immutable published report version(s).
                Publishing is a local contractor review action; it sends
                nothing.
              </p>
              {state.reports.map((r) => (
                <details key={r.id}>
                  <summary>
                    Report v{r.version} ·{' '}
                    {new Date(r.published_at).toLocaleDateString()}
                  </summary>
                  <p>{r.summary}</p>
                  {r.findings.map((f) => (
                    <p key={f.id}>
                      {f.location}: {f.description}
                    </p>
                  ))}
                </details>
              ))}
            </section>
          </div>
          {v && (
            <VisitEditor
              key={`${v.id}-${v.revision}`}
              repo={repo}
              org={org}
              visit={v}
              refresh={refresh}
            />
          )}
        </>
      )}
      {task.message && <p role="status">{task.message}</p>}
    </>
  );
}
function VisitEditor({
  repo,
  org,
  visit: v,
  refresh,
}: {
  repo: PropertyRepository;
  org: string;
  visit: Visit;
  refresh: () => void;
}) {
  const [c, setC] = useState<VisitContent>(structuredClone(v.content));
  const task = useTask(),
    locked = v.status !== 'draft';
  const run = (
    f: () => unknown | Promise<unknown>,
    msg = 'Local inspection updated',
  ) =>
    void task.run(async () => {
      await f();
      refresh();
    }, msg);
  return (
    <section className="inspection-editor">
      <div className="section-title">
        <h3>Visit · {v.visited_on}</h3>
        <span className="badge">
          {v.status} · revision {v.revision}
        </span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => repo.saveVisit(org, v, c));
        }}
      >
        <fieldset disabled={locked || task.busy}>
          <legend>Inspection content</legend>
          <Field label="Client report summary">
            <textarea
              required
              value={c.summary}
              onChange={(e) => setC({ ...c, summary: e.target.value })}
            />
          </Field>
          <Field label="Internal inspection notes">
            <textarea
              value={c.internal_notes}
              onChange={(e) => setC({ ...c, internal_notes: e.target.value })}
            />
          </Field>
          <h4>Checklist</h4>
          {c.checklist.map((x, i) => (
            <label key={x.id} className="property-check">
              <input
                type="checkbox"
                checked={x.completed}
                onChange={(e) =>
                  setC({
                    ...c,
                    checklist: c.checklist.map((a, j) =>
                      j === i ? { ...a, completed: e.target.checked } : a,
                    ),
                  })
                }
              />
              {x.label}
              {x.required ? ' · required' : ''}
            </label>
          ))}
          <h4>Findings & repair recommendations</h4>
          {c.findings.map((f, i) => (
            <div className="finding-card" key={f.id}>
              <div className="p3-grid">
                <Field label={`Finding ${i + 1} location`}>
                  <input
                    value={f.location}
                    onChange={(e) =>
                      setC({
                        ...c,
                        findings: c.findings.map((x, j) =>
                          j === i ? { ...x, location: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label={`Finding ${i + 1} category`}>
                  <input
                    value={f.category}
                    onChange={(e) =>
                      setC({
                        ...c,
                        findings: c.findings.map((x, j) =>
                          j === i ? { ...x, category: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label={`Finding ${i + 1} severity`}>
                  <select
                    value={f.severity}
                    onChange={(e) =>
                      setC({
                        ...c,
                        findings: c.findings.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                severity: e.target.value as typeof x.severity,
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    {['low', 'moderate', 'urgent'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={`Finding ${i + 1} description`}>
                <textarea
                  value={f.description}
                  onChange={(e) =>
                    setC({
                      ...c,
                      findings: c.findings.map((x, j) =>
                        j === i ? { ...x, description: e.target.value } : x,
                      ),
                    })
                  }
                />
              </Field>
              <Field label={`Finding ${i + 1} recommendation`}>
                <textarea
                  value={f.recommendation}
                  onChange={(e) =>
                    setC({
                      ...c,
                      findings: c.findings.map((x, j) =>
                        j === i ? { ...x, recommendation: e.target.value } : x,
                      ),
                    })
                  }
                />
              </Field>
              <label className="property-check">
                <input
                  type="checkbox"
                  checked={f.customer_visible}
                  onChange={(e) =>
                    setC({
                      ...c,
                      findings: c.findings.map((x, j) =>
                        j === i
                          ? { ...x, customer_visible: e.target.checked }
                          : x,
                      ),
                    })
                  }
                />
                Include finding {i + 1} in client report
              </label>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setC({
                ...c,
                findings: [
                  ...c.findings,
                  {
                    id: crypto.randomUUID(),
                    category: 'Damage',
                    location: 'Work area',
                    severity: 'moderate',
                    description: 'Describe observed condition',
                    recommendation: 'Contractor review required',
                    customer_visible: false,
                  },
                ],
              })
            }
          >
            Add finding
          </button>
          <button>Save visit draft</button>
        </fieldset>
      </form>
      <div className="p3-actions">
        {v.status === 'draft' ? (
          <button
            disabled={task.busy}
            onClick={() => run(() => repo.submit(org, v))}
          >
            Submit inspection for review
          </button>
        ) : v.status === 'submitted' ? (
          <button
            disabled={task.busy}
            onClick={() =>
              run(
                () => repo.publish(org, v),
                'Immutable client report published locally',
              )
            }
          >
            Approve & publish report
          </button>
        ) : (
          <button
            disabled={task.busy}
            onClick={() => run(() => repo.revise(org, v))}
          >
            Create report revision
          </button>
        )}
        {v.content.findings
          .filter((f) => f.customer_visible)
          .map((f) => (
            <button
              className="secondary"
              key={f.id}
              disabled={task.busy}
              onClick={() =>
                run(
                  () => repo.findingEstimate(org, v.id, f.id),
                  'Repair added to existing estimate draft; price requires review',
                )
              }
            >
              Draft repair estimate · {f.location}
            </button>
          ))}
      </div>
      {task.message && <p role="status">{task.message}</p>}
    </section>
  );
}
function MediaPanel() {
  const [kind, setKind] = useState('photo'),
    [phase, setPhase] = useState('before'),
    [visibility, setVisibility] = useState('internal');
  return (
    <section>
      <h3>Private project media</h3>
      <p>
        Jobsite and drone originals remain private. Customer visibility requires
        a reviewed, scanned derivative and an immutable report reference. A
        selection here grants no file access.
      </p>
      <div className="p3-grid">
        <Field label="Media type">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {['photo', 'video', 'drone_photo', 'drone_video'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Project stage">
          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
            {['before', 'during', 'after'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Intended visibility">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
          >
            <option value="internal">Internal contractor only</option>
            <option value="customer">Client report after approval</option>
          </select>
        </Field>
        <Field label="Capture or choose files · unavailable">
          <input
            type="file"
            accept={
              kind.includes('video')
                ? 'video/mp4,video/quicktime'
                : 'image/jpeg,image/png,image/webp'
            }
            capture="environment"
            multiple
            disabled
          />
        </Field>
      </div>
      <button disabled>Upload to quarantine · disabled</button>
      <p>
        Limits: photos 3 MiB, videos 250 MiB / 5 minutes, 1 GiB daily and 10 GiB
        stored per company. Original GPS/EXIF is removed from published
        derivatives. Playback is capped at 60 seconds of access and rechecked
        per segment.
      </p>
      <div className="property-gallery">
        {['Before', 'During', 'After'].map((x) => (
          <div key={x}>
            <strong>{x}</strong>
            <p>No approved media</p>
            <small>
              Scanning, safe transcodes and private playback infrastructure
              pending
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}
function Comparison({
  repo,
  org,
  state,
  refresh,
}: {
  repo: PropertyRepository;
  org: string;
  state: PropertyState;
  refresh: () => void;
}) {
  const requirements = requirementsFromLines(
    state.bundle.version.payload.lines,
  );
  const [quotes, setQuotes] = useState<SupplierQuote[]>(
      state.quotes.at(-1) ?? [],
    ),
    [active, setActive] = useState(0);
  const task = useTask(),
    currency = state.bundle.version.payload.currency;
  const money = (n: number) => formatMinor(n, currency);
  let result: ReturnType<typeof compareSuppliers> | undefined,
    error = '';
  try {
    if (quotes.length)
      result = compareSuppliers(requirements, quotes, currency);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Check quotes';
  }
  const add = (synthetic = false) => {
    const i = quotes.length;
    if (i === 4) return;
    setQuotes([
      ...quotes,
      {
        id: crypto.randomUUID(),
        name: synthetic ? `Synthetic supplier ${i + 1}` : 'New supplier',
        store: 'Local branch',
        account_price_note:
          'Contractor-supplied quote; not live retailer pricing',
        source_reference: synthetic ? `Synthetic quotation ${i + 1}` : '',
        quoted_at: new Date().toISOString(),
        expires_at: new Date(new Date().getTime() + 7 * 86400000).toISOString(),
        currency,
        shipping_minor: synthetic ? i * 1200 : null,
        pickup_minor: synthetic ? 0 : null,
        tax_bps: synthetic ? 700 : null,
        lines: requirements.map((r) => ({
          line_id: r.line_id,
          sku: '',
          specification: r.specification,
          unit: r.unit,
          pack_quantity_milli: 1000,
          pack_price_minor: synthetic ? 5000 - i * 125 : 0,
          available_packs: synthetic ? 100000 : null,
          equivalent_approved: false,
        })),
      },
    ]);
    setActive(i);
  };
  const q = quotes[active];
  const change = (patch: Partial<SupplierQuote>) =>
    setQuotes(quotes.map((x, i) => (i === active ? { ...x, ...patch } : x)));
  return (
    <>
      <p>
        Compare up to four reviewed supplier quotations. Home Depot, Lowe’s,
        Menards and local supplier connectors require authorized APIs; no prices
        are scraped or represented as live.
      </p>
      <div className="p3-actions">
        <button disabled={quotes.length >= 4} onClick={() => add()}>
          Add supplier quote
        </button>
        <button
          className="secondary"
          disabled={quotes.length >= 4}
          onClick={() => add(true)}
        >
          Add synthetic quote example
        </button>
        <span>{quotes.length}/4 suppliers</span>
      </div>
      {q && (
        <>
          <button
            className="secondary"
            onClick={() => {
              setQuotes(quotes.filter((x) => x.id !== q.id));
              setActive(0);
            }}
          >
            Remove selected supplier
          </button>
          <div className="p3-tabs">
            {quotes.map((x, i) => (
              <button
                className={i === active ? '' : 'secondary'}
                key={x.id}
                onClick={() => setActive(i)}
              >
                {x.name}
              </button>
            ))}
          </div>
          <div className="p3-grid">
            <Field label="Supplier name">
              <input
                value={q.name}
                onChange={(e) => change({ name: e.target.value })}
              />
            </Field>
            <Field label="Store or branch">
              <input
                value={q.store}
                onChange={(e) => change({ store: e.target.value })}
              />
            </Field>
            <Field label="Quote source reference">
              <input
                value={q.source_reference}
                onChange={(e) => change({ source_reference: e.target.value })}
              />
            </Field>
            <Field label="Quoted date">
              <input
                type="date"
                value={q.quoted_at.slice(0, 10)}
                onChange={(e) =>
                  change({
                    quoted_at: e.target.value
                      ? `${e.target.value}T00:00:00Z`
                      : '',
                  })
                }
              />
            </Field>
            <Field label="Quote expiration">
              <input
                type="date"
                value={q.expires_at.slice(0, 10)}
                onChange={(e) =>
                  change({
                    expires_at: e.target.value
                      ? `${e.target.value}T23:59:59Z`
                      : '',
                  })
                }
              />
            </Field>
            <OptionalMoney
              key={`${q.id}-shipping`}
              label={`Shipping · ${q.shipping_minor === null ? 'UNKNOWN: enter confirmed cost' : 'confirmed cost'}`}
              value={q.shipping_minor}
              currency={currency}
              onChange={(n) =>
                change({ shipping_minor: Number.isFinite(n) ? n : null })
              }
            />
            <OptionalMoney
              key={`${q.id}-pickup`}
              label={`Pickup · ${q.pickup_minor === null ? 'UNKNOWN: enter confirmed cost' : 'confirmed cost'}`}
              value={q.pickup_minor}
              currency={currency}
              onChange={(n) =>
                change({ pickup_minor: Number.isFinite(n) ? n : null })
              }
            />
            <Field label="Purchase tax basis points (unknown until entered)">
              <input
                type="number"
                min="0"
                max="10000"
                value={q.tax_bps ?? ''}
                onChange={(e) =>
                  change({
                    tax_bps:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          {q.lines.map((l, i) => (
            <details key={`${q.id}-${l.line_id}`} open={i === 0}>
              <summary>
                {requirements[i].description} ·{' '}
                {requirements[i].quantity_milli / 1000} {requirements[i].unit}
              </summary>
              <div className="p3-grid">
                <Field label={`Product ${i + 1} specification`}>
                  <input
                    value={l.specification}
                    onChange={(e) =>
                      change({
                        lines: q.lines.map((x, j) =>
                          j === i ? { ...x, specification: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label={`Product ${i + 1} SKU`}>
                  <input
                    value={l.sku}
                    onChange={(e) =>
                      change({
                        lines: q.lines.map((x, j) =>
                          j === i ? { ...x, sku: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label={`Product ${i + 1} unit`}>
                  <select
                    value={l.unit}
                    onChange={(e) =>
                      change({
                        lines: q.lines.map((x, j) =>
                          j === i ? { ...x, unit: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    {[
                      'each',
                      'bundle',
                      'linear_ft',
                      'inch',
                      'sq_ft',
                      'roofing_square',
                      'cubic_yard',
                    ].map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </Field>
                <Quantity
                  key={`${q.id}-${i}-qty`}
                  label={`Product ${i + 1} quantity per pack`}
                  value={l.pack_quantity_milli}
                  onChange={(n) =>
                    change({
                      lines: q.lines.map((x, j) =>
                        j === i ? { ...x, pack_quantity_milli: n } : x,
                      ),
                    })
                  }
                />
                <Money
                  key={`${q.id}-${i}-cost`}
                  label={`Product ${i + 1} pack cost`}
                  value={l.pack_price_minor}
                  currency={currency}
                  onChange={(n) =>
                    change({
                      lines: q.lines.map((x, j) =>
                        j === i ? { ...x, pack_price_minor: n } : x,
                      ),
                    })
                  }
                />
                <Field label={`Product ${i + 1} available packs`}>
                  <input
                    type="number"
                    min="0"
                    value={l.available_packs ?? ''}
                    onChange={(e) =>
                      change({
                        lines: q.lines.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                available_packs:
                                  e.target.value === ''
                                    ? null
                                    : Number(e.target.value),
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </Field>
              </div>
              <label className="property-check">
                <input
                  type="checkbox"
                  checked={l.equivalent_approved}
                  onChange={(e) =>
                    change({
                      lines: q.lines.map((x, j) =>
                        j === i
                          ? { ...x, equivalent_approved: e.target.checked }
                          : x,
                      ),
                    })
                  }
                />
                Explicitly approve product equivalence {i + 1}
              </label>
            </details>
          ))}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <section aria-label="Supplier acquisition comparison">
          <h3>Acquisition costs · {currency}</h3>
          <div className="p3-table-wrap">
            <table className="p3-table">
              <thead>
                <tr>
                  <th>Material</th>
                  {result.vendors.map((v) => (
                    <th key={v.quote.id}>{v.quote.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requirements.map((r, i) => (
                  <tr key={r.line_id}>
                    <th>{r.description}</th>
                    {result!.vendors.map((v) => (
                      <td key={v.quote.id}>
                        {v.rows[i].reason ??
                          `${money(v.rows[i].total_minor!)} · ${v.rows[i].packs} packs`}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th>Complete basket · goods, tax, shipping & pickup</th>
                  {result.vendors.map((v) => (
                    <td key={v.quote.id}>
                      {v.total_minor === null
                        ? 'Incomplete · resolve unknowns'
                        : money(v.total_minor)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="p3-notice">
            <strong>
              Best reviewed mixed basket:{' '}
              {result.mixed ? money(result.mixed.total_minor) : 'not available'}
            </strong>
            <p>
              Rounded pack quantities, line tax and each used vendor’s fixed
              fees are included. Availability remains quoted, not reserved.
            </p>
          </div>
          <button
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                repo.saveQuotes(org, quotes);
                refresh();
              }, 'Quote snapshot retained locally')
            }
          >
            Retain reviewed quote snapshot
          </button>
          <button
            className="secondary"
            disabled={task.busy || !result.mixed}
            onClick={() =>
              void task.run(async () => {
                await repo.applyCosts(org, quotes, result!.mixed!.assignments);
                refresh();
              }, 'Reviewed costs copied to existing estimate draft; original issued scope unchanged')
            }
          >
            Copy reviewed goods costs to estimate draft
          </button>
          <p>
            Customer selling prices, taxes and scope remain subject to estimate
            review. Procurement fees are separate internal acquisition costs.
          </p>
        </section>
      )}
      {task.message && <p role="status">{task.message}</p>}
    </>
  );
}
function ClientView({
  repo,
  org,
  state,
  refresh,
}: {
  repo: PropertyRepository;
  org: string;
  state: PropertyState;
  refresh: () => void;
}) {
  const task = useTask();
  const [customer, setCustomer] = useState(state.plans[0].customer_id);
  const p = repo.portal(org, customer);
  return (
    <>
      <p>
        This is a synthetic client projection for{' '}
        {state.contexts.find((c) => c.customer_id === customer)?.customer_name}.
        Connected portal access remains disabled. Internal costs, private
        findings and draft billing proposals are excluded.
      </p>
      <button
        className="secondary"
        disabled={task.busy || p.invoices.length > 0}
        onClick={() =>
          void task.run(async () => {
            await repo.demonstrateFinancials(org);
            refresh();
          }, 'Existing internal release engine demonstrated; no legal signing, delivery or payment')
        }
      >
        Load synthetic approved financial example
      </button>
      <Field label="Synthetic client context">
        <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
          {state.contexts
            .filter(
              (c, i, a) =>
                a.findIndex((x) => x.customer_id === c.customer_id) === i,
            )
            .map((c) => (
              <option key={c.customer_id} value={c.customer_id}>
                {c.customer_name}
              </option>
            ))}
        </select>
      </Field>
      <section aria-label="Client property report">
        <h3>
          {
            state.contexts.find((c) => c.customer_id === customer)
              ?.location_label
          }
        </h3>
        <h4>Inspection & service visit history</h4>
        {p.reports.length ? (
          p.reports.map((r) => (
            <div className="finding-card" key={r.id}>
              <span className="badge">
                {r.visited_on} · {r.phase} · Published report v{r.version}
              </span>
              <p>{r.summary}</p>
              {r.findings.map((f) => (
                <div key={f.id}>
                  <h4>
                    {f.location} · {f.severity}
                  </h4>
                  <p>{f.description}</p>
                  <p>Recommended repair: {f.recommendation}</p>
                </div>
              ))}
            </div>
          ))
        ) : (
          <p>No contractor-approved reports have been published.</p>
        )}
        <h4>Project progress · photos and videos</h4>
        <p>No approved media. Expiring playback awaits security acceptance.</p>
        <h4>Proposed repairs & estimates</h4>
        {p.estimates.map((e, i) => (
          <div key={i}>
            <strong>{e.project.name}</strong>
            {e.lines.map((l, j) => (
              <p key={j}>
                {l.description} · {formatMinor(l.amount_minor, e.currency)}
              </p>
            ))}
            <p>Total {formatMinor(e.total_minor, e.currency)}</p>
          </div>
        ))}
        {!p.estimates.length && <p>No published estimate is available.</p>}
        <h4>Agreements & approved changes</h4>
        <p>
          {p.contracts.length} synthetic internal agreement(s). Legal signatures
          remain disabled. Only separately authorized scope may become billable.
        </p>
        <h4>Invoices & payment schedules</h4>
        {p.invoices.map((i) => (
          <div key={i.id}>
            <strong>{i.number} · synthetic internal example</strong>
            <p>{formatMinor(i.snapshot.total_minor, i.snapshot.currency)}</p>
            {i.snapshot.schedule.map((s, j) => (
              <p key={j}>
                {s.label} · {formatMinor(s.amount_minor, i.snapshot.currency)} ·{' '}
                {s.due_on || 'Date to be agreed'}
              </p>
            ))}
            <button disabled>
              Payment collection disabled · NMI preferred
            </button>
          </div>
        ))}
        {!p.invoices.length && <p>No authorized invoices are available.</p>}
      </section>
      {task.message && <p role="status">{task.message}</p>}
    </>
  );
}

function OptionalMoney({
  label,
  value,
  currency,
  onChange,
}: {
  label: string;
  value: number | null;
  currency: string;
  onChange: (v: number | null) => void;
}) {
  const [raw, setRaw] = useState(
    value === null ? '' : minorText(value, currency),
  );
  return (
    <Field label={label}>
      <input
        inputMode="decimal"
        placeholder="Unknown"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          try {
            onChange(
              e.target.value === ''
                ? null
                : parseMinor(e.target.value, currency),
            );
          } catch {
            onChange(null);
          }
        }}
      />
    </Field>
  );
}
