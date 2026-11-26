import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { demoClock, mockEvents } from '@/data';

/**
 * Mounted once in the shell. The mock adapter announces every change (writes, Coax transitions, cadence runs),
 * so queues and timelines refresh without a page reload. Refreshes are batched. Mock only.
 */
export function MockLiveSync() {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void qc.invalidateQueries();
      }, 80);
    };
    const offEvents = mockEvents.subscribe(refresh);
    const offClock = demoClock.subscribe(refresh);
    return () => {
      clearTimeout(timer);
      offEvents();
      offClock();
    };
  }, [qc]);
  return null;
}
