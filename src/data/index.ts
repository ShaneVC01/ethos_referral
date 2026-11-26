import type { DataRepository } from './repository';
import { createMockRepository } from './mock';
import { createSupabaseRepository } from './supabase';

export * from './repository';
export { demoClock } from './mock/clock';
export { mockEvents } from './mock/events';

/** Chosen at build time by VITE_DATA_ADAPTER. Defaults to the in-memory mock. */
export const dataAdapter: 'mock' | 'supabase' = import.meta.env.VITE_DATA_ADAPTER === 'supabase' ? 'supabase' : 'mock';

/** The single repository instance used by the UI through data/hooks.ts. */
export const data: DataRepository = dataAdapter === 'supabase' ? createSupabaseRepository() : createMockRepository();
