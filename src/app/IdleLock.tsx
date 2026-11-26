import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ICONS } from '@/components/ui/icons';

const EVENTS = ['pointerdown', 'keydown', 'mousemove', 'touchstart', 'scroll'] as const;

/**
 * Locks the screen after `minutes` without input. Desk PCs at clinics are shared, so the content is blurred
 * until the user unlocks. Prototype unlock is a click. Supabase Auth will re-check the session later.
 */
export function IdleLock({ minutes }: { minutes: number }) {
  const [locked, setLocked] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (locked) return;
    const arm = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setLocked(true), minutes * 60_000);
    };
    arm();
    EVENTS.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    return () => {
      window.clearTimeout(timer.current);
      EVENTS.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [minutes, locked]);

  if (!locked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-lock-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-canvas/70 p-4 backdrop-blur-md"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center shadow-overlay">
        <ICONS.lock size={20} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />
        <div className="flex flex-col gap-1">
          <h2 id="idle-lock-title" className="text-lg font-semibold text-ink">
            Screen locked
          </h2>
          <p className="text-base text-ink-muted">The screen locked after {minutes} minutes with no activity. Patient details are hidden until you unlock.</p>
        </div>
        <Button className="w-full" onClick={() => setLocked(false)}>
          Unlock
        </Button>
      </div>
    </div>
  );
}
