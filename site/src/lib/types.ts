// Shapes of the JSON files written by scripts/export_site_data.py

export type Seniority = 'entry' | 'mid' | 'senior' | 'lead' | 'unknown'
export type Remote = 'onsite' | 'hybrid' | 'remote' | 'unknown'

/** Counts for one (role, province, seniority, remote) combination. Unique postings only. */
export interface Cell {
  role: string
  p: string
  s: Seniority
  r: Remote
  n: number
  req: Record<string, number> // skill id -> postings that require it
  nice: Record<string, number> // skill id -> postings that list it as nice-to-have
  yrs: Record<string, number> // "0".."10" (10 = 10+) or "none" -> postings
  edu: Record<string, number>
  flags: Record<string, number> // bilingual / clearance / license / shift
  lang: Record<string, number>
  sal: number[] // yearly salary midpoints
  co: Record<string, number> // company index -> postings
  certs: Record<string, number> // "A + B" cert pair -> postings
  empl: Record<string, number>
}

/** [role, province, city, seniority, remote, rows] — every row, repeats included */
export type LocCell = [string, string, string, Seniority, Remote, number]

export interface CellFile {
  companies: string[]
  cells: Cell[]
  locations: LocCell[]
}

export interface RoleMeta {
  slug: string
  name: string
  blurb: string
  includes: string[]
  postings: number
  rows: number
}

export type RoleFile = RoleMeta & CellFile

export interface Skill {
  id: number
  name: string
  category: 'cert' | 'concept' | 'tool' | 'platform' | 'soft' | 'other' | 'language'
}

export interface Meta {
  generated: string
  posted_from: string
  posted_to: string
  scrape_runs: number
  scrape_results: number
  scraped_on: string
  jobs_total_rows: number
  jobs_total_unique: number
  in_scope_rows: number
  in_scope_unique: number
  repeated_rows: number
  salary_postings: number
  extraction_version: string
  extraction_date: string
  min_n_for_percent: number
  hours_per_year: number
  skill_recall: { overall: number; english: number; french: number; precision: number }
  provinces: Record<string, string>
  seniority: Seniority[]
  remote: Remote[]
  career_path: string[]
}
