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
}

interface Props {
  rows: BarRow[]
  n: number // postings the counts are out of
  series?: [string, string?] // legend names
  labelWidth?: number
  legend?: boolean
  fixedMax?: number // share one scale across several charts (in % units)
}

/**
 * Horizontal bars. Shows % of postings with the sample size, or plain counts when n < 20.
 * With two series the bars are stacked: required + nice to have = any mention.
 */
export function BarList({ rows, n, series = ['Postings'], labelWidth = 190, legend = true, fixedMax }: Props) {
  const usePct = showPct(n)
  const two = series.length > 1 && series[1] !== undefined
  const data = rows.map((r) => ({
    ...r,
    va: usePct ? (100 * r.a) / n : r.a,
    vb: usePct ? (100 * (r.b ?? 0)) / n : (r.b ?? 0),
    total: r.a + (r.b ?? 0),
  }))
  // Scale to the longest bar; the labels carry the exact numbers.
  const max = fixedMax ?? Math.max(1, ...data.map((d) => d.va + d.vb)) * 1.02
  if (!rows.length) return <p className="text-sm text-ink-3">Nothing to show for this selection.</p>

  type LabelProps = { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown }
  // Recharts skips zero-width segments when labelling, which shifts label indexes. So labels look up
  // their row by category name (value of dataKey="label"), and go on whichever segment ends the bar.
  const byLabel = new Map(data.map((d) => [d.label, d]))
  const endLabelOn = (seg: 'a' | 'b') => (props: LabelProps) => {
    const d = byLabel.get(String(props.value))
    if (!d) return null
    const endsHere = seg === 'b' ? d.vb > 0 : !two || d.vb === 0
    if (!endsHere) return null
    const x = Number(props.x) + Number(props.width) + 6
    const y = Number(props.y) + Number(props.height) / 2
    return (
      <text x={x} y={y} dy="0.35em" fontSize={12} fill={INK_2} className="tabular-nums">
        {usePct ? `${pct(d.total, n)}%` : `${d.total}`}
        <tspan fill={INK_3}>{usePct ? `  (${d.total}/${n})` : ` of ${n}`}</tspan>
      </text>
    )
  }

  return (
    <div>
      {two && legend && (
        <div className="mb-2 flex gap-4 text-xs text-ink-2">
          <Legend color={COLOR_A} label={series[0]} />
          <Legend color={COLOR_B} label={series[1]!} />
        </div>
      )}
      <ResponsiveContainer width="100%" height={rows.length * 30 + 16}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 110, bottom: 0, left: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" domain={[0, max]} hide />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 13, fill: '#0b0b0b' }}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as (typeof data)[number]
              const line = (label: string, c: number) =>
                usePct ? `${label}: ${pct(c, n)}% (${c} of ${n})` : `${label}: ${c} of ${n}`
              return (
                <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-sm">
                  <div className="mb-1 font-medium text-ink">{d.label}</div>
                  {two ? (
                    <>
                      <div>{line(series[0], d.a)}</div>
                      <div>{line(series[1]!, d.b ?? 0)}</div>
                      <div className="mt-1 text-ink-2">{line('Total', d.total)}</div>
                    </>
                  ) : (
                    <div>{line(series[0], d.a)}</div>
                  )}
                </div>
              )
            }}
          />
          <Bar dataKey="va" stackId="s" fill={COLOR_A} radius={two ? 0 : [0, 4, 4, 0]} minPointSize={1} isAnimationActive={false}>
            <LabelList dataKey="label" content={endLabelOn('a')} />
          </Bar>
          {two && (
            <Bar dataKey="vb" stackId="s" fill={COLOR_B} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList dataKey="label" content={endLabelOn('b')} />
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
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
