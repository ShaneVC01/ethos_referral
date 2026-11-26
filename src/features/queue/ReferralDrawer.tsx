import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { IconButton } from '@/components/ui/button';
import { ICONS } from '@/components/ui/icons';
import type { TodayItem } from './queue-model';
import { ReferralDetailView } from './ReferralDetailView';

export interface ReferralDrawerProps {
  id: string;
  focusItem?: TodayItem | null;
  onClose: () => void;
}

/**
 * The referral record beside a list. On desktop (1024px and wider) it takes a fixed 520px column and pushes the list.
 * Below that it covers the screen, as a full screen sheet. Escape closes it. The list keeps its place.
 */
export function ReferralDrawer({ id, focusItem = null, onClose }: ReferralDrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Dialogs and popovers handle Escape themselves. Only close when nothing else is open on top.
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside
      aria-label="Referral detail"
      className="fixed inset-0 z-30 flex min-h-0 flex-col bg-surface lg:static lg:z-auto lg:h-full lg:w-[520px] lg:shrink-0 lg:border-l lg:border-line"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-subtle px-4 py-2 safe-top">
        <Link
          to={`/referrals/${id}/full`}
          className="inline-flex h-11 items-center gap-1.5 rounded-control px-2 text-sm font-medium text-accent hover:bg-panel md:h-9"
        >
          <ICONS.edit size={16} strokeWidth={1.5} aria-hidden="true" />
          Open full page
        </Link>
        <IconButton icon="close" aria-label="Close referral" onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
        <ReferralDetailView id={id} backTo="" focusItem={focusItem} variant="drawer" />
      </div>
    </aside>
  );
}
