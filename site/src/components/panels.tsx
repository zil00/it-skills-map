import { isLearnable, quantile, top, YEAR_BUCKETS, yearsStated, type Stats } from '../lib/aggregate'
import { EDU_LABEL, EDU_ORDER, money, REMOTE_LABEL, SENIORITY_LABEL, showPct } from '../lib/format'
import type { Meta, Skill } from '../lib/types'
import { BarList, ColumnChart } from './charts'
import { Pct, RankList, Section } from './ui'

export type SkillIndex = Map<number, Skill>
export const indexSkills = (list: Skill[]) => new Map(list.map((s) => [s.id, s]))

export function skillRows(st: Stats, skills: SkillIndex, k: number, keep: (s?: Skill) => boolean) {
  return top(st.any, k, (id) => keep(skills.get(id))).map(([id]) => ({
    label: skills.get(id)?.name ?? `#${id}`,
    a: st.req.get(id) ?? 0,
    b: st.nice.get(id) ?? 0,
  }))
}

export function SkillsPanel({ st, skills, k = 15, title = 'Most-asked skills' }: { st: Stats; skills: SkillIndex; k?: number; title?: string }) {
  const rows = skillRows(st, skills, k, (s) => isLearnable(s) && s?.category !== 'cert')
  return (
    <Section
      title={title}
      sub="Share of postings that mention each skill. Blue = listed as required, orange = listed as nice to have."
    >
      <BarList rows={rows} n={st.n} series={['Required', 'Nice to have']} />
    </Section>
  )
}

export function CertsPanel({ st, skills, k = 8 }: { st: Stats; skills: SkillIndex; k?: number }) {
  const rows = skillRows(st, skills, k, (s) => s?.category === 'cert')
  const anyCert = st.n // shown as context
  return (
    <Section title="Certifications" sub="Share of postings that name each certification (required or nice to have).">
      <BarList rows={rows} n={anyCert} series={['Required', 'Nice to have']} labelWidth={200} />
    </Section>
  )
}

export function YearsPanel({ st }: { st: Stats }) {
  const { stated, values } = yearsStated(st)
  const rows = YEAR_BUCKETS.map((b) => ({ label: b.label, a: values.filter(b.test).length }))
  const med = quantile(values, 0.5)
  return (
    <Section
      title="Years of experience asked for"
      sub={
        <>
          Out of the {stated} postings that state a minimum ({st.n - stated} don't say).
          {med !== undefined && showPct(stated) && <> Typical ask: <strong>{fmtYears(med)}</strong>.</>}
        </>
      }
    >
      <ColumnChart rows={rows} n={stated} />
    </Section>
  )
}

export const fmtYears = (y: number) => (y === 0 ? 'no experience' : `${Math.round(y * 2) / 2}${y >= 10 ? '+' : ''} year${y === 1 ? '' : 's'}`)

export function SeniorityPanel({ st, meta }: { st: Stats; meta: Meta }) {
  const rows = meta.seniority.map((s) => ({ label: SENIORITY_LABEL[s], a: st.seniority.get(s) ?? 0 }))
  return (
    <Section title="Seniority mix" sub="From the job title, then years asked for, then LinkedIn's level.">
      <ColumnChart rows={rows} n={st.n} />
    </Section>
  )
}

export function EducationPanel({ st }: { st: Stats }) {
  return (
    <Section title="Education" sub="The lowest level a posting requires. Many accept equivalent experience.">
      <ul className="space-y-2 text-sm">
        {EDU_ORDER.filter((e) => st.edu.get(e)).map((e) => (
          <li key={e} className="flex justify-between gap-4">
            <span>{EDU_LABEL[e]}</span>
            <Pct count={st.edu.get(e) ?? 0} n={st.n} className="font-medium" />
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function RemotePanel({ st, meta }: { st: Stats; meta: Meta }) {
  const known = meta.remote.filter((r) => r !== 'unknown').reduce((s, r) => s + (st.remote.get(r) ?? 0), 0)
  const rows = meta.remote.filter((r) => r !== 'unknown').map((r) => ({ label: REMOTE_LABEL[r], a: st.remote.get(r) ?? 0 }))
  return (
    <Section
      title="On-site, hybrid or remote"
      sub={`Out of the ${known} postings that say (${st.n - known} don't).`}
    >
      <BarList rows={rows} n={known} labelWidth={90} />
    </Section>
  )
}

export function ProvincePanel({ st, meta }: { st: Stats; meta: Meta }) {
  const rows = top(st.provinces, 14).map(([p, v]) => ({ label: meta.provinces[p] ?? p, a: v }))
  return (
    <Section
      title="Where the jobs are"
      sub="By province. A posting listed in several cities counts once per city here."
    >
      <BarList rows={rows} n={st.locRows} labelWidth={170} />
    </Section>
  )
}

export function SalaryText({ st }: { st: Stats }) {
  const n = st.sal.length
  if (!n) return <>Not enough data</>
  if (!showPct(n)) return <>{n} posting{n === 1 ? '' : 's'} list pay: too few to summarize</>
  return (
    <>
      {money(quantile(st.sal, 0.25))} – {money(quantile(st.sal, 0.75))}
    </>
  )
}

export function SalaryPanel({ st }: { st: Stats }) {
  const n = st.sal.length
  return (
    <Section
      title="Pay"
      sub={`Only ${n} of ${st.n} postings list pay. Hourly pay is converted at 2,080 hours a year. Range = middle half of postings.`}
    >
      {showPct(n) ? (
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            ['Lower quarter', quantile(st.sal, 0.25)],
            ['Middle (median)', quantile(st.sal, 0.5)],
            ['Upper quarter', quantile(st.sal, 0.75)],
          ].map(([label, v]) => (
            <div key={label as string} className="rounded-lg bg-surface p-3">
              <div className="text-xs text-ink-2">{label}</div>
              <div className="text-xl font-semibold tabular-nums">{money(v as number)}</div>
            </div>
          ))}
          <p className="col-span-3 text-xs text-ink-3">Based on n = {n} postings with pay listed.</p>
        </div>
      ) : (
        <p className="text-sm text-ink-2">Fewer than 20 postings with pay in this selection, so no range is shown.</p>
      )}
    </Section>
  )
}

export function CompaniesCities({ st }: { st: Stats }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="Companies hiring" sub="Unique postings per company.">
        <RankList rows={top(st.companies, 10)} />
      </Section>
      <Section title="Cities" sub="Every city a posting lists.">
        <RankList rows={top(st.cities, 10)} />
      </Section>
    </div>
  )
}
