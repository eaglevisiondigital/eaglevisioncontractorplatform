import { useState } from 'react';
import type { Phase3Repository } from '../../lib/phase3';
import type { EstimateBundle } from '../../domain/estimating/types';
import {
  buildReview,
  reviewTotals,
  type MaterialReview,
  type Pricing,
  type MaterialSource,
} from '../../domain/materials/import';
import { syntheticMaterials } from '../../domain/materials/fixtures';
import { estimateUnits } from '../../domain/estimating/types';
import { formatMinor } from '../../domain/estimating/calculation';
import { useTask, useResource } from '../forms-state';
import { useCallback } from 'react';
import { ResourceStatus } from '../forms';
import { Field, Money, Quantity, Percent } from './fields';
function PricingControl({
  label,
  value,
  currency,
  onChange,
}: {
  label: string;
  value: Pricing;
  currency: string;
  onChange: (p: Pricing) => void;
}) {
  return (
    <div className="pricing-control">
      <Field label={label}>
        <select
          value={value.mode}
          onChange={(e) =>
            onChange({ mode: e.target.value as Pricing['mode'], value: 0 })
          }
        >
          <option value="pass_through">Cost pass-through</option>
          <option value="percent">Percentage markup</option>
          <option value="fixed">Fixed dollar markup per extended line</option>
        </select>
      </Field>
      {value.mode === 'percent' ? (
        <Percent
          key={value.mode}
          label={`${label} percent`}
          value={value.value}
          onChange={(n) => onChange({ ...value, value: n })}
        />
      ) : value.mode === 'fixed' ? (
        <Money
          key={value.mode}
          label={`${label} amount`}
          currency={currency}
          value={value.value}
          onChange={(n) => onChange({ ...value, value: n })}
        />
      ) : null}
    </div>
  );
}
export function MaterialImport({
  repo,
  org,
  bundle,
  onApplied,
  onClose,
  onExpense,
  purchaseJobId,
  purchaseLines,
}: {
  repo: Phase3Repository;
  org: string;
  bundle: EstimateBundle;
  onApplied: (b: EstimateBundle) => void;
  onClose: () => void;
  onExpense?: (
    review: MaterialReview,
    batchId?: string,
    batchLock?: number,
    kind?: 'commitment' | 'payment',
  ) => Promise<void>;
  purchaseJobId?: string;
  purchaseLines?: EstimateBundle['version']['payload']['lines'];
}) {
  const [purchaseKind, setPurchaseKind] = useState<'commitment' | 'payment'>(
    'payment',
  );
  const [review, setReview] = useState<MaterialReview>();
  const [batch, setBatch] = useState<{ id: string; lock: number }>();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const task = useTask();
  const batches = useResource(
    useCallback(
      () => repo.importBatches(org, bundle.estimate.id, purchaseJobId),
      [repo, org, bundle.estimate.id, purchaseJobId],
    ),
  );
  const defaults = useResource(
    useCallback(
      async () => ({
        pricing: await repo.materialPricing(org),
        admin: (await repo.operations.companyAccess(org)).settings,
      }),
      [repo, org],
    ),
  );
  function change(update: Partial<MaterialReview>) {
    setReview((r) => (r ? { ...r, ...update, reviewed: false } : r));
  }
  let summary;
  let error = '';
  try {
    if (review) summary = reviewTotals(review);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Check imported values';
  }
  async function loadBatch(id: string, lock: number) {
    await task.run(async () => {
      const sources = await repo.importSources(org, id);
      setReview(
        buildReview(
          sources.map((s) => ({
            id: s.id,
            filename: s.filename,
            sha256: s.sha256,
            status: s.status,
            provenance: s.provenance,
            extraction: s.extraction,
          })) as MaterialSource[],
          bundle.version.payload.currency,
        ),
      );
      setBatch({ id, lock });
    }, 'Clean extracted sources loaded for review');
  }
  return (
    <section className="p3-import">
      <div className="section-title">
        <div>
          <span className="eyebrow">SUPPLIER WORKSPACE</span>
          <h2>Smart material import</h2>
        </div>
        <button className="secondary" onClick={onClose}>
          Close import
        </button>
      </div>
      <p>
        Keep original supplier evidence. Review every selected row before adding
        it to a draft. Supplier costs and markup remain internal.
      </p>
      <div className="p3-notice">
        <strong>Live extraction unverified · ingestion unavailable</strong>
        <p>
          Approved scanning, full content validation and an isolated worker must
          be configured before real files can be processed or opened. PDF, JPEG,
          PNG, WebP and literal CSV are the planned supported formats; XLSX is
          not supported.
        </p>
      </div>
      <div className="form-grid">
        <Field label="Select multiple supplier files">
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.csv"
            onChange={(e) =>
              setSelectedFiles(
                Array.from(e.target.files ?? []).map(
                  (f) => `${f.name} · ${f.size.toLocaleString()} bytes`,
                ),
              )
            }
          />
        </Field>
        <Field label="Capture supplier photo">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) =>
              setSelectedFiles(
                Array.from(e.target.files ?? []).map(
                  (f) => `${f.name} · selected locally`,
                ),
              )
            }
          />
        </Field>
      </div>
      {selectedFiles.length > 0 && (
        <p role="status">
          Selected locally: {selectedFiles.join('; ')}. Nothing uploaded or
          extracted.
        </p>
      )}
      {repo.sample && (
        <button
          onClick={() => {
            const r = syntheticMaterials(bundle.version.payload.currency);
            if (defaults.data) r.company_pricing = defaults.data.pricing;
            setReview(r);
            setBatch(undefined);
          }}
        >
          Load synthetic multi-supplier example
        </button>
      )}
      {!repo.sample && (
        <>
          <ResourceStatus {...batches} />
          {batches.data?.map((b) => (
            <button
              key={b.id}
              onClick={() => void loadBatch(b.id, b.lock_revision)}
            >
              Review scan-approved batch {b.id.slice(0, 8)}
            </button>
          ))}
        </>
      )}
      {onExpense && (
        <Field label="Purchased material record type">
          <select
            value={purchaseKind}
            onChange={(e) =>
              setPurchaseKind(e.target.value as typeof purchaseKind)
            }
          >
            <option value="payment">Paid receipt / actual expense</option>
            <option value="commitment">
              Unpaid invoice / committed purchase
            </option>
          </select>
        </Field>
      )}
      {review && (
        <>
          <div className="source-strip">
            {review.sources.map((s) => (
              <div key={s.id}>
                <strong>{s.filename}</strong>
                <span>{s.extraction?.vendor ?? 'Unidentified supplier'}</span>
                <small>
                  {s.extraction?.quoted_on ?? 'Date unknown'} ·{' '}
                  {s.provenance === 'synthetic_fixture'
                    ? 'Synthetic fixture · no scan or AI performed'
                    : 'Scan-approved evidence'}
                </small>
              </div>
            ))}
          </div>
          <PricingControl
            label="Company default markup"
            value={review.company_pricing}
            currency={review.currency}
            onChange={(p) => change({ company_pricing: p })}
          />
          {defaults.data?.admin && (
            <button
              className="secondary"
              onClick={() =>
                void task.run(async () => {
                  await repo.saveMaterialPricing(org, review.company_pricing);
                  defaults.reload();
                }, 'Company material pricing default saved')
              }
            >
              Save company material pricing default
            </button>
          )}
          <p className="muted">
            Markup is profit added to cost. Gross margin is profit divided by
            selling price. A 20% markup produces a 16.67% gross margin before
            other costs. Fixed markup applies once to an extended line.
          </p>
          {Array.from(new Set(review.lines.map((l) => l.vendor))).map((v) => (
            <details key={v}>
              <summary>Supplier override · {v || 'Unknown supplier'}</summary>
              <PricingControl
                label={`Markup for ${v}`}
                value={review.supplier_pricing[v] ?? review.company_pricing}
                currency={review.currency}
                onChange={(p) =>
                  change({
                    supplier_pricing: { ...review.supplier_pricing, [v]: p },
                  })
                }
              />
              <button
                className="secondary"
                onClick={() => {
                  const next = { ...review.supplier_pricing };
                  delete next[v];
                  change({ supplier_pricing: next });
                }}
              >
                Use company default
              </button>
            </details>
          ))}
          <div className="material-review-list">
            {review.lines.map((l, index) => {
              const update = (patch: Partial<typeof l>) =>
                change({
                  lines: review.lines.map((x) =>
                    x.id === l.id ? { ...x, ...patch, acknowledged: false } : x,
                  ),
                });
              return (
                <article className="material-review-line" key={l.id}>
                  <div className="section-title">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={l.selected}
                        onChange={(e) => update({ selected: e.target.checked })}
                      />
                      Include row {index + 1}
                    </label>
                    <span className="status">
                      {l.confidence === null
                        ? 'Unverified confidence'
                        : `${Math.round(l.confidence * 100)}% model confidence`}
                    </span>
                  </div>
                  <div className="form-grid">
                    <Field label={`Supplier ${index + 1}`}>
                      <input
                        value={l.vendor}
                        onChange={(e) => update({ vendor: e.target.value })}
                      />
                    </Field>
                    <Field label={`Product description ${index + 1}`}>
                      <input
                        value={l.description}
                        maxLength={500}
                        onChange={(e) =>
                          update({ description: e.target.value })
                        }
                      />
                    </Field>
                    <Field label={`SKU ${index + 1}`}>
                      <input
                        value={l.sku}
                        onChange={(e) => update({ sku: e.target.value })}
                      />
                    </Field>
                    <Quantity
                      label={`Material quantity ${index + 1}`}
                      value={l.quantity_milli ?? 0}
                      onChange={(n) => update({ quantity_milli: n })}
                    />
                    <Field label={`Material unit ${index + 1}`}>
                      <select
                        value={l.unit ?? ''}
                        onChange={(e) =>
                          update({ unit: e.target.value as typeof l.unit })
                        }
                      >
                        <option value="">Confirm unit</option>
                        {estimateUnits.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </Field>
                    <Money
                      label={`Supplier unit cost ${index + 1}`}
                      currency={review.currency}
                      value={l.unit_cost_minor ?? 0}
                      onChange={(n) => update({ unit_cost_minor: n })}
                    />
                  </div>
                  {purchaseLines && (
                    <Field label={`Original budget match ${index + 1}`}>
                      <select
                        value={l.estimate_line_id ?? ''}
                        onChange={(e) =>
                          update({ estimate_line_id: e.target.value || null })
                        }
                      >
                        <option value="">
                          Unplanned / ambiguous · review required
                        </option>
                        {purchaseLines.map((line) => (
                          <option value={line.id} key={line.id}>
                            {line.description} · {line.unit}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <p className="source-reference">
                    Source:{' '}
                    {review.sources.find((s) => s.id === l.source_id)?.filename}{' '}
                    · page {l.reference.page ?? 'unknown'}{' '}
                    {l.reference.sheet &&
                      `· ${l.reference.sheet} ${l.reference.cell ?? ''}`}
                    <br />
                    Original: {l.original.quantity_text ?? '?'} ×{' '}
                    {l.original.unit_cost_text ?? '?'} ={' '}
                    {l.original.extension_text ?? '?'} · {l.reference.excerpt}
                  </p>
                  {l.warnings.length > 0 && (
                    <ul className="warning-list">
                      {l.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                  <details>
                    <summary>Individual line markup</summary>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={!!l.pricing}
                        onChange={(e) =>
                          update({
                            pricing: e.target.checked
                              ? { mode: 'pass_through', value: 0 }
                              : null,
                          })
                        }
                      />
                      Override supplier / company pricing
                    </label>
                    {l.pricing && (
                      <PricingControl
                        label={`Line ${index + 1} markup`}
                        value={l.pricing}
                        currency={review.currency}
                        onChange={(p) => update({ pricing: p })}
                      />
                    )}
                  </details>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={l.acknowledged}
                      onChange={(e) =>
                        change({
                          lines: review.lines.map((x) =>
                            x.id === l.id
                              ? { ...x, acknowledged: e.target.checked }
                              : x,
                          ),
                        })
                      }
                    />
                    I checked this row against the source and resolved or
                    accepted its warnings.
                  </label>
                </article>
              );
            })}
          </div>
          <div className="form-grid">
            <Field label="Customer materials presentation">
              <select
                value={review.presentation}
                onChange={(e) =>
                  change({
                    presentation: e.target
                      .value as MaterialReview['presentation'],
                  })
                }
              >
                <option value="itemized">Itemized materials</option>
                <option value="package">Single materials package</option>
              </select>
            </Field>
            {review.presentation === 'package' && (
              <Field label="Included materials description">
                <textarea
                  value={review.package_description}
                  maxLength={500}
                  onChange={(e) =>
                    change({ package_description: e.target.value })
                  }
                />
              </Field>
            )}
          </div>
          {summary && (
            <div className="p3-totals">
              <span>
                Private supplier cost{' '}
                <strong>
                  {formatMinor(summary.cost_minor, review.currency)}
                </strong>
              </span>
              <span>
                Private markup{' '}
                <strong>
                  {formatMinor(summary.markup_minor, review.currency)}
                </strong>
              </span>
              <span>
                Customer materials price{' '}
                <strong>
                  {formatMinor(summary.price_minor, review.currency)}
                </strong>
              </span>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={review.reviewed}
              onChange={(e) =>
                setReview({ ...review, reviewed: e.target.checked })
              }
            />
            I explicitly approve the selected materials, quantities, costs and
            pricing for this draft.
          </label>
          <button
            disabled={task.busy || !!error || !review.reviewed}
            onClick={() =>
              void task.run(async () => {
                if (onExpense) {
                  await onExpense(review, batch?.id, batch?.lock, purchaseKind);
                } else {
                  onApplied(
                    await repo.applyImport(
                      org,
                      bundle,
                      review,
                      batch?.id,
                      batch?.lock,
                    ),
                  );
                }
                onClose();
              }, 'Materials approved and added to draft')
            }
          >
            {onExpense
              ? 'Approve purchase for expense review'
              : 'Approve and add to estimate draft'}
          </button>
        </>
      )}
      {task.message && <p role="status">{task.message}</p>}
    </section>
  );
}
