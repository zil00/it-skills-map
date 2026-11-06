import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BarList } from '../components/charts'
import { CertsPanel, EducationPanel, indexSkills, SalaryText, SkillsPanel, YearsPanel } from '../components/panels'
import { FilterBar, Loading, Pct, Section, SmallSample, StatCard } from '../components/ui'
import { aggregate, top, yearsStated } from '../lib/aggregate'
import { useEntry, useRoles, useSkills, usePageTitle } from '../lib/data'
import { useFilters } from '../lib/filters'

export default function BreakingIn() {
  usePageTitle('Breaking in')
  const { data: entry, error } = useEntry()
  const { data: skillList } = useSkills()
  const { data: roles } = useRoles()
  const { filters } = useFilters()
  const skills = useMemo(() => indexSkills(skillList ?? []), [skillList])
  // This page is entry-level only, so the seniority filter is ignored here.
  const st = useMemo(() => entry && aggregate(entry, { ...filters, seniority: '' }), [entry, filters])

  if (!entry || !st || !skillList || !roles) return <Loading error={error} />

  const yrs = yearsStated(st)
  const zeroToOne = yrs.values.filter((y) => y <= 1).length
  const noDegree = (st.edu.get('none') ?? 0) + (st.edu.get('diploma') ?? 0) + (st.edu.get('unspecified') ?? 0)
  const roleName = (slug: string) => roles.find((r) => r.slug === slug)?.name ?? slug
  const roleRows = top(st.roles, 10).map(([slug, v]) => ({ label: roleName(slug), a: v }))
  const pairs = top(st.certPairs, 6)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Breaking in</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          Only entry-level postings: titles with junior, co-op, intern, apprentice or level 1, or postings that ask for 2
          years or less. What do employers expect from someone starting out?
        </p>
      </div>

      <FilterBar n={st.n} hideSeniority unit="entry-level postings" />
      <SmallSample n={st.n} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Entry-level postings" value={st.n} />
        <StatCard
          label="Ask for 0–1 years"
          value={<Pct count={zeroToOne} n={yrs.stated} />}
          note={`of n = ${yrs.stated} that state years`}
        />
        <StatCard
          label="No bachelor's degree required"
          value={<Pct count={noDegree} n={st.n} />}
          note="diploma, no formal requirement, or not mentioned"
        />
        <StatCard label="Pay (middle half)" value={<SalaryText st={st} />} note={`n = ${st.sal.length} postings that list pay`} />
      </div>

      <SkillsPanel st={st} skills={skills} k={12} title="Skills entry-level postings ask for" />
      <div className="grid gap-4 lg:grid-cols-2">
        <CertsPanel st={st} skills={skills} k={6} />
        <Section
          title="Common certification combos"
          sub="Pairs of certifications named in the same posting."
        >
          {pairs.length ? (
            <ul className="space-y-2 text-sm">
              {pairs.map(([pair, c]) => (
                <li key={pair} className="flex justify-between gap-4">
                  <span>{pair.split(' + ').join(' and ')}</span>
                  <Pct count={c} n={st.n} className="font-medium" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No posting in this selection names two certifications.</p>
          )}
          <p className="mt-4 text-xs text-ink-3">
            Most entry-level postings name no certification at all; when they do, it's usually one of the above.
          </p>
        </Section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <YearsPanel st={st} />
          <p className="px-1 text-xs text-ink-3">
            Asking for 2 years or less is one of the ways a posting counts as entry-level here, so few postings on this
            page ask for more.
          </p>
        </div>
        <EducationPanel st={st} />
      </div>
      <Section title="Roles with the most entry-level postings" sub="Click through for the full role page.">
        <BarList rows={roleRows} n={st.n} labelWidth={260} />
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {top(st.roles, 10).map(([slug]) => (
            <Link key={slug} to={`/roles/${slug}`} className="inline-block py-1 text-req hover:underline">
              {roleName(slug)} →
            </Link>
          ))}
        </div>
      </Section>
    </div>
  )
}
