import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtYears, indexSkills, SalaryText } from '../components/panels'
import { FilterBar, Loading, Pct, Section } from '../components/ui'
import { aggregate, isLearnable, quantile, top, yearsStated, type Stats } from '../lib/aggregate'
import { roleFile, useJsonMany, useMeta, useRoles, useSkills, useSummary, usePageTitle } from '../lib/data'
import { useFilters } from '../lib/filters'
import { MIN_N, money, pct, showPct } from '../lib/format'
import type { RoleFile } from '../lib/types'

const DEFAULT = ['help-desk-service-desk', 'it-support-specialist', 'systems-administrator']
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a']

export default function Compare() {
  usePageTitle('Compare roles')
  const { data: meta } = useMeta()
  const { data: roles } = useRoles()
  const { data: skillList } = useSkills()
  const { data: summary } = useSummary()
  const { filters } = useFilters()
  const [picked, setPicked] = useState<string[]>(DEFAULT)
  const [note, setNote] = useState('')
  const files = useJsonMany<RoleFile>(picked.map(roleFile))
  const skills = useMemo(() => indexSkills(skillList ?? []), [skillList])
  const stats = useMemo(() => files?.map((f) => aggregate(f, filters)), [files, filters])

  if (!meta || !roles || !skillList || !summary) return <Loading />

  const toggle = (slug: string) => {
    if (picked.includes(slug)) {
      if (picked.length <= 2) return setNote('Keep at least 2 roles to compare. Pick another role first, then remove this one.')
      setPicked(picked.filter((s) => s !== slug))
    } else {
      if (picked.length >= 3) return setNote('You can compare up to 3 roles. Remove one first by clicking it.')
      setPicked([...picked, slug])
    }
    setNote('')
  }
  const name = (slug: string) => roles.find((r) => r.slug === slug)?.name ?? slug

  // Skills to compare: the most-mentioned learnable skills across the picked roles.
  let rows: { id: number; shares: number[] }[] = []
  if (stats) {
    const ids = new Set<number>()
    for (const st of stats) for (const [id] of top(st.any, 12, (i) => isLearnable(skills.get(i)))) ids.add(id)
    rows = [...ids]
      .map((id) => ({ id, shares: stats.map((st) => (st.n ? (st.any.get(id) ?? 0) / st.n : 0)) }))
      .sort((a, b) => Math.max(...b.shares) - Math.max(...a.shares))
      .slice(0, 18)
  }

  const GLANCE: [string, (st: Stats) => React.ReactNode][] = [
    ['Postings', (st) => st.n],
    ['Entry-level postings', (st) => <Pct count={st.seniority.get('entry') ?? 0} n={st.n} />],
    ['Typical experience asked', (st) => medianYears(st)],
    [
      'Pay (middle half)',
      (st) => (
        <>
          <SalaryText st={st} /> <span className="text-xs font-normal text-ink-3">(n={st.sal.length})</span>
        </>
      ),
    ],
    ['Need English + French', (st) => <Pct count={st.flags.get('bilingual') ?? 0} n={st.n} />],
  ]
  const SharedTag = ({ r }: { r: { shares: number[] } }) =>
    r.shares.every((x) => x >= 0.2) ? (
      <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs text-ink-2">Shared</span>
    ) : (
      <span className="min-w-0 text-xs text-ink-3">
        Mostly {name(picked[r.shares.indexOf(Math.max(...r.shares))])}
      </span>
    )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compare roles</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          Pick 2 or 3 roles to see which skills carry over and which are specific to one job.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {roles.map((r) => {
          const i = picked.indexOf(r.slug)
          return (
            <button
              key={r.slug}
              onClick={() => toggle(r.slug)}
              aria-pressed={i >= 0}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                i >= 0 ? 'border-ink bg-white font-medium' : 'border-line text-ink-2 hover:border-ink-3'
              } ${i < 0 && picked.length >= 3 ? 'opacity-50' : ''}`}
            >
              {i >= 0 && <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />}
              {r.name}
            </button>
          )
        })}
      </div>
      <p className={`-mt-3 text-xs ${note ? 'font-medium text-amber-800' : 'text-ink-3'}`} role="status" aria-live="polite">
        {note || 'Pick 2 or 3 roles. Click a selected role to remove it.'}
      </p>

      <FilterBar />
      {stats && stats.some((st) => !showPct(st.n)) && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          With these filters,{' '}
          {andList(
            stats
              .map((st, i) => [st, i] as const)
              .filter(([st]) => !showPct(st.n))
              .map(([st, i]) => `${name(picked[i])} has ${st.n === 0 ? 'no postings' : `only ${st.n} posting${st.n === 1 ? '' : 's'}`}`),
          )}
          . Percentages are hidden below {MIN_N} postings, so counts are shown instead. Try widening the filters.
        </p>
      )}

      {!stats ? (
        <Loading />
      ) : (
        <>
          <Section title="At a glance">
            {/* Phones: one block per measure, one line per role. */}
            <dl className="divide-y divide-line text-sm md:hidden">
              {GLANCE.map(([label, cell]) => (
                <div key={label} className="py-2.5">
                  <dt className="mb-1 text-ink-2">{label}</dt>
                  {stats.map((st, i) => (
                    <dd key={i} className="flex items-baseline gap-2 py-0.5">
                      <RoleDot i={i} />
                      <span className="min-w-0 flex-1 truncate text-ink-2">{name(picked[i])}</span>
                      <span className="shrink-0 font-medium tabular-nums">{cell(st)}</span>
                    </dd>
                  ))}
                </div>
              ))}
            </dl>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-2">
                    <th className="py-2 pr-4 font-normal"><span className="sr-only">Measure</span></th>
                    {picked.map((s, i) => (
                      <th key={s} className="py-2 pr-4 align-bottom font-semibold text-ink">
                        <RoleDot i={i} /> {name(s)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {GLANCE.map(([label, cell]) => (
                    <GlanceRow key={label} label={label} stats={stats} cell={cell} />
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Skills side by side"
            sub="Share of each role's postings that mention the skill (required or nice to have). “Shared” = at least 20% in every role picked."
          >
            {/* Phones: one block per skill, one bar per role. */}
            <div className="md:hidden">
              <Legend names={picked.map(name)} />
              <ul className="divide-y divide-line text-sm">
                {rows.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="font-medium">{skills.get(r.id)?.name}</span>
                      <SharedTag r={r} />
                    </div>
                    {stats.map((st, i) => (
                      <div key={i} className="flex items-center gap-2 py-0.5">
                        <span className="sr-only">{name(picked[i])}:</span>
                        <ShareBar count={st.any.get(r.id) ?? 0} n={st.n} color={COLORS[i]} wide />
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-2">
                    <th className="py-2 pr-3 align-bottom font-normal">Skill</th>
                    {picked.map((s, i) => (
                      <th key={s} className="py-2 pr-3 align-bottom font-normal">
                        <RoleDot i={i} /> {name(s)}
                      </th>
                    ))}
                    <th className="py-2 font-normal"><span className="sr-only">Shared or role-specific</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3 font-medium">{skills.get(r.id)?.name}</td>
                      {stats.map((st, i) => (
                        <td key={i} className="py-2 pr-3">
                          <ShareBar count={st.any.get(r.id) ?? 0} n={st.n} color={COLORS[i]} />
                        </td>
                      ))}
                      <td className="py-2 text-xs">
                        <SharedTag r={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      <CareerPath summary={summary} />
    </div>
  )

  function CareerPath({ summary }: { summary: NonNullable<ReturnType<typeof useSummary>['data']> }) {
    const steps = meta!.career_path.map((slug) => {
      const st = aggregate({ ...summary, cells: summary.cells.filter((c) => c.role === slug) }, filters)
      return { slug, st }
    })
    return (
      <Section
        title="A common career path"
        sub="One typical way people move up from IT support. Network and systems administration are two common branches; many people take one or the other before moving into security. Each step shows what postings ask for, and the skills that become common at that step."
      >
        <ol className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          {steps.map(({ slug, st }, i) => {
            const prev = i > 0 ? steps[i - 1].st : undefined
            const prevTop = new Set(prev ? top(prev.any, 10, (id) => isLearnable(skills.get(id))).map(([id]) => id) : [])
            const fresh = top(st.any, 10, (id) => isLearnable(skills.get(id)))
              .filter(([id]) => !prevTop.has(id))
              .slice(0, 3)
            return (
              <Fragment key={slug}>
                <li className="relative rounded-lg border border-line bg-surface p-3">
                  <div className="text-xs text-ink-3">Step {i + 1}</div>
                  <Link to={`/roles/${slug}`} className="font-semibold leading-snug text-req hover:underline">
                    {name(slug)}
                  </Link>
                  <dl className="mt-2 space-y-1 text-xs">
                    <div>
                      <dt className="inline text-ink-2">Experience: </dt>
                      <dd className="inline font-medium">{medianYears(st)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-ink-2">Median pay: </dt>
                      <dd className="inline font-medium">
                        {showPct(st.sal.length) ? money(quantile(st.sal, 0.5)) : '—'}
                      </dd>
                      <span className="text-ink-3"> (n={st.sal.length})</span>
                    </div>
                  </dl>
                  {fresh.length > 0 && (
                    <p className="mt-2 text-xs text-ink-2">
                      <span className="text-ink-3">{i ? 'New at this step: ' : 'Starts with: '}</span>
                      {fresh.map(([id]) => skills.get(id)?.name).join(', ')}
                    </p>
                  )}
                </li>
              </Fragment>
            )
          })}
        </ol>
      </Section>
    )
  }
}

/** ["a"] -> "a", ["a","b"] -> "a and b", ["a","b","c"] -> "a; b and c" (role names contain commas). */
const andList = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join('; ')} and ${xs[xs.length - 1]}`)

function medianYears(st: Stats) {
  const y = yearsStated(st)
  const m = quantile(y.values, 0.5)
  if (m === undefined || !showPct(y.stated)) return <span className="text-ink-3">— (n={y.stated})</span>
  return (
    <>
      {fmtYears(m)} <span className="text-xs font-normal text-ink-3">(n={y.stated})</span>
    </>
  )
}

function RoleDot({ i }: { i: number }) {
  return (
    <span className="mr-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full align-middle" style={{ background: COLORS[i] }} />
  )
}

function GlanceRow({ label, stats, cell }: { label: string; stats: Stats[]; cell: (st: Stats) => React.ReactNode }) {
  return (
    <tr>
      <td className="py-2 pr-4 text-ink-2">{label}</td>
      {stats.map((st, i) => (
        <td key={i} className="py-2 pr-4 font-medium tabular-nums">
          {cell(st)}
        </td>
      ))}
    </tr>
  )
}

function Legend({ names }: { names: string[] }) {
  return (
    <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-hidden="true">
      {names.map((nm, i) => (
        <span key={nm} className="flex items-center">
          <RoleDot i={i} /> {nm}
        </span>
      ))}
    </div>
  )
}

function ShareBar({ count, n, color, wide }: { count: number; n: number; color: string; wide?: boolean }) {
  const p = pct(count, n)
  return (
    <div className={`flex items-center gap-2 ${wide ? 'flex-1' : ''}`}>
      <div className={`h-2 overflow-hidden rounded-full bg-black/5 ${wide ? 'flex-1' : 'w-16 lg:w-20'}`}>
        {showPct(n) && <div className="h-full rounded-full" style={{ width: `${p}%`, background: color }} />}
      </div>
      <Pct count={count} n={n} className="text-xs" />
    </div>
  )
}
