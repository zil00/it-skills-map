import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarList } from '../components/charts'
import { indexSkills } from '../components/panels'
import { FilterBar, Loading, Pct, Section, SmallSample } from '../components/ui'
import { aggregate, isLearnable } from '../lib/aggregate'
import { useRoles, useSkills, useSummary, usePageTitle } from '../lib/data'
import { useFilters } from '../lib/filters'
import { fold, showPct } from '../lib/format'

const CATEGORY_LABEL: Record<string, string> = {
  cert: 'Certification',
  tool: 'Tool',
  platform: 'Platform',
  concept: 'Skill area',
  soft: 'Soft skill',
  language: 'Language',
  other: 'Condition',
}

export default function Skills() {
  usePageTitle('Skills explorer')
  const { data: skillList } = useSkills()
  const { data: summary, error } = useSummary()
  const { data: roles } = useRoles()
  const { filters } = useFilters()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const skills = useMemo(() => indexSkills(skillList ?? []), [skillList])
  const st = useMemo(() => summary && aggregate(summary, filters), [summary, filters])

  if (!skillList || !st || !roles || !summary) return <Loading error={error} />

  const ranked = [...skillList].sort((a, b) => (st.any.get(b.id) ?? 0) - (st.any.get(a.id) ?? 0))
  // Match the English name first, then other names (variants and French terms), ignoring accents.
  const needle = fold(q.trim())
  const aliasHit = new Map<number, string>()
  const list = !needle
    ? ranked
    : [
        ...ranked.filter((s) => fold(s.name).includes(needle)),
        ...ranked.filter((s) => {
          if (fold(s.name).includes(needle)) return false
          const hit = s.aka?.find((a) => fold(a).includes(needle))
          if (hit) aliasHit.set(s.id, hit)
          return !!hit
        }),
      ]
  const firstTech = ranked.find((s) => isLearnable(s)) ?? ranked[0]
  const selectedId = Number(params.get('skill')) || firstTech.id
  const skill = skills.get(selectedId)!

  const roleRows = roles
    .map((r) => {
      const rs = aggregate({ ...summary, cells: summary.cells.filter((c) => c.role === r.slug) }, filters)
      return { label: r.name, a: rs.req.get(selectedId) ?? 0, b: rs.nice.get(selectedId) ?? 0, n: rs.n }
    })
    .sort((x, y) => (y.n ? (y.a + y.b) / y.n : 0) - (x.n ? (x.a + x.b) / x.n : 0))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Skills explorer</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          Search a skill or certification to see which roles ask for it, and how often.
        </p>
      </div>
      <FilterBar n={st.n} />
      <SmallSample n={st.n} />

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="rounded-xl border border-line bg-card p-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search, e.g. Azure, CCNA, réseau"
            aria-label="Search skills"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-2 focus:outline-req"
          />
          <ul className="mt-2 max-h-[560px] overflow-y-auto text-sm">
            {list.map((s) => {
              const c = st.any.get(s.id) ?? 0
              return (
                <li key={s.id}>
                  <button
                    onClick={() =>
                      setParams(
                        (p) => {
                          const next = new URLSearchParams(p)
                          next.set('skill', String(s.id))
                          return next
                        },
                      )
                    }
                    className={`flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left ${
                      s.id === selectedId ? 'bg-req/10 font-medium text-link' : 'hover:bg-ink/5'
                    }`}
                  >
                    <span>
                      {s.name}
                      {aliasHit.has(s.id) && (
                        <span className="block text-xs font-normal text-ink-3">also called “{aliasHit.get(s.id)}”</span>
                      )}
                    </span>
                    <Pct count={c} n={st.n} className="shrink-0 text-xs font-normal text-ink-2" />
                  </button>
                </li>
              )
            })}
            {!list.length && <li className="px-2 py-3 text-ink-3">No skill matches “{q}”.</li>}
          </ul>
        </div>

        <div className="space-y-4">
          <Section title={skill.name} sub={CATEGORY_LABEL[skill.category]}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Big label="Mentioned in" count={st.any.get(selectedId) ?? 0} n={st.n} />
              <Big label="As a requirement" count={st.req.get(selectedId) ?? 0} n={st.n} />
              <Big label="As nice to have" count={st.nice.get(selectedId) ?? 0} n={st.n} />
            </div>
          </Section>
          <Section
            title={`Which roles ask for ${skill.name}`}
            sub="Share of each role's postings. Roles with fewer than 20 postings in this selection show counts instead."
          >
            <RoleBars rows={roleRows} />
          </Section>
        </div>
      </div>
    </div>
  )
}

function Big({ label, count, n }: { label: string; count: number; n: number }) {
  return (
    <div className="rounded-lg bg-surface p-3">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="text-xl font-semibold">
        <Pct count={count} n={n} />
      </div>
      <div className="text-xs text-ink-3">of all postings</div>
    </div>
  )
}

/** Each role has its own n, carried on each row. */
function RoleBars({ rows }: { rows: { label: string; a: number; b: number; n: number }[] }) {
  const big = rows.filter((r) => showPct(r.n))
  const small = rows.filter((r) => !showPct(r.n))
  return (
    <div className="space-y-1">
      <div className="mb-2 flex gap-4 text-xs text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-req" /> Required
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-nice" /> Nice to have
        </span>
      </div>
      <BarList rows={big} n={big[0]?.n ?? 0} series={['Required', 'Nice to have']} labelWidth={230} legend={false} fixedMax={100} />
      {small.length > 0 && (
        <p className="pt-2 text-xs text-ink-3">
          Too few postings for a %:{' '}
          {small.map((r) => `${r.label} (${r.a + r.b} of ${r.n})`).join(' · ')}
        </p>
      )}
    </div>
  )
}
