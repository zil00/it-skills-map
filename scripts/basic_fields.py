"""Stage 2 — BASIC FIELDS: raw_jobs -> companies, jobs (plain code, no AI).

Drops and rebuilds companies + jobs (and job_skills via cascade) from the raw layer.
One jobs row per LinkedIn id; the most recent payload wins, first_seen/last_seen
span all runs that saw it. Run extract.py afterwards.
"""
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from init_db import connect  # noqa: E402

PROVINCES = {
    "alberta": "AB", "british columbia": "BC", "manitoba": "MB", "new brunswick": "NB",
    "newfoundland and labrador": "NL", "newfoundland": "NL", "nova scotia": "NS",
    "ontario": "ON", "prince edward island": "PE", "quebec": "QC", "québec": "QC",
    "saskatchewan": "SK", "northwest territories": "NT", "nunavut": "NU", "yukon": "YT",
}
PROV_CODES = set(PROVINCES.values())
# Metro-area names LinkedIn uses instead of "City, Province, Canada".
METROS = {
    "greater toronto area": ("Toronto", "ON"), "toronto": ("Toronto", "ON"),
    "greater montreal metropolitan area": ("Montreal", "QC"), "montreal": ("Montreal", "QC"),
    "greater vancouver metropolitan area": ("Vancouver", "BC"), "vancouver": ("Vancouver", "BC"),
    "greater calgary metropolitan area": ("Calgary", "AB"), "calgary": ("Calgary", "AB"),
    "greater edmonton metropolitan area": ("Edmonton", "AB"), "edmonton": ("Edmonton", "AB"),
    "ottawa metropolitan area": ("Ottawa", "ON"), "greater ottawa metropolitan area": ("Ottawa", "ON"),
    "ottawa": ("Ottawa", "ON"),
    "greater winnipeg metropolitan area": ("Winnipeg", "MB"), "winnipeg": ("Winnipeg", "MB"),
    "greater halifax metropolitan area": ("Halifax", "NS"), "halifax": ("Halifax", "NS"),
    "greater quebec city metropolitan area": ("Quebec City", "QC"),
    "kitchener-cambridge-waterloo area": ("Kitchener", "ON"),
    "greater hamilton metropolitan area": ("Hamilton", "ON"),
    "greater london metropolitan area": ("London", "ON"),
    "greater saskatoon metropolitan area": ("Saskatoon", "SK"),
    "greater regina metropolitan area": ("Regina", "SK"),
    "greater victoria metropolitan area": ("Victoria", "BC"),
    "greater kelowna metropolitan area": ("Kelowna", "BC"),
    "greater sudbury metropolitan area": ("Sudbury", "ON"),
    "greater st. john's metropolitan area": ("St. John's", "NL"),
    "greater moncton metropolitan area": ("Moncton", "NB"),
    "greater fredericton metropolitan area": ("Fredericton", "NB"),
    "greater windsor metropolitan area": ("Windsor", "ON"),
    "greater kingston metropolitan area": ("Kingston", "ON"),
    "greater oshawa metropolitan area": ("Oshawa", "ON"),
    "greater guelph metropolitan area": ("Guelph", "ON"),
    "greater barrie metropolitan area": ("Barrie", "ON"),
    "greater st. catharines-niagara area": ("St. Catharines", "ON"),
    "greater sherbrooke metropolitan area": ("Sherbrooke", "QC"),
    "greater nanaimo metropolitan area": ("Nanaimo", "BC"),
    "greater abbotsford metropolitan area": ("Abbotsford", "BC"),
}

EMPLOYMENT = {
    "full-time": "full-time", "part-time": "part-time", "contract": "contract",
    "temporary": "contract", "internship": "internship", "volunteer": "volunteer",
    "other": "other",
}

FR_WORDS = set("le la les des une est pour avec dans nous vous sur être votre notre "
               "aux du au ou qui que expérience poste travail équipe connaissance "
               "atout exigences compétences".split())
EN_WORDS = set("the and of to for with in is are you we our your will on be this "
               "experience team skills role work".split())


def parse_location(loc: str):
    """'Calgary, Alberta, Canada' -> ('Calgary', 'AB'); metro areas handled."""
    if not loc:
        return None, None, None
    parts = [p.strip() for p in loc.split(",")]
    country = "CA" if parts[-1].lower() == "canada" else None
    if country:
        parts = parts[:-1]
    if not parts:
        return None, None, country or "CA"
    low = [p.lower() for p in parts]
    if len(parts) >= 2:
        prov = PROVINCES.get(low[-1]) or (parts[-1].upper() if parts[-1].upper() in PROV_CODES else None)
        if prov:
            return parts[0], prov, country or "CA"
    if low[0] in PROVINCES:                      # "Quebec, Canada" = province only
        return None, PROVINCES[low[0]], country or "CA"
    if low[0] in METROS:
        city, prov = METROS[low[0]]
        return city, prov, country or "CA"
    m = re.match(r"(?:greater )?(.+?)(?: metropolitan)? area$", low[0])
    if m and m.group(1) in METROS:
        city, prov = METROS[m.group(1)]
        return city, prov, country or "CA"
    return parts[0], None, country


