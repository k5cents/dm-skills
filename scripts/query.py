#!/usr/bin/env python3
"""
query.py

Query a dm-skills SQLite database from the command line.
Replaces the sqlite3 CLI — works on any system with Python 3 (no extra deps).

Usage:
  python3 scripts/query.py <db-name-or-path> "<SQL>"

  # db-name is resolved against $DM_SKILLS_DIR/databases/ unless it's an absolute path
  python3 $DM_SKILLS_DIR/scripts/query.py monsters.db "SELECT name, cr FROM monsters WHERE cr_num <= 1"
  python3 $DM_SKILLS_DIR/scripts/query.py spells.db   "SELECT name, level, school FROM spells WHERE srd = 1"

Output: markdown table
"""

import os
import sqlite3
import sys


def resolve_db(db_name: str) -> str:
    if os.path.isabs(db_name) or db_name.startswith("."):
        return db_name
    dm_skills = os.environ.get(
        "DM_SKILLS_DIR",
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    )
    return os.path.join(dm_skills, "databases", db_name)


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: query.py <db> <SQL>", file=sys.stderr)
        sys.exit(1)

    db_path = resolve_db(sys.argv[1])
    sql = sys.argv[2]

    if not os.path.exists(db_path):
        print(f"Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    con = sqlite3.connect(db_path)
    try:
        cur = con.execute(sql)
    except sqlite3.Error as e:
        print(f"SQL error: {e}", file=sys.stderr)
        sys.exit(1)

    headers = [d[0] for d in cur.description]
    rows = cur.fetchall()
    con.close()

    if not rows:
        print("*(no results)*")
        return

    str_rows = [
        [str(v) if v is not None else "" for v in row]
        for row in rows
    ]
    widths = [len(h) for h in headers]
    for row in str_rows:
        for i, v in enumerate(row):
            widths[i] = max(widths[i], len(v))

    fmt = "| " + " | ".join(f"{{:<{w}}}" for w in widths) + " |"
    sep = "| " + " | ".join("-" * w for w in widths) + " |"

    print(fmt.format(*headers))
    print(sep)
    for row in str_rows:
        print(fmt.format(*row))


if __name__ == "__main__":
    main()
