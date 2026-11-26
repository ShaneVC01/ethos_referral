import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

/*
 * Public form controls. Plain markup with tokens, no Radix and no staff components, so the
 * refer bundle stays small. Labels are always visible. Errors sit under the field and set aria-invalid.
 */

export const controlClass =
  'w-full min-w-0 rounded-control border border-line bg-surface px-3.5 text-base text-ink ' +
  'placeholder:text-ink-subtle hover:border-line-strong ' +
  'aria-[invalid=true]:border-danger disabled:bg-disabled-bg disabled:text-ink-disabled';

function describedBy(id: string, hint: ReactNode, error: string | undefined): string | undefined {
  const ids = [hint && !error ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}

export function FieldShell({ id, label, hint, error, optional = false, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-base font-semibold text-ink">
        {label}
        {optional ? <span className="ml-1.5 font-normal text-ink-muted">(optional)</span> : null}
      </label>
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-sm leading-relaxed text-ink-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
}

export function TextField({ id, label, hint, error, optional, className, ...input }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`h-12 ${controlClass} ${className ?? ''}`}
        {...input}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
}

export function SelectField({ id, label, hint, error, optional, children, ...select }: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`h-12 pr-8 ${controlClass}`}
        {...select}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export interface TextareaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
}

export function TextareaField({ id, label, hint, error, optional, ...textarea }: TextareaFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea
        id={id}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`min-h-28 py-2.5 leading-relaxed ${controlClass}`}
        {...textarea}
      />
    </FieldShell>
  );
}

export interface CheckFieldProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  error?: string;
  onBlur?: () => void;
}

export function CheckField({ id, checked, onChange, label, description, error, onBlur }: CheckFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={description ? `${id}-desc` : undefined}
          className="mt-0.5 size-5 shrink-0 accent-accent"
        />
        <span className="flex flex-col gap-1">
          <span className="text-base text-ink">{label}</span>
          {description ? (
            <span id={`${id}-desc`} className="text-sm leading-relaxed text-ink-muted">
              {description}
            </span>
          ) : null}
        </span>
      </label>
      {error ? (
        <p id={`${id}-error`} role="alert" className="pl-8 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
}

/** Large choice rows for one answer out of a few. Uses a native radio group. */
export function ChoiceGroup({
  name,
  legend,
  value,
  onChange,
  options,
  error,
  onBlur,
}: {
  name: string;
  legend: string;
  value: string | null;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  error?: string;
  onBlur?: () => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-1 text-base font-semibold text-ink">{legend}</legend>
      {options.map((opt) => {
        const id = `${name}-${opt.value}`;
        const checked = value === opt.value;
        return (
          <label
            key={opt.value}
            htmlFor={id}
            className={
              'flex min-h-14 cursor-pointer items-start gap-3 rounded-panel border bg-surface p-4 transition-colors duration-[var(--duration-fast)] hover:border-line-strong ' +
              (checked ? 'border-accent bg-accent-subtle' : 'border-line')
            }
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={opt.value}
              checked={checked}
              onChange={() => onChange(opt.value)}
              onBlur={onBlur}
              className="mt-1 size-5 shrink-0 accent-accent"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-base font-semibold text-ink">{opt.label}</span>
              {opt.description ? <span className="text-sm leading-relaxed text-ink-muted">{opt.description}</span> : null}
            </span>
          </label>
        );
      })}
      {error ? (
        <p id={`${name}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function PublicButton({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'text'; loading?: boolean }) {
  const variants = {
    primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active',
    secondary: 'border border-line bg-surface text-ink hover:border-line-strong hover:bg-canvas',
    text: 'min-h-11 px-1 text-accent underline underline-offset-4 hover:text-accent-hover',
  } as const;
  const sized = variant === 'text' ? '' : 'h-12 px-6';
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-control text-base font-semibold transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-ink-disabled ${variants[variant]} ${sized} ${className ?? ''}`}
      {...rest}
    >
      {loading ? 'Sending' : children}
    </button>
  );
}
