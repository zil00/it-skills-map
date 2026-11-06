export const MIN_N = 20

export const showPct = (n: number) => n >= MIN_N

export const pct = (count: number, n: number) => (n ? Math.round((100 * count) / n) : 0)

/** "42%" when the sample is big enough, otherwise undefined. */
export const pctOrNull = (count: number, n: number) => (showPct(n) ? `${pct(count, n)}%` : undefined)

export const money = (v?: number) => (v === undefined ? '—' : `$${Math.round(v / 1000)}k`)

export const num = (v: number) => v.toLocaleString('en-CA')

export const SENIORITY_LABEL: Record<string, string> = {
  entry: 'Entry-level',
  mid: 'Mid-level',
  senior: 'Senior',
  lead: 'Lead / manager',
  unknown: 'Not stated',
}

export const REMOTE_LABEL: Record<string, string> = {
  onsite: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
  unknown: 'Not stated',
}

export const EDU_LABEL: Record<string, string> = {
  none: 'No formal requirement',
  diploma: 'College diploma (or equivalent)',
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  unspecified: 'Not mentioned',
}

export const EDU_ORDER = ['none', 'diploma', 'bachelor', 'master', 'unspecified']

export const FLAG_LABEL: Record<string, string> = {
  bilingual: 'English + French required',
  shift: 'Shifts, evenings or on-call',
  license: "Driver's licence",
  clearance: 'Security clearance',
}

export function fmtDate(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Lower-case and strip accents, so "securite" finds "sécurité" and vice versa. */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
