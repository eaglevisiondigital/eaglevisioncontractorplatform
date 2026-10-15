import { type FormEvent } from 'react';
export interface Field {
  name: string;
  label: string;
  type?:
    | 'text'
    | 'email'
    | 'tel'
    | 'number'
    | 'color'
    | 'textarea'
    | 'checkbox'
    | 'select';
  options?: { value: string; label: string }[];
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  hint?: string;
}
export type Values = Record<string, string | boolean | number>;
export function FieldsForm({
  fields,
  initial = {},
  submitLabel = 'Save changes',
  secondaryLabel,
  onSubmit,
  busy = false,
  honeypot = false,
}: {
  fields: Field[];
  initial?: Record<string, unknown>;
  submitLabel?: string;
  secondaryLabel?: string;
  onSubmit: (values: Values, intent: string) => void | Promise<void>;
  busy?: boolean;
  honeypot?: boolean;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values: Values = {};
    for (const field of fields) {
      const v = data.get(field.name);
      values[field.name] =
        field.type === 'checkbox'
          ? v === 'on'
          : field.type === 'number'
            ? Number(v)
            : String(v ?? '');
    }
    if (honeypot) values._website = String(data.get('_website') ?? '');
    const intent =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ??
      'save';
    void onSubmit(values, intent);
  }
  return (
    <form className="operational-form" onSubmit={submit}>
      {honeypot && (
        <label className="trap" aria-hidden="true">
          Leave this field blank
          <input name="_website" tabIndex={-1} autoComplete="off" />
        </label>
      )}
      <div className="form-grid">
        {fields.map((f) => (
          <label
            key={f.name}
            className={
              f.type === 'textarea'
                ? 'wide'
                : f.type === 'checkbox'
                  ? 'checkbox-label'
                  : ''
            }
          >
            {f.label}
            {f.type === 'textarea' ? (
              <textarea
                name={f.name}
                defaultValue={String(initial[f.name] ?? '')}
                required={f.required}
                maxLength={f.maxLength ?? 5000}
                rows={3}
              />
            ) : f.type === 'select' ? (
              <select
                name={f.name}
                defaultValue={String(
                  initial[f.name] ?? f.options?.[0]?.value ?? '',
                )}
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'checkbox' ? (
              <input
                type="checkbox"
                name={f.name}
                defaultChecked={initial[f.name] === true}
              />
            ) : (
              <input
                name={f.name}
                type={f.type ?? 'text'}
                defaultValue={String(initial[f.name] ?? '')}
                required={f.required}
                maxLength={f.maxLength ?? 500}
                min={f.min}
                max={f.max}
                step={f.type === 'number' ? 1 : undefined}
              />
            )}{' '}
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}
      </div>
      <div className="actions">
        <button disabled={busy} type="submit" value="save">
          {busy ? 'Working…' : submitLabel}
        </button>
        {secondaryLabel && (
          <button
            className="secondary"
            type="submit"
            value="secondary"
            disabled={busy}
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </form>
  );
}
export function ResourceStatus({
  loading,
  error,
}: {
  loading: boolean;
  error: string;
}) {
  return (
    <>
      {loading && <p role="status">Loading workspace records…</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </>
  );
}
export function Pagination({
  page,
  count,
  onChange,
}: {
  page: number;
  count: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {count} records · Page {page + 1} of{' '}
        {Math.max(1, Math.ceil(count / 10))}
      </span>
      <button
        className="secondary"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <button
        className="secondary"
        disabled={(page + 1) * 10 >= count}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
