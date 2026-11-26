/**
 * Demo clock. "Today" for the whole app (queues, overdue, timestamps written by the mock).
 * Manager-only control in the header advances it so Day 1, Day 14 and 3 month queues fill without waiting.
 * Not part of the Supabase adapter: production uses real time.
 */
type Listener = () => void;

export class MockClock {
  private offsetMs = 0;
  private listeners = new Set<Listener>();

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  /** Snapshot for useSyncExternalStore. Changes only when the clock is moved. */
  snapshot(): number {
    return this.offsetMs;
  }

  advanceDays(days: number): void {
    this.offsetMs += days * 24 * 60 * 60 * 1000;
    this.emit();
  }

  reset(): void {
    this.offsetMs = 0;
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}

export const demoClock = new MockClock();
