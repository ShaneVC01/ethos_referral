import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SplitViewProps {
  /** Left column: the queue or list. Stays mounted so the user keeps their place. */
  list: ReactNode;
  /** Right column: the open referral or record. */
  detail: ReactNode;
  /**
   * Below 1280px only one column shows. This flag decides which: true shows the detail (route has an id),
   * false shows the list. At 1280px and wider both show side by side.
   */
  detailOpen: boolean;
  className?: string;
}

/**
 * Desktop split view (1280px and wider). Below that, the list and the detail are shown one at a time.
 */
export function SplitView({ list, detail, detailOpen, className }: SplitViewProps) {
  return (
    <div className={cn('grid min-h-0 flex-1 xl:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]', className)}>
      <div className={cn('flex min-h-0 min-w-0 flex-col xl:border-r xl:border-line', detailOpen && 'hidden xl:flex')}>{list}</div>
      <div className={cn('min-h-0 min-w-0 overflow-auto', !detailOpen && 'hidden xl:block')}>{detail}</div>
    </div>
  );
}
