/**
 * Page and sort state for a server-paged list. EVERY list screen uses this.
 *
 * Rules (see DESIGN.md 10.3 and src/data/repository.ts):
 * - The server filters, searches, sorts and pages. The client never filters or sorts a page it has.
 * - Page size is PAGE_SIZE (100). The server never returns more than SERVER_MAX_ROWS (1,000).
 * - A change of filters, search or sort goes back to page 1 and runs a new server query.
 * - A column is sortable only when it declares `meta: { sortField }`, the server's field name.
 *
 * Usage:
 *   const list = useServerList<ReferrerSortField>({ columns, initialSorting: [{ id: 'name', desc: false }], resetOn: [search, segment] });
 *   const query = useReferrers({ search, segment, orderBy: list.orderBy, offset: list.offset, limit: list.limit });
 *   <DataTable columns={columns} data={query.data?.items ?? []} sorting={list.sorting} onSortingChange={list.setSorting}
 *     pagination={list.pagination(query.data?.total ?? 0)} ... />
 */
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { PAGE_SIZE, type SortSpec } from './repository';

export interface ServerPagination {
  /** Zero-based page index. */
  page: number;
  pageSize: number;
  /** Total matching rows on the server (not the rows on this page). */
  total: number;
  onPageChange: (page: number) => void;
}

function columnId<T>(c: ColumnDef<T, unknown>): string | undefined {
  return c.id ?? ('accessorKey' in c ? String(c.accessorKey) : undefined);
}

export interface UseServerListOptions<T> {
  columns: ColumnDef<T, unknown>[];
  initialSorting?: SortingState;
  /** Filters and search. Any change resets to the first page. Debounce free text before passing it. */
  resetOn?: unknown[];
  pageSize?: number;
}

export function useServerList<F extends string, T = unknown>({
  columns,
  initialSorting = [],
  resetOn = [],
  pageSize = PAGE_SIZE,
}: UseServerListOptions<T>) {
  const [page, setPage] = useState(0);
  const [sorting, setSortingState] = useState<SortingState>(initialSorting);

  // Back to page 1 when the filters change (render-time reset, no extra effect pass).
  const resetKey = JSON.stringify(resetOn);
  const [lastKey, setLastKey] = useState(resetKey);
  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    setPage(0);
  }

  const setSorting = (next: SortingState) => {
    setSortingState(next);
    setPage(0);
  };

  const orderBy = useMemo<SortSpec<F> | undefined>(() => {
    const first = sorting[0];
    if (!first) return undefined;
    const field = columns.find((c) => columnId(c) === first.id)?.meta?.sortField;
    return field ? { field: field as F, desc: first.desc } : undefined;
  }, [sorting, columns]);

  return {
    page,
    setPage,
    sorting,
    setSorting,
    orderBy,
    offset: page * pageSize,
    limit: pageSize,
    pagination: (total: number): ServerPagination => ({ page, pageSize, total, onPageChange: setPage }),
  };
}

/** Delays a fast-changing value (search box) so the server is queried once typing pauses. */
export function useDebouncedValue<V>(value: V, ms = 250): V {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
