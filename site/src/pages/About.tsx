import { Loading, Section } from '../components/ui'
import { useMeta, useRoles, usePageTitle } from '../lib/data'
import { fmtDate, num } from '../lib/format'

export default function About() {
  usePageTitle('About the data')
  const { data: meta } = useMeta()
  const { data: roles } = useRoles()
  if (!meta || !roles) return <Loading />
  const r = meta.skill_recall
  const p = (x: number) => `${Math.round(x * 100)}%`

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">About the data</h1>
        <p className="mt-2 text-ink-2">How the numbers on this site were made, and where they can be wrong.</p>
      </div>

      <Section title="Where the postings come from">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>
            LinkedIn's public job search for Canada, collected once on {fmtDate(meta.scraped_on)} with the Apify
            “LinkedIn Jobs Scraper”. 15 searches for support, network, systems and security job titles, plus a top-up
            for help desk / service desk titles.
          </li>
          <li>
            Postings dated {fmtDate(meta.posted_from)} to {fmtDate(meta.posted_to)} (about one month).
          </li>
          <li>
            {num(meta.jobs_total_rows)} postings were collected; {num(meta.in_scope_rows)} match one of the{' '}
            {roles.length} roles on this site. Engineer, developer and business-analyst titles are left out to keep
            the focus on entry-level and early-career jobs.
          </li>
          <li>
            The same posting is often listed once per city. These repeats are counted once for all percentages (
            {num(meta.in_scope_unique)} unique postings; {num(meta.repeated_rows)} repeats removed), but every city is
            counted in the location charts.
          </li>
        </ul>
      </Section>

      <Section title="How skills are counted">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>
            Each description is scanned for a list of about 190 skills and certifications, each with its common
            spellings and French names (for example “backup”, “backups” and “sauvegarde” all count as Backup &amp; recovery).
          </li>
          <li>
            A skill is <strong>required</strong> unless it appears under a heading or in a sentence like “nice to
            have”, “asset”, “preferred” or “un atout”, in which case it's <strong>nice to have</strong>.
          </li>
          <li>
            Years of experience, education, remote/hybrid, seniority, pay and conditions (bilingual, shifts, licence,
            clearance) are found the same way. Pay comes from LinkedIn's salary field or from the description.
          </li>
          <li>
            Roles come from the job title. Small roles are grouped: Help Desk + Service Desk + Desktop Support, and
            Network + NOC + Telecom.
          </li>
          <li>Extraction version: {meta.extraction_version}.</li>
        </ul>
      </Section>

      <Section title="How to read the numbers">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>
            Every percentage shows its sample size next to it, for example <em>42% (50/120)</em> = 50 out of 120
            postings.
          </li>
          <li>
            When fewer than {meta.min_n_for_percent} postings match your filters, percentages are hidden and plain
            counts are shown, because a % of a handful of postings is mostly noise.
          </li>
          <li>Pay ranges show the middle 50% of postings that list pay (a quarter pay less, a quarter pay more); hourly pay is converted at 2,080 hours a year.</li>
        </ul>
      </Section>

      <Section title="Limitations">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>
            <strong>Keyword rules miss things.</strong> On a hand-checked sample, the rules caught about {p(r.overall)}{' '}
            of the skills a posting mentions ({p(r.english)} for English postings) and about {p(r.precision)} of what
            they caught was correct. So real percentages are likely a bit higher than shown.
          </li>
          <li>
            <strong>French postings are less accurate:</strong> about {p(r.french)} of skills caught, so Quebec numbers
            undercount skills more than other provinces.
          </li>
          <li>
            <strong>One month, one site.</strong> This is a snapshot of LinkedIn in fall 2026, not the whole job market.
            Jobs only posted on Indeed, Job Bank or company sites are missing.
          </li>
          <li>
            <strong>Many postings leave things out.</strong> Only {num(meta.salary_postings)} of{' '}
            {num(meta.in_scope_unique)} list pay, and many don't state years of experience or work arrangement. Those
            charts only use postings that say.
          </li>
          <li>
            “Required” means the posting lists it, not that you'll be rejected without it. Many employers hire people
            who meet most, not all, of the list.
          </li>
        </ul>
      </Section>

      <Section title="Privacy">
        <p className="text-sm">
          This site publishes only counts. Full job descriptions, recruiter names and the raw data are not published.
        </p>
      </Section>
    </div>
  )
}
