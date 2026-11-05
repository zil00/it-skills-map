import type { Cell, CellFile, LocCell, Skill } from './types'

export interface Filters {
  province: string // '' = all
  seniority: string
  remote: string
}

export const NO_FILTERS: Filters = { province: '', seniority: '', remote: '' }

const match = (f: Filters, p: string, s: string, r: string) =>
  (!f.province || f.province === p) && (!f.seniority || f.seniority === s) && (!f.remote || f.remote === r)

/** Everything on a page is computed from this: the sum of the cells that match the filters. */
export interface Stats {
  n: number
  req: Map<number, number>
  nice: Map<number, number>
  any: Map<number, number>
  yrs: Map<string, number>
  edu: Map<string, number>
  flags: Map<string, number>
  lang: Map<string, number>
  sal: number[]
  companies: Map<string, number>
  certPairs: Map<string, number>
  seniority: Map<string, number>
  remote: Map<string, number>
  roles: Map<string, number>
  provinces: Map<string, number> // all rows, repeats counted per city
  cities: Map<string, number> // "City, PR" -> rows
  locRows: number
}

function add(m: Map<string | number, number>, k: string | number, v: number) {
  m.set(k, (m.get(k) ?? 0) + v)
}

export function aggregate(file: CellFile, f: Filters): Stats {
  const st: Stats = {
    n: 0, req: new Map(), nice: new Map(), any: new Map(), yrs: new Map(), edu: new Map(),
    flags: new Map(), lang: new Map(), sal: [], companies: new Map(), certPairs: new Map(),
    seniority: new Map(), remote: new Map(), roles: new Map(), provinces: new Map(),
    cities: new Map(), locRows: 0,
  }
  const cells: Cell[] = file.cells.filter((c) => match(f, c.p, c.s, c.r))
  for (const c of cells) {
    st.n += c.n
    for (const [k, v] of Object.entries(c.req)) {
      add(st.req as Map<number, number>, +k, v)
      add(st.any as Map<number, number>, +k, v)
    }
    for (const [k, v] of Object.entries(c.nice)) {
      add(st.nice as Map<number, number>, +k, v)
      add(st.any as Map<number, number>, +k, v)
    }
    for (const [k, v] of Object.entries(c.yrs)) add(st.yrs, k, v)
    for (const [k, v] of Object.entries(c.edu)) add(st.edu, k, v)
    for (const [k, v] of Object.entries(c.flags)) add(st.flags, k, v)
    for (const [k, v] of Object.entries(c.lang)) add(st.lang, k, v)
    for (const [k, v] of Object.entries(c.co)) add(st.companies, file.companies[+k] ?? 'Unknown', v)
    for (const [k, v] of Object.entries(c.certs)) add(st.certPairs, k, v)
    st.sal.push(...c.sal)
    add(st.seniority, c.s, c.n)
    add(st.remote, c.r, c.n)
    add(st.roles, c.role, c.n)
  }
  st.sal.sort((a, b) => a - b)
  for (const l of file.locations as LocCell[]) {
    const [, p, city, s, r, rows] = l
    if (!match(f, p, s, r)) continue
    st.locRows += rows
    add(st.provinces, p, rows)
    if (city) add(st.cities, `${city}, ${p}`, rows)
  }
  return st
}

export function top<K>(m: Map<K, number>, k: number, keep?: (key: K) => boolean): [K, number][] {
  return [...m.entries()].filter(([key]) => !keep || keep(key)).sort((a, b) => b[1] - a[1]).slice(0, k)
}

export function quantile(sorted: number[], q: number): number | undefined {
  if (!sorted.length) return undefined
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Years buckets for charts. yrs keys: "0".."10" or "none". */
export const YEAR_BUCKETS: { label: string; test: (y: number) => boolean }[] = [
  { label: '0–1 yrs', test: (y) => y <= 1 },
  { label: '2 yrs', test: (y) => y === 2 },
  { label: '3 yrs', test: (y) => y === 3 },
  { label: '4–5 yrs', test: (y) => y >= 4 && y <= 5 },
  { label: '6+ yrs', test: (y) => y >= 6 },
]

export function yearsStated(st: Stats): { stated: number; values: number[] } {
  const values: number[] = []
  for (const [k, v] of st.yrs) if (k !== 'none') for (let i = 0; i < v; i++) values.push(+k)
  values.sort((a, b) => a - b)
  return { stated: values.length, values }
}

/** Skills a person would study: drop soft skills, languages and job conditions. */
export const isLearnable = (s?: Skill) => !!s && !['soft', 'other', 'language'].includes(s.category)
