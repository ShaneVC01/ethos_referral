import { createContext, forwardRef, useContext, useId, type AriaAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ICONS } from './icons';

/* ---------- Field: label, helper and error, wired to the control ---------- */

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Used by controls to pick up the id and aria wiring from the nearest Field. */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: ReactNode;
  /** Helper text shown under the label, always visible (not placeholder text). */
  hint?: ReactNode;
  /** Error message. Shown under the control and sets aria-invalid. Say what is wrong and how to fix it. */
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Override the generated id, for example to match a server field name. */
  id?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required = false, disabled = false, id: idProp, className, children }: FieldProps) {
  const generated = useId();
  const id = idProp ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error, required, disabled }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {required ? <span className="ml-1 text-ink-muted" aria-hidden="true">(required)</span> : null}
        </label>
        {children}
        {hint && !error ? (
          <p id={hintId} className="text-sm text-ink-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="flex items-start gap-1.5 text-sm text-danger" role="alert">
            <ICONS.alert size={16} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

/* ---------- Shared control styling ---------- */

export const controlClass =
  'w-full min-w-0 rounded-control border border-line bg-surface px-3 text-base text-ink ' +
  'placeholder:text-ink-subtle hover:border-line-strong ' +
  'disabled:cursor-not-allowed disabled:border-line-subtle disabled:bg-disabled-bg disabled:text-ink-disabled ' +
  'aria-[invalid=true]:border-danger read-only:bg-canvas';

/** Resolves id, aria-describedby, aria-invalid, required and disabled from the Field, unless set explicitly. */
function useControlProps(props: { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: AriaAttributes['aria-invalid']; required?: boolean; disabled?: boolean }) {
  const field = useFieldContext();
  return {
    id: props.id ?? field?.id,
    'aria-describedby': props['aria-describedby'] ?? field?.describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field?.invalid ? true : undefined),
    required: props.required ?? field?.required,
    disabled: props.disabled ?? field?.disabled,
  };
}

/* ---------- Input ---------- */

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** Single line text. Use `inputMode` and `autoComplete` for phones, email and names. Height 44px on phones, 36px on desktop. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
  const controlProps = useControlProps(props);
  return <input ref={ref} className={cn(controlClass, 'h-11 md:h-9', className)} {...props} {...controlProps} />;
});

/* ---------- Textarea ---------- */

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, rows = 4, ...props }, ref) {
  const controlProps = useControlProps(props);
  return <textarea ref={ref} rows={rows} className={cn(controlClass, 'min-h-20 py-2 leading-normal', className)} {...props} {...controlProps} />;
});

/* ---------- Select (native, for reliable mobile pickers) ---------- */

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, children, ...props }, ref) {
  const controlProps = useControlProps(props);
  return (
    <select ref={ref} className={cn(controlClass, 'h-11 md:h-9 pr-8', className)} {...props} {...controlProps}>
      {children}
    </select>
  );
});

/* ---------- Checkbox ---------- */

export interface CheckboxProps {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  id?: string;
  disabled?: boolean;
  name?: string;
  description?: ReactNode;
  invalid?: boolean;
  /** Keeps the label for screen readers only. Use in dense tables where the row gives the context. */
  hideLabel?: boolean;
}

export function Checkbox({ checked, onCheckedChange, label, id: idProp, disabled, name, description, invalid, hideLabel = false }: CheckboxProps) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <div className="flex items-start gap-3">
      <CheckboxPrimitive.Root
        id={id}
        name={name}
        checked={checked}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-describedby={description ? `${id}-desc` : undefined}
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-line-strong bg-surface',
          'hover:border-ink-muted data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:bg-accent',
          'disabled:cursor-not-allowed disabled:border-line-subtle disabled:bg-disabled-bg',
          'aria-[invalid=true]:border-danger',
        )}
      >
        <CheckboxPrimitive.Indicator className="text-accent-fg">
          <Check size={14} strokeWidth={1.5} aria-hidden="true" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <div className="flex flex-col">
        <label htmlFor={id} className={cn('text-base text-ink', disabled && 'text-ink-disabled', hideLabel && 'sr-only')}>
          {label}
        </label>
        {description ? (
          <span id={`${id}-desc`} className="text-sm text-ink-muted">
            {description}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- RadioGroup ---------- */

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** Group label. Required so the group has a name for screen readers. */
  label: string;
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: RadioOption[];
  name?: string;
  disabled?: boolean;
  /** Layout: 'stack' for lists, 'row' for two or three short choices. */
  layout?: 'stack' | 'row';
  invalid?: boolean;
}

export function RadioGroup({ label, value, onValueChange, options, name, disabled, layout = 'stack', invalid }: RadioGroupProps) {
  const generated = useId();
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      name={name}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn('flex gap-3', layout === 'stack' ? 'flex-col' : 'flex-wrap')}
    >
      {options.map((opt) => {
        const id = `${generated}-${opt.value}`;
        return (
          <div key={opt.value} className="flex items-start gap-3">
            <RadioGroupPrimitive.Item
              id={id}
              value={opt.value}
              disabled={disabled || opt.disabled}
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill border border-line-strong bg-surface',
                'hover:border-ink-muted data-[state=checked]:border-accent',
                'disabled:cursor-not-allowed disabled:border-line-subtle disabled:bg-disabled-bg',
              )}
            >
              <RadioGroupPrimitive.Indicator className="size-2.5 rounded-pill bg-accent" />
            </RadioGroupPrimitive.Item>
            <div className="flex flex-col">
              <label htmlFor={id} className={cn('text-base text-ink', (disabled || opt.disabled) && 'text-ink-disabled')}>
                {opt.label}
              </label>
              {opt.description ? <span className="text-sm text-ink-muted">{opt.description}</span> : null}
            </div>
          </div>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
