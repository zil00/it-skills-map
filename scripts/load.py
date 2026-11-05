"""Stage 1 — LOAD: data/raw/*.json -> scrape_runs, scrape_queries, raw_jobs.

Append-only: a raw file whose Apify run id is already in scrape_runs is skipped.
Payloads are stored untouched.

Usage: python scripts/load.py [FILE ...]     (default: every file in data/raw/)
"""
import json
import sys
import urllib.parse
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from init_db import ROOT, connect  # noqa: E402

RAW_DIR = ROOT / "data" / "raw"


def url_params(url: str) -> dict:
    return {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(url).query).items()}


def load_file(con, path: Path) -> None:
    meta_path = path.with_suffix(".meta.json")
    if not meta_path.exists():
        print(f"skip {path.name}: no .meta.json sidecar")
        return
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    run_key = meta["apify_run_id"]
    if con.execute("SELECT 1 FROM scrape_runs WHERE apify_run_id = ?", (run_key,)).fetchone():
        print(f"skip {path.name}: run {run_key} already loaded")
        return
    items = json.loads(path.read_text(encoding="utf-8"))
    by_url = Counter(it.get("inputUrl", "") for it in items)
    filters = sorted({url_params(u).get("f_TPR", "") for u in by_url} - {""})
    run_date = meta.get("started_at") or path.name[:10]

    cur = con.execute(
        """INSERT INTO scrape_runs (apify_run_id, apify_dataset_id, location, date_filter,
                                    raw_file, run_date, results_count)
           VALUES (?,?,?,?,?,?,?)""",
        (run_key, meta.get("apify_dataset_id"), meta.get("location", "Canada"),
         ",".join(filters) or None, str(path.relative_to(ROOT)).replace("\\", "/"),
         run_date, len(items)))
    run_id = cur.lastrowid

    # Also record searches that returned 0 results (they are in the input, not the items).
    input_urls = (meta.get("input") or {}).get("urls") or []
    for u in input_urls:
        by_url.setdefault(u, 0)
    # The actor appends &position=1&pageNum=0 to inputUrl; fold those into the input URL.
    merged = Counter()
    for u, n in by_url.items():
        base = next((iu for iu in input_urls if u.startswith(iu)), u)
        merged[base] += n
    for u, n in merged.items():
        con.execute("INSERT INTO scrape_queries (run_id, keyword, search_url, results_count)"
                    " VALUES (?,?,?,?)", (run_id, url_params(u).get("keywords", ""), u, n))

    dup = 0
    for it in items:
        cur = con.execute(
            "INSERT OR IGNORE INTO raw_jobs (job_id, run_id, scraped_at, payload_json)"
            " VALUES (?,?,?,?)",
            (str(it["id"]), run_id, run_date, json.dumps(it, ensure_ascii=False)))
        dup += cur.rowcount == 0
    con.commit()
    print(f"loaded {path.name}: run_id={run_id}, {len(items)} items "
          f"({len(items) - dup} raw rows, {dup} same-run duplicates), {len(merged)} queries")


def main():
    files = [Path(f) for f in sys.argv[1:]] or sorted(
        p for p in RAW_DIR.glob("*.json") if not p.name.endswith(".meta.json"))
    con = connect()
    for f in files:
        load_file(con, f.resolve())


if __name__ == "__main__":
    main()
