-- Schema from PROJECT_PLAN.md section 5. Idempotent (IF NOT EXISTS).
PRAGMA foreign_keys = ON;

-- ===================== RAW LAYER (append-only) =====================
CREATE TABLE IF NOT EXISTS scrape_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  apify_run_id     TEXT UNIQUE,
  apify_dataset_id TEXT,
  location         TEXT NOT NULL,
  date_filter      TEXT,
  raw_file         TEXT,
  run_date         TEXT NOT NULL,
  results_count    INTEGER
);

CREATE TABLE IF NOT EXISTS scrape_queries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id         INTEGER NOT NULL REFERENCES scrape_runs(id),
  keyword        TEXT NOT NULL,
  search_url     TEXT NOT NULL,
  results_count  INTEGER,
  UNIQUE (run_id, search_url)
);

CREATE TABLE IF NOT EXISTS raw_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        TEXT NOT NULL,
  run_id        INTEGER NOT NULL REFERENCES scrape_runs(id),
  scraped_at    TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  UNIQUE (job_id, run_id)
);
CREATE INDEX IF NOT EXISTS idx_raw_jobs_job_id ON raw_jobs(job_id);

-- ===================== REFERENCE TABLES =====================
CREATE TABLE IF NOT EXISTS roles (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  category  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS role_aliases (
  alias     TEXT PRIMARY KEY,
  role_id   INTEGER NOT NULL REFERENCES roles(id)
);
CREATE TABLE IF NOT EXISTS skills (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  category  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skill_aliases (
  alias     TEXT PRIMARY KEY,
  skill_id  INTEGER NOT NULL REFERENCES skills(id)
);

-- ===================== PROCESSED LAYER (rebuildable) =====================
CREATE TABLE IF NOT EXISTS extraction_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date        TEXT NOT NULL,
  model           TEXT,
  prompt_version  TEXT NOT NULL,
  jobs_processed  INTEGER,
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS companies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  linkedin_url    TEXT UNIQUE,
  industry        TEXT,
  employee_count  INTEGER,
  website         TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id                  TEXT PRIMARY KEY,
  title_raw           TEXT NOT NULL,
  role_id             INTEGER REFERENCES roles(id),
  company_id          INTEGER REFERENCES companies(id),
  location_raw        TEXT,
  city                TEXT,
  province            TEXT,
  country             TEXT DEFAULT 'CA',
  remote_type         TEXT CHECK (remote_type IN ('onsite','hybrid','remote','unknown')),
  employment_type     TEXT,
  seniority           TEXT CHECK (seniority IN ('entry','mid','senior','lead','unknown')),
  language            TEXT,
  years_exp_min       REAL,
  years_exp_max       REAL,
  education           TEXT,
  bilingual_required  INTEGER,
  security_clearance  INTEGER,
  drivers_license     INTEGER,
  shift_or_oncall     INTEGER,
  salary_min          REAL,
  salary_max          REAL,
  salary_period       TEXT,
  salary_currency     TEXT DEFAULT 'CAD',
  salary_source       TEXT,
  posted_at           TEXT,
  first_seen          TEXT NOT NULL,
  last_seen           TEXT NOT NULL,
  applicants          INTEGER,
  linkedin_seniority  TEXT,
  url                 TEXT,
  description         TEXT,
  extraction_run_id   INTEGER REFERENCES extraction_runs(id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_role     ON jobs(role_id);
CREATE INDEX IF NOT EXISTS idx_jobs_province ON jobs(province);
CREATE INDEX IF NOT EXISTS idx_jobs_posted   ON jobs(posted_at);

CREATE TABLE IF NOT EXISTS job_skills (
  job_id    TEXT    NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id  INTEGER NOT NULL REFERENCES skills(id),
  required  INTEGER NOT NULL DEFAULT 1,
  raw_text  TEXT,
  PRIMARY KEY (job_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_job_skills_skill ON job_skills(skill_id);

CREATE TABLE IF NOT EXISTS unmapped_skills (
  raw_text    TEXT PRIMARY KEY,
  times_seen  INTEGER NOT NULL DEFAULT 1,
  first_seen  TEXT NOT NULL
);

-- ===================== VIEWS =====================
CREATE VIEW IF NOT EXISTS v_skill_demand AS
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

CREATE VIEW IF NOT EXISTS v_salary AS
SELECT r.name AS role, j.province, COUNT(*) AS n,
       ROUND(AVG(j.salary_min)) AS avg_min,
       ROUND(AVG(j.salary_max)) AS avg_max
FROM jobs j JOIN roles r ON r.id = j.role_id
WHERE j.salary_min IS NOT NULL AND j.salary_period = 'year'
GROUP BY r.id, j.province;

CREATE VIEW IF NOT EXISTS v_weekly_volume AS
SELECT r.name AS role, strftime('%Y-%W', j.posted_at) AS week, COUNT(*) AS postings
FROM jobs j JOIN roles r ON r.id = j.role_id
GROUP BY r.id, week;
