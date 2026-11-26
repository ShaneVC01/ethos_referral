import { Toaster as SonnerToaster, toast } from 'sonner';
import type { ReactNode } from 'react';
import { ICONS } from './icons';

/**
 * Mount once in the app shell. Bottom centre on phones, top right elsewhere.
 * Messages are plain language. Use showUndoToast for reversible status changes (5 seconds).
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      closeButton
      offset={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)', right: '1rem' }}
      mobileOffset={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom) + 0.75rem)' }}
      toastOptions={{
        classNames: {
          toast: 'rounded-panel border border-line bg-surface text-ink shadow-overlay',
          description: 'text-ink-muted',
          actionButton: 'rounded-control bg-accent text-accent-fg px-3 h-8 text-sm font-medium',
          cancelButton: 'rounded-control bg-canvas text-ink px-3 h-8 text-sm',
        },
      }}
    />
  );
}

export { toast };

/** Success, info and error are paired with an icon. Keep messages short. */
export function notifySuccess(message: ReactNode) {
  return toast.success(message, { icon: <ICONS.check size={16} strokeWidth={1.5} aria-hidden="true" /> });
}

export function notifyError(message: ReactNode) {
  return toast.error(message, { icon: <ICONS.alert size={16} strokeWidth={1.5} aria-hidden="true" />, duration: 8000 });
}

/** Reversible action with a 5 second Undo, as specified for status changes. */
export function showUndoToast(message: string, onUndo: () => void | Promise<void>) {
  return toast(message, {
    duration: 5000,
    action: { label: 'Undo', onClick: () => void onUndo() },
  });
}
