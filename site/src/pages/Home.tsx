import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CertsPanel, indexSkills, ProvincePanel, RemotePanel, SalaryText, skillRows, SkillsPanel } from '../components/panels'
import { FilterBar, Loading, Pct, SmallSample, StatCard } from '../components/ui'
import { aggregate, isLearnable } from '../lib/aggregate'
import { useMeta, useRoles, useSkills, useSummary } from '../lib/data'
import { useFilters } from '../lib/filters'
import { fmtDate, num } from '../lib/format'

export default function Home() {
  const { data: meta } = useMeta()
  const { data: roles } = useRoles()
  const { data: skillList } = useSkills()
  const { data: summary, error } = useSummary()
  const { filters } = useFilters()

  const skills = useMemo(() => indexSkills(skillList ?? []), [skillList])
  const st = useMemo(() => summary && aggregate(summary, filters), [summary, filters])
  const perRole = useMemo(() => {
    if (!summary || !roles) return new Map()
    return new Map(
      roles.map((r) => [r.slug, aggregate({ ...summary, cells: summary.cells.filter((c) => c.role === r.slug) }, filters)]),
    )
  }, [summary, roles, filters])

  if (!meta || !roles || !st || !skillList) return <Loading error={error} />

  return (
    <div className="space-y-6">
      <div className="pt-2">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">What do IT jobs in Canada actually ask for?</h1>
        <p className="mt-3 max-w-2xl text-ink-2">
          We read {num(meta.in_scope_unique)} entry-level and early-career IT job postings from across Canada (posted{' '}
          {fmtDate(meta.posted_from)} – {fmtDate(meta.posted_to)}) and counted the skills, certifications, experience and
          pay they mention. Pick a role to see what you need to get hired.
        </p>
      </div>

      <FilterBar n={st.n} />
      <SmallSample n={st.n} />

      <section>
        <h2 className="mb-3 text-xl font-semibold">Pick a role</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => {
            const rs = perRole.get(r.slug)!
            const topSkills = skillRows(rs, skills, 3, (s) => isLearnable(s) && s?.category !== 'cert')
            return (
              <Link
                key={r.slug}
                to={`/roles/${r.slug}`}
                className="group flex flex-col rounded-xl border border-line bg-white p-4 transition hover:border-req hover:shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold group-hover:text-req">{r.name}</h3>
                  <span className="shrink-0 text-xs text-ink-3 tabular-nums">{rs.n} postings</span>
                </div>
                <p className="mt-1 flex-1 text-sm text-ink-2">{r.blurb}</p>
                {topSkills.length > 0 && (
                  <p className="mt-3 text-xs text-ink-3">
                    Most asked: <span className="text-ink-2">{topSkills.map((s) => s.label).join(' · ')}</span>
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Job postings" value={num(st.n)} note={`${num(st.locRows)} counting each city listed`} />
        <StatCard
          label="Entry-level"
          value={<Pct count={st.seniority.get('entry') ?? 0} n={st.n} />}
          note="Junior, co-op, intern, or 0–2 years asked"
        />
        <StatCard
          label="Need English + French"
          value={<Pct count={st.flags.get('bilingual') ?? 0} n={st.n} />}
          note="Mostly Quebec and federal jobs"
        />
        <StatCard label="Typical pay (middle half)" value={<SalaryText st={st} />} note={`n = ${st.sal.length} postings that list pay`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SkillsPanel st={st} skills={skills} k={10} title="Top 10 skills" />
        <div className="space-y-4">
          <CertsPanel st={st} skills={skills} k={5} />
          <RemotePanel st={st} meta={meta} />
        </div>
      </div>
      <ProvincePanel st={st} meta={meta} />
    </div>
  )
}
