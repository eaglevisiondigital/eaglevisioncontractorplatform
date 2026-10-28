import { useState, useCallback } from 'react';
import type { Phase3Repository } from '../../lib/phase3';
import type { CompanyProfile } from '../../domain/platform';
import {
  blankEstimate,
  blankLine,
  calculateEstimate,
  formatMinor,
} from '../../domain/estimating/calculation';
import {
  estimateUnits,
  type EstimateInput,
  type EstimateBundle,
  type EstimateLine,
  type CatalogItem,
  type TaxPolicy,
  type EstimateDefaults,
} from '../../domain/estimating/types';
import { customerPreview } from '../../domain/estimating/customer-preview';
import { useResource, useTask } from '../forms-state';
import { ResourceStatus } from '../forms';
import { CompanyLogo } from '../CompanyLogo';
import { Field, Money, Quantity, Percent } from './fields';
import { MaterialImport } from './MaterialImport';
export function Estimates({
  repo,
  company,
  canIssue,
  initialBundle,
}: {
  repo: Phase3Repository;
  company: CompanyProfile;
  canIssue: boolean;
  initialBundle?: EstimateBundle;
}) {
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<EstimateBundle | undefined>(
      initialBundle,
    );
  const task = useTask();
  const data = useResource(
    useCallback(
      async () => ({
        list: await repo.list(company.id),
        customers: (await repo.operations.listCustomers(company.id, '', '', 0))
          .rows,
        templates: await repo.templates(company.id),
        defaults: await repo.defaults(company.id),
        catalog: await repo.catalog(company.id),
        taxes: await repo.taxes(company.id),
      }),
      [repo, company.id],
    ),
  );
  async function create(templateId?: string) {
    await task.run(async () => {
      if (!data.data?.customers.length)
        throw new Error('Create a customer before estimating');
      const p = blankEstimate(
        data.data.customers[0].id,
        data.data.defaults.currency,
      );
      Object.assign(p, { terms: data.data.defaults.default_terms });
      p.lines[0].unit_price_minor = null;
      p.lines[0].markup_bps = data.data.defaults.material_markup_bps;
      const d = new Date();
      d.setDate(d.getDate() + data.data.defaults.expiration_days);
      p.expires_on = d.toISOString().slice(0, 10);
      if (templateId) {
        const template = data.data.templates.find((t) => t.id === templateId);
        if (template)
          Object.assign(p, structuredClone(template.content), {
            customer_id: p.customer_id,
            location_id: null,
            tax_policy_id: null,
            expires_on: p.expires_on,
            attachments: [],
          });
      }
      setSelected(await repo.create(company, p));
      data.reload();
    }, 'Draft created');
  }
  if (selected)
    return (
      <EstimateEditor
        key={`${selected.version.id}-${selected.version.lock_revision}-${selected.version.status}`}
        initial={selected}
        repo={repo}
        company={company}
        canIssue={canIssue}
        catalog={data.data?.catalog ?? []}
        taxes={data.data?.taxes ?? []}
        defaults={data.data?.defaults}
        onChange={(b) => {
          setSelected(b);
          data.reload();
        }}
        onClose={() => {
          setSelected(undefined);
          data.reload();
        }}
      />
    );
  const rows =
    data.data?.list.filter(
      (e) =>
        (status === 'all' || e.status === status) &&
        `${e.estimate_number} ${e.project_name}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) ?? [];
  return (
    <article className="p3-workspace">
      <div className="section-title">
        <div>
          <span className="eyebrow">PROPOSAL STUDIO</span>
          <h2>Estimates built around your work</h2>
        </div>
        <button
          disabled={task.busy || !data.data}
          onClick={() => void create()}
        >
          New estimate
        </button>
      </div>
      <p>Build clear scope. Protect your costs. Keep every issued version.</p>
      <ResourceStatus {...data} />
      <div className="p3-totals">
        <span>
          Drafts{' '}
          <strong>
            {data.data?.list.filter((e) => e.status === 'draft').length ?? 0}
          </strong>
        </span>
        <span>
          Internally issued{' '}
          <strong>
            {data.data?.list.filter((e) => e.status === 'issued').length ?? 0}
          </strong>
        </span>
        <span>
          Delivery & payments <strong>Disabled</strong>
        </span>
      </div>
      <div className="form-grid">
        <Field label="Search estimates">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Number or project name"
          />
        </Field>
        <Field label="Estimate status">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            {['all', 'draft', 'issued', 'archived'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Create from company template">
          <select value="" onChange={(e) => void create(e.target.value)}>
            <option value="">Choose a template…</option>
            {data.data?.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="estimate-list">
        {rows.slice(page * 10, page * 10 + 10).map((e) => (
          <button
            className="estimate-list-row"
            key={e.id}
            onClick={() =>
              void task.run(
                async () => setSelected(await repo.get(company.id, e.id)),
                'Estimate opened',
              )
            }
          >
            <span>
              <small>
                {e.estimate_number} · {e.status}
              </small>
              <strong>{e.project_name}</strong>
              <span>
                {data.data?.customers.find((c) => c.id === e.customer_id)
                  ?.display_name ?? 'Company customer'}
              </span>
            </span>
            <strong>
              {formatMinor(e.total_minor, e.currency)}{' '}
              <span aria-hidden="true">↗</span>
            </strong>
          </button>
        ))}
      </div>
      {!rows.length && (
        <p>
          No estimates match. Create a customer and your first draft to begin.
        </p>
      )}
      <div className="button-row">
        <button
          className="secondary"
          disabled={!page}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span>
          {rows.length} estimates · page {page + 1}
        </span>
        <button
          className="secondary"
          disabled={(page + 1) * 10 >= rows.length}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
      {task.message && <p role="status">{task.message}</p>}
    </article>
  );
}
function EstimateEditor({
  initial,
  repo,
  company,
  canIssue,
  catalog,
  taxes,
  defaults,
  onChange,
  onClose,
}: {
  initial: EstimateBundle;
  repo: Phase3Repository;
  company: CompanyProfile;
  canIssue: boolean;
  catalog: CatalogItem[];
  taxes: TaxPolicy[];
  defaults?: EstimateDefaults;
  onChange: (b: EstimateBundle) => void;
  onClose: () => void;
}) {
  const [p, setP] = useState(() => structuredClone(initial.version.payload));
  const [tab, setTab] = useState<'build' | 'preview' | 'history'>('build');
  const [importing, setImporting] = useState(false);
  const task = useTask();
  const readonly =
    initial.version.status === 'issued' ||
    initial.estimate.status === 'archived' ||
    initial.estimate.current_version_id !== initial.version.id;
  const dirty = JSON.stringify(p) !== JSON.stringify(initial.version.payload);
  const resources = useResource(
    useCallback(
      async () => ({
        customers: (await repo.operations.listCustomers(company.id, '', '', 0))
          .rows,
        locations: await repo.operations.listLocations(
          company.id,
          p.customer_id,
        ),
        documents: await repo.cleanDocuments(company.id),
        history: await repo.history(company.id, initial.estimate.id),
      }),
      [repo, company.id, p.customer_id, initial.estimate.id],
    ),
  );
  const update = (patch: Partial<EstimateInput>) =>
    setP((prev) => ({ ...prev, ...patch }));
  const line = (id: string, patch: Partial<EstimateLine>) =>
    update({
      lines: p.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
  let calc: ReturnType<typeof calculateEstimate> | undefined;
  let error = '';
  try {
    calc = calculateEstimate(
      p,
      taxes.find((t) => t.id === p.tax_policy_id)?.rate_bps ?? 0,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : 'Check the estimate';
  }
  const money = (n: number) => formatMinor(n, p.currency);
  const previewVersion = {
    ...initial.version,
    payload: p,
    calculation: calc ?? initial.version.calculation,
  };
  return (
    <article className="p3-workspace estimate-editor">
      <div className="section-title">
        <div>
          <span className="eyebrow">
            {initial.estimate.estimate_number} / VERSION{' '}
            {initial.version.version_number}
          </span>
          <h2>{p.project.name}</h2>
          <p>
            {readonly ? 'Immutable snapshot' : 'Private working draft'} ·{' '}
            {p.currency} ·{' '}
            {dirty
              ? 'Unsaved changes'
              : `Saved revision ${initial.version.lock_revision}`}
          </p>
        </div>
        <button className="secondary" onClick={onClose}>
          All estimates
        </button>
      </div>
      <div className="p3-tabs">
        {(['build', 'preview', 'history'] as const).map((t) => (
          <button
            aria-pressed={tab === t}
            key={t}
            className={tab === t ? 'active' : 'secondary'}
            onClick={() => setTab(t)}
          >
            {t === 'build'
              ? 'Estimate builder'
              : t === 'preview'
                ? 'Customer preview'
                : 'Version history'}
          </button>
        ))}
      </div>
      <div className="p3-notice">
        <strong>Internal estimating only</strong>
        <p>
          Issuance locks a version for internal review. It does not deliver,
          accept, sign, invoice or collect payment.
        </p>
      </div>
      {tab === 'history' ? (
        <>
          <ResourceStatus {...resources} />
          {resources.data?.history.map((v) => (
            <button
              className="history-row"
              key={v.id}
              onClick={() =>
                void task.run(
                  async () =>
                    onChange(
                      await repo.get(company.id, initial.estimate.id, v.id),
                    ),
                  'Version opened',
                )
              }
            >
              Version {v.version_number} · {v.status} ·{' '}
              {money(v.calculation.total_minor)} ·{' '}
              {v.issued_at?.slice(0, 10) ?? v.created_at.slice(0, 10)}
            </button>
          ))}
        </>
      ) : tab === 'preview' ? (
        <CustomerEstimatePreview
          bundle={{ ...initial, version: previewVersion }}
          company={company}
          sample={repo.sample}
        />
      ) : (
        <div className="estimate-grid">
          <div className="estimate-main">
            <fieldset disabled={readonly || task.busy}>
              <legend>Project & customer</legend>
              <div className="form-grid">
                <Field label="Project name">
                  <input
                    value={p.project.name}
                    maxLength={200}
                    onChange={(e) =>
                      update({
                        project: { ...p.project, name: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Project type">
                  <input
                    value={p.project.type}
                    maxLength={80}
                    onChange={(e) =>
                      update({
                        project: { ...p.project, type: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Estimate customer">
                  <select
                    value={p.customer_id}
                    onChange={(e) =>
                      update({ customer_id: e.target.value, location_id: null })
                    }
                  >
                    {resources.data?.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.display_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Job location">
                  <select
                    value={p.location_id ?? ''}
                    onChange={(e) =>
                      update({ location_id: e.target.value || null })
                    }
                  >
                    <option value="">No location selected</option>
                    {resources.data?.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.address_line1}, {l.city}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Estimate expires">
                  <input
                    type="date"
                    value={p.expires_on}
                    onChange={(e) => update({ expires_on: e.target.value })}
                  />
                </Field>
                <Field label="Project start">
                  <input
                    type="date"
                    value={p.project.start_on ?? ''}
                    onChange={(e) =>
                      update({
                        project: {
                          ...p.project,
                          start_on: e.target.value || null,
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Project end">
                  <input
                    type="date"
                    value={p.project.end_on ?? ''}
                    onChange={(e) =>
                      update({
                        project: {
                          ...p.project,
                          end_on: e.target.value || null,
                        },
                      })
                    }
                  />
                </Field>
              </div>
              <Field label="Scope description">
                <textarea
                  value={p.project.description}
                  maxLength={5000}
                  onChange={(e) =>
                    update({
                      project: { ...p.project, description: e.target.value },
                    })
                  }
                />
              </Field>
            </fieldset>
            <div className="section-title">
              <h3>Scope & pricing</h3>
              {!readonly && (
                <button disabled={dirty} onClick={() => setImporting(true)}>
                  Smart material import
                </button>
              )}
            </div>
            <p className="muted">
              Costs, markup and internal notes are private. Quantity supports
              three decimal places. Prices use {p.currency} minor units.
            </p>
            <fieldset disabled={readonly || task.busy}>
              <legend className="sr-only">Estimate line items</legend>
              <Field label="Add catalog item">
                <select
                  value=""
                  onChange={(e) => {
                    const item = catalog.find((c) => c.id === e.target.value);
                    if (item)
                      update({
                        lines: [
                          ...p.lines,
                          {
                            ...blankLine(item.kind),
                            description: item.description || item.name,
                            unit: item.unit,
                            unit_cost_minor: item.unit_cost_minor,
                            unit_price_minor: item.unit_price_minor,
                            markup_bps: item.markup_bps,
                            catalog_item_id: item.id,
                          },
                        ],
                      });
                  }}
                >
                  <option value="">
                    Choose company material, product or labor…
                  </option>
                  {catalog
                    .filter((c) => c.active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.category} · {c.name}
                      </option>
                    ))}
                </select>
              </Field>
              {p.lines.map((l, i) => (
                <div className="scope-card" key={l.id}>
                  <div className="section-title">
                    <strong>
                      {String(i + 1).padStart(2, '0')} / {l.kind}
                      {l.import_approval_id ? ' · approved import' : ''}
                    </strong>
                    <span>
                      {calc &&
                        money(
                          calc.lines.find((c) => c.id === l.id)
                            ?.subtotal_minor ?? 0,
                        )}
                    </span>
                  </div>
                  <Field label={`Scope item ${i + 1}`}>
                    <input
                      value={l.description}
                      maxLength={500}
                      onChange={(e) =>
                        line(l.id, { description: e.target.value })
                      }
                    />
                  </Field>
                  <div className="form-grid compact">
                    <Field label={`Type ${i + 1}`}>
                      <select
                        disabled={!!l.import_approval_id}
                        value={l.kind}
                        onChange={(e) =>
                          line(l.id, {
                            kind: e.target.value as EstimateLine['kind'],
                          })
                        }
                      >
                        {[
                          'material',
                          'product',
                          'labor',
                          'service',
                          'allowance',
                        ].map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </Field>
                    <Quantity
                      disabled={!!l.import_approval_id}
                      label={`Quantity ${i + 1}`}
                      value={l.quantity_milli}
                      onChange={(n) => line(l.id, { quantity_milli: n })}
                    />
                    <Field label={`Unit ${i + 1}`}>
                      <select
                        disabled={!!l.import_approval_id}
                        value={l.unit}
                        onChange={(e) =>
                          line(l.id, {
                            unit: e.target.value as EstimateLine['unit'],
                          })
                        }
                      >
                        {estimateUnits.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </Field>
                    <Money
                      disabled={!!l.import_approval_id}
                      label={`Internal unit cost ${i + 1}`}
                      value={l.unit_cost_minor}
                      currency={p.currency}
                      onChange={(n) => line(l.id, { unit_cost_minor: n })}
                    />
                    <Percent
                      disabled={
                        !!l.import_approval_id || l.unit_price_minor !== null
                      }
                      label={`Cost markup % ${i + 1}`}
                      value={l.markup_bps}
                      onChange={(n) => line(l.id, { markup_bps: n })}
                    />
                  </div>
                  <label className="checkbox-label">
                    <input
                      disabled={!!l.import_approval_id}
                      type="checkbox"
                      checked={l.unit_price_minor !== null}
                      onChange={(e) =>
                        line(l.id, {
                          unit_price_minor: e.target.checked
                            ? l.unit_cost_minor
                            : null,
                        })
                      }
                    />
                    Use explicit selling unit price
                  </label>
                  {l.unit_price_minor !== null && (
                    <Money
                      key={`${l.id}-explicit`}
                      disabled={!!l.import_approval_id}
                      label={`Selling unit price ${i + 1}`}
                      value={l.unit_price_minor}
                      currency={p.currency}
                      onChange={(n) => line(l.id, { unit_price_minor: n })}
                    />
                  )}
                  <div className="form-grid">
                    <Field label={`Option for item ${i + 1}`}>
                      <select
                        disabled={!!l.import_approval_id}
                        value={l.option_id ?? ''}
                        onChange={(e) =>
                          line(l.id, { option_id: e.target.value || null })
                        }
                      >
                        <option value="">Base scope</option>
                        {p.options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={`Internal line note ${i + 1}`}>
                      <input
                        value={l.internal_note}
                        maxLength={1000}
                        onChange={(e) =>
                          line(l.id, { internal_note: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <div className="button-row">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={l.taxable}
                        onChange={(e) =>
                          line(l.id, { taxable: e.target.checked })
                        }
                      />
                      Taxable under selected policy
                    </label>
                    <button
                      className="secondary"
                      disabled={p.lines.length === 1 || !!l.import_approval_id}
                      onClick={() =>
                        update({ lines: p.lines.filter((x) => x.id !== l.id) })
                      }
                    >
                      Remove item {i + 1}
                    </button>
                  </div>
                  {l.import_approval_id && (
                    <p className="muted">
                      Private fixed import markup: {money(l.fixed_markup_minor)}
                      . Reimport and review to change source pricing.
                    </p>
                  )}
                </div>
              ))}
              <div className="button-row">
                <button
                  onClick={() =>
                    update({
                      lines: [
                        ...p.lines,
                        {
                          ...blankLine(),
                          unit_price_minor: null,
                          markup_bps: defaults?.material_markup_bps ?? 0,
                        },
                      ],
                    })
                  }
                >
                  Add material
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    update({
                      lines: [
                        ...p.lines,
                        {
                          ...blankLine('labor'),
                          unit_price_minor: null,
                          unit_cost_minor: defaults?.labor_rate_minor ?? 0,
                        },
                      ],
                    })
                  }
                >
                  Add labor
                </button>
              </div>
              <h3>Options & alternates</h3>
              {p.options.map((o) => (
                <div className="option-row" key={o.id}>
                  <label className="checkbox-label">
                    <input
                      type={o.kind === 'exclusive' ? 'radio' : 'checkbox'}
                      name={o.group ?? o.id}
                      checked={o.selected}
                      onChange={(e) =>
                        update({
                          options: p.options.map((x) =>
                            x.id === o.id
                              ? { ...x, selected: e.target.checked }
                              : o.kind === 'exclusive' && x.group === o.group
                                ? { ...x, selected: false }
                                : x,
                          ),
                        })
                      }
                    />
                    {o.label} ·{' '}
                    {o.kind === 'exclusive'
                      ? `choose one: ${o.group}`
                      : 'optional addition'}
                  </label>
                  <small>
                    Scope subtotal:{' '}
                    {money(
                      calc?.options.find((x) => x.id === o.id)
                        ?.scope_subtotal_minor ?? 0,
                    )}{' '}
                    · before global discount/tax
                  </small>
                </div>
              ))}
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => {
                    const id = crypto.randomUUID();
                    update({
                      options: [
                        ...p.options,
                        {
                          id,
                          label: `Optional scope ${p.options.length + 1}`,
                          description: '',
                          kind: 'addon',
                          group: null,
                          selected: false,
                        },
                      ],
                      lines: [
                        ...p.lines,
                        {
                          ...blankLine(),
                          option_id: id,
                          description: 'Optional additional scope',
                        },
                      ],
                    });
                  }}
                >
                  Add optional scope
                </button>
              </div>
              <h3>Adjustments & tax</h3>
              <div className="form-grid">
                <Field label="Discount type">
                  <select
                    value={p.discount.kind}
                    onChange={(e) =>
                      update({
                        discount: {
                          kind: e.target
                            .value as EstimateInput['discount']['kind'],
                          value: 0,
                        },
                      })
                    }
                  >
                    {['none', 'fixed', 'percent'].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </Field>
                {p.discount.kind === 'fixed' ? (
                  <Money
                    key="fixed"
                    label="Discount amount"
                    currency={p.currency}
                    value={p.discount.value}
                    onChange={(n) =>
                      update({ discount: { ...p.discount, value: n } })
                    }
                  />
                ) : p.discount.kind === 'percent' ? (
                  <Percent
                    key="percent"
                    label="Discount percent"
                    value={p.discount.value}
                    onChange={(n) =>
                      update({ discount: { ...p.discount, value: n } })
                    }
                  />
                ) : null}
                <Field label="Tax policy">
                  <select
                    value={p.tax_policy_id ?? ''}
                    onChange={(e) =>
                      update({ tax_policy_id: e.target.value || null })
                    }
                  >
                    <option value="">No tax applied · confirm treatment</option>
                    {taxes
                      .filter((t) => t.active)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} · {t.rate_bps / 100}% · {t.status}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <p className="muted">
                Tax policy is company configured and requires independent
                jurisdiction / contract review. A draft policy blocks internal
                issue.
              </p>
              <h3>Proposed payment schedule</h3>
              {p.payment_schedule.map((s, i) => (
                <div className="form-grid" key={s.id}>
                  <Field label={`Payment milestone ${i + 1}`}>
                    <input
                      value={s.label}
                      onChange={(e) =>
                        update({
                          payment_schedule: p.payment_schedule.map((x) =>
                            x.id === s.id ? { ...x, label: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Percent
                    label={`Payment share ${i + 1}`}
                    value={s.share_bps}
                    onChange={(n) =>
                      update({
                        payment_schedule: p.payment_schedule.map((x) =>
                          x.id === s.id ? { ...x, share_bps: n } : x,
                        ),
                      })
                    }
                  />
                  <Field label={`Payment due date ${i + 1}`}>
                    <input
                      type="date"
                      value={s.due_on ?? ''}
                      onChange={(e) =>
                        update({
                          payment_schedule: p.payment_schedule.map((x) =>
                            x.id === s.id
                              ? {
                                  ...x,
                                  due_on: e.target.value || null,
                                  kind: e.target.value ? 'dated' : 'milestone',
                                }
                              : x,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
              <button
                className="secondary"
                onClick={() =>
                  update({
                    payment_schedule: [
                      ...p.payment_schedule,
                      {
                        id: crypto.randomUUID(),
                        label: 'Additional milestone',
                        kind: 'milestone',
                        share_bps: 1,
                        due_on: null,
                      },
                    ],
                  })
                }
              >
                Add milestone
              </button>
              <p className="muted">
                Shares must total 100%. The final milestone receives any
                minor-unit remainder. These are proposals, not payment
                instructions.
              </p>
              <h3>Notes, terms & existing clean attachments</h3>
              <Field label="Private estimate notes">
                <textarea
                  value={p.internal_notes}
                  onChange={(e) => update({ internal_notes: e.target.value })}
                />
              </Field>
              <Field label="Customer notes">
                <textarea
                  value={p.customer_notes}
                  onChange={(e) => update({ customer_notes: e.target.value })}
                />
              </Field>
              <Field label="Estimate terms">
                <textarea
                  value={p.terms}
                  onChange={(e) => update({ terms: e.target.value })}
                />
              </Field>
              {resources.data?.documents.map((d) => (
                <div key={d.id}>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={p.attachments.some(
                        (a) => a.document_id === d.id,
                      )}
                      onChange={(e) =>
                        update({
                          attachments: e.target.checked
                            ? [
                                ...p.attachments,
                                { document_id: d.id, customer_visible: false },
                              ]
                            : p.attachments.filter(
                                (a) => a.document_id !== d.id,
                              ),
                        })
                      }
                    />
                    {d.display_name}
                  </label>
                  {p.attachments.some((a) => a.document_id === d.id) &&
                    d.visibility === 'customer' && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={
                            p.attachments.find((a) => a.document_id === d.id)
                              ?.customer_visible ?? false
                          }
                          onChange={(e) =>
                            update({
                              attachments: p.attachments.map((a) =>
                                a.document_id === d.id
                                  ? { ...a, customer_visible: e.target.checked }
                                  : a,
                              ),
                            })
                          }
                        />
                        Include in customer preview
                      </label>
                    )}
                </div>
              ))}
              {!resources.data?.documents.length && (
                <p>
                  No clean attachments available. Upload restrictions remain
                  enforced.
                </p>
              )}
            </fieldset>
          </div>
          <aside className="estimate-summary">
            <span className="eyebrow">SELECTED SCOPE</span>
            <h3>{calc ? money(calc.total_minor) : 'Check values'}</h3>
            {calc && (
              <>
                <dl>
                  <dt>Scope subtotal</dt>
                  <dd>{money(calc.subtotal_minor)}</dd>
                  <dt>Discount</dt>
                  <dd>−{money(calc.discount_minor)}</dd>
                  <dt>Tax</dt>
                  <dd>{money(calc.tax_minor)}</dd>
                </dl>
                <hr />
                <span className="eyebrow">INTERNAL PROFITABILITY</span>
                <dl>
                  <dt>Estimated cost</dt>
                  <dd>{money(calc.cost_minor)}</dd>
                  <dt>Gross profit before overhead</dt>
                  <dd>{money(calc.gross_profit_minor)}</dd>
                  <dt>Gross margin</dt>
                  <dd>{(calc.profit_margin_bps / 100).toFixed(2)}%</dd>
                </dl>
                <hr />
                {calc.payment_schedule.map((s) => (
                  <p key={s.id}>
                    {s.label}
                    <strong className="float-right">
                      {money(s.amount_minor)}
                    </strong>
                  </p>
                ))}
              </>
            )}
            {error && <p role="alert">{error}</p>}
            <p className="muted">
              No card data, automatic surcharge or live financial action.
            </p>
          </aside>
        </div>
      )}
      {importing && (
        <MaterialImport
          repo={repo}
          org={company.id}
          bundle={initial}
          onApplied={onChange}
          onClose={() => setImporting(false)}
        />
      )}
      <div className="p3-actionbar">
        {!readonly ? (
          <>
            <button
              disabled={task.busy || !!error}
              onClick={() =>
                void task.run(
                  async () => onChange(await repo.save(company.id, initial, p)),
                  'Draft saved',
                )
              }
            >
              Save estimate draft
            </button>
            {canIssue && (
              <button
                className="secondary"
                disabled={task.busy || dirty || !!error}
                onClick={() =>
                  void task.run(
                    async () => onChange(await repo.issue(company.id, initial)),
                    'Version internally issued · nothing sent',
                  )
                }
              >
                Issue internal snapshot
              </button>
            )}
            <button
              className="secondary"
              disabled={task.busy || !!error || dirty}
              onClick={() =>
                void task.run(async () => {
                  await repo.saveTemplate(
                    company.id,
                    `${p.project.type} template`,
                    p,
                  );
                }, 'Company template saved')
              }
            >
              Save as company template
            </button>
          </>
        ) : (
          initial.version.status === 'issued' && (
            <>
              <button
                disabled={task.busy}
                onClick={() =>
                  void task.run(
                    async () =>
                      onChange(await repo.revise(company.id, initial)),
                    'Revision created',
                  )
                }
              >
                Create draft revision
              </button>
              {canIssue && (
                <button
                  className="secondary"
                  onClick={() =>
                    void task.run(async () => {
                      await repo.approveJob(company.id, initial);
                    }, 'Job baseline captured · open Jobs to track costs')
                  }
                >
                  Approve job baseline
                </button>
              )}
            </>
          )
        )}
        <button
          className="secondary"
          disabled={task.busy || dirty}
          onClick={() =>
            void task.run(
              async () => onChange(await repo.duplicate(company, initial)),
              'Estimate duplicated',
            )
          }
        >
          Duplicate estimate
        </button>
        {canIssue && (
          <button
            className="secondary"
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                await repo.archive(
                  company.id,
                  initial.estimate.id,
                  initial.estimate.status !== 'archived',
                );
                onClose();
              }, 'Archive updated')
            }
          >
            {initial.estimate.status === 'archived'
              ? 'Restore estimate'
              : 'Archive estimate'}
          </button>
        )}
      </div>
      {task.message && <p role="status">{task.message}</p>}
    </article>
  );
}
function CustomerEstimatePreview({
  bundle,
  company,
  sample,
}: {
  bundle: EstimateBundle;
  company: CompanyProfile;
  sample: boolean;
}) {
  const view = customerPreview(bundle.version),
    money = (n: number) => formatMinor(n, view.currency);
  return (
    <section
      className="customer-estimate-preview"
      aria-label="Customer-facing estimate preview"
    >
      <header style={{ borderColor: view.company.primary_color }}>
        <CompanyLogo
          company={{ ...company, ...view.company }}
          sample={sample}
        />
        <div>
          <h2>{view.company.name}</h2>
          <p>
            {view.company.business_address}
            <br />
            {view.company.contact_email} · {view.company.contact_phone}
          </p>
        </div>
        <div>
          <strong>ESTIMATE</strong>
          <p>
            {bundle.estimate.estimate_number}
            <br />
            Version {bundle.version.version_number}
            <br />
            Expires {view.expires_on}
          </p>
        </div>
      </header>
      <span className="eyebrow">
        PREPARED FOR {view.customer.display_name.toUpperCase()}
      </span>
      <h2>{view.project.name}</h2>
      <p>{view.project.description}</p>
      {view.location && (
        <p>
          {view.location.address_line1}, {view.location.city}
        </p>
      )}
      <div className="preview-lines">
        {view.lines.map((l, i) => (
          <div key={i}>
            <span>
              <strong>{l.description}</strong>
              <small>
                {l.quantity_milli / 1000} {l.unit.replaceAll('_', ' ')}
              </small>
            </span>
            <strong>{money(l.amount_minor)}</strong>
          </div>
        ))}
      </div>
      <dl className="preview-total">
        <dt>Subtotal</dt>
        <dd>{money(view.subtotal_minor)}</dd>
        <dt>Discount</dt>
        <dd>−{money(view.discount_minor)}</dd>
        <dt>Tax</dt>
        <dd>{money(view.tax_minor)}</dd>
        <dt>Total estimate</dt>
        <dd>
          <strong>{money(view.total_minor)}</strong>
        </dd>
      </dl>
      <h3>Proposed payment milestones</h3>
      {view.schedule.map((s, i) => (
        <p key={i}>
          {s.label}: {money(s.amount_minor)} {s.due_on && `· ${s.due_on}`}
        </p>
      ))}
      <p className="preserve-lines">{view.notes}</p>
      <p className="preserve-lines">{view.terms}</p>
      {view.attachments.map((a, i) => (
        <p key={i}>Attachment: {a.display_name}</p>
      ))}
      <footer>
        Internal preview only · not delivered · no acceptance or payment action
      </footer>
    </section>
  );
}
