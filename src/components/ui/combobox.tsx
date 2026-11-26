import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { controlClass, useFieldContext } from './forms';
import { ICONS } from './icons';

export interface ComboboxOption<T> {
  value: T;
  label: string;
  /** Second line, for example practice name or clinic. */
  description?: string;
  disabled?: boolean;
}

export interface ComboboxProps<T> {
  /** Accessible name when not inside a Field. */
  label: string;
  value: T | null;
  onChange: (value: T | null, option: ComboboxOption<T> | null) => void;
  /** Async search. Called with the typed text (at least 2 characters by default). */
  options: ComboboxOption<T>[];
  loading?: boolean;
  onInputChange: (text: string) => void;
  /** Text shown in the input when a value is selected. */
  selectedLabel?: string;
  placeholder?: string;
  minChars?: number;
  emptyText?: ReactNode;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Message shown when the query is shorter than minChars. */
  typeToSearchText?: string;
  className?: string;
}

/**
 * Async typeahead (ARIA combobox pattern). Up and Down move, Enter selects, Escape closes.
 * The caller owns the search: pass `options` from a React Query hook and call `onInputChange` as the user types.
 */
export function Combobox<T>({
  label,
  value,
  onChange,
  options,
  loading = false,
  onInputChange,
  selectedLabel,
  placeholder,
  minChars = 2,
  emptyText = 'No matches. Try a different spelling.',
  id: idProp,
  disabled,
  invalid,
  typeToSearchText = 'Type at least 2 letters to search.',
  className,
}: ComboboxProps<T>) {
  const generated = useId();
  const field = useFieldContext();
  const id = idProp ?? field?.id ?? generated;
  const listId = `${id}-list`;
  const [text, setText] = useState(selectedLabel ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(selectedLabel ?? '');
  }, [selectedLabel]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const showingHint = text.trim().length < minChars && value === null;

  const choose = (opt: ComboboxOption<T>) => {
    onChange(opt.value, opt);
    setText(opt.label);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && active >= 0) {
      e.preventDefault();
      const opt = options[active];
      if (opt && !opt.disabled) choose(opt);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const activeId = active >= 0 ? `${id}-opt-${active}` : undefined;

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-label={field ? undefined : label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={invalid || field?.invalid || undefined}
          aria-describedby={field?.describedBy}
          autoComplete="off"
          disabled={disabled || field?.disabled}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
            if (value !== null) onChange(null, null);
            onInputChange(e.target.value);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(controlClass, 'h-11 pr-9 md:h-9')}
        />
        {loading ? (
          <ICONS.spinner size={16} strokeWidth={1.5} aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-muted" />
        ) : (
          <ICONS.search size={16} strokeWidth={1.5} aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
        )}
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-panel border border-line bg-surface p-1 shadow-overlay"
        >
          {showingHint ? (
            <li className="px-3 py-2 text-sm text-ink-muted">{typeToSearchText}</li>
          ) : loading && options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-muted" aria-live="polite">
              Searching
            </li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-muted">{emptyText}</li>
          ) : (
            options.map((opt, i) => (
              <li
                key={i}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={active === i}
                aria-disabled={opt.disabled || undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => !opt.disabled && choose(opt)}
                className={cn(
                  'flex cursor-pointer flex-col rounded-control px-3 py-2',
                  active === i && 'bg-accent-subtle',
                  opt.disabled && 'cursor-not-allowed text-ink-disabled',
                )}
              >
                <span className="text-base text-ink">{opt.label}</span>
                {opt.description ? <span className="text-sm text-ink-muted">{opt.description}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
