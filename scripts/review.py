"""QA helper: print N random in-scope jobs with extracted fields + description,
or the top unmapped_skills.

Usage:
  python scripts/review.py jobs [N] [SEED]
  python scripts/review.py unmapped [N]
  python scripts/review.py skills          # skill frequency across in-scope jobs
"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from init_db import connect  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")


def jobs(n, seed):
    con = connect()
    ids = [r[0] for r in con.execute("SELECT id FROM jobs WHERE role_id IS NOT NULL ORDER BY id")]
    random.Random(seed).shuffle(ids)
    for jid in ids[:n]:
        j = con.execute("""SELECT j.*, r.name AS role FROM jobs j LEFT JOIN roles r ON r.id=j.role_id
                           WHERE j.id=?""", (jid,)).fetchone()
        cols = [d[0] for d in con.execute("SELECT * FROM jobs LIMIT 0").description] + ["role"]
        j = dict(zip(cols, j))
        sk = con.execute("""SELECT s.name, js.required FROM job_skills js JOIN skills s ON s.id=js.skill_id
                            WHERE js.job_id=? ORDER BY s.category, s.name""", (jid,)).fetchall()
        print("=" * 100)
        print(f"[{jid}] {j['title_raw']}  ->  {j['role']}  | {j['location_raw']} -> {j['city']}, {j['province']}")
        print(f"remote={j['remote_type']} seniority={j['seniority']} (li={j['linkedin_seniority']}) "
              f"emp={j['employment_type']} lang={j['language']} years={j['years_exp_min']}-{j['years_exp_max']} "
              f"edu={j['education']} bil={j['bilingual_required']} clr={j['security_clearance']} "
              f"lic={j['drivers_license']} shift={j['shift_or_oncall']} "
              f"salary={j['salary_min']}-{j['salary_max']}/{j['salary_period']} ({j['salary_source']})")
        print("REQ:", ", ".join(s for s, r in sk if r))
        print("ASSET:", ", ".join(s for s, r in sk if not r))
        print("-" * 100)
        print(j["description"])


def unmapped(n):
    con = connect()
    rows = con.execute("SELECT raw_text, times_seen FROM unmapped_skills ORDER BY times_seen DESC LIMIT ?",
                       (n,)).fetchall()
    print(" | ".join(f"{t} ({c})" for t, c in rows))


def skills():
    con = connect()
    rows = con.execute("""SELECT s.name, COUNT(*), SUM(js.required) FROM job_skills js
                          JOIN skills s ON s.id=js.skill_id JOIN jobs j ON j.id=js.job_id
                          WHERE j.role_id IS NOT NULL GROUP BY s.id ORDER BY 2 DESC""").fetchall()
    print(" | ".join(f"{a} {b}/{c}" for a, b, c in rows))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "jobs":
        jobs(int(sys.argv[2]) if len(sys.argv) > 2 else 30, int(sys.argv[3]) if len(sys.argv) > 3 else 1)
    elif cmd == "unmapped":
        unmapped(int(sys.argv[2]) if len(sys.argv) > 2 else 150)
    else:
        skills()
