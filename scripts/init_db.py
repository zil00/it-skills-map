"""Create jobs.db (schema from schema.sql) and (re)seed the reference tables.

Safe to re-run: raw and processed tables are kept; roles/role_aliases/skills/
skill_aliases are replaced with the contents of seed_data.py.
"""
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_data import ROLES, ROLE_ALIASES, SKILLS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "jobs.db"


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = ON")
    return con


def main():
    con = connect()
    con.executescript((Path(__file__).parent / "schema.sql").read_text(encoding="utf-8"))
    # job_skills references skills; it is rebuilt by extract.py anyway.
    con.execute("DELETE FROM job_skills")
    con.execute("UPDATE jobs SET role_id = NULL")
    for t in ("skill_aliases", "skills", "role_aliases", "roles"):
        con.execute(f"DELETE FROM {t}")

    con.executemany("INSERT INTO roles (id, name, category) VALUES (?,?,?)", ROLES)
    seen = {}
    for role_id, aliases in ROLE_ALIASES.items():
        for a in aliases:
            a = a.lower().strip()
            if a in seen and seen[a] != role_id:
                sys.exit(f"role alias {a!r} used for roles {seen[a]} and {role_id}")
            seen[a] = role_id
    con.executemany("INSERT INTO role_aliases (alias, role_id) VALUES (?,?)", seen.items())

    aliases = {}
    for sid, (name, cat, al) in enumerate(SKILLS, start=1):
        con.execute("INSERT INTO skills (id, name, category) VALUES (?,?,?)", (sid, name, cat))
        for a in [name.lower(), *al]:
            a = a.lower().strip()
            if a in aliases and aliases[a] != sid:
                sys.exit(f"skill alias {a!r} used for {SKILLS[aliases[a]-1][0]} and {name}")
            aliases[a] = sid
    con.executemany("INSERT INTO skill_aliases (alias, skill_id) VALUES (?,?)", aliases.items())
    con.commit()
    n = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
         for t in ("roles", "role_aliases", "skills", "skill_aliases")}
    print(f"{DB.name}: {n}")


if __name__ == "__main__":
    main()