SAL_RE = re.compile(r"CA?\$\s*([\d,]+(?:\.\d+)?)\s*(K)?\s*/\s*(yr|hr|mo|year|hour|month)"
                    r"(?:\s*-\s*CA?\$\s*([\d,]+(?:\.\d+)?)\s*(K)?\s*/\s*(?:yr|hr|mo|year|hour|month))?",
                    re.I)


def parse_listed_salary(s: str):
    """'CA$100,000.00/yr - CA$115,000.00/yr' -> (100000, 115000, 'year')."""
    if not s:
        return None
    m = SAL_RE.search(s)
    if not m:
        return None
    lo = float(m.group(1).replace(",", "")) * (1000 if m.group(2) else 1)
    hi = float(m.group(4).replace(",", "")) * (1000 if m.group(5) else 1) if m.group(4) else lo
    period = {"yr": "year", "year": "year", "hr": "hour", "hour": "hour",
              "mo": "month", "month": "month"}[m.group(3).lower()]
    currency = "USD" if s.strip().startswith("$") or s.strip().startswith("US$") else "CAD"
    return lo, hi, period, currency


def detect_language(text: str) -> str | None:
    words = re.findall(r"[a-zàâçéèêëîïôûùüÿœ']+", (text or "").lower())[:400]
    if not words:
        return None
    fr = sum(w in FR_WORDS for w in words)
    en = sum(w in EN_WORDS for w in words)
    return "fr" if fr > en else "en"


def employment_type(raw: str, title: str) -> str | None:
    t = title.lower()
    if re.search(r"\bco-?op\b|\bstage\b|\bstagiaire\b", t):
        return "co-op"
    if re.search(r"\bapprenti", t):
        return "apprenticeship"
    if re.search(r"\bintern(ship)?\b", t):
        return "internship"
    return EMPLOYMENT.get((raw or "").strip().lower(), (raw or "").strip().lower() or None)


def clean_text(s: str) -> str:
    """Decode HTML entities (&rsquo; &amp; &nbsp;) and normalize apostrophes/spaces."""
    s = html.unescape(html.unescape(s))
    s = s.replace("’", "'").replace("‘", "'").replace(" ", " ").replace(" ", " ")
    return s


def to_int(v):
    try:
        return int(str(v).replace(",", "").replace("+", ""))
    except (TypeError, ValueError):
        return None


def clean_company_url(u: str) -> str | None:
    return u.split("?")[0].rstrip("/") if u else None


def main():
    con = connect()
    con.execute("DELETE FROM job_skills")
    con.execute("DELETE FROM jobs")
    con.execute("DELETE FROM companies")
    con.execute("DELETE FROM sqlite_sequence WHERE name = 'companies'")

    rows = con.execute("""
        SELECT r.job_id, r.payload_json, r.scraped_at
        FROM raw_jobs r ORDER BY r.job_id, r.scraped_at""").fetchall()
    jobs = {}
    for job_id, payload, scraped_at in rows:
        j = jobs.setdefault(job_id, {"first": scraped_at, "last": scraped_at})
        j["last"] = scraped_at
        j["item"] = json.loads(payload)          # latest payload wins

    company_ids = {}
    n_sal = 0
    for job_id, j in jobs.items():
        it = j["item"]
        curl = clean_company_url(it.get("companyLinkedinUrl"))
        cname = (it.get("companyName") or "").strip() or "(unknown)"
        ckey = curl or f"name:{cname.lower()}"
        if ckey not in company_ids:
            cur = con.execute(
                "INSERT INTO companies (name, linkedin_url, industry) VALUES (?,?,?)",
                (cname, curl, it.get("industries") or None))
            company_ids[ckey] = cur.lastrowid
        city, prov, country = parse_location(it.get("location", ""))
        sal = parse_listed_salary(it.get("salary", ""))
        n_sal += bool(sal)
        title = clean_text(it.get("title") or "").strip()
        desc = clean_text(it.get("descriptionText") or "")
        con.execute("""
            INSERT INTO jobs (id, title_raw, company_id, location_raw, city, province, country,
                              employment_type, language, salary_min, salary_max, salary_period,
                              salary_currency, salary_source, posted_at, first_seen, last_seen,
                              applicants, linkedin_seniority, url, description)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (job_id, title, company_ids[ckey], it.get("location"), city, prov, country or "CA",
             employment_type(it.get("employmentType"), title), detect_language(title + " " + desc),
             sal[0] if sal else None, sal[1] if sal else None, sal[2] if sal else None,
             sal[3] if sal else "CAD", "listed" if sal else None,
             it.get("postedAt") or None, j["first"], j["last"],
             to_int(it.get("applicantsCount")), it.get("seniorityLevel") or None,
             (it.get("link") or "").split("?")[0] or None, desc))
    con.commit()
    no_prov = con.execute("SELECT COUNT(*) FROM jobs WHERE province IS NULL").fetchone()[0]
    print(f"jobs={len(jobs)} companies={len(company_ids)} listed_salary={n_sal} "
          f"no_province={no_prov}")


if __name__ == "__main__":
    main()
