#!/usr/bin/env python3
"""
build-monsters.py

Build monsters.db from the committed SRD CSV plus non-SRD monsters from 5etools.

Normal usage (after cloning 5etools-src):
  python3 scripts/build-monsters.py

CSV-only mode (maintainer tool — regenerates the committed SRD baseline):
  python3 scripts/build-monsters.py --csv

Sources:
  reference/srd/monsters.csv           (SRD 5.2.1, committed)
  $FIVETOOLS_SRC/data/bestiary/bestiary-*.json  (full set, non-SRD appended)
  $FIVETOOLS_SRC/data/bestiary/legendarygroups.json
  $FIVETOOLS_SRC/data/bestiary/fluff-bestiary-*.json  (habitat data)

Output:
  databases/monsters.db  (normal mode)
  reference/srd/monsters.csv  (--csv mode)
"""

import argparse
import csv
import glob
import json
import os
import re
import sqlite3
from pathlib import Path

REPO_ROOT    = Path(__file__).resolve().parent.parent
TOOLS_SRC    = Path(os.environ.get("FIVETOOLS_SRC", REPO_ROOT.parent / "5etools-src"))
BESTIARY_DIR = TOOLS_SRC / "data" / "bestiary"
DB_PATH      = REPO_ROOT / "databases" / "monsters.db"
CSV_PATH     = REPO_ROOT / "reference" / "srd" / "monsters.csv"

# ── CR tables ─────────────────────────────────────────────────────────────────

CR_TO_XP = {
    "0": 10, "1/8": 25, "1/4": 50, "1/2": 100,
    "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
    "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
    "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
    "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
    "21": 33000, "22": 41000, "23": 50000, "24": 62000,
    "25": 75000, "26": 90000, "27": 105000, "28": 120000,
    "29": 135000, "30": 155000,
}
CR_FRAC = {"1/8": 0.125, "1/4": 0.25, "1/2": 0.5}

ALIGN = {
    "L": "Lawful", "N": "Neutral", "C": "Chaotic",
    "G": "Good",   "E": "Evil",    "U": "Unaligned",
    "A": "Any", "NX": "Neutral", "NY": "Neutral",
}
SIZE = {
    "T": "Tiny", "S": "Small",     "M": "Medium",
    "L": "Large", "H": "Huge",     "G": "Gargantuan",
}

COLUMNS = [
    "name", "source", "slug", "cr", "cr_num", "xp",
    "type", "subtype", "size", "alignment",
    "ac", "hp", "hp_formula",
    "walk", "fly", "swim", "burrow", "climb", "hover",
    "str", "dex", "con", "int", "wis", "cha", "passive_perception",
    "darkvision", "blindsight", "truesight", "tremorsense",
    "damage_resistances", "damage_immunities", "condition_immunities",
    "legendary", "mythic", "spellcasting", "lair",
    "trait_names", "habitat", "page", "srd",
]

# ── Parsing helpers ────────────────────────────────────────────────────────────

def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "").replace("'", "")).strip("-")

def parse_cr(cr):
    if cr is None:
        return None, None, None
    cr_str = cr.get("cr") if isinstance(cr, dict) else str(cr)
    cr_num = CR_FRAC.get(cr_str)
    if cr_num is None:
        try:
            cr_num = float(cr_str)
        except (ValueError, TypeError):
            cr_num = 0.0
    return cr_str, cr_num, CR_TO_XP.get(cr_str, 0)

def _unwrap_choose(v):
    """Resolve {"choose": ["a","b"]} → "a"; pass strings through."""
    if isinstance(v, str):
        return v
    if isinstance(v, dict) and "choose" in v:
        choices = v["choose"]
        return choices[0] if choices and isinstance(choices[0], str) else None
    return None

def parse_type(t):
    if isinstance(t, str):
        return t, None
    if isinstance(t, dict):
        if "choose" in t:
            return _unwrap_choose(t), None
        type_str = _unwrap_choose(t.get("type")) or t.get("type")
        if isinstance(type_str, dict):
            type_str = _unwrap_choose(type_str)
        tags = [
            tag if isinstance(tag, str) else tag.get("tag", "")
            for tag in t.get("tags", [])
        ]
        tags = [tag for tag in tags if tag]
        return type_str, "|".join(tags) if tags else None
    return None, None

