import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CertsPanel,
  CompaniesCities,
  EducationPanel,
  fmtYears,
  indexSkills,
  SalaryPanel,
  SalaryText,
  SeniorityPanel,
  SkillsPanel,
  YearsPanel,
  type SkillIndex,
} from '../components/panels'
import { FilterBar, Loading, Pct, Section, SmallSample, StatCard } from '../components/ui'
import { aggregate, isLearnable, quantile, top, yearsStated, type Stats } from '../lib/aggregate'
import { useMeta, useRole, useSkills } from '../lib/data'
import { useFilters } from '../lib/filters'
import { FLAG_LABEL, showPct } from '../lib/format'

export default function Role() {
  const { slug = '' } = useParams()
  const { data: meta } = useMeta()
  const { data: role, error } = useRole(slug)
  const { data: skillList } = useSkills()
  const { filters } = useFilters()
  const skills = useMemo(() => indexSkills(skillList ?? []), [skillList])
  const st = useMemo(() => role && aggregate(role, filters), [role, filters])

  if (error) return <NotFound />
  if (!meta || !role || !st || !skillList) return <Loading />

  const yrs = yearsStated(st)
  const medYears = quantile(yrs.values, 0.5)

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-req hover:underline">
          ← All roles
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{role.name}</h1>
        <p className="mt-2 max-w-2xl text-ink-2">{role.blurb}</p>
        {role.includes.length > 1 && (
          <p className="mt-2 text-sm text-ink-3">Includes: {role.includes.join(', ')}</p>
        )}
      </div>

      <FilterBar n={st.n} />
      <SmallSample n={st.n} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Job postings" value={st.n} note={`${st.locRows} counting each city listed`} />
        <StatCard
          label="Typical experience asked"
          value={medYears !== undefined && showPct(yrs.stated) ? fmtYears(medYears) : '—'}
          note={`median of n = ${yrs.stated} postings that state years`}
        />
        <StatCard
          label="Need English + French"
          value={<Pct count={st.flags.get('bilingual') ?? 0} n={st.n} />}
        />
        <StatCard label="Pay (middle half)" value={<SalaryText st={st} />} note={`n = ${st.sal.length} postings that list pay`} />
      </div>

      <SkillsPanel st={st} skills={skills} />
      <div className="grid gap-4 lg:grid-cols-2">
        <CertsPanel st={st} skills={skills} />
        <div className="space-y-4">
          <EducationPanel st={st} />
          <ConditionsPanel st={st} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <YearsPanel st={st} />
        <SeniorityPanel st={st} meta={meta} />
      </div>
      <SalaryPanel st={st} />
      <CompaniesCities st={st} />
      <LearnFirst slug={role.slug} name={role.name} st={st} skills={skills} />
    </div>
  )
}

function ConditionsPanel({ st }: { st: Stats }) {
  return (
    <Section title="Other requirements" sub="Conditions some postings add.">
      <ul className="space-y-2 text-sm">
        {Object.keys(FLAG_LABEL).map((f) => (
          <li key={f} className="flex justify-between gap-4">
            <span>{FLAG_LABEL[f]}</span>
            <Pct count={st.flags.get(f) ?? 0} n={st.n} className="font-medium" />
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** Picks what to study first: the most-requested certs and required technical skills. */
export function learnList(st: Stats, skills: SkillIndex) {
  const certs = top(st.any, 3, (id) => skills.get(id)?.category === 'cert').filter(([, c]) => c >= 2 && c / st.n >= 0.05)
  const techs = top(st.req, 7, (id) => isLearnable(skills.get(id)) && skills.get(id)?.category !== 'cert').filter(
    ([, c]) => c >= 2,
  )
  return { certs, techs }
}

function LearnFirst({ slug, name, st, skills }: { slug: string; name: string; st: Stats; skills: SkillIndex }) {
  const key = `learn:${slug}`
  const [done, setDone] = useState<Set<number>>(() => new Set(JSON.parse(localStorage.getItem(key) ?? '[]')))
  const toggle = (id: number) => {
    const next = new Set(done)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDone(next)
    localStorage.setItem(key, JSON.stringify([...next]))
  }
  const { certs, techs } = learnList(st, skills)
  const item = (id: number, count: number, why: string) => (
    <li key={id}>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface">
        <input
          type="checkbox"
          checked={done.has(id)}
          onChange={() => toggle(id)}
          className="mt-1 h-4 w-4 accent-req"
        />
        <span className="flex-1">
          <span className={`font-medium ${done.has(id) ? 'text-ink-3 line-through' : ''}`}>{skills.get(id)?.name}</span>
          <span className="block text-xs text-ink-2">
            {why} <Pct count={count} n={st.n} /> of postings
          </span>
        </span>
      </label>
    </li>
  )
  return (
    <section className="rounded-xl border-2 border-req/40 bg-req/5 p-5 sm:p-6">
      <h2 className="text-xl font-semibold">What to learn first for {name}</h2>
      <p className="mt-1 text-sm text-ink-2">
        The skills and certifications these postings ask for most. Tick them off as you go: your progress is saved in
        this browser.
      </p>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-2">Skills</h3>
          <ol className="space-y-0.5">{techs.map(([id, c]) => item(id, c, 'Required in'))}</ol>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-2">Certifications</h3>
          {certs.length ? (
            <ol className="space-y-0.5">{certs.map(([id, c]) => item(id, c, 'Named in'))}</ol>
          ) : (
            <p className="px-2 text-sm text-ink-2">No certification shows up in at least 5% of these postings.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-ink-2">That role doesn't exist.</p>
      <Link to="/" className="mt-2 inline-block text-req hover:underline">
        See all roles
      </Link>
    </div>
  )
}
