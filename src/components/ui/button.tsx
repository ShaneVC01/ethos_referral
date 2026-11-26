import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ICONS, type UiIconName } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium select-none ' +
  'transition-colors duration-[var(--duration-fast)] ease-out ' +
  'disabled:cursor-not-allowed disabled:pointer-events-none ' +
  'aria-busy:cursor-progress';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active ' +
    'disabled:bg-disabled-bg disabled:text-ink-disabled',
  secondary:
    'bg-surface text-ink border border-line hover:bg-canvas hover:border-line-strong active:bg-panel ' +
    'disabled:text-ink-disabled disabled:border-line-subtle disabled:bg-surface',
  ghost:
    'bg-transparent text-ink hover:bg-panel active:bg-line-subtle ' +
    'disabled:text-ink-disabled',
  danger:
    'bg-surface text-danger border border-danger hover:bg-danger-bg active:bg-danger-bg ' +
    'disabled:text-ink-disabled disabled:border-line-subtle',
};

/* Heights: 44px touch targets on phones, 36px (sm 32px) on desktop and tablet. */
const sizes: Record<ButtonSize, string> = {
  sm: 'h-11 md:h-8 px-3 text-sm',
  md: 'h-11 md:h-9 px-4 text-base',
  lg: 'h-12 md:h-11 px-5 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and disables the button. Keep the label so the action stays named. */
  loading?: boolean;
  /** Leading icon name from ICONS. */
  icon?: UiIconName;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const LeadingIcon = icon ? ICONS[icon] : null;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading ? <ICONS.spinner size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" /> : LeadingIcon ? <LeadingIcon size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required. Icon-only buttons must be named for screen readers. */
  'aria-label': string;
  icon: UiIconName;
  variant?: 'ghost' | 'secondary';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, variant = 'ghost', size = 'md', loading = false, className, disabled, type = 'button', ...rest },
  ref,
) {
  const Icon = ICONS[icon];
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        base,
        variants[variant],
        'px-0',
        size === 'md' ? 'h-11 w-11 md:h-9 md:w-9' : 'h-11 w-11 md:h-8 md:w-8',
        className,
      )}
      {...rest}
    >
      {loading ? <ICONS.spinner size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" /> : <Icon size={16} strokeWidth={1.5} aria-hidden="true" />}
    </button>
  );
});