def parse_size(s):
    if isinstance(s, list) and s:
        return SIZE.get(s[0], s[0])
    if isinstance(s, str):
        return SIZE.get(s, s)
    return None

def parse_alignment(a):
    if not a:
        return None
    codes = []
    for x in a:
        if isinstance(x, str) and x in ALIGN:
            codes.append(x)
        elif isinstance(x, dict):
            # e.g. {"alignment": ["N","G"]} or {"special": "..."}
            for sub in x.get("alignment", []):
                if isinstance(sub, str) and sub in ALIGN:
                    codes.append(sub)
    parts = [ALIGN[x] for x in codes]
    if not parts:
        return None
    return " ".join(dict.fromkeys(parts))

def parse_ac(ac_list):
    if not ac_list:
        return None
    first = ac_list[0]
    return first if isinstance(first, int) else first.get("ac") if isinstance(first, dict) else None

def _spd_val(v) -> int:
    """Speed values can be int or {"number": 30, "condition": "(hover)"}."""
    if isinstance(v, dict):
        return v.get("number") or 0
    return v or 0

def parse_speed(spd):
    if not spd:
        return 0, 0, 0, 0, 0, 0
    return (
        _spd_val(spd.get("walk")),
        _spd_val(spd.get("fly")),
        _spd_val(spd.get("swim")),
        _spd_val(spd.get("burrow")),
        _spd_val(spd.get("climb")),
        int(bool(spd.get("hover"))),
    )

def parse_sense_ft(senses_list, keyword: str) -> int:
    for s in (senses_list or []):
        if isinstance(s, str) and keyword in s.lower():
            m = re.search(r"(\d+)", s)
            return int(m.group(1)) if m else 0
    return 0

def pipe_strings(items) -> str | None:
    if not items:
        return None
    strs = []
    for item in items:
        if isinstance(item, str):
            strs.append(item.lower())
        elif isinstance(item, dict):
            inner = item.get("resist") or item.get("immune") or item.get("vulnerable") or []
            strs.extend(x.lower() for x in inner if isinstance(x, str))
    return "|".join(strs) if strs else None

def pipe_condition_immunities(ci_list) -> str | None:
    if not ci_list:
        return None
    strs = []
    for item in ci_list:
        if isinstance(item, str):
            strs.append(item.lower())
        elif isinstance(item, dict):
            inner = item.get("conditionImmune", [])
            strs.extend(x.lower() for x in inner if isinstance(x, str))
    return "|".join(strs) if strs else None

def parse_habitat(monster: dict, fluff_lookup: dict) -> str | None:
    # Prefer fluff habitat (richer), fall back to environment tags
    fluff = fluff_lookup.get(f"{monster['name']}|{monster['source']}")
    if fluff:
        for e in fluff.get("entries", []):
            if isinstance(e, dict) and e.get("type") == "list":
                for item in e.get("items", []):
                    if isinstance(item, str) and item.startswith("**Habitat"):
                        val = re.sub(r"\*\*Habitat:\*\*\s*", "", item).strip()
                        return val.split(",")[0].strip() if val else None
    env = monster.get("environment", [])
    if env:
        return env[0].replace(",", "").title()
    return None

def parse_spellcasting(monster: dict) -> int:
    return int(
        any(
            t.get("name", "").lower().startswith("spellcast")
            for t in (monster.get("trait") or [])
            if isinstance(t, dict)
        )
        or bool(monster.get("spellcastingTrait"))
    )

def parse_lair(monster: dict, lg_lair: dict) -> int:
    lg = monster.get("legendaryGroup")
    if isinstance(lg, dict):
        return int(lg_lair.get((lg.get("name"), lg.get("source")), False))
    return 0

