import type { ReactNode } from 'react'
import { useFilters } from '../lib/filters'
import { MIN_N, num, pct, REMOTE_LABEL, SENIORITY_LABEL, showPct } from '../lib/format'
import { useMeta } from '../lib/data'

export function Section({ title, sub, children, id }: { title: string; sub?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-xl border border-line bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function StatCard({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
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
  return (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Only {n} posting{n === 1 ? '' : 's'} match these filters. Percentages are hidden below {MIN_N} postings, so
      counts are shown instead. Try widening the filters.
    </p>
  )
}

export function Loading({ error }: { error?: string }) {
  return <p className="py-16 text-center text-ink-2">{error ? `Something went wrong: ${error}` : 'Loading…'}</p>
}

const selectCls =
  'rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-2 focus:outline-req'

export function FilterBar({ n, hideSeniority = false, unit = 'postings' }: { n?: number; hideSeniority?: boolean; unit?: string }) {
  const { filters, setFilters } = useFilters()
  const { data: meta } = useMeta()
  if (!meta) return null
  const active = filters.province || filters.remote || (!hideSeniority && filters.seniority)
  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-white/95">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink-2">Filter:</span>
        <select
          aria-label="Province"
          className={selectCls}
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
            className={selectCls}
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
          className={selectCls}
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
        {active && (
          <button
            className="rounded-lg px-2 py-1.5 text-sm text-req hover:underline"
            onClick={() => setFilters({ province: '', seniority: hideSeniority ? filters.seniority : '', remote: '' })}
          >
            Clear
          </button>
        )}
        {n !== undefined && (
          <span className="ml-auto text-sm text-ink-2">
            <strong className="text-ink tabular-nums">{num(n)}</strong> {unit}
          </span>
        )}
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
