import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtYears, indexSkills, SalaryText } from '../components/panels'
import { FilterBar, Loading, Pct, Section } from '../components/ui'
import { aggregate, isLearnable, quantile, top, yearsStated, type Stats } from '../lib/aggregate'
import { roleFile, useJsonMany, useMeta, useRoles, useSkills, useSummary } from '../lib/data'
import { useFilters } from '../lib/filters'
import { money, pct, showPct } from '../lib/format'
import type { RoleFile } from '../lib/types'

const DEFAULT = ['help-desk-service-desk', 'it-support-specialist', 'systems-administrator']
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a']

export default function Compare() {
  const { data: meta } = useMeta()
  const { data: roles } = useRoles()
  const { data: skillList } = useSkills()
  const { data: summary } = useSummary()
  const { filters } = useFilters()
  const [picked, setPicked] = useState<string[]>(DEFAULT)
  const files = useJsonMany<RoleFile>(picked.map(roleFile))
  const skills = useMemo(() => indexSkills(skillList ?? []), [skillList])
  const stats = useMemo(() => files?.map((f) => aggregate(f, filters)), [files, filters])

  if (!meta || !roles || !skillList || !summary) return <Loading />

  const toggle = (slug: string) =>
    setPicked((p) => (p.includes(slug) ? (p.length > 2 ? p.filter((s) => s !== slug) : p) : p.length < 3 ? [...p, slug] : p))
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
      <p className="-mt-3 text-xs text-ink-3">Up to 3 roles. Click a selected role to remove it.</p>

      <FilterBar />

      {!stats ? (
        <Loading />
      ) : (
        <>
          <Section title="At a glance">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-ink-2">
                    <th className="py-2 pr-4 font-normal"></th>
                    {picked.map((s, i) => (
                      <th key={s} className="py-2 pr-4 font-semibold text-ink">
                        <RoleDot i={i} /> {name(s)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <GlanceRow label="Postings" stats={stats} cell={(st) => st.n} />
                  <GlanceRow
                    label="Entry-level postings"
                    stats={stats}
                    cell={(st) => <Pct count={st.seniority.get('entry') ?? 0} n={st.n} />}
                  />
                  <GlanceRow label="Typical experience asked" stats={stats} cell={(st) => medianYears(st)} />
                  <GlanceRow label="Pay (middle half)" stats={stats} cell={(st) => (
                      <>
                        <SalaryText st={st} />{' '}
                        <span className="text-xs font-normal text-ink-3">(n={st.sal.length})</span>
                      </>
                    )} />
                  <GlanceRow
                    label="Need English + French"
                    stats={stats}
                    cell={(st) => <Pct count={st.flags.get('bilingual') ?? 0} n={st.n} />}
                  />
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Skills side by side"
            sub="Share of each role's postings that mention the skill (required or nice to have). “Shared” = at least 20% in every role picked."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="text-left text-ink-2">
                    <th className="py-2 pr-3 font-normal">Skill</th>
                    {picked.map((s, i) => (
                      <th key={s} className="py-2 pr-3 font-normal">
                        <RoleDot i={i} /> {name(s)}
                      </th>
                    ))}
                    <th className="py-2 font-normal"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => {
                    const shared = r.shares.every((s) => s >= 0.2)
                    const best = r.shares.indexOf(Math.max(...r.shares))
                    return (
                      <tr key={r.id}>
                        <td className="py-2 pr-3 font-medium">{skills.get(r.id)?.name}</td>
                        {stats.map((st, i) => (
                          <td key={i} className="py-2 pr-3">
                            <ShareBar count={st.any.get(r.id) ?? 0} n={st.n} color={COLORS[i]} />
                          </td>
                        ))}
                        <td className="py-2 text-xs">
                          {shared ? (
                            <span className="rounded-full bg-black/5 px-2 py-0.5 text-ink-2">Shared</span>
                          ) : (
                            <span className="text-ink-3">Mostly {name(picked[best])}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
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
        sub="One typical way people move up in IT support. Each step shows what postings ask for, and the skills that become common at that step."
      >
        <ol className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
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
  return <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: COLORS[i] }} />
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

function ShareBar({ count, n, color }: { count: number; n: number; color: string }) {
  const p = pct(count, n)
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-black/5">
        {showPct(n) && <div className="h-full rounded-full" style={{ width: `${p}%`, background: color }} />}
      </div>
      <Pct count={count} n={n} className="text-xs" />
    </div>
  )
}
