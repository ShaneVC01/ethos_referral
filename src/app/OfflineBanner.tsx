import { useEffect, useState } from 'react';
import { ICONS } from '@/components/ui/icons';

/** Shown when the browser loses its connection. Writes are not queued offline in this prototype. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online) return null;

  return (
    <div role="status" className="flex items-center gap-2 border-b border-warn-bg bg-warn-bg px-4 py-2 text-sm text-warn-fg">
      <ICONS.offline size={16} strokeWidth={1.5} aria-hidden="true" />
      You are offline. Changes will not save until the connection returns.
    </div>
  );
}
