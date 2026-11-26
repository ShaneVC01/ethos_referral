import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';
import { IconButton } from './button';

/* ---------- Dialog: centred, for decisions that need focus (confirm, destructive) ---------- */

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required. Read first by screen readers. */
  title: string;
  description?: ReactNode;
  /** Footer actions, usually Cancel then the primary action. */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, footer, children, className }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-panel border border-line bg-surface shadow-overlay outline-none',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line-subtle px-5 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <DialogPrimitive.Title className="text-lg font-semibold text-ink">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-base text-ink-muted">{description}</DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton icon="close" aria-label="Close" />
            </DialogPrimitive.Close>
          </div>
          {children ? <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div> : null}
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line-subtle px-5 py-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ---------- Sheet: side panel on desktop and tablet, bottom sheet on phones ---------- */

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** 'right' for detail and forms on desktop. 'bottom' for quick actions (log outcome). */
  side?: 'right' | 'bottom';
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Sheet({ open, onOpenChange, title, description, side = 'right', footer, children, className }: SheetProps) {
  const isBottom = side === 'bottom';
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 flex flex-col border-line bg-surface shadow-overlay outline-none safe-bottom',
            isBottom
              ? 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-panel border-t'
              : 'inset-y-0 right-0 w-full max-w-xl border-l md:w-[32rem]',
            className,
          )}
        >
          {isBottom ? <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-pill bg-line-strong" /> : null}
          <div className="flex items-start justify-between gap-3 border-b border-line-subtle px-5 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <DialogPrimitive.Title className="text-lg font-semibold text-ink">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-base text-ink-muted">{description}</DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton icon="close" aria-label="Close" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line-subtle px-5 py-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ---------- Popover: anchored, portalled so it escapes overflow containers ---------- */

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function Popover({ trigger, children, align = 'start', open, onOpenChange, className }: PopoverProps) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn('z-50 min-w-48 rounded-panel border border-line bg-surface p-2 shadow-overlay outline-none', className)}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/* ---------- Tooltip: supplementary only. Never the sole label of an action ---------- */

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={400}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-50 max-w-xs rounded-control bg-ink px-2 py-1 text-sm text-surface shadow-overlay"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
