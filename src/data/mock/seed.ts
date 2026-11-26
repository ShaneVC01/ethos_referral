/**
 * Seed data loader. Files are written by `npm run seed` (gitignored, never committed) as JSON under seed/<name>.json.
 *
 * Every file is its own lazy chunk (non-eager glob). Nothing is bundled into the entry chunk, and nothing reaches
 * the public refer.html bundle, which does not import the mock. The mock adapter starts loading on its first
 * data call (after login), and each file is fetched once. A missing file gives the fallback, so the app runs
 * without any seed.
 */
const seedLoaders = import.meta.glob('../../../seed/*.json', { import: 'default' }) as Record<string, () => Promise<unknown>>;
const loaded = new Map<string, Promise<unknown>>();

export function loadSeed<T>(name: string, fallback: T): Promise<T> {
  const key = `../../../seed/${name}.json`;
  const loader = seedLoaders[key];
  if (!loader) return Promise.resolve(fallback);
  let pending = loaded.get(key);
  if (!pending) {
    pending = loader();
    loaded.set(key, pending);
  }
  return pending.then(
    (value) => (value as T | null | undefined) ?? fallback,
    (error: unknown) => {
      console.error(`Seed file ${name}.json could not be loaded`, error);
      loaded.delete(key);
      return fallback;
    },
  );
}

/** Edge referral history. Only the referrer profile needs it, so it loads on first use there. */
export function loadReferrerHistory<T>(): Promise<T[]> {
  return loadSeed<T[]>('referrer_history', []);
}
