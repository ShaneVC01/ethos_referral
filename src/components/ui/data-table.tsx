import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type Header,
  type Row,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { ICONS } from './icons';
import { Skeleton } from './surfaces';
import { Button } from './button';
import type { ServerPagination } from '@/data/use-server-list';

export type { SortingState } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Plain-text column name for the mobile sort sheet when `header` is not a string. */
    label?: string;
    /**
     * Server-paged lists: the server's sort field for this column (for example 'receivedAt').
     * With `pagination` set, only columns that declare sortField are sortable.
     */
    sortField?: string;
  }
}

export type Density = 'comfortable' | 'compact';

/**
 * SORTING IS ON BY DEFAULT for every list.
 * Server-paged lists (every list backed by the repository) pass `pagination` and give each sortable
 * column `meta: { sortField }`. The table then never sorts rows itself: the heading click changes the
 * sort state, useServerList turns it into `orderBy`, and the server returns the right page.
 * A column is sortable when it has a value to sort by: give it `accessorFn` (or `accessorKey`).
 * Return a sortable primitive from accessorFn (string, number, ISO date string). Return `undefined`
 * for "no value" so empty cells always sort last. Columns with no accessor (row checkbox, actions)
 * are not sortable. To opt a data column out, set `enableSorting: false`.
 */
export interface SortOption {
  id: string;
  label: string;
}

/** Plain-text label for a column: `meta.label`, else a string `header`, else the column id. */
export function columnLabel<T>(column: ColumnDef<T, unknown> | Column<T, unknown>): string {
  const def = 'columnDef' in column ? column.columnDef : column;
  if (def.meta?.label) return def.meta.label;
  if (typeof def.header === 'string') return def.header;
  return def.id ?? '';
}

function hasAccessor<T>(def: ColumnDef<T, unknown>): boolean {
  return 'accessorFn' in def || 'accessorKey' in def;
}

/** True when the columns are set up for server sorting (any column declares meta.sortField). */
function isServerSorted<T>(columns: ColumnDef<T, unknown>[]): boolean {
  return columns.some((c) => !!c.meta?.sortField);
}

/**
 * Sortable columns, in display order. Feed this to SortSheet so phone and desktop sort the same way.
 * For server-sorted columns (any meta.sortField) only those with a sortField are offered.
 */
export function sortOptions<T>(columns: ColumnDef<T, unknown>[]): SortOption[] {
  const server = isServerSorted(columns);
  return columns
    .filter((c) => (server ? !!c.meta?.sortField : hasAccessor(c)) && c.enableSorting !== false)
    .map((c) => ({ id: c.id ?? ('accessorKey' in c ? String(c.accessorKey) : ''), label: columnLabel(c) }))
    .filter((o) => o.id && o.label);
}

/** Human description of the current sort, for the phone toolbar ("Due, ascending"). */
export function describeSort(sorting: SortingState, options: SortOption[]): string | null {
  const first = sorting[0];
  if (!first) return null;
  const label = options.find((o) => o.id === first.id)?.label ?? first.id;
  return `${label}, ${first.desc ? 'descending' : 'ascending'}`;
}

function SortHeader<T>({ header }: { header: Header<T, unknown> }) {
  const content = flexRender(header.column.columnDef.header, header.getContext());
  if (!header.column.getCanSort()) return <>{content}</>;
  const dir = header.column.getIsSorted();
  const Icon = dir === 'asc' ? ICONS.sortAsc : dir === 'desc' ? ICONS.sortDesc : ICONS.sortable;
  const label = columnLabel(header.column);
  const next = header.column.getNextSortingOrder();
  const action = next === 'asc' ? 'sort ascending' : next === 'desc' ? 'sort descending' : 'clear sort';
  return (
    <button
      type="button"
      onClick={header.column.getToggleSortingHandler()}
      className={cn(
        '-mx-1 inline-flex max-w-full items-center gap-1 rounded-control px-1 py-0.5 text-left leading-tight',
        'hover:text-ink',
        dir ? 'font-semibold text-ink' : '',
      )}
      aria-label={`${label}, ${action}`}
    >
      <span className="min-w-0">{content}</span>
      <Icon
        size={14}
        strokeWidth={1.75}
        aria-hidden="true"
        className={cn('shrink-0', dir ? 'text-accent' : 'text-ink-subtle opacity-60')}
      />
    </button>
  );
}

