import { useEffect, useState } from 'react';
import { formatAuDate, parseAuDate } from '@/domain';
import { Input, useFieldContext } from './forms';

export interface DatePickerProps {
  /** Accessible name when used outside a Field. */
  label: string;
  /** 'YYYY-MM-DD' or null. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Latest allowed date, 'YYYY-MM-DD'. Dates of birth use today. */
  max?: string;
  /** Earliest allowed date, 'YYYY-MM-DD'. */
  min?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  /** Message when the value is not a valid date. */
  errorText?: string;
  className?: string;
}

/**
 * Australian date entry: typed as DD/MM/YYYY with a numeric keyboard on phones.
 * Validates on blur. Shows the reason when a date is not accepted.
 */
export function DatePicker({ label, value, onChange, max, min, disabled, invalid, id, errorText, className }: DatePickerProps) {
  const field = useFieldContext();
  const [text, setText] = useState(() => formatAuDate(value));
  const [localError, setLocalError] = useState<string | null>(null);

  // Keep the text in sync when the parent changes the value (for example after a reset).
  useEffect(() => {
    setText(formatAuDate(value));
    setLocalError(null);
  }, [value]);

  const validate = (raw: string) => {
    if (!raw.trim()) {
      setLocalError(null);
      onChange(null);
      return;
    }
    const iso = parseAuDate(raw);
    if (!iso) {
      setLocalError(errorText ?? 'Enter a date as DD/MM/YYYY.');
      return;
    }
    if (max && iso > max) {
      setLocalError('This date is in the future. Check the year.');
      return;
    }
    if (min && iso < min) {
      setLocalError('This date is too far in the past. Check the year.');
      return;
    }
    setLocalError(null);
    onChange(iso);
    setText(formatAuDate(iso));
  };

  const hasError = invalid || !!localError;

  return (
    <Input
      id={id}
      aria-label={field ? undefined : label}
      inputMode="numeric"
      autoComplete="off"
      placeholder="DD/MM/YYYY"
      maxLength={10}
      value={text}
      disabled={disabled}
      aria-invalid={hasError || undefined}
      aria-describedby={localError ? `${id ?? field?.id ?? 'date'}-date-error` : field?.describedBy}
      className={className}
      onChange={(e) => {
        setText(e.target.value);
        if (localError) setLocalError(null);
      }}
      onBlur={(e) => validate(e.target.value)}
    />
  );
}
