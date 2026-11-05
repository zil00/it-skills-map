"""Group repeated postings: same company + same description text (usually one
copy per city). Fills job_groups; stats should read v_jobs_unique.

Run after basic_fields.py (basic_fields deletes jobs, which clears job_groups).
Usage: python scripts/dedupe.py
"""
import hashlib
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from init_db import ROOT, connect  # noqa: E402

WS = re.compile(r"\s+")


def text_key(description: str | None) -> str:
    norm = WS.sub(" ", (description or "").lower()).strip()
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()


def main():
    con = connect()
    con.executescript((ROOT / "scripts" / "schema.sql").read_text(encoding="utf-8"))
    rows = con.execute(
        "SELECT id, company_id, description, posted_at FROM jobs"
    ).fetchall()

    groups = defaultdict(list)
    for job_id, company_id, desc, posted_at in rows:
        if not desc or len(desc) < 200:
            # too short to trust as identical text: keep as its own group
            groups[("solo", job_id)].append((job_id, posted_at))
        else:
            groups[(company_id, text_key(desc))].append((job_id, posted_at))

    con.execute("DELETE FROM job_groups")
    out = []
    for members in groups.values():
        # canonical = earliest posted, then lowest id (stable)
        members.sort(key=lambda m: (m[1] or "9999", m[0]))
        canon = members[0][0]
        for job_id, _ in members:
            out.append((job_id, canon, len(members), int(job_id == canon)))
    con.executemany(
        "INSERT INTO job_groups (job_id, group_id, group_size, is_canonical) VALUES (?,?,?,?)",
        out,
    )
    con.commit()

    multi = [g for g in groups.values() if len(g) > 1]
    extra = sum(len(g) - 1 for g in multi)
    in_scope = con.execute(
        "SELECT COUNT(*), SUM(g.is_canonical) FROM jobs j JOIN job_groups g ON g.job_id=j.id "
        "WHERE j.role_id IS NOT NULL"
    ).fetchone()
    print(f"jobs={len(rows)} unique={len(groups)} repeated_groups={len(multi)} extra_rows={extra}")
    print(f"in scope: {in_scope[0]} rows -> {in_scope[1]} unique postings")


if __name__ == "__main__":
    main()
