/**
 * Change notifications from the mock adapter. Fires whenever the mock state changes (writes, Coax
 * transitions, cadence runs). The app's MockLiveSync listens and refreshes queries. Mock only.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export const mockEvents = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  emit(): void {
    listeners.forEach((listener) => listener());
  },
};
