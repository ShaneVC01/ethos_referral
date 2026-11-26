import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';

/**
 * Service worker registration for the staff app only. The public form (refer.html) never imports this file.
 * registerType is 'prompt', so a new version waits until the user chooses Update.
 */
let updateFn: ((reload?: boolean) => Promise<void>) | null = null;

export function registerAppServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  updateFn = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast('A new version of Referrals is ready.', {
        duration: Infinity,
        action: { label: 'Update', onClick: () => void updateFn?.(true) },
      });
    },
    onOfflineReady() {
      toast('Referrals is ready to use offline for the app shell.', { duration: 5000 });
    },
  });
}

