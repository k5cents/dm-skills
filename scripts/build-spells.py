#!/usr/bin/env python3
"""
build-spells.py

Build spells.db from 5etools-src spell JSON files plus relevant homebrew.

Sources:
  ~/Developer/5etools-src/data/spells/spells-*.json
  ~/Developer/5etools-homebrew/collection/Keith Baker; Exploring Eberron - 2024.json

Output: ~/Developer/dnd-reference/databases/spells.db

Usage:
  python3 scripts/build-spells.py
"""

import argparse
import csv
import glob
import json
import os
import re
import sqlite3
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
# Scripts auto-detect the repo root from their own location.
# External repos (5etools-src, 5etools-homebrew) are configurable via env vars
# and default to sibling directories of this repo.

REPO_ROOT = Path(__file__).resolve().parent.parent
HOME      = Path.home()

_FIVETOOLS_SRC = os.environ.get("FIVETOOLS_SRC")
_FIVETOOLS_HB  = os.environ.get("FIVETOOLS_HOMEBREW")

TOOLS_DIR = Path(_FIVETOOLS_SRC) / "data/spells" if _FIVETOOLS_SRC \
            else REPO_ROOT.parent / "5etools-src/data/spells"
HOMEBREW  = Path(_FIVETOOLS_HB)  / "collection"  if _FIVETOOLS_HB  \
            else REPO_ROOT.parent / "5etools-homebrew/collection"
DB_PATH   = REPO_ROOT / "databases/spells.db"
CSV_PATH  = REPO_ROOT / "reference/srd/spells.csv"

COLUMNS = [
    "name", "slug", "source", "page", "level", "school",
    "casting_time", "range", "range_feet",
    "verbal", "somatic", "material", "ritual", "concentration", "duration",
    "damage_types", "conditions_inflict", "save", "spell_attack", "area_tags",
    "srd", "entries_json", "higher_level_json",
]
INT_COLS   = {"page", "level", "range_feet", "verbal", "somatic", "material",
              "ritual", "concentration", "srd"}

# ── Lookup tables ─────────────────────────────────────────────────────────────

SCHOOL = {
    "A": "Abjuration",
    "C": "Conjuration",
    "D": "Divination",
    "E": "Enchantment",
    "I": "Illusion",
    "N": "Necromancy",
    "T": "Transmutation",
    "V": "Evocation",
    "P": "Psionic",
}

# ── Normalisation helpers ─────────────────────────────────────────────────────

def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def parse_casting_time(time_list: list) -> str:
    if not time_list:
        return "unknown"
    t = time_list[0]
    n, unit = t.get("number", 1), t.get("unit", "")
    if unit == "action":
        return "action"
    if unit == "bonus":
        return "bonus action"
    if unit == "reaction":
        return "reaction"
    if unit in ("minute", "minutes"):
        return f"{n} minute" if n == 1 else f"{n} minutes"
    if unit in ("hour", "hours"):
        return f"{n} hour" if n == 1 else f"{n} hours"
    return f"{n} {unit}"

def parse_range(range_obj: dict) -> tuple[str, int | None]:
    """Returns (range_text, range_feet_or_None)."""
    if not range_obj:
        return "unknown", None
    rtype = range_obj.get("type", "")
    dist  = range_obj.get("distance", {})
    dtype = dist.get("type", "")
    amt   = dist.get("amount")

    if rtype == "special":
        return "special", None
    if dtype == "self":
        return "self", 0
    if dtype == "touch":
        return "touch", None
    if dtype == "sight":
        return "sight", None
    if dtype == "unlimited":
        return "unlimited", None
    if dtype == "feet":
        return f"{amt} ft", int(amt) if amt else None
    if dtype == "miles":
        ft = int(amt * 5280) if amt else None
        return (f"{amt} mile" if amt == 1 else f"{amt} miles"), ft
    return rtype or "unknown", None

