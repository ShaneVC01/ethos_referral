import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Panel, Skeleton } from '@/components/ui/surfaces';
import { cn } from '@/lib/utils';

/*
 * Dashboard chart primitives. Plain HTML and SVG, tokens only (no raw hex).
 * Palette: one accent (sage) for the current period, one neutral (ink-subtle, dashed) for 2025 reference.
 * No dual axes. Every chart has a table alternative and a screen-reader summary.
 */

export interface ChartTable {
  headers: string[];
  rows: (string | number)[][];
}

export function ChartPanel({
  title,
  description,
  summary,
  table,
  loading = false,
  empty = false,
  emptyText,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** Plain-language summary for screen readers, read before the chart. */
  summary: string;
  table: ChartTable;
  loading?: boolean;
  empty?: boolean;
  emptyText: string;
  children: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const summaryId = useId();
  return (
    <Panel
      title={title}
      description={description}
      className={className}
      actions={
        !loading && !empty ? (
          <Button size="sm" variant="secondary" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
            {asTable ? 'Show chart' : 'Show as table'}
          </Button>
        ) : null
      }
    >
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label={`Loading ${title}`}>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : empty ? (
        <p className="py-6 text-sm text-ink-muted">{emptyText}</p>
      ) : asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm tabular-nums" aria-describedby={summaryId}>
            <thead>
              <tr className="border-b border-line bg-panel text-left text-ink-muted">
                {table.headers.map((h, i) => (
                  <th key={h} scope="col" className={cn('px-2 py-2 font-medium', i > 0 && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, ri) => (
                <tr key={ri} className="border-b border-line-subtle">
                  {row.map((cell, ci) => (
                    <td key={ci} className={cn('px-2 py-2', ci > 0 && 'text-right')}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div aria-describedby={summaryId}>{children}</div>
      )}
    </Panel>
  );
}

export interface BarItem {
  label: string;
  value: number;
  display: string;
  sub?: string;
}

/** Horizontal bars for one measure. Single series, so one colour (accent) and no legend. */
export function BarList({ items, ariaLabel }: { items: BarItem[]; ariaLabel: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3" aria-label={ariaLabel}>
      {items.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
          <div className="min-w-0">
            <p className="truncate text-sm text-ink">{item.label}</p>
            {item.sub ? <p className="text-xs text-ink-muted tabular-nums">{item.sub}</p> : null}
          </div>
          <div className="h-2 overflow-hidden rounded-pill bg-line-subtle" aria-hidden="true">
            <div className="h-full rounded-pill bg-accent" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <span className="min-w-[3.5rem] text-right text-sm font-medium tabular-nums text-ink">{item.display}</span>
        </li>
      ))}
    </ul>
  );
}

export interface LineSeries {
  name: string;
  values: (number | null)[];
  /** 'current' is the accent solid line. 'reference' is a dashed neutral line. */
  role: 'current' | 'reference';
}

/**
 * Monthly line chart with HTML axes (so labels stay legible at 360px) and an SVG plot.
 * Two series share one y-axis. Legend is always shown (two series).
 */
export function LineChart({
  labels,
  series,
  yMax,
  format,
  ariaLabel,
}: {
  labels: readonly string[];
  series: LineSeries[];
  yMax: number;
  format: (v: number) => string;
  ariaLabel: string;
}) {
  const width = 1200;
  const height = 100;
  const n = labels.length;
  const x = (i: number) => ((i + 0.5) / n) * width;
  const y = (v: number) => height - Math.min(v / yMax, 1) * height;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  const pathFor = (values: (number | null)[]) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  return (
    <figure className="m-0" aria-label={ariaLabel}>
      <div className="grid grid-cols-[3rem_1fr] gap-2">
        <div className="relative h-48 text-xs tabular-nums text-ink-muted">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 leading-none"
              style={{ top: `${100 - (t / yMax) * 100}%` }}
            >
              {format(t)}
            </span>
          ))}
        </div>
        <div className="relative h-48 border-b border-l border-line">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-line-subtle"
              style={{ top: `${100 - (t / yMax) * 100}%` }}
              aria-hidden="true"
            />
          ))}
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {series.map((s) => (
              <path
                key={s.name}
                d={pathFor(s.values)}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeWidth={s.role === 'current' ? 2.5 : 1.5}
                strokeDasharray={s.role === 'reference' ? '6 4' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ stroke: s.role === 'current' ? 'var(--color-accent)' : 'var(--color-ink-subtle)' }}
              />
            ))}
          </svg>
        </div>
        <div aria-hidden="true" />
        <div className="mt-1 grid text-center text-xs text-ink-muted tabular-nums" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-6"
              style={{
                background: s.role === 'current' ? 'var(--color-accent)' : 'transparent',
                borderTop: s.role === 'reference' ? '2px dashed var(--color-ink-subtle)' : undefined,
              }}
            />
            {s.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Single-hue heatmap cells (sequential, magnitude). Cell text stays ink, never the series colour. */
export function Heatmap({
  rowLabels,
  colLabels,
  values,
  ariaLabel,
}: {
  rowLabels: string[];
  colLabels: string[];
  values: number[][];
  ariaLabel: string;
}) {
  const max = Math.max(1, ...values.flat());
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm tabular-nums" aria-label={ariaLabel}>
        <thead>
          <tr className="text-xs text-ink-muted">
            <th scope="col" className="px-2 py-1 text-left font-medium">
              Staff
            </th>
            {colLabels.map((c) => (
              <th key={c} scope="col" className="px-1 py-1 text-center font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((r, ri) => (
            <tr key={r}>
              <th scope="row" className="px-2 py-1 text-left font-medium text-ink">
                {r}
              </th>
              {(values[ri] ?? []).map((v, ci) => (
                <td key={ci} className="px-1 py-1 text-center">
                  <span
                    className="inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-control text-ink"
                    style={{
                      background: v === 0 ? 'var(--color-canvas)' : `color-mix(in oklab, var(--color-accent) ${Math.round((v / max) * 50)}%, var(--color-surface))`,
                    }}
                  >
                    {v}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
