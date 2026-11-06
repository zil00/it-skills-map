import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { pct, showPct } from '../lib/format'

export const COLOR_A = '#2a78d6' // required / main series
export const COLOR_B = '#eb6834' // nice to have
const INK_2 = '#52514e'
const INK_3 = '#8a8983'
const GRID = '#ecebe6'

export interface BarRow {
  label: string
  a: number // count (required, or the only series)
  b?: number // count (nice to have)
  n?: number // this row's own sample size, when rows come from different groups
}

interface Props {
  rows: BarRow[]
  n: number // postings the counts are out of
  series?: [string, string?] // legend names
  labelWidth?: number // label column width (px) when there's room for label | bar side by side
  legend?: boolean
  fixedMax?: number // share one scale across several charts (in % units)
}

/**
 * Horizontal bars as plain HTML, so they reflow on narrow screens and screen readers get real text.
 * Shows % of postings with the sample size, or plain counts when n < 20.
 * With two series the bars are stacked: required + nice to have = any mention.
 * In a narrow container the label sits above its bar; from 32rem up it sits to the left.
 */
export function BarList({ rows, n, series = ['Postings'], labelWidth = 190, legend = true, fixedMax }: Props) {
  const two = series.length > 1 && series[1] !== undefined
  const data = rows.map((r) => {
    const rn = r.n ?? n
    const usePct = showPct(rn)
    return {
      ...r,
      rn,
      usePct,
      va: usePct ? (100 * r.a) / rn : r.a,
      vb: usePct ? (100 * (r.b ?? 0)) / rn : (r.b ?? 0),
      total: r.a + (r.b ?? 0),
    }
  })
  if (!rows.length) return <p className="text-sm text-ink-3">Nothing to show for this selection.</p>
  // Scale to the longest bar; the labels carry the exact numbers.
  const max = fixedMax ?? Math.max(1, ...data.map((d) => d.va + d.vb)) * 1.02
  const part = (label: string, c: number, d: (typeof data)[number]) =>
    d.usePct ? `${label}: ${pct(c, d.rn)}% (${c} of ${d.rn})` : `${label}: ${c} of ${d.rn}`

  return (
    <div className="@container">
      {two && legend && (
        <div className="mb-2 flex gap-4 text-xs text-ink-2" aria-hidden="true">
          <Legend color="bg-req" label={series[0]} />
          <Legend color="bg-nice" label={series[1]!} />
        </div>
      )}
      <ul className="space-y-2 @lg:space-y-1.5" style={{ ['--lw' as string]: `${labelWidth}px` }}>
        {data.map((d) => {
          const tip = two ? [part(series[0], d.a, d), part(series[1]!, d.b ?? 0, d)] : [part(series[0], d.a, d)]
          return (
            <li
              key={d.label}
              className="group relative grid grid-cols-1 items-center gap-x-3 gap-y-0.5 text-sm @lg:grid-cols-[var(--lw)_1fr]"
            >
              <span className="leading-snug text-ink @lg:text-right">{d.label}</span>
              <div className="flex items-center">
                <div
                  className="flex h-4 shrink-0 gap-[2px]"
                  style={{ width: `calc((100% - 7.5rem) * ${Math.min(1, (d.va + d.vb) / max)})`, minWidth: 2 }}
                  aria-hidden="true"
                >
                  {d.a > 0 && <span className={`h-full bg-req ${d.b ? '' : 'rounded-r'}`} style={{ flexGrow: d.va }} />}
                  {two && (d.b ?? 0) > 0 && <span className="h-full rounded-r bg-nice" style={{ flexGrow: d.vb }} />}
                </div>
                <span className="ml-1.5 whitespace-nowrap text-xs tabular-nums text-ink-2">
                  {d.usePct ? `${pct(d.total, d.rn)}%` : d.total}
                  <span className="text-ink-3">{d.usePct ? ` (${d.total}/${d.rn})` : ` of ${d.rn}`}</span>
                  {two && <span className="sr-only">. {tip.join(', ')}</span>}
                </span>
              </div>
              {/* Hover detail: the required / nice-to-have split behind the total. */}
              <div
                className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-sm group-hover:block @lg:left-[calc(var(--lw)+0.75rem)]"
                aria-hidden="true"
              >
                <div className="mb-1 font-medium text-ink">{d.label}</div>
                {tip.map((t) => (
                  <div key={t}>{t}</div>
                ))}
                {two && <div className="mt-1 text-ink-2">{part('Total', d.total, d)}</div>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  )
}

/** Vertical columns for ordered categories (years, seniority). */
export function ColumnChart({ rows, n }: { rows: BarRow[]; n: number }) {
  const usePct = showPct(n)
  const data = rows.map((r) => ({ ...r, v: usePct ? (100 * r.a) / n : r.a }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 34, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 12, fill: INK_2 }} interval={0} />
        <YAxis hide domain={[0, usePct ? 'auto' : 'auto']} />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as (typeof data)[number]
            return (
              <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-sm">
                <div className="font-medium">{d.label}</div>
                <div>{usePct ? `${pct(d.a, n)}% (${d.a} of ${n})` : `${d.a} of ${n}`}</div>
              </div>
            )
          }}
        />
        <Bar dataKey="v" fill={COLOR_A} radius={[4, 4, 0, 0]} maxBarSize={56} minPointSize={1} isAnimationActive={false}>
          <LabelList
            dataKey="label"
            content={(p) => {
              const d = data.find((r) => r.label === String(p.value))
              if (!d) return null
              const x = Number(p.x) + Number(p.width) / 2
              const y = Number(p.y)
              return (
                <text x={x} y={y - 20} textAnchor="middle" fontSize={12} fill={INK_2}>
                  <tspan x={x}>{usePct ? `${pct(d.a, n)}%` : d.a}</tspan>
                  <tspan x={x} dy="1.2em" fill={INK_3} fontSize={11}>
                    {usePct ? `(${d.a}/${n})` : `of ${n}`}
                  </tspan>
                </text>
              )
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