def parse_duration(dur_list: list) -> tuple[str, bool]:
    """Returns (duration_text, is_concentration)."""
    if not dur_list:
        return "unknown", False
    d = dur_list[0]
    dtype = d.get("type", "")
    conc  = bool(d.get("concentration"))

    if dtype == "instant":
        return "instant", False
    if dtype == "permanent":
        ends = d.get("ends", [])
        return "permanent" + (f" (until {'/'.join(ends)})" if ends else ""), False
    if dtype == "special":
        return "special", conc
    if dtype == "timed":
        inner = d.get("duration", {})
        itype = inner.get("type", "")
        iamt  = inner.get("amount", 1)
        if itype == "round":
            text = "1 round" if iamt == 1 else f"{iamt} rounds"
        elif itype == "minute":
            text = "1 minute" if iamt == 1 else f"{iamt} minutes"
        elif itype == "hour":
            text = "1 hour" if iamt == 1 else f"{iamt} hours"
        elif itype == "day":
            text = "1 day" if iamt == 1 else f"{iamt} days"
        elif itype == "week":
            text = "1 week" if iamt == 1 else f"{iamt} weeks"
        elif itype == "year":
            text = "1 year" if iamt == 1 else f"{iamt} years"
        else:
            text = f"{iamt} {itype}"
        if conc:
            text += " (conc)"
        return text, conc
    return dtype, conc

def pipe(lst: list | None) -> str | None:
    if not lst:
        return None
    return "|".join(sorted(str(x).lower() for x in lst))

def spell_attack_text(sa_list: list | None) -> str | None:
    if not sa_list:
        return None
    mapping = {"m": "melee", "r": "ranged", "o": "other"}
    return "|".join(mapping.get(x, x) for x in sa_list)

def load_spells(path: Path, source_override: str | None = None) -> list[dict]:
    with open(path) as f:
        data = json.load(f)
    # Handle both 5etools-src format and homebrew collection format
    spells = data.get("spell", [])
    if source_override:
        for s in spells:
            s["source"] = source_override
    return spells

# ── Build ─────────────────────────────────────────────────────────────────────

def build(spells: list[dict]) -> list[tuple]:
    rows = []
    for s in spells:
        name   = s.get("name", "")
        source = s.get("source", "")
        if not name or not source:
            continue

        level  = s.get("level", 0)
        school = SCHOOL.get(s.get("school", ""), s.get("school", ""))

        cast_time = parse_casting_time(s.get("time", []))
        range_text, range_feet = parse_range(s.get("range", {}))
        dur_text, concentration = parse_duration(s.get("duration", []))

        comps = s.get("components", {})
        verbal   = int(bool(comps.get("v")))
        somatic  = int(bool(comps.get("s")))
        material = int(bool(comps.get("m")))
        ritual   = int(bool(s.get("meta", {}).get("ritual")))

        damage_types      = pipe(s.get("damageInflict"))
        conditions_inflict = pipe(s.get("conditionInflict"))
        save              = pipe(s.get("savingThrow"))
        area_tags         = pipe(s.get("areaTags"))
        spell_attack      = spell_attack_text(s.get("spellAttack"))
        srd               = int(bool(s.get("srd52") or s.get("srd")))

        # Store raw entries as JSON strings — 5etools tags preserved intact.
        # Tags like {@condition blinded}, {@damage 8d6}, {@spell fireball} are
        # structural cross-references useful for rules lookup and rendering.
        entries_json = json.dumps(s.get("entries", []))
        higher_level_json = json.dumps(s.get("entriesHigherLevel", []))

        rows.append((
            name, slugify(name), source, s.get("page"),
            level, school,
            cast_time, range_text, range_feet,
            verbal, somatic, material, ritual, int(concentration),
            dur_text,
            damage_types, conditions_inflict, save, spell_attack, area_tags,
            srd,
            entries_json, higher_level_json,
        ))
    return rows

# ── CSV helpers ────────────────────────────────────────────────────────────────

def write_csv(rows: list[tuple]) -> None:
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(COLUMNS)
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows → {CSV_PATH}")


def read_csv_rows() -> list[tuple]:
    rows = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            typed = []
            for col in COLUMNS:
                v = row.get(col, "") or None
                if v is None:
                    typed.append(None)
                elif col in INT_COLS:
                    try:
                        typed.append(int(v))
                    except (ValueError, TypeError):
                        typed.append(None)
                else:
                    typed.append(v)
            rows.append(tuple(typed))
    return rows


