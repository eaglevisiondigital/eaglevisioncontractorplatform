import { useState, useCallback } from 'react';
import type { Phase3Repository } from '../../lib/phase3';
import { estimateUnits, type CatalogItem } from '../../domain/estimating/types';
import { formatMinor } from '../../domain/estimating/calculation';
import { useResource, useTask } from '../forms-state';
import { FieldsForm, ResourceStatus } from '../forms';
export function Catalog({
  repo,
  org,
  admin,
}: {
  repo: Phase3Repository;
  org: string;
  admin: boolean;
}) {
  const task = useTask();
  const [editing, setEditing] = useState<CatalogItem | null>();
  const data = useResource(
    useCallback(
      async () => ({
        items: await repo.catalog(org),
        taxes: await repo.taxes(org),
        defaults: await repo.defaults(org),
        templates: await repo.templates(org),
      }),
      [repo, org],
    ),
  );
  const currency = data.data?.defaults.currency ?? 'USD';
  return (
    <article className="p3-workspace">
      <div className="section-title">
        <div>
          <span className="eyebrow">COMPANY KNOWLEDGE</span>
          <h2>Catalog & estimating policies</h2>
        </div>
        <button onClick={() => setEditing(null)}>New catalog item</button>
      </div>
      <p>
        Company-specific materials, labor, vendors and templates. Existing
        estimate lines keep their saved prices when this catalog changes.
      </p>
      <ResourceStatus {...data} />
      {editing !== undefined && (
        <FieldsForm
          key={editing?.id ?? 'new'}
          initial={
            editing
              ? { ...editing }
              : {
                  category: 'General',
                  kind: 'material',
                  unit: 'each',
                  unit_cost_minor: 0,
                  unit_price_minor: 0,
                  markup_bps: 0,
                  active: true,
                }
          }
          fields={[
            {
              name: 'name',
              label: 'Catalog name',
              required: true,
              maxLength: 160,
            },
            {
              name: 'description',
              label: 'Catalog description',
              maxLength: 500,
            },
            { name: 'category', label: 'Catalog category', required: true },
            {
              name: 'kind',
              label: 'Catalog type',
              type: 'select',
              options: [
                'material',
                'product',
                'labor',
                'service',
                'allowance',
              ].map((value) => ({ value, label: value })),
            },
            {
              name: 'unit',
              label: 'Catalog unit',
              type: 'select',
              options: estimateUnits.map((value) => ({ value, label: value })),
            },
            {
              name: 'unit_cost_minor',
              label: `Private unit cost (${currency} minor units)`,
              type: 'number',
              min: 0,
              max: 1e9,
            },
            {
              name: 'unit_price_minor',
              label: `Selling unit price (${currency} minor units; blank uses markup)`,
              type: 'text',
            },
            {
              name: 'markup_bps',
              label: 'Markup basis points (2000 = 20%)',
              type: 'number',
              min: 0,
              max: 100000,
            },
            { name: 'vendor', label: 'Vendor', maxLength: 200 },
            { name: 'active', label: 'Active item', type: 'checkbox' },
          ]}
          submitLabel="Save catalog item"
          onSubmit={(v) =>
            task
              .run(async () => {
                await repo.saveCatalog(
                  org,
                  {
                    name: String(v.name),
                    description: String(v.description),
                    category: String(v.category),
                    kind: v.kind as CatalogItem['kind'],
                    unit: v.unit as CatalogItem['unit'],
                    unit_cost_minor: Number(v.unit_cost_minor),
                    unit_price_minor:
                      v.unit_price_minor === ''
                        ? null
                        : Number(v.unit_price_minor),
                    markup_bps: Number(v.markup_bps),
                    vendor: String(v.vendor),
                    active: !!v.active,
                  },
                  editing?.id,
                );
                setEditing(undefined);
                data.reload();
              })
              .then(() => {})
          }
        />
      )}
      <div className="record-list">
        {data.data?.items.map((c) => (
          <button
            className="catalog-row"
            key={c.id}
            onClick={() => setEditing(c)}
          >
            <span>
              <strong>{c.name}</strong>
              <small>
                {c.category} · {c.vendor || 'No vendor'} · {c.unit} ·{' '}
                {c.active ? 'active' : 'archived'}
              </small>
            </span>
            <span>
              Private cost {formatMinor(c.unit_cost_minor, currency)}
              <br />
              Markup {c.markup_bps / 100}%
            </span>
          </button>
        ))}
      </div>
      <h3>Company templates</h3>
      {data.data?.templates.map((t) => (
        <p key={t.id}>{t.name}</p>
      ))}
      <p>
        Save reusable scope from a saved estimate draft. Source-bound imported
        pricing cannot become a generic template.
      </p>
      <h3>Tax policy references</h3>
      {data.data?.taxes.map((t) => (
        <p key={t.id}>
          {t.name} · {t.rate_bps / 100}% · {t.status} · {t.jurisdiction} /{' '}
          {t.contract_type} · {t.reference}
        </p>
      ))}
      {admin && (
        <details>
          <summary>Add a reviewed or draft tax policy</summary>
          <p>
            This records company review; it does not determine legal tax
            treatment.
          </p>
          <FieldsForm
            fields={[
              { name: 'name', label: 'Tax policy name', required: true },
              {
                name: 'reference',
                label: 'Tax review reference',
                required: true,
              },
              { name: 'jurisdiction', label: 'Jurisdiction', required: true },
              { name: 'contract_type', label: 'Contract type', required: true },
              {
                name: 'rate_bps',
                label: 'Tax basis points',
                type: 'number',
                min: 0,
                max: 10000,
                required: true,
              },
              {
                name: 'reviewed',
                label:
                  'Independently reviewed for this jurisdiction and contract type',
                type: 'checkbox',
              },
            ]}
            submitLabel="Save tax policy"
            onSubmit={(v) =>
              task
                .run(async () => {
                  await repo.saveTax(org, {
                    name: String(v.name),
                    reference: String(v.reference),
                    jurisdiction: String(v.jurisdiction),
                    contract_type: String(v.contract_type),
                    rate_bps: Number(v.rate_bps),
                    status: v.reviewed ? 'reviewed' : 'draft',
                    active: true,
                  });
                  data.reload();
                })
                .then(() => {})
            }
          />
        </details>
      )}
      {task.message && <p role="status">{task.message}</p>}
    </article>
  );
}
