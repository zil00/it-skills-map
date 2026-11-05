"""Export aggregate JSON for the website (site/public/data/).

Only counts are exported: no descriptions, no recruiter names, no job URLs.

Stats are split into "cells": one cell per (website role, province, seniority,
remote type). Every number in a cell is a count, so the site can add cells
together to apply its province / seniority / remote filters.

- Percentages (skills, years, education, flags, salary) use v_jobs_unique:
  a posting repeated in several cities counts once.
- Location charts use every row, so each city a posting lists is counted.

Usage: python scripts/export_site_data.py
"""
import json
import sys
from collections import Counter, defaultdict
from datetime import date
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from init_db import ROOT, connect  # noqa: E402

OUT = ROOT / "site" / "public" / "data"

# 14 database roles -> 10 website roles (PROJECT_PLAN.md section 8b item 5).
SITE_ROLES = [
    ("technical-support", "Technical Support", [4],
     "Solve customers' technical problems with a product or service, by phone, chat or ticket."),
    ("systems-administrator", "Systems Administrator", [9],
     "Keep servers, user accounts, backups and core IT systems running."),
    ("soc-cybersecurity-analyst", "SOC / Cybersecurity Analyst", [13],
     "Watch security alerts, investigate incidents and help keep systems protected."),
    ("it-support-specialist", "IT Support Specialist", [3],
     "Support staff inside a company: laptops, accounts, software, printers and network access."),
    ("network-noc-telecom", "Network, NOC & Telecom", [11, 10, 12],
     "Install, monitor and fix networks, network equipment and telecom lines."),
    ("application-support", "Application Support", [6],
     "Support business applications: troubleshoot issues, run fixes and work with developers."),
    ("help-desk-service-desk", "Help Desk, Service Desk & Desktop Support", [1, 2, 5],
     "First point of contact for IT problems: tickets, password resets, setting up computers."),
    ("technology-analyst", "Technology Analyst", [14],
     "General IT analyst roles that mix support, systems and small projects."),
    ("systems-support", "Systems Support", [8],
     "Support and maintain specific business systems and the people who use them."),
    ("software-product-support", "Software / Product Support", [7],
     "Help customers use and troubleshoot a software product."),
]
ROLE_OF_DB = {db_id: slug for slug, _, ids, _ in SITE_ROLES for db_id in ids}

# Order used in "career path" view on the Compare page.
CAREER_PATH = ["help-desk-service-desk", "it-support-specialist", "technical-support",
               "network-noc-telecom", "systems-administrator", "soc-cybersecurity-analyst"]

PROVINCES = {
    "AB": "Alberta", "BC": "British Columbia", "MB": "Manitoba", "NB": "New Brunswick",
    "NL": "Newfoundland and Labrador", "NS": "Nova Scotia", "NT": "Northwest Territories",
    "NU": "Nunavut", "ON": "Ontario", "PE": "Prince Edward Island", "QC": "Quebec",
    "SK": "Saskatchewan", "YT": "Yukon", "?": "Not stated",
}

HOURS_PER_YEAR = 2080
SAL_MIN, SAL_MAX = 25_000, 250_000  # outside this the parse is probably wrong


def annual_salary(lo, hi, period):
    """Midpoint of the range as a yearly amount, rounded to $1,000, or None."""
    if lo is None or period not in ("year", "hour"):
        return None
    mid = (lo + (hi or lo)) / 2
    if period == "hour":
        mid *= HOURS_PER_YEAR
    if not SAL_MIN <= mid <= SAL_MAX:
        return None
    return int(round(mid / 1000) * 1000)


def new_cell(role, prov, sen, rem):
    return {
        "role": role, "p": prov, "s": sen, "r": rem, "n": 0,
        "req": Counter(), "nice": Counter(),
        "yrs": Counter(),       # years_exp_min (floored, 10 = 10+); "none" = not stated
        "edu": Counter(),
        "flags": Counter(),     # bilingual, clearance, license, shift
        "lang": Counter(),
        "sal": [],              # yearly midpoints, one per posting with a salary
        "co": Counter(),        # company index -> postings
        "certs": Counter(),     # "A+ + Network+" style cert combos (2+ certs)
        "empl": Counter(),
    }


