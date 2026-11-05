"""Run the Apify LinkedIn jobs scraper (one-time scrape, PROJECT_PLAN.md section 6)
and save the raw JSON to data/raw/.

Usage:
  python scripts/scrape.py plan                 # show input + cost estimate (no API call)
  python scripts/scrape.py run --yes            # start the run, wait, download
  python scripts/scrape.py test-or --yes        # ~10-result OR-syntax test (~$0.02)
  python scripts/scrape.py download RUN_ID [--name NAME]
                                                # download an existing run's dataset

Needs the APIFY_TOKEN environment variable. The token is never printed.
Output: data/raw/<YYYY-MM-DD>_<name>.json  (list of Apify items, untouched)
        data/raw/<YYYY-MM-DD>_<name>.meta.json  (run id, dataset id, input)
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
API = "https://api.apify.com/v2"
ACTOR = "curious_coder~linkedin-jobs-scraper"

KEYWORDS = [
    "help desk",
    "service desk",
    "IT support",
    "technical support analyst",
    "desktop support",
    "application support",
    "software support",
    "product support",
    "systems support",
    "systems administrator",
    "NOC",
    "network administrator",
    "telecommunications technician",
    "SOC analyst",
    "technology analyst",
]
LOCATION = "Canada"
GEO_ID = "101174742"
DATE_FILTER = "r2592000"          # past month
LIMIT_PER_SOURCE = 150
PRICE_PER_RESULT = 0.002          # Free plan
PRICE_PER_START = 0.00005         # per GB of memory, negligible
MAX_CHARGE_USD = 4.60             # hard cap passed to Apify


def search_url(keyword: str) -> str:
    q = urllib.parse.urlencode({
        "keywords": keyword,
        "location": LOCATION,
        "geoId": GEO_ID,
        "f_TPR": DATE_FILTER,
    }, quote_via=urllib.parse.quote)
    return f"https://www.linkedin.com/jobs/search/?{q}"


def build_input() -> dict:
    return {
        "urls": [search_url(k) for k in KEYWORDS],
        "limitPerSource": LIMIT_PER_SOURCE,
        "scrapeCompany": False,
    }


def estimate() -> dict:
    max_results = len(KEYWORDS) * LIMIT_PER_SOURCE
    return {
        "search_urls": len(KEYWORDS),
        "max_results": max_results,
        "max_cost_usd": round(max_results * PRICE_PER_RESULT + 4 * PRICE_PER_START, 2),
        "hard_cap_usd": MAX_CHARGE_USD,
    }


def token() -> str:
    t = os.environ.get("APIFY_TOKEN")
    if not t:
        sys.exit("APIFY_TOKEN is not set in this environment.")
    return t


def api(method: str, path: str, params: dict | None = None, body: dict | None = None):
    params = dict(params or {})
    url = f"{API}{path}?{urllib.parse.urlencode(params)}" if params else f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token()}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"Apify API error {e.code} on {method} {path}: {e.read()[:500]!r}")


def download(run_id: str, name: str, actor_input: dict | None = None) -> Path:
    run = api("GET", f"/actor-runs/{run_id}")["data"]
    dataset_id = run["defaultDatasetId"]
    items, offset, page = [], 0, 1000
    while True:
        batch = api("GET", f"/datasets/{dataset_id}/items",
                    {"format": "json", "clean": "true", "offset": offset, "limit": page})
        items.extend(batch)
        if len(batch) < page:
            break
        offset += page
    date = (run.get("startedAt") or time.strftime("%Y-%m-%d"))[:10]
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out = RAW_DIR / f"{date}_{name}.json"
    if out.exists():
        sys.exit(f"{out} already exists; raw files are never overwritten.")
    out.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    meta = {
        "apify_run_id": run_id,
        "apify_dataset_id": dataset_id,
        "status": run.get("status"),
        "started_at": run.get("startedAt"),
        "finished_at": run.get("finishedAt"),
        "usage_total_usd": run.get("usageTotalUsd"),
        "items": len(items),
        "location": LOCATION,
        "input": actor_input,
    }
    out.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Saved {len(items)} items -> {out.relative_to(ROOT)}")
    return out


def cmd_plan(_):
    print("Actor:", ACTOR.replace("~", "/"))
    print("Input:")
    print(json.dumps(build_input(), indent=2))
    print("Estimate:", json.dumps(estimate(), indent=2))


def cmd_run(args):
    if not args.yes:
        sys.exit("Refusing to start a paid run without --yes. Run `plan` first.")
    run_and_download(build_input(), estimate()["max_results"], MAX_CHARGE_USD, args.name)


def run_and_download(actor_input: dict, max_items: int, max_usd: float, name: str) -> Path:
    params = {"maxItems": max_items, "maxTotalChargeUsd": max_usd}
    run = api("POST", f"/acts/{ACTOR}/runs", params, actor_input)["data"]
    run_id = run["id"]
    print(f"Started run {run_id}", flush=True)
    while run["status"] in ("READY", "RUNNING"):
        time.sleep(20)
        run = api("GET", f"/actor-runs/{run_id}")["data"]
        print(f"  status={run['status']} usd={run.get('usageTotalUsd')}", flush=True)
    print("Final status:", run["status"])
    return download(run_id, name, actor_input)


def cmd_test_or(args):
    """~10-result test (~$0.02): does LinkedIn accept OR between quoted phrases?"""
    if not args.yes:
        sys.exit("Refusing to start a paid run without --yes.")
    kw = '"help desk" OR "service desk" OR "IT support"'
    actor_input = {"urls": [search_url(kw)], "limitPerSource": 10, "scrapeCompany": False}
    print(json.dumps(actor_input, indent=2))
    run_and_download(actor_input, 10, 0.05, "test_or")


def cmd_download(args):
    download(args.run_id, args.name)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(required=True)
    s = sub.add_parser("plan"); s.set_defaults(fn=cmd_plan)
    s = sub.add_parser("run"); s.add_argument("--yes", action="store_true")
    s.add_argument("--name", default="onetime"); s.set_defaults(fn=cmd_run)
    s = sub.add_parser("test-or"); s.add_argument("--yes", action="store_true")
    s.set_defaults(fn=cmd_test_or)
    s = sub.add_parser("download"); s.add_argument("run_id")
    s.add_argument("--name", default="download"); s.set_defaults(fn=cmd_download)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
