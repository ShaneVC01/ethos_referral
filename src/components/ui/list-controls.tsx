import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { describeSort, type SortOption, type SortingState } from './data-table';
import { ICONS } from './icons';
import { Sheet } from './overlays';

/**
 * Phone list controls (under 768px). Cards have no column headings to tap, so every list page that
 * shows cards on phones renders this above the list:
 *   - a sticky toolbar with Filter (with active count) and Sort (with the current sort) buttons
 *   - a horizontally scrolling row of active filter chips, each removable in one tap
 *   - a bottom sheet of grouped filters (fieldset per group) with "Clear all" and "Show N results"
 *   - a bottom sheet to pick the sort field and direction
 * Filters apply as they change, so the result count in the sheet footer is always live.
 * Desktop keeps its inline filter rows and clickable column headings; this whole block is md:hidden.
 */

export interface FilterGroup {
  id: string;
  /** Group heading in the sheet, for example "Status" or "Clinic". */
  label: string;
  /** Number of active filters in this group, shown next to the heading. */
  activeCount?: number;
  /** The filter controls for this group (pills, selects, checkboxes). Reuse the desktop controls. */
  content: ReactNode;
}

export interface ActiveFilterChip {
  id: string;
  label: string;
  onRemove: () => void;
}

export interface MobileListControlsProps {
  /** Noun for the result count, for example "referrals". */
  itemNoun: string;
  resultCount: number;
  groups: FilterGroup[];
  activeChips?: ActiveFilterChip[];
  onClearFilters?: () => void;
  sortOptions: SortOption[];
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  className?: string;
}

export function MobileListControls({
  itemNoun,
  resultCount,
  groups,
  activeChips = [],
  onClearFilters,
  sortOptions,
  sorting,
  onSortingChange,
  className,
}: MobileListControlsProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filterCount = groups.reduce((n, g) => n + (g.activeCount ?? 0), 0);
  const sortText = describeSort(sorting, sortOptions);
  const FilterIcon = ICONS.filter;
  const SortIcon = ICONS.sort;
  const RemoveIcon = ICONS.close;

  return (
    <div className={cn('flex flex-col gap-2 md:hidden', className)}>
      <div className="grid grid-cols-2 gap-2">
        {groups.length > 0 ? (
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={cn(
              'inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-full border px-4 text-base font-medium',
              filterCount > 0 ? 'border-accent bg-accent-subtle text-ink' : 'border-line bg-surface text-ink',
            )}
            aria-haspopup="dialog"
          >
            <FilterIcon size={16} strokeWidth={1.5} aria-hidden="true" className={filterCount > 0 ? 'text-accent' : 'text-ink-muted'} />
            <span>Filter</span>
            {filterCount > 0 ? (
              <span className="tabular rounded-full bg-surface px-2 text-sm" aria-label={`${filterCount} active`}>
                {filterCount}
              </span>
            ) : null}
          </button>
        ) : null}
        {sortOptions.length > 0 ? (
          <button
            type="button"
            onClick={() => setSortOpen(true)}
            className={cn(
              'inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-full border px-4 text-base font-medium',
              sortText ? 'border-accent bg-accent-subtle text-ink' : 'border-line bg-surface text-ink',
              groups.length === 0 && 'col-span-2',
            )}
            aria-haspopup="dialog"
            aria-label={sortText ? `Sort, currently ${sortText}` : 'Sort'}
          >
            <SortIcon size={16} strokeWidth={1.5} aria-hidden="true" className={sortText ? 'text-accent' : 'text-ink-muted'} />
            <span className="truncate">{sortText ? sortText.replace(', ascending', ' ↑').replace(', descending', ' ↓') : 'Sort'}</span>
          </button>
        ) : null}
      </div>

      {activeChips.length > 0 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="list" aria-label="Active filters">
          {activeChips.map((chip) => (
            <span role="listitem" key={chip.id} className="shrink-0">
              <button
                type="button"
                onClick={chip.onRemove}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-accent bg-accent-subtle pl-3 pr-2 text-sm text-ink"
                aria-label={`Remove filter ${chip.label}`}
              >
                <span className="whitespace-nowrap">{chip.label}</span>
                <RemoveIcon size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </span>
          ))}
          {onClearFilters ? (
            <button type="button" onClick={onClearFilters} className="h-9 shrink-0 px-2 text-sm font-medium text-accent underline-offset-2 hover:underline">
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}

      <Sheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        side="bottom"
        title="Filter"
        description={`${resultCount.toLocaleString('en-AU')} ${itemNoun} match`}
        footer={
          <div className="grid w-full grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={onClearFilters} disabled={!onClearFilters || filterCount === 0}>
              Clear all
            </Button>
            <Button size="lg" onClick={() => setFilterOpen(false)}>
              Show {resultCount.toLocaleString('en-AU')} {itemNoun}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <fieldset key={g.id} className="flex min-w-0 flex-col gap-3">
              <legend className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
                {g.label}
                {g.activeCount ? <span className="tabular rounded-full bg-accent-subtle px-2 text-sm font-medium">{g.activeCount}</span> : null}
              </legend>
              {g.content}
            </fieldset>
          ))}
        </div>
      </Sheet>

      <SortSheet open={sortOpen} onOpenChange={setSortOpen} options={sortOptions} sorting={sorting} onSortingChange={onSortingChange} />
    </div>
  );
}

export interface SortSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: SortOption[];
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
}

/** Bottom sheet: pick a field (radio list), then a direction. Applies immediately. */
export function SortSheet({ open, onOpenChange, options, sorting, onSortingChange }: SortSheetProps) {
  const current = sorting[0];
  const AscIcon = ICONS.sortAsc;
  const DescIcon = ICONS.sortDesc;
  const CheckIcon = ICONS.check;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title="Sort by"
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => onSortingChange([])} disabled={!current}>
            Clear sort
          </Button>
          <Button size="lg" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div role="radiogroup" aria-label="Sort field" className="flex flex-col divide-y divide-line-subtle rounded-panel border border-line">
          {options.map((o) => {
            const selected = current?.id === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSortingChange([{ id: o.id, desc: selected ? current!.desc : false }])}
                className={cn('flex min-h-12 items-center justify-between gap-3 px-4 text-left text-base', selected ? 'font-semibold text-ink' : 'text-ink')}
              >
                <span>{o.label}</span>
                {selected ? <CheckIcon size={20} strokeWidth={1.5} aria-hidden="true" className="text-accent" /> : null}
              </button>
            );
          })}
        </div>
        <div role="radiogroup" aria-label="Sort direction" className="grid grid-cols-2 gap-2">
          {[
            { desc: false, label: 'Ascending', Icon: AscIcon },
            { desc: true, label: 'Descending', Icon: DescIcon },
          ].map(({ desc, label, Icon }) => {
            const selected = !!current && current.desc === desc;
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!current}
                onClick={() => current && onSortingChange([{ id: current.id, desc }])}
                className={cn(
                  'inline-flex h-12 items-center justify-center gap-2 rounded-full border text-base font-medium disabled:opacity-50',
                  selected ? 'border-accent bg-accent-subtle text-ink' : 'border-line bg-surface text-ink',
                )}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
        {!current ? <p className="text-sm text-ink-muted">Choose a field, then a direction.</p> : null}
      </div>
    </Sheet>
  );
}
