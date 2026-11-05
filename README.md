# IT Skills Map

What do Canadian entry-level and early-career IT jobs actually ask for?

**Live site:** https://zil00.github.io/it-skills-map/

IT Skills Map reads about 1,600 public LinkedIn job postings from across Canada
(posted October 7 – November 5, 2026) and shows, for 10 IT roles, which skills,
certifications, experience and education employers ask for, what they pay, and
where the jobs are.

## How it works

1. **Scrape:** a one-time run of the Apify `curious_coder/linkedin-jobs-scraper`
   actor (`scripts/scrape.py`).
2. **Load:** raw results go into SQLite (`scripts/load.py`, `scripts/basic_fields.py`),
   and repeated postings are grouped (`scripts/dedupe.py`).
3. **Extract:** rule-based matching pulls skills, experience, education, remote
   type and salary from each description (`scripts/extract.py`).
4. **Export:** only aggregate counts are written to JSON
   (`scripts/export_site_data.py`), and no job descriptions or names leave the database.
5. **Site:** React + TypeScript + Vite + Tailwind + Recharts in `site/`, deployed
   to GitHub Pages by `.github/workflows/deploy.yml`.

The raw data and the database are not in this repository.

## Run the site locally

```bash
cd site
npm install
npm run dev
```

## Limitations

- One month of public LinkedIn postings, not the whole job market.
- Skill matching is rule-based: about 92% recall on English postings and about
  70% on French ones.
- Salary appears only where the posting states it.

See `PROJECT_PLAN.md` for the full design.
