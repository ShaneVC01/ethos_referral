import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { data, type QueueQuery, type ReferralFilterQuery } from '@/data';
import { useLookups } from '@/data/hooks';
import { useMemo, useEffect, useState } from 'react';

/*
 * Every list on the queue screens is a server query now (see src/data/repository.ts). These hooks are
 * thin wrappers: the server filters, searches, sorts, pages and counts.
 */

/** One page of the work queue, with exact tab and card counts and the stage counts for the chosen group. */
export function useQueuePage(query: QueueQuery) {
  return useQuery({
    queryKey: ['referrals', 'queue', query] as const,
    queryFn: () => data.referrals.queue(query),
    placeholderData: keepPreviousData,
  });
}

/** Exact counts over the referral list filters (total, active, booked, to call, overdue). No paging. */
export function useReferralSummary(query: ReferralFilterQuery) {
  return useQuery({
    queryKey: ['referrals', 'summary', query] as const,
    queryFn: () => data.referrals.summary(query),
    placeholderData: keepPreviousData,
  });
}

/** Other referrals for the same patient, for the duplicate warning on a referral. */
export function useReferralDuplicates(id: string | undefined) {
  return useQuery({
    queryKey: ['referrals', 'duplicates', id ?? ''] as const,
    queryFn: () => data.referrals.possibleDuplicates(id ?? ''),
    enabled: !!id,
  });
}

/** CSV for every referral matching the filters, in the sort order given. The server builds it, not the page. */
export function exportReferralsCsv(query: ReferralFilterQuery): Promise<string> {
  return data.referrals.exportCsv(query);
}

/** Clinic, orthodontist and staff names by id. Lookups are small and cached. */
export function useNames() {
  const lookups = useLookups();
  return useMemo(() => {
    const clinics = lookups.data?.clinics ?? [];
    const orthos = lookups.data?.orthodontists ?? [];
    const staff = lookups.data?.staff ?? [];
    return {
      clinic: (id: string | null) => clinics.find((c) => c.id === id)?.name ?? '',
      ortho: (id: string | null) => orthos.find((o) => o.id === id)?.fullName ?? '',
      staff: (id: string | null) => staff.find((s) => s.id === id)?.name ?? '',
      clinicList: clinics,
      orthoList: orthos,
      staffList: staff,
    };
  }, [lookups.data]);
}

/**
 * Referrer display name for a referral. The list rows already carry referrerName (the server joins it),
 * so pages read that instead. This only falls back to the name typed on the referral. Kept for
 * DoNotContactPage until it reads the row's referrerName.
 * @deprecated Read referrerName from the row returned by useReferrals or useQueuePage.
 */
export function useReferrerNames() {
  return (_id: string | null, fallback: string | null = null) => fallback ?? '';
}

export function useSessionUser() {
  return useAuth().user;
}

/** True at or above a CSS media query. Used only where a component must pick a different element (sheet side). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : true));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Keyboard shortcuts are ignored while the user is typing. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
}
