import { useLayoutEffect, useRef, useState } from 'react';
import type { Phase3Repository } from '../../lib/phase3';
import type {
  CatalogItem,
  EstimateBundle,
  EstimateInput,
} from '../../domain/estimating/types';
import { catalogDraftBatch, type CatalogQuantity } from './catalog-draft-batch';
import { Field } from './fields';
export function CatalogDraftBatch({
  repo,
  org,
  bundle,
  catalog,
  liveDraft,
  onApply,
}: {
  repo: Phase3Repository;
  org: string;
  bundle: EstimateBundle;
  catalog: CatalogItem[];
  liveDraft(): EstimateInput;
  onApply(payload: EstimateInput): void;
}) {
  const [rows, setRows] = useState<CatalogQuantity[]>([]);
  const [confirmed, confirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, say] = useState('');
  const [query, search] = useState('');
  const pending = useRef(false),
    consumed = useRef(false),
    generation = useRef({ epoch: 0 });
  useLayoutEffect(() => {
    const lifetime = generation.current;
    lifetime.epoch++;
    return () => {
      lifetime.epoch++;
    };
  }, [repo, org, bundle.version.id, bundle.version.lock_revision]);
  function change(next: CatalogQuantity[]) {
    if (pending.current) return;
    consumed.current = false;
    setRows(next);
    confirm(false);
    say('');
  }
  async function apply() {
    if (pending.current || consumed.current || !confirmed || !rows.length)
      return;
    pending.current = true;
    setBusy(true);
    say('');
    const epoch = generation.current.epoch;
    try {
      const result = await catalogDraftBatch(
        repo,
        org,
        bundle,
        catalog,
        rows,
        liveDraft,
      );
      if (epoch !== generation.current.epoch) return;
      if (JSON.stringify(liveDraft()) !== result.expected)
        throw Error('Working draft changed; no items added');
      result.check();
      consumed.current = true;
      onApply(result.payload);
      setRows([]);
      confirm(false);
      say(
        `${rows.length} catalog items added to the working draft. Save estimate draft to retain them in this session.`,
      );
    } catch (error) {
      if (epoch === generation.current.epoch)
        say(
          error instanceof Error
            ? error.message
            : 'Items could not be prepared; no items added',
        );
    } finally {
      if (epoch === generation.current.epoch) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <details>
      <summary>Add several catalog items</summary>
      <p>
        Select existing catalog items and enter quantities. Current catalog
        pricing is copied into this private draft; nothing is purchased or
        issued.
      </p>
      <fieldset disabled={busy}>
        <legend className="sr-only">Catalog batch preparation</legend>
        <Field label="Find catalog items for draft">
          <input value={query} onChange={(e) => search(e.target.value)} />
        </Field>
        {catalog
          .filter(
            (item) =>
              item.active &&
              item.organization_id === org &&
              `${item.name} ${item.category}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .map((item) => {
            const row = rows.find((r) => r.id === item.id);
            return (
              <div className="form-grid compact" key={item.id}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={!!row}
                    onChange={(e) =>
                      change(
                        e.target.checked
                          ? [...rows, { id: item.id, quantity: '' }]
                          : rows.filter((r) => r.id !== item.id),
                      )
                    }
                  />
                  Select {item.name} for draft
                </label>
                {row && (
                  <Field
                    label={`Draft quantity for ${item.name} (${item.unit})`}
                  >
                    <input
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) =>
                        change(
                          rows.map((r) =>
                            r.id === item.id
                              ? { ...r, quantity: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                  </Field>
                )}
              </div>
            );
          })}
        <p>{rows.length} selected. Filtering retains selected quantities.</p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => confirm(e.target.checked)}
          />
          I confirm the selected catalog items and quantities for this draft.
        </label>
        <button
          type="button"
          disabled={
            !confirmed || !rows.length || rows.some((r) => !r.quantity.trim())
          }
          onClick={() => void apply()}
        >
          Add selected catalog items to draft
        </button>
      </fieldset>
      <p role="status">{message}</p>
    </details>
  );
}
