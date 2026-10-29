import { BackOfficeText } from '../property/back-office-copy';
import { useState, type ReactNode } from 'react';
import {
  parseMinor,
  minorText,
  decimalToScaled,
} from '../../domain/estimating/calculation';
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="p3-field">
      <span>
        <BackOfficeText text={label} />
      </span>
      {children}
    </label>
  );
}
export function Money({
  label,
  value,
  currency,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  currency: string;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => minorText(value, currency));
  return (
    <Field label={label}>
      <input
        inputMode="decimal"
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(parseMinor(e.target.value, currency));
          } catch {
            onChange(NaN);
          }
        }}
      />
    </Field>
  );
}
export function Quantity({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => String(value / 1000));
  return (
    <Field label={label}>
      <input
        inputMode="decimal"
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(decimalToScaled(e.target.value, 3));
          } catch {
            onChange(NaN);
          }
        }}
      />
    </Field>
  );
}
export function Percent({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => String(value / 100));
  return (
    <Field label={label}>
      <input
        inputMode="decimal"
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(decimalToScaled(e.target.value, 2));
          } catch {
            onChange(NaN);
          }
        }}
      />
    </Field>
  );
}