def build_row(monster: dict, srd: int, fluff_lookup: dict, lg_lair: dict) -> tuple | None:
    name   = monster.get("name", "").strip()
    source = monster.get("source", "").strip()
    if not name or not source:
        return None

    cr_str, cr_num, xp   = parse_cr(monster.get("cr"))
    type_str, subtype     = parse_type(monster.get("type"))
    senses                = monster.get("senses", [])
    walk, fly, swim, burrow, climb, hover = parse_speed(monster.get("speed", {}))

    return (
        name, source, slugify(name), cr_str, cr_num, xp,
        type_str, subtype,
        parse_size(monster.get("size")),
        parse_alignment(monster.get("alignment")),
        parse_ac(monster.get("ac", [])),
        monster.get("hp", {}).get("average") if isinstance(monster.get("hp"), dict) else None,
        monster.get("hp", {}).get("formula") if isinstance(monster.get("hp"), dict) else None,
        walk, fly, swim, burrow, climb, hover,
        monster.get("str"), monster.get("dex"), monster.get("con"),
        monster.get("int"), monster.get("wis"), monster.get("cha"),
        monster.get("passive"),
        parse_sense_ft(senses, "darkvision"),
        parse_sense_ft(senses, "blindsight"),
        parse_sense_ft(senses, "truesight"),
        parse_sense_ft(senses, "tremorsense"),
        pipe_strings(monster.get("resist", [])),
        pipe_strings(monster.get("immune", [])),
        pipe_condition_immunities(monster.get("conditionImmune", [])),
        int(bool(monster.get("legendary") or monster.get("legendaryActions"))),
        int(bool(monster.get("mythic"))),
        parse_spellcasting(monster),
        parse_lair(monster, lg_lair),
        "|".join(
            t.get("name", "") for t in (monster.get("trait") or [])
            if isinstance(t, dict) and t.get("name")
        ) or None,
        parse_habitat(monster, fluff_lookup),
        monster.get("page"),
        srd,
    )

# ── Data loading ───────────────────────────────────────────────────────────────

def load_support_data() -> tuple[dict, dict]:
    """Load legendary group lair flags and fluff habitat data."""
    lg_lair = {}
    lg_path = BESTIARY_DIR / "legendarygroups.json"
    if lg_path.exists():
        data = json.loads(lg_path.read_text())
        for g in data.get("legendaryGroup", []):
            lg_lair[(g["name"], g["source"])] = bool(g.get("lairActions"))

    fluff_lookup = {}
    for f in sorted(BESTIARY_DIR.glob("fluff-bestiary-*.json")):
        data = json.loads(f.read_text())
        for fl in data.get("monsterFluff", []):
            fluff_lookup[f"{fl['name']}|{fl['source']}"] = fl

    return lg_lair, fluff_lookup

def load_bestiary_rows(srd_filter: bool | None, lg_lair: dict, fluff_lookup: dict) -> list[tuple]:
    """
    Load and parse monsters from 5etools bestiary JSON.
    srd_filter=True  → only srd52 monsters (for CSV export)
    srd_filter=False → only non-srd52 monsters (for DB append)
    srd_filter=None  → all monsters
    """
    rows = []
    for path in sorted(BESTIARY_DIR.glob("bestiary-[a-z]*.json")):
        data = json.loads(path.read_text())
        for m in data.get("monster", []):
            is_srd = bool(m.get("srd52"))
            if srd_filter is True and not is_srd:
                continue
            if srd_filter is False and is_srd:
                continue
            srd_val = 1 if is_srd else 0
            row = build_row(m, srd_val, fluff_lookup, lg_lair)
            if row:
                rows.append(row)
    return rows

def read_csv_rows() -> list[tuple]:
    """Read committed SRD CSV back as typed tuples for DB insertion."""
    INT_COLS = {
        "cr_num", "xp", "ac", "hp", "walk", "fly", "swim", "burrow", "climb",
        "hover", "str", "dex", "con", "int", "wis", "cha", "passive_perception",
        "darkvision", "blindsight", "truesight", "tremorsense",
        "legendary", "mythic", "spellcasting", "lair", "page", "srd",
    }
    FLOAT_COLS = {"cr_num"}
    rows = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            typed = []
            for col in COLUMNS:
                v = row.get(col, "") or None
                if v is None:
                    typed.append(None)
                elif col in FLOAT_COLS:
                    typed.append(float(v))
                elif col in INT_COLS:
                    try:
                        typed.append(int(float(v)))
                    except (ValueError, TypeError):
                        typed.append(None)
                else:
                    typed.append(v)
            rows.append(tuple(typed))
    return rows

# ── DB creation ────────────────────────────────────────────────────────────────