export interface DataTableProps<T> {
  /** Accessible name for the table. Required. */
  caption: string;
  data: T[];
  columns: ColumnDef<T, unknown>[];
  getRowId: (row: T) => string;
  density?: Density;
  /** Highlights the row for the open detail (split view). */
  selectedId?: string | null;
  /** Enter, click or tap on a row. */
  onRowActivate?: (row: T) => void;
  /** Phone layout (under 768px): renders each row as a card instead of a table row. */
  renderCard?: (row: T) => ReactNode;
  loading?: boolean;
  /** Shown when there are no rows and not loading. Use EmptyState. */
  emptyState?: ReactNode;
  /** Columns hidden under the md breakpoint, by column id. */
  hideBelowMd?: string[];
  /**
   * Controlled sort state. Pass with onSortingChange when the page also shows the phone SortSheet,
   * so both drive one sort. Omit both and the table keeps its own sort state.
   */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /** Starting sort when uncontrolled, for example [{ id: 'due', desc: false }]. */
  initialSorting?: SortingState;
  /**
   * Server paging (the default for repository-backed lists): `data` is one page from the server.
   * Turns on manual sorting and shows the pager. Use `useServerList().pagination(total)`.
   */
  pagination?: ServerPagination;
  /** Plural noun for the pager, for example "referrals". */
  itemNoun?: string;
  className?: string;
}

/**
 * Pager for server-paged lists: "1 to 100 of 4,227", Previous and Next.
 * 44px targets on phones (Button sm). Hidden when everything fits on one page.
 */