def load_5etools_spells(srd_filter: bool | None) -> list[tuple]:
    """Load spells from 5etools JSON, optionally filtering by SRD status."""
    all_spells = []
    for path in sorted(glob.glob(str(TOOLS_DIR / "spells-*.json"))):
        spells = load_spells(Path(path))
        all_spells.extend(spells)
        print(f"  {os.path.basename(path):30} {len(spells):4} spells")

    ee_path = HOMEBREW / "Keith Baker; Exploring Eberron - 2024.json"
    if ee_path.exists():
        spells = load_spells(ee_path)
        all_spells.extend(spells)
        print(f"  {'ExploringEberron24 (homebrew)':30} {len(spells):4} spells")

    if srd_filter is True:
        # CSV export: SRD 5.2.1 only (srd52 flag); srd (2014) excluded
        all_spells = [s for s in all_spells if s.get("srd52")]
    elif srd_filter is False:
        # DB append: everything not already in the SRD 5.2.1 CSV
        all_spells = [s for s in all_spells if not s.get("srd52")]

    return build(all_spells)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", action="store_true",
                    help="Export SRD-only CSV (maintainer tool); do not build DB")
    args = ap.parse_args()

    has_5etools = TOOLS_DIR.exists()

    if args.csv:
        if not has_5etools:
            print(f"ERROR: FIVETOOLS_SRC not found at {TOOLS_DIR} — cannot generate CSV")
            raise SystemExit(1)
        rows = load_5etools_spells(srd_filter=True)
        write_csv(rows)
        return

    # Normal mode: SRD from CSV + non-SRD from 5etools JSON (if available)
    srd_rows = []
    if CSV_PATH.exists():
        srd_rows = read_csv_rows()
        print(f"  SRD CSV               {len(srd_rows):4} spells")
    elif has_5etools:
        print(f"  WARNING: {CSV_PATH} not found — building SRD rows from JSON")
        srd_rows = load_5etools_spells(srd_filter=True)
    else:
        print(f"  ERROR: No SRD CSV and no 5etools-src — nothing to build from")
        raise SystemExit(1)

    if has_5etools:
        non_srd_rows = load_5etools_spells(srd_filter=False)
        print(f"  Non-SRD (5etools)     {len(non_srd_rows):4} spells")
    else:
        non_srd_rows = []
        print(f"  Non-SRD              skipped (FIVETOOLS_SRC not set — SRD-only build)")

    all_rows = srd_rows + non_srd_rows
    print(f"\n  Total: {len(all_rows)} spells")

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()

    con = sqlite3.connect(DB_PATH)
    con.execute("""
        CREATE TABLE spells (
            name               TEXT NOT NULL,
            slug               TEXT NOT NULL,
            source             TEXT NOT NULL,
            page               INTEGER,
            level              INTEGER NOT NULL,
            school             TEXT NOT NULL,
            casting_time       TEXT NOT NULL,
            range              TEXT NOT NULL,
            range_feet         INTEGER,
            verbal             INTEGER NOT NULL,
            somatic            INTEGER NOT NULL,
            material           INTEGER NOT NULL,
            ritual             INTEGER NOT NULL,
            concentration      INTEGER NOT NULL,
            duration           TEXT NOT NULL,
            damage_types       TEXT,
            conditions_inflict TEXT,
            save               TEXT,
            spell_attack       TEXT,
            area_tags          TEXT,
            srd                INTEGER NOT NULL,
            entries_json       TEXT,
            higher_level_json  TEXT
        )
    """)
    con.executemany("INSERT INTO spells VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", all_rows)
    con.execute("CREATE INDEX idx_spells_level  ON spells(level)")
    con.execute("CREATE INDEX idx_spells_school ON spells(school)")
    con.execute("CREATE INDEX idx_spells_source ON spells(source)")
    con.execute("CREATE INDEX idx_spells_name   ON spells(name)")
    con.commit()

    print(f"\nWrote {len(all_rows)} rows → {DB_PATH}")

    cur = con.execute("SELECT source, COUNT(*) as n FROM spells GROUP BY source ORDER BY n DESC")
    print("\nBy source:")
    for row in cur:
        print(f"  {row[0]:20} {row[1]:4}")

    con.close()


if __name__ == "__main__":
    main()