def finish_cell(c):
    out = {k: v for k, v in c.items()}
    for k in ("req", "nice", "yrs", "edu", "flags", "lang", "co", "certs", "empl"):
        out[k] = {str(key): val for key, val in sorted(c[k].items(), key=lambda kv: -kv[1])}
    out["sal"] = sorted(c["sal"])
    return out


def with_companies(cells, names):
    """Re-number company indexes so a file only lists the companies it uses."""
    used = sorted({int(i) for c in cells for i in c["co"]})
    remap = {old: new for new, old in enumerate(used)}
    out = [{**c, "co": {str(remap[int(i)]): n for i, n in c["co"].items()}} for c in cells]
    return [names[i] for i in used], out


def write(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return path.stat().st_size


def main():
    con = connect()
    skills = {sid: (name, cat) for sid, name, cat in con.execute("SELECT id, name, category FROM skills")}
    cert_ids = {sid for sid, (_, cat) in skills.items() if cat == "cert"}

    job_skills = defaultdict(list)
    for job_id, skill_id, required in con.execute("SELECT job_id, skill_id, required FROM job_skills"):
        job_skills[job_id].append((skill_id, required))

    companies = {cid: name for cid, name in con.execute("SELECT id, name FROM companies")}
    company_index: dict[str, int] = {}

    def co_idx(cid):
        name = companies.get(cid) or "Unknown"
        if name not in company_index:
            company_index[name] = len(company_index)
        return company_index[name]

    # ---- unique postings -> cells -------------------------------------------------
    rows = con.execute("""
        SELECT id, role_id, province, seniority, remote_type, language, years_exp_min,
               education, bilingual_required, security_clearance, drivers_license,
               shift_or_oncall, salary_min, salary_max, salary_period, company_id,
               employment_type, posted_at
        FROM v_jobs_unique WHERE role_id IS NOT NULL
    """).fetchall()

    cells = {}
    posted = []
    for (jid, role_id, prov, sen, rem, lang, yrs, edu, bil, clr, lic, shf,
         smin, smax, sper, cid, empl, posted_at) in rows:
        role = ROLE_OF_DB[role_id]
        key = (role, prov or "?", sen or "unknown", rem or "unknown")
        c = cells.get(key) or cells.setdefault(key, new_cell(*key))
        c["n"] += 1
        for sid, required in job_skills[jid]:
            (c["req"] if required else c["nice"])[sid] += 1
        c["yrs"]["none" if yrs is None else min(int(yrs), 10)] += 1
        c["edu"][edu or "unspecified"] += 1
        for name, val in (("bilingual", bil), ("clearance", clr), ("license", lic), ("shift", shf)):
            if val:
                c["flags"][name] += 1
        c["lang"][lang or "en"] += 1
        sal = annual_salary(smin, smax, sper)
        if sal:
            c["sal"].append(sal)
        c["co"][co_idx(cid)] += 1
        certs = sorted(skills[sid][0] for sid, _ in job_skills[jid] if sid in cert_ids)
        if len(certs) >= 2:
            for pair in combinations(certs, 2):
                c["certs"][" + ".join(pair)] += 1
        c["empl"][empl or "other"] += 1
        if posted_at:
            posted.append(posted_at)

    all_cells = [finish_cell(c) for c in cells.values()]

    # ---- all rows -> location cells ----------------------------------------------
    loc = Counter()
    for role_id, prov, city, sen, rem in con.execute(
        "SELECT role_id, province, city, seniority, remote_type FROM jobs WHERE role_id IS NOT NULL"
    ):
        loc[(ROLE_OF_DB[role_id], prov or "?", city or "", sen or "unknown", rem or "unknown")] += 1
    loc_cells = [list(k) + [n] for k, n in sorted(loc.items(), key=lambda kv: -kv[1])]

    company_names = sorted(company_index, key=company_index.get)
    used_skill_ids = {int(s) for c in all_cells for k in ("req", "nice") for s in c[k]}
    skill_list = [{"id": sid, "name": skills[sid][0], "category": skills[sid][1]}
                  for sid in sorted(used_skill_ids, key=lambda s: skills[s][0].lower())]

    db_role_names = dict(con.execute("SELECT id, name FROM roles"))
    roles_meta = []
    for slug, name, ids, blurb in SITE_ROLES:
        n_unique = sum(c["n"] for c in all_cells if c["role"] == slug)
        n_rows = sum(l[-1] for l in loc_cells if l[0] == slug)
        roles_meta.append({
            "slug": slug, "name": name, "blurb": blurb,
            "includes": [db_role_names[i] for i in ids],
            "postings": n_unique, "rows": n_rows,
        })

    run = con.execute(
        "SELECT run_date, prompt_version, jobs_processed FROM extraction_runs ORDER BY id DESC LIMIT 1"
    ).fetchone()
    scrape = con.execute(
        "SELECT COUNT(*), SUM(results_count), MIN(run_date), MAX(run_date) FROM scrape_runs"
    ).fetchone()
    total_rows, total_unique = con.execute(
        "SELECT COUNT(*), SUM(g.is_canonical) FROM jobs j JOIN job_groups g ON g.job_id = j.id"
    ).fetchone()
    in_scope_rows = sum(l[-1] for l in loc_cells)
    in_scope_unique = sum(c["n"] for c in all_cells)
    salary_n = sum(len(c["sal"]) for c in all_cells)

    meta = {
        "generated": date.today().isoformat(),
        "posted_from": min(posted) if posted else None,
        "posted_to": max(posted) if posted else None,
        "scrape_runs": scrape[0], "scrape_results": scrape[1],
        "scraped_on": (scrape[3] or "")[:10],
        "jobs_total_rows": total_rows, "jobs_total_unique": total_unique,
        "in_scope_rows": in_scope_rows, "in_scope_unique": in_scope_unique,
        "repeated_rows": in_scope_rows - in_scope_unique,
        "salary_postings": salary_n,
        "extraction_version": run[1] if run else None,
        "extraction_date": run[0] if run else None,
        "min_n_for_percent": 20,
        "hours_per_year": HOURS_PER_YEAR,
        "skill_recall": {"overall": 0.87, "english": 0.92, "french": 0.70, "precision": 0.97},
        "provinces": PROVINCES,
        "seniority": ["entry", "mid", "senior", "lead", "unknown"],
        "remote": ["onsite", "hybrid", "remote", "unknown"],
        "career_path": CAREER_PATH,
    }

    sizes = {}
    sizes["meta.json"] = write(OUT / "meta.json", meta)
    sizes["roles.json"] = write(OUT / "roles.json", roles_meta)
    sizes["skills.json"] = write(OUT / "skills.json", skill_list)
    sizes["summary.json"] = write(OUT / "summary.json", {
        "companies": company_names, "cells": all_cells, "locations": loc_cells,
    })
    for r in roles_meta:
        slug = r["slug"]
        names, rcells = with_companies([c for c in all_cells if c["role"] == slug], company_names)
        sizes[f"roles/{slug}.json"] = write(OUT / "roles" / f"{slug}.json", {
            **r,
            "companies": names,
            "cells": rcells,
            "locations": [l for l in loc_cells if l[0] == slug],
        })
    entry = [c for c in all_cells if c["s"] == "entry"]
    names, ecells = with_companies(entry, company_names)
    sizes["entry_level.json"] = write(OUT / "entry_level.json", {
        "companies": names, "cells": ecells,
        "locations": [l for l in loc_cells if l[3] == "entry"],
    })

    print(f"in scope: {in_scope_unique} unique postings ({in_scope_rows} rows), "
          f"{len(all_cells)} cells, salary n={salary_n}, entry n={sum(c['n'] for c in entry)}")
    for r in roles_meta:
        print(f"  {r['postings']:4d}  {r['name']}")
    for name, size in sizes.items():
        print(f"  {size / 1024:7.1f} KB  {name}")


if __name__ == "__main__":
    main()