export function Pager({ page, pageSize, total, onPageChange, itemNoun = 'items' }: ServerPagination & { itemNoun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize && page === 0) {
    return (
      <p className="border-t border-line px-3 py-2 text-sm text-ink-muted tabular-nums" aria-live="polite">
        {total.toLocaleString('en-AU')} {itemNoun}
      </p>
    );
  }
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const fmt = (n: number) => n.toLocaleString('en-AU');
  return (
    <nav aria-label={`${itemNoun} pages`} className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
      <p className="text-sm text-ink-muted tabular-nums" aria-live="polite">
        {fmt(from)} to {fmt(to)} of {fmt(total)} <span className="hidden sm:inline">{itemNoun}</span>
      </p>
      <div className="flex items-center gap-2">
        <span className="hidden text-sm text-ink-muted tabular-nums md:inline">
          Page {fmt(page + 1)} of {fmt(pages)}
        </span>
        <Button variant="secondary" size="sm" icon="chevronLeft" disabled={page <= 0} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages - 1} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <span className="hidden sm:inline">Next</span>
          <ICONS.chevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

const ROW_HEIGHT: Record<Density, number> = { comfortable: 40, compact: 32 };
const CARD_HEIGHT = 96;

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

/**
 * Virtualised table for 4k+ rows. Keyboard: j or ArrowDown moves down, k or ArrowUp moves up,
 * Enter opens the active row, Home and End jump. Sticky header. Density toggles row height.
 * Under 768px pass renderCard to show cards, and render <MobileListControls> above the table so
 * phone users can still filter and sort (cards have no column headings to tap).
 * Column headings are sort buttons: click cycles ascending, descending, then off.
 */
export function DataTable<T>({
  caption,
  data,
  columns,
  getRowId,
  density = 'comfortable',
  selectedId,
  onRowActivate,
  renderCard,
  loading = false,
  emptyState,
  hideBelowMd = [],
  sorting: sortingProp,
  onSortingChange,
  initialSorting = [],
  pagination,
  itemNoun,
  className,
}: DataTableProps<T>) {
  const isDesktop = useIsDesktop();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [ownSorting, setOwnSorting] = useState<SortingState>(initialSorting);
  const sorting = sortingProp ?? ownSorting;

  const server = !!pagination;

  if (import.meta.env.DEV) {
    for (const c of columns) {
      const titled = typeof c.header === 'string' && c.header.trim();
      if (!titled || c.enableSorting === false) continue;
      if (server && !c.meta?.sortField) {
        console.warn(`[DataTable "${caption}"] Column "${c.header}" has no meta.sortField so the server cannot sort it. Add sortField, or set enableSorting: false.`);
      } else if (!server && !hasAccessor(c)) {
        console.warn(`[DataTable "${caption}"] Column "${c.header}" has no accessorFn so it cannot be sorted. Add accessorFn, or set enableSorting: false.`);
      }
    }
  }

  // Server mode: a column sorts only when the server knows its field. The table never reorders the page.
  const tableColumns = useMemo(
    () =>
      server
        ? columns.map((c) => {
            const sortable = c.enableSorting !== false && !!c.meta?.sortField;
            // TanStack only lets a column sort when it has an accessor. The server does the sorting, so a stub is enough.
            const withAccessor = sortable && !hasAccessor(c) ? { ...c, accessorFn: () => undefined } : c;
            return { ...withAccessor, enableSorting: sortable } as ColumnDef<T, unknown>;
          })
        : columns,
    [columns, server],
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    manualSorting: server,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (onSortingChange) onSortingChange(next);
      if (sortingProp === undefined) setOwnSorting(next);
    },
    // First click is always ascending (TanStack otherwise starts number columns descending), so every heading behaves the same.
    defaultColumn: { sortUndefined: 'last', sortDescFirst: false },
    enableSortingRemoval: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: server ? undefined : getSortedRowModel(),
    getRowId: (row) => getRowId(row),
  });
  const rows: Row<T>[] = table.getRowModel().rows;
  const useCards = !isDesktop && !!renderCard;
  const rowHeight = useCards ? CARD_HEIGHT : ROW_HEIGHT[density];

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    measureElement: useCards ? (el) => el.getBoundingClientRect().height : undefined,
  });

  // Keep the active row in view when moving with the keyboard.
  useEffect(() => {
    if (rows.length > 0 && activeIndex < rows.length) virtualizer.scrollToIndex(activeIndex, { align: 'auto' });
  }, [activeIndex, rows.length, virtualizer]);

  // Reset the active row when the data set changes.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  // A new server page starts at the top.
  const pageIndex = pagination?.page ?? 0;
  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pageIndex]);

  const pager = pagination && pagination.total > 0 ? <Pager {...pagination} itemNoun={itemNoun} /> : null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    const target = e.target as HTMLElement;
    // Let inputs and buttons inside a row handle their own keys.
    if (target !== e.currentTarget && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(rows.length - 1);
    } else if (e.key === 'Enter' && onRowActivate) {
      const row = rows[activeIndex];
      if (row) onRowActivate(row.original);
    }
  };

  if (loading && rows.length === 0) {
    return (
      <div className={cn('flex flex-col gap-2 p-3', className)} aria-busy="true" aria-label={`${caption}, loading`}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className={cn('flex flex-1 items-center justify-center p-6', className)}>{emptyState}</div>;
  }

  const items = virtualizer.getVirtualItems();
  const paddingTop = items.length > 0 ? items[0]!.start : 0;
  const paddingBottom = items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1]!.end : 0;

  const scroll = (
    <div
      ref={scrollRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={`${caption}. Use j and k to move, Enter to open.`}
      className={cn('relative min-h-0 flex-1 overflow-auto rounded-panel focus-visible:outline-offset-[-2px]', !pager && className)}
    >
      {useCards ? (
        <div role="list" aria-label={caption} className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((vi) => {
            const row = rows[vi.index]!;
            const selected = selectedId === row.id;
            const active = vi.index === activeIndex;
            return (
              <div
                key={row.id}
                ref={virtualizer.measureElement}
                role="listitem"
                data-index={vi.index}
                onClick={() => {
                  setActiveIndex(vi.index);
                  onRowActivate?.(row.original);
                }}
                className={cn(
                  'absolute inset-x-0 cursor-pointer px-4 pb-3',
                  'focus-within:bg-accent-subtle',
                )}
                style={{ transform: `translateY(${vi.start}px)` }}
              >
                <div
                  className={cn(
                    'rounded-panel border bg-surface',
                    selected || active ? 'border-accent bg-accent-subtle' : 'border-line',
                  )}
                  aria-current={selected ? 'true' : undefined}
                >
                  {renderCard!(row.original)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <table aria-label={caption} className="w-full table-fixed border-separate border-spacing-0 text-base" aria-rowcount={rows.length}>
          <thead className="sticky top-0 z-10 bg-panel">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const dir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        header.column.getCanSort() ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : undefined
                      }
                      className={cn(
                        'border-b border-line px-3 py-2 text-left text-sm font-medium text-ink-muted',
                        hideBelowMd.includes(header.column.id) && 'hidden md:table-cell',
                      )}
                      style={{ width: header.column.columnDef.size }}
                    >
                      {header.isPlaceholder ? null : <SortHeader header={header} />}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={columns.length} style={{ height: paddingTop, padding: 0 }} />
              </tr>
            ) : null}
            {items.map((vi) => {
              const row = rows[vi.index]!;
              const selected = selectedId === row.id;
              const active = vi.index === activeIndex;
              return (
                <tr
                  key={row.id}
                  data-index={vi.index}
                  aria-selected={selected || undefined}
                  aria-rowindex={vi.index + 1}
                  onClick={() => {
                    setActiveIndex(vi.index);
                    onRowActivate?.(row.original);
                  }}
                  className={cn(
                    'cursor-pointer text-ink hover:bg-canvas',
                    active && 'bg-canvas',
                    selected && 'bg-accent-subtle hover:bg-accent-subtle',
                  )}
                  style={{ height: ROW_HEIGHT[density] }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'border-b border-line-subtle px-3 align-middle',
                        density === 'compact' ? 'py-0 text-sm' : 'py-1',
                        active && cell.column.id === row.getVisibleCells()[0]?.column.id && 'shadow-[inset_3px_0_0_var(--color-accent)]',
                        hideBelowMd.includes(cell.column.id) && 'hidden md:table-cell',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={columns.length} style={{ height: paddingBottom, padding: 0 }} />
              </tr>
            ) : null}
          </tbody>
        </table>
      )}
    </div>
  );

  if (!pager) return scroll;
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {scroll}
      {pager}
    </div>
  );
}
