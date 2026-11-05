# IT Jobs Requirements Tracker — Project Plan

Living document. Each planning step adds to it. When planning is done, this file
becomes the build brief.

Last updated: 2026-11-05

---

## 1. Goal

Scrape IT job postings (Canada, LinkedIn) every week, extract what employers
actually require (certs, skills, experience, salary, remote/on-site), store it in
a SQL database, and publish a website showing the current requirements per role.

---

## 2. Data source — Apify `curious_coder/linkedin-jobs-scraper`

- Public LinkedIn job search (no LinkedIn login; do NOT use the logged-in
  "advanced" actor — risks the user's LinkedIn account).
- Input: LinkedIn search URL(s) with `keywords`, `location=Canada`,
  `geoId=101174742`, date filter `f_TPR` (r604800 = past week,
  r1814400 = past 3 weeks), `limitPerSource` (e.g. 200), `scrapeCompany`.
- Fields returned per job:
  `id, trackingId, refId, link, applyUrl, title, companyName,
  companyLinkedinUrl, companyLogo, location, postedAt, descriptionText,
  descriptionHtml, applicantsCount, salary, seniorityLevel, employmentType,
  industries, inputUrl, jobPosterName, jobPosterTitle, jobPosterPhoto,
  jobPosterProfileUrl` (+ company details when `scrapeCompany=true`:
  `companyEmployeesCount, companyAddress, companyDescription, companyWebsite`).
- NOT returned (must be extracted from `descriptionText`): skills list, certs,
  years of experience, education, remote/hybrid/on-site, bilingual requirement.
- Caveats: `salary` present only ~10% of the time; `seniorityLevel` often
  "Not Applicable"; `applicantsCount` capped ("25" = ≤25, "200" = 200+);
  ~1000 results max per search; ~14 KB per item.
- Cost reference: 99 jobs ≈ 0.01 compute units, ~75 s run.
- Access: scripts need `APIFY_TOKEN` env var (anonymous dataset download → 403).
  User sets the token themselves; never paste it into chat or commit it.
- Test dataset already scraped: run `4pWuwYF1kBMjMuOdJ`, dataset
  `WiMHa0Q1PEuuAamvw` — 99 "network engineer" jobs, Canada, past 3 weeks.

---

## 3. Scope

- Location: Canada (to confirm: other countries?).
- Frequency: weekly scrape, "past week" filter.
- Collect all seniority levels and employment types (co-op, internship,
  full-time, contract); store them as fields, filter later.
- French-language (Quebec) postings: TO DECIDE — include or not.

### Target roles (from the user's LinkedIn alerts)

Base titles only — junior/senior/co-op/internship removed (those are stored as
`seniority` / `employment_type` fields instead).

**Support and service desk**
- Help Desk Analyst
- Service Desk Analyst
- IT Support Specialist
- Technical Support
- Desktop Support

**Application and systems support**
- Application Support
- Software Support
- Product Support
- Systems Support

**Systems and infrastructure**
- Systems Administrator
- Infrastructure

**Network, security and operations**
- Network
- NOC Technician
- SOC Analyst
- Cybersecurity
- Telecommunications Technician

**General IT**
- IT
- Technology Analyst
- IT Apprentice

Note: "IT", "Network" and "Infrastructure" are areas rather than job titles;
they are covered by the specific search keywords below instead of being
searched on their own.

### Roles (14 canonical roles)

| # | Canonical role | Search keywords | Category |
|---|---|---|---|
| 1 | Help Desk Analyst | "help desk analyst", "help desk technician" | Support |
| 2 | Service Desk Analyst | "service desk analyst", "service desk agent" | Support |
| 3 | IT Support Specialist | "IT support specialist", "IT support analyst", "IT technician" | Support |
| 4 | Technical Support | "technical support analyst", "technical support specialist" | Support |
| 5 | Desktop Support | "desktop support", "deskside support" | Support |
| 6 | Application Support | "application support analyst" | App/Systems |
| 7 | Software / Product Support | "software support", "product support specialist" | App/Systems |
| 8 | Systems Support | "systems support analyst" | App/Systems |
| 9 | Systems Administrator | "systems administrator" | Infrastructure |
| 10 | NOC Technician | "NOC technician", "NOC analyst" | Network |
| 11 | Network Technician / Admin | "network technician", "network administrator" | Network |
| 12 | Telecommunications Technician | "telecommunications technician" | Network |
| 13 | SOC / Cybersecurity Analyst | "SOC analyst", "cybersecurity analyst" | Security |
| 14 | Technology Analyst | "technology analyst", "IT analyst" | General |

Dropped as search terms (too broad): "IT", "Network", "Infrastructure".
"IT Apprentice" captured via employment_type.
Expected volume: ~25 searches × ≤200 → ~1,500–3,000 unique jobs/week.

### Seed skill list

- Certs: CompTIA A+, Network+, Security+, CySA+, CCNA, ITIL 4,
  Microsoft MD-102, AZ-900, SC-900
- Platforms: Windows 10/11, macOS, Linux, Microsoft 365, Active Directory,
  Entra ID, Intune, SCCM/MECM, VMware, Azure, AWS
- Tools: ServiceNow, Jira, Zendesk, Remote Desktop/TeamViewer, Splunk,
  Microsoft Sentinel, Wireshark, PowerShell, SQL
- Concepts: TCP/IP, DNS/DHCP, VPN, LAN/WAN, firewalls, ticketing/SLA,
  incident response, SIEM, phishing triage
- Other: French/bilingual, driver's licence, security clearance, shift/on-call

---

## 4. Pipeline (Option A — decided)

```
Apify run
  └─► data/raw/<YYYY-MM-DD>_<query>.json     (one file per run, never edited — backup)
        └─► load script ─► scrape_runs + raw_jobs (payload_json)   [RAW layer]
              └─► rebuild script ─► companies, jobs (basic fields)  [PROCESSED layer]
                    └─► LLM extraction (prompt_version) ─► jobs requirement fields,
                        job_skills, unmapped_skills
                          └─► SQL views ─► website
```

Rules:
1. Store the entire Apify item as JSON (file + `payload_json`), not picked columns.
2. Raw layer is append-only; never edit raw rows or raw files.
3. Processed tables can be dropped and rebuilt from raw at any time.
4. Tag extracted rows with `extraction_run_id` / `prompt_version`.
5. Raw data (descriptions, recruiter names) stays private; website shows only
   aggregates + links to original postings (LinkedIn ToS / copyright).
6. Weekly QA: spot-check ~20 random extracted jobs; review `unmapped_skills`.

---

## 5. Database — SQLite, single file `jobs.db`

(Move to Postgres/Supabase only if the website needs live queries.)
Size estimate: ~150k jobs/year ≈ ~2 GB raw.

```sql
PRAGMA foreign_keys = ON;

-- ===================== RAW LAYER (append-only) =====================
-- One row per Apify actor run (a run contains many search URLs)
CREATE TABLE scrape_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  apify_run_id     TEXT UNIQUE,
  apify_dataset_id TEXT,
  location         TEXT NOT NULL,
  date_filter      TEXT,
  raw_file         TEXT,                 -- path to data/raw/*.json
  run_date         TEXT NOT NULL,
  results_count    INTEGER
);

-- One row per search URL inside a run (from each item's inputUrl)
CREATE TABLE scrape_queries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id         INTEGER NOT NULL REFERENCES scrape_runs(id),
  keyword        TEXT NOT NULL,          -- 'help desk analyst'
  search_url     TEXT NOT NULL,
  results_count  INTEGER,
  UNIQUE (run_id, search_url)
);

CREATE TABLE raw_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        TEXT NOT NULL,           -- LinkedIn job id
  run_id        INTEGER NOT NULL REFERENCES scrape_runs(id),
  scraped_at    TEXT NOT NULL,
  payload_json  TEXT NOT NULL,           -- full Apify item, untouched
  UNIQUE (job_id, run_id)
);
CREATE INDEX idx_raw_jobs_job_id ON raw_jobs(job_id);

-- ===================== REFERENCE TABLES =====================
CREATE TABLE roles (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  category  TEXT NOT NULL
);
CREATE TABLE role_aliases (
  alias     TEXT PRIMARY KEY,            -- lowercase raw title
  role_id   INTEGER NOT NULL REFERENCES roles(id)
);
CREATE TABLE skills (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  category  TEXT NOT NULL                -- cert/platform/tool/concept/language/soft/other
);
CREATE TABLE skill_aliases (
  alias     TEXT PRIMARY KEY,            -- lowercase: 'a+', 'comptia a plus'
  skill_id  INTEGER NOT NULL REFERENCES skills(id)
);

-- ===================== PROCESSED LAYER (rebuildable) =====================
CREATE TABLE extraction_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date        TEXT NOT NULL,
  model           TEXT,
  prompt_version  TEXT NOT NULL,
  jobs_processed  INTEGER,
  notes           TEXT
);

CREATE TABLE companies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  linkedin_url    TEXT UNIQUE,
  industry        TEXT,
  employee_count  INTEGER,
  website         TEXT
);

CREATE TABLE jobs (
  id                  TEXT PRIMARY KEY,
  title_raw           TEXT NOT NULL,
  role_id             INTEGER REFERENCES roles(id),
  company_id          INTEGER REFERENCES companies(id),
  location_raw        TEXT,
  city                TEXT,
  province            TEXT,
  country             TEXT DEFAULT 'CA',
  remote_type         TEXT CHECK (remote_type IN ('onsite','hybrid','remote','unknown')),
  employment_type     TEXT,              -- full-time/part-time/contract/co-op/internship/apprenticeship
  seniority           TEXT CHECK (seniority IN ('entry','mid','senior','lead','unknown')),
  language            TEXT,              -- en / fr
  years_exp_min       REAL,
  years_exp_max       REAL,
  education           TEXT,
  bilingual_required  INTEGER,
  security_clearance  INTEGER,
  drivers_license     INTEGER,
  shift_or_oncall     INTEGER,
  salary_min          REAL,
  salary_max          REAL,
  salary_period       TEXT,              -- year / hour
  salary_currency     TEXT DEFAULT 'CAD',
  salary_source       TEXT,              -- listed / description
  posted_at           TEXT,
  first_seen          TEXT NOT NULL,
  last_seen           TEXT NOT NULL,
  applicants          INTEGER,
  linkedin_seniority  TEXT,
  url                 TEXT,
  description         TEXT,              -- private
  extraction_run_id   INTEGER REFERENCES extraction_runs(id)
);
CREATE INDEX idx_jobs_role     ON jobs(role_id);
CREATE INDEX idx_jobs_province ON jobs(province);
CREATE INDEX idx_jobs_posted   ON jobs(posted_at);

CREATE TABLE job_skills (
  job_id    TEXT    NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id  INTEGER NOT NULL REFERENCES skills(id),
  required  INTEGER NOT NULL DEFAULT 1,
  raw_text  TEXT,
  PRIMARY KEY (job_id, skill_id)
);
CREATE INDEX idx_job_skills_skill ON job_skills(skill_id);

CREATE TABLE unmapped_skills (
  raw_text    TEXT PRIMARY KEY,
  times_seen  INTEGER NOT NULL DEFAULT 1,
  first_seen  TEXT NOT NULL
);

-- ===================== VIEWS (website reads only these) =====================
CREATE VIEW v_skill_demand AS
SELECT r.name AS role, s.name AS skill, s.category,
       COUNT(*) AS jobs_mentioning,
       ROUND(100.0 * COUNT(*) /
             (SELECT COUNT(*) FROM jobs j2 WHERE j2.role_id = r.id), 1) AS pct_of_role,
       SUM(js.required) AS times_required
FROM job_skills js
JOIN jobs j   ON j.id = js.job_id
JOIN roles r  ON r.id = j.role_id
JOIN skills s ON s.id = js.skill_id
GROUP BY r.id, s.id;

CREATE VIEW v_salary AS
SELECT r.name AS role, j.province, COUNT(*) AS n,
       ROUND(AVG(j.salary_min)) AS avg_min,
       ROUND(AVG(j.salary_max)) AS avg_max
FROM jobs j JOIN roles r ON r.id = j.role_id
WHERE j.salary_min IS NOT NULL AND j.salary_period = 'year'
GROUP BY r.id, j.province;

CREATE VIEW v_weekly_volume AS
SELECT r.name AS role, strftime('%Y-%W', j.posted_at) AS week, COUNT(*) AS postings
FROM jobs j JOIN roles r ON r.id = j.role_id
GROUP BY r.id, week;
```

---

## 6. Scrape

### Now: one-time scrape (DECIDED)

- One Apify run, 15 search URLs, Canada, **past month** (`f_TPR=r2592000`),
  `limitPerSource: 150`, `scrapeCompany: false`.
- Max 2,250 results × $0.002 = **$4.50**, fits the Apify Free plan's ~$5
  monthly credit (~$0.20 already used on the test run). Expect
  ~1,600–1,900 unique jobs after de-duplication.
- Download with a script using `APIFY_TOKEN` (not through the chat connector,
  to save Claude Pro usage).
- Optional first: a ~10-result test (~$0.02) of a combined
  `"help desk" OR "service desk" OR "IT support"` search to see if OR works.

| # | Keyword | Covers |
|---|---|---|
| 1 | `help desk` | Help Desk Analyst / Technician |
| 2 | `service desk` | Service Desk Analyst / Agent |
| 3 | `IT support` | IT Support Specialist / Analyst, IT Technician |
| 4 | `technical support analyst` | Technical Support |
| 5 | `desktop support` | Desktop / Deskside Support |
| 6 | `application support` | Application Support |
| 7 | `software support` | Software Support |
| 8 | `product support` | Product Support |
| 9 | `systems support` | Systems Support |
| 10 | `systems administrator` | Systems Administrator |
| 11 | `NOC` | NOC Technician / Analyst |
| 12 | `network administrator` | Network Admin / Technician |
| 13 | `telecommunications technician` | Telecommunications Technician |
| 14 | `SOC analyst` | SOC / Cybersecurity Analyst |
| 15 | `technology analyst` | Technology Analyst |

Dropped as separate searches (covered above): help desk technician, service
desk agent, IT technician, deskside support, NOC analyst, network technician,
cybersecurity analyst, IT analyst.

The data is a snapshot — the website must state the posting date range.

### Later (optional): weekly scrape

- ONE Apify run per week containing ~25 search URLs (one per keyword in the
  roles table), all `location=Canada`, `geoId=101174742`, `f_TPR=r604800`.
- `limitPerSource: 200` (applies per URL, not per run).
- Output → a single file `data/raw/<YYYY-MM-DD>_weekly.json`.
- Each item's `inputUrl` tells which search found it → `scrape_queries`
  row with keyword + results count (lets us drop keywords that return junk).
- The same job can appear in several searches: raw layer keeps every copy,
  `jobs` keeps one row per LinkedIn id.
- The search keyword does NOT decide the role — the extraction step does.
- Expected: ~1,500–3,000 unique jobs/week, ~0.3 Apify compute units
  (+ any per-result fee shown on the actor page).
- Runs from a script with `APIFY_TOKEN` on a schedule (Apify scheduler or
  GitHub Actions — to decide). Ad-hoc test runs can use the Apify connector.

---

## 7. Extraction

Three stages (only stage 3 uses AI):

```
① LOAD          raw JSON file ─► raw_jobs.payload_json        (copy, no changes)
② BASIC FIELDS  raw_jobs ─► jobs  (plain code)
③ EXTRACTION    jobs.description ─► jobs requirement fields + job_skills  (AI)
```

### Stage 2 — fields from Apify data (no AI)

| Field | Source |
|---|---|
| salary_min / max / period | parse `salary` when present (~10% of jobs) |
| city, province | split `location` ("Calgary, Alberta, Canada" → Calgary, AB) |
| employment_type, posted_at, applicants, linkedin_seniority | direct copy |
| language | language detection on description (en / fr) |
| company | `companyName`, `companyLinkedinUrl` |

### Stage 3 — DECIDED for v1: rule-based extraction (no API cost)

Built and tuned with Claude Code on the user's **Claude Pro** subscription.
Claude writes the code and reviews results; the computer does the bulk work,
so it doesn't use up Pro usage limits.

- Python script, keyword + pattern matching:
  - skill dictionary with aliases (`skills` + `skill_aliases` tables)
  - patterns for years of experience ("3+ years", "2-4 ans"), remote type,
    bilingual, clearance, driver's licence, shift/on-call, salary ranges,
    required vs nice-to-have ("asset", "preferred", "atout")
  - title → role mapping rules (`role_aliases`), else `out_of_scope`
- Runs on all jobs in seconds.
- Claude reviews ~30 random jobs + `unmapped_skills`, then improves the
  dictionary and rules; repeat until accuracy is good (target ~85–95% on
  common skills).
- `extraction_runs.model` = `'rules'`, `prompt_version` = rules version.

### Later option: Stage 3 via the Claude API (one call per job)

- Input: title, company, location, full description.
- Output: JSON validated by the Claude API's **structured outputs**
  (`output_config.format` with a JSON schema) — always valid JSON.
- Sent through the **Message Batches API** (50% cheaper; results usually
  within an hour, max 24 h).
- Fixed part of the prompt (rules + canonical skill list) placed first and
  **prompt-cached**.

Output schema (example values):

```json
{
  "role": "Service Desk Analyst",
  "seniority": "entry",
  "remote_type": "hybrid",
  "employment_type": "full-time",
  "years_exp_min": 1, "years_exp_max": 3,
  "education": "diploma",
  "bilingual_required": false,
  "security_clearance": false,
  "drivers_license": true,
  "shift_or_oncall": true,
  "salary": { "min": 52000, "max": 60000, "period": "year" },
  "skills": [
    { "name": "CompTIA A+", "required": false, "raw_text": "A+ certification an asset" },
    { "name": "Active Directory", "required": true, "raw_text": "experience with AD" }
  ]
}
```

- `role`: one of the 14 canonical roles or `"out_of_scope"`
- `seniority`: entry / mid / senior / lead / unknown
- `remote_type`: onsite / hybrid / remote / unknown
- `education`: none / diploma / bachelor / master / unspecified
- `salary`: null if not stated in the text

Prompt rules:
1. Extract only what is written; use null when not mentioned — never guess.
2. "asset", "preferred", "nice to have", "atout" → `required: false`.
3. Use canonical skill names from the provided list; if not on the list,
   return the skill as written (→ `unmapped_skills` for weekly review).
4. French postings → English canonical names.
5. Role must be one of the 14 roles or `out_of_scope`.

### Stage 3b — validation in code

- Map skill names through `skill_aliases`; unmatched → `unmapped_skills`.
- Sanity checks: years 0–20, salary_min ≤ salary_max, salary plausible for
  its period.
- Tag every row with `extraction_run_id` (model + `prompt_version`).

### Model choice (only if the API option is used): test Haiku vs Opus, pick by accuracy

1. Hand-label ~30 jobs from the existing 99-job dataset as an answer key
   (gold set).
2. Run the same prompt on **Claude Haiku 5.5** (`claude-haiku-5-5`) and
   **Claude Opus 5.5** (`claude-opus-5-5`).
3. Compare per field: role, seniority, remote_type, years, salary,
   skills (precision/recall), required vs nice-to-have.
4. If Haiku is close to Opus → use Haiku (~20× cheaper). Otherwise Opus,
   or Sonnet 5.5 (`claude-sonnet-5-5`) as a middle option worth testing.
5. Re-run the gold-set check every time the prompt changes.

Estimated cost, ~2,000 jobs/week, batched + cached:

| Model | $ per 1M tokens (in/out) | ≈ per week | ≈ per month |
|---|---|---|---|
| Claude Opus 5.5 | $4 / $20 | ~$15–20 | ~$60–80 |
| Claude Sonnet 5.5 | $2 / $10 | ~$8–10 | ~$35–40 |
| Claude Haiku 5.5 | $0.10 / $0.50 | ~$0.50–1 | ~$2–4 |

(Assumes ~1,000 tokens per description + cached prompt, ~400 output
tokens. Rough estimates — measure on the gold-set run.)

---

## 7b. Website

### Stack — DECIDED: React, hosted on GitHub Pages

| Piece | Choice | Why |
|---|---|---|
| Build tool | **Vite** + React | Simplest React setup for a static site; Next.js not needed (no server) |
| Language | **TypeScript** (DECIDED) | Types catch data-shape mistakes in the JSON |
| Charts | **Recharts** | React-native charts, good bar/pie/line support |
| Styling | **Tailwind CSS** | Fast to build a clean, mobile-friendly layout |
| Routing | React Router with **HashRouter** | GitHub Pages can't serve SPA routes on refresh; `/#/roles/help-desk` always works |
| Hosting | **GitHub Pages** via a GitHub Actions deploy workflow | Free; code doubles as a portfolio repo |

GitHub Pages notes:
- Repo name: **`it-skills-map`** (DECIDED). GitHub account: `zil00`
  (GitHub CLI already logged in on this machine).
- Site URL: `https://zil00.github.io/it-skills-map/`
- Set `base: '/it-skills-map/'` in `vite.config.ts`.

### Audience — DECIDED: a tool for other job seekers

- Written for people looking for entry-level / early-career IT jobs in Canada.
- Plain language, practical framing ("what do I need to get hired as X?").
- Home page leads with "pick a role" → role page, not with project details.
- Role pages end with an actionable checklist: most-asked certs/skills to
  learn first.
- Methodology lives on the About page, short and honest about limitations.
- Deploy: push to `main` → Actions builds → publishes `dist/`.

### Data flow

```
jobs.db (SQLite, private) ─► scripts/export_site_data.py ─► site/public/data/*.json ─► React app
```

- No server or live database; the site only reads pre-computed JSON.
- `jobs.db`, `data/raw/`, and descriptions are NOT committed to the public
  repo (`.gitignore`). Only aggregate JSON is published.

JSON files (one per view / page):
- `summary.json` — totals, date range, top skills/certs, remote split, provinces
- `roles.json` — list of roles with counts
- `roles/<role-slug>.json` — per-role stats (skills required/nice-to-have,
  certs, years, education, salary + n, bilingual %, seniority, companies, cities)
- `skills.json` — per-skill: which roles ask for it and how often
- `entry_level.json` — stats for entry/co-op/internship postings only
- `meta.json` — scrape date range, sample sizes, extraction version

### Pages — ACCEPTED by user (2026-11-05)

1. **Home / overview** — headline numbers, top 10 skills, top 5 certs,
   on-site/hybrid/remote, by province.
2. **Role pages** (one per role) — postings, seniority mix, years required,
   top skills (required vs nice-to-have), certs, education, bilingual %,
   salary range (with n), top companies and cities.
3. **Compare roles** — 2–3 roles side by side; shared vs different skills;
   career-path view (e.g. Help Desk → NOC → Network Admin).
4. **Skills explorer** — search a skill → roles asking for it and %.
5. **Breaking in** — entry-level / co-op postings only: requirements, % with
   0–1 years, common cert combinations.
6. **About / methodology** — source, dates, sample size, method, limitations.

Every page: filters for province, seniority, remote type; sample size shown
next to every percentage; percentages hidden when n < 20.

Not shown: full job descriptions or a copy of the job board (LinkedIn ToS /
copyright). At most, links to original postings.

### Project layout

```
it-skills-map/
├── data/raw/                 # Apify JSON (gitignored)
├── jobs.db                   # SQLite (gitignored)
├── scripts/                  # Python: load, extract, export_site_data
├── site/                     # React app (Vite)
│   ├── public/data/*.json    # exported aggregates (committed)
│   └── src/
│       ├── pages/            # Home, Role, Compare, Skills, BreakingIn, About
│       ├── components/       # charts, filters, stat cards
│       └── lib/              # data loading + types
└── .github/workflows/deploy.yml
```

---

## 8. Costs

Apify actor `curious_coder/linkedin-jobs-scraper` charges per result:
$0.002 on the Free plan, $0.001 on paid plans (+ negligible $0.00005 per run).
"$1 per 1,000" = per 1,000 job results, and only on a paid plan (~$39/month,
fee becomes usage credit). Free plan includes ~$5 credit/month (resets
monthly; runs stop when it runs out — no surprise charges).

v1 (current plan):

| Item | Cost |
|---|---|
| Apify one-time scrape (≤2,250 results) | $0 (inside free credit) |
| Extraction + SQL + website work | Claude Pro subscription (already paid) |
| Hosting (GitHub Pages / Netlify) | $0 |
| **Total extra** | **~$0** |

If it later becomes a weekly pipeline: Apify paid plan ~$39/month +
API extraction (Haiku ~$2–4/month or Opus ~$60–80/month).

---

## 9. Open questions

- [ ] Canada only, or other countries too?
- [ ] Include French-language (Quebec) postings?
- [ ] Script language: Python assumed — confirm
- [x] Website audience: tool for other job seekers
- [x] Repo name: `it-skills-map`
- [x] TypeScript
- [x] Project moved to permanent folder `C:\Users\sharz\it-skills-map`
- [ ] Scheduling (only if weekly later): Apify scheduler vs GitHub Actions
- [ ] Set `APIFY_TOKEN` (user does this; `ANTHROPIC_API_KEY` only if the
      API option is used later)

---

## 10. Planning log

- 2026-11-05 — Test scrape: 99 network engineer jobs (Canada, 3 weeks).
- 2026-11-05 — Defined 14 canonical roles from user's LinkedIn alerts.
- 2026-11-05 — Saved the user's target role list (base titles) in section 3.
- 2026-11-05 — Weekly scrape: one Apify run with ~25 search URLs; added
  `scrape_queries` table.
- 2026-11-05 — Extraction design: 3 stages, structured outputs, batches +
  caching. Model: test Haiku 5.5 vs Opus 5.5 on a 30-job gold set.
- 2026-11-05 — Changed to v1 = one-time scrape (15 keywords × 150, past
  month, Apify Free credit) + rule-based extraction built with Claude Pro.
  API extraction and weekly scraping moved to "later options". Added costs.
- 2026-11-05 — Started website design discussion.
- 2026-11-05 — Website: React (Vite) + GitHub Pages decided; pages, data
  flow (SQLite → JSON) and project layout added (section 7b).
- 2026-11-05 — Audience: job seekers. Repo `it-skills-map` (GitHub `zil00`).
  TypeScript.
- 2026-11-05 — User accepted all 6 pages and the data flow as proposed.
- 2026-11-05 — Decided SQLite with raw + processed layers in one file.
- 2026-11-05 — Decided Option A: raw JSON files → raw_jobs → processed tables.
- 2026-11-05 — Phase 1 built. OR-search test ($0.02): `"a" OR "b"` works on the
  public search. One-time scrape run `xgHw0bvsPZXB6vhcH`: 1,555 items, $3.11,
  posted 2026-10-07 → 2026-11-05. Rule-based extraction `rules-v3`: 986 in-scope
  jobs; held-out check (15 jobs) skill recall ~87% (EN ~92%, FR ~70%), precision ~97%.
