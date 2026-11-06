import { useState, type ReactNode } from 'react'
import { useFilters } from '../lib/filters'
import { MIN_N, num, pct, REMOTE_LABEL, SENIORITY_LABEL, showPct } from '../lib/format'
import { useMeta } from '../lib/data'

export function Section({ title, sub, children, id }: { title: string; sub?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-xl border border-line bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function StatCard({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {note && <div className="mt-1 text-xs text-ink-3">{note}</div>}
    </div>
  )
}

/** A percentage with its sample size, or just the count when the sample is too small. */
export function Pct({ count, n, className = '' }: { count: number; n: number; className?: string }) {
  if (!showPct(n))
    return (
      <span className={`tabular-nums whitespace-nowrap ${className}`} title={`Fewer than ${MIN_N} postings: percentage hidden`}>
        {count} of {n}
      </span>
    )
  return (
    <span className={`tabular-nums whitespace-nowrap ${className}`}>
      {pct(count, n)}%<span className="ml-1 text-xs font-normal text-ink-3">({count}/{n})</span>
    </span>
  )
}

export function SmallSample({ n }: { n: number }) {
  if (showPct(n)) return null
  if (n === 0)
    return (
      <p role="status" className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
        No postings match these filters. Try widening them.
      </p>
    )
  return (
    <p role="status" className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
      Only {n} posting{n === 1 ? '' : 's'} match these filters. Percentages are hidden below {MIN_N} postings, so
      counts are shown instead. Try widening the filters.
    </p>
  )
}

export function Loading({ error }: { error?: string }) {
  return <p className="py-16 text-center text-ink-2">{error ? `Something went wrong: ${error}` : 'Loading…'}</p>
}

const selectCls =
  'rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink focus:outline-2 focus:outline-req'

export function FilterBar({ n, hideSeniority = false, unit = 'postings' }: { n?: number; hideSeniority?: boolean; unit?: string }) {
  const { filters, setFilters } = useFilters()
  const { data: meta } = useMeta()
  // Phones: the bar collapses to one line and the dropdowns open on demand, so it doesn't cover the page.
  const [open, setOpen] = useState(false)
  if (!meta) return null
  const picked = [
    filters.province && meta.provinces[filters.province],
    !hideSeniority && filters.seniority && SENIORITY_LABEL[filters.seniority],
    filters.remote && REMOTE_LABEL[filters.remote],
  ].filter(Boolean) as string[]
  const active = picked.length > 0
  const count = n !== undefined && (
    <span className="text-sm whitespace-nowrap text-ink-2">
      <strong className="text-ink tabular-nums">{num(n)}</strong> {unit}
    </span>
  )
  const sel = `${selectCls} w-full sm:w-auto`
  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-card/95 sm:py-3">
      <div className="flex items-center gap-2 sm:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="filter-panel"
          onClick={() => setOpen(!open)}
          className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-3 text-sm font-medium"
        >
          Filters{active ? ` (${picked.length})` : ''}
          <span aria-hidden="true" className={`text-xs transition ${open ? 'rotate-180' : ''}`}>▾</span>
        </button>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{active ? picked.join(' · ') : 'All of Canada'}</span>
        {count}
      </div>
      <div
        id="filter-panel"
        className={`${open ? 'grid' : 'hidden'} mt-2 grid-cols-1 gap-2 sm:mt-0 sm:flex sm:flex-wrap sm:items-center`}
      >
        <span className="hidden text-sm font-medium text-ink-2 sm:inline">Filter:</span>
        <select
          aria-label="Province"
          className={sel}
          value={filters.province}
          onChange={(e) => setFilters({ ...filters, province: e.target.value })}
        >
          <option value="">All provinces</option>
          {Object.entries(meta.provinces).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        {!hideSeniority && (
          <select
            aria-label="Seniority"
            className={sel}
            value={filters.seniority}
            onChange={(e) => setFilters({ ...filters, seniority: e.target.value })}
          >
            <option value="">All levels</option>
            {meta.seniority.map((s) => (
              <option key={s} value={s}>
                {SENIORITY_LABEL[s]}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Work arrangement"
          className={sel}
          value={filters.remote}
          onChange={(e) => setFilters({ ...filters, remote: e.target.value })}
        >
          <option value="">On-site, hybrid or remote</option>
          {meta.remote.map((r) => (
            <option key={r} value={r}>
              {REMOTE_LABEL[r]}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 sm:contents">
          {active && (
            <button
              type="button"
              className="min-h-9 rounded-lg px-2 text-sm text-link hover:underline"
              onClick={() => setFilters({ province: '', seniority: hideSeniority ? filters.seniority : '', remote: '' })}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="ml-auto min-h-9 rounded-lg px-2 text-sm font-medium text-ink-2 sm:hidden"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
        {count && <span className="ml-auto hidden sm:inline">{count}</span>}
      </div>
    </div>
  )
}

/** Simple ranked list with a count, used for companies and cities. */
export function RankList({ rows, unit = 'postings' }: { rows: [string, number][]; unit?: string }) {
  if (!rows.length) return <p className="text-sm text-ink-3">None in this selection.</p>
  return (
    <ol className="divide-y divide-line text-sm">
      {rows.map(([name, v], i) => (
        <li key={name} className="flex items-baseline gap-3 py-1.5">
          <span className="w-5 text-right text-ink-3 tabular-nums">{i + 1}</span>
          <span className="flex-1">{name}</span>
          <span className="text-ink-2 tabular-nums">
            {v} {v === 1 ? unit.replace(/s$/, '') : unit}
          </span>
        </li>
      ))}
    </ol>
  )
}