CREATE_TABLE = """
CREATE TABLE monsters (
    name                TEXT NOT NULL,
    source              TEXT NOT NULL,
    slug                TEXT NOT NULL,
    cr                  TEXT,
    cr_num              REAL,
    xp                  INTEGER,
    type                TEXT,
    subtype             TEXT,
    size                TEXT,
    alignment           TEXT,
    ac                  INTEGER,
    hp                  INTEGER,
    hp_formula          TEXT,
    walk                INTEGER,
    fly                 INTEGER,
    swim                INTEGER,
    burrow              INTEGER,
    climb               INTEGER,
    hover               INTEGER,
    str                 INTEGER,
    dex                 INTEGER,
    con                 INTEGER,
    int                 INTEGER,
    wis                 INTEGER,
    cha                 INTEGER,
    passive_perception  INTEGER,
    darkvision          INTEGER,
    blindsight          INTEGER,
    truesight           INTEGER,
    tremorsense         INTEGER,
    damage_resistances  TEXT,
    damage_immunities   TEXT,
    condition_immunities TEXT,
    legendary           INTEGER,
    mythic              INTEGER,
    spellcasting        INTEGER,
    lair                INTEGER,
    trait_names         TEXT,
    habitat             TEXT,
    page                INTEGER,
    srd                 INTEGER NOT NULL DEFAULT 0
)
"""

# ── CSV write ──────────────────────────────────────────────────────────────────

def write_csv(rows: list[tuple]) -> None:
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(COLUMNS)
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows → {CSV_PATH}")

# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", action="store_true",
                    help="Export SRD-only CSV (maintainer tool); do not build DB")
    args = ap.parse_args()

    has_5etools = BESTIARY_DIR.exists()
    lg_lair, fluff_lookup = load_support_data() if has_5etools else ({}, {})

    if args.csv:
        if not has_5etools:
            print(f"ERROR: FIVETOOLS_SRC not found at {TOOLS_SRC} — cannot generate CSV")
            raise SystemExit(1)
        rows = load_bestiary_rows(srd_filter=True, lg_lair=lg_lair, fluff_lookup=fluff_lookup)
        rows.sort(key=lambda r: r[0])
        write_csv(rows)
        return

    # Normal mode: SRD from CSV + non-SRD from JSON (if 5etools available)
    srd_rows = []
    if CSV_PATH.exists():
        srd_rows = read_csv_rows()
        print(f"  SRD CSV               {len(srd_rows):4} monsters")
    elif has_5etools:
        print(f"  WARNING: {CSV_PATH} not found — building SRD rows from JSON")
        srd_rows = load_bestiary_rows(srd_filter=True, lg_lair=lg_lair, fluff_lookup=fluff_lookup)
    else:
        print(f"  ERROR: No SRD CSV and no 5etools-src — nothing to build from")
        raise SystemExit(1)

    if has_5etools:
        non_srd_rows = load_bestiary_rows(srd_filter=False, lg_lair=lg_lair, fluff_lookup=fluff_lookup)
        print(f"  Non-SRD (5etools)     {len(non_srd_rows):4} monsters")
    else:
        non_srd_rows = []
        print(f"  Non-SRD              skipped (FIVETOOLS_SRC not set — SRD-only build)")

    # Deduplicate by name: SRD (csv) rows win over non-SRD duplicates.
    # Handles 2014 MM entries (srd=True, srd52=False) that share names with XMM.
    srd_names = {r[0] for r in srd_rows}
    non_srd_rows = [r for r in non_srd_rows if r[0] not in srd_names]

    all_rows = srd_rows + non_srd_rows
    all_rows.sort(key=lambda r: r[0])  # sort by name

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()

    con = sqlite3.connect(DB_PATH)
    con.execute(CREATE_TABLE)
    con.executemany(f"INSERT INTO monsters VALUES ({','.join(['?']*len(COLUMNS))})", all_rows)
    con.execute("CREATE INDEX idx_monsters_name   ON monsters(name)")
    con.execute("CREATE INDEX idx_monsters_cr     ON monsters(cr_num)")
    con.execute("CREATE INDEX idx_monsters_type   ON monsters(type)")
    con.execute("CREATE INDEX idx_monsters_source ON monsters(source)")
    con.commit()
    con.close()

    print(f"\nWrote {len(all_rows)} rows → {DB_PATH}")


if __name__ == "__main__":
    main()
