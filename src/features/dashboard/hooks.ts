import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { data, type DashboardQuery } from '@/data';
import { useDemoNow } from '@/data/hooks';
import { dayKey } from './metrics';

/**
 * Every dashboard number, computed by the server over the full data set (data.dashboard.metrics).
 * The clinic calendar day is part of the key, so the numbers refresh when the demo clock moves a day.
 * The server ignores the key part; it only forces a refetch.
 */
export function useDashboardMetrics(query: DashboardQuery) {
  const asOf = dayKey(useDemoNow());
  return useQuery({
    queryKey: ['dashboard', 'metrics', asOf, query] as const,
    queryFn: () => data.dashboard.metrics(query),
    placeholderData: keepPreviousData,
  });
}
