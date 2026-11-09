import { useRef, useState } from 'react';
import type { Phase3Repository } from '../../lib/phase3';
import type {
  EstimateBundle,
  EstimateInput,
} from '../../domain/estimating/types';
import { editDraftLines, type DraftLineAction } from './draft-line-edits';
import { Field } from './fields';
export function DraftLineEdits({
  repo,
  org,
  bundle,
  draft,
  revision,
  selected,
  onSelect,
  liveDraft,
  onApply,
}: {
  repo: Phase3Repository;
  org: string;
  bundle: EstimateBundle;
  draft: EstimateInput;
  revision: number;
  selected: string[];
  onSelect(ids: string[]): void;
  liveDraft(): EstimateInput;
  onApply(payload: EstimateInput): void;
}) {
  const [action, setAction] = useState<DraftLineAction>('quantity');
  const [quantity, setQuantity] = useState('');
  const [confirmation, confirm] = useState('');
  const [message, say] = useState('');
  const consumed = useRef('');
  const signature = JSON.stringify({
    draft,
    revision,
    selected,
    action,
    quantity,
  });
  const confirmed = confirmation === signature;
  function apply() {
    if (!confirmed || consumed.current === signature) return;
    try {
      if (JSON.stringify(liveDraft()) !== JSON.stringify(draft))
        throw Error('Working draft changed; review the selection again');
      const payload = editDraftLines(
        repo,
        org,
        bundle,
        liveDraft(),
        selected,
        action,
        quantity,
      );
      consumed.current = signature;
      onApply(payload);
      onSelect([]);
      confirm('');
      say(
        action === 'remove'
          ? `${selected.length} items removed from the working draft. Save to retain this change.`
          : `${selected.length} working-draft quantities updated. Save to retain this change.`,
      );
    } catch (error) {
      confirm('');
      say(error instanceof Error ? error.message : 'No scope edit applied');
    }
  }
  return (
    <section aria-label="Edit multiple draft items">
      <h4>Edit selected scope items</h4>
      <p>
        Select editable items below. Approved imported items remain protected.
        Units, prices and unselected items are retained.
      </p>
      <div className="button-row">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            onSelect(
              draft.lines
                .filter(
                  (l) =>
                    !l.import_approval_id && !l.material_import_line_ids.length,
                )
                .map((l) => l.id),
            );
            confirm('');
            say('');
          }}
        >
          Select all editable scope items
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!selected.length}
          onClick={() => {
            onSelect([]);
            confirm('');
            say('');
          }}
        >
          Clear scope selection
        </button>
      </div>
      <p>
        {selected.length} selected:{' '}
        {draft.lines
          .filter((l) => selected.includes(l.id))
          .map((l) => `${l.description} (${l.unit})`)
          .join('; ') || 'none'}
      </p>
      <div className="form-grid compact">
        <Field label="Selected scope action">
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value as DraftLineAction);
              confirm('');
              say('');
            }}
          >
            <option value="quantity">Set the same quantity</option>
            <option value="remove">Remove selected items</option>
          </select>
        </Field>
        {action === 'quantity' && (
          <Field label="Quantity for selected scope items">
            <input
              inputMode="decimal"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                confirm('');
                say('');
              }}
            />
          </Field>
        )}
      </div>
      <p>
        {action === 'quantity'
          ? 'The entered quantity applies to every selected item in its existing unit; no measurement is inferred.'
          : 'Removal affects only this working draft. Issued versions and job baselines are not replaced.'}
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!selected.length}
          onChange={(e) => {
            if (e.target.checked) consumed.current = '';
            confirm(e.target.checked ? signature : '');
          }}
        />
        I confirm this edit to the selected working-draft items.
      </label>
      <button
        type="button"
        disabled={
          !confirmed ||
          !selected.length ||
          (action === 'quantity' && !quantity.trim())
        }
        onClick={apply}
      >
        {action === 'quantity'
          ? 'Update selected quantities'
          : 'Remove selected scope items'}
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
