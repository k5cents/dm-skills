#!/usr/bin/env python3
"""
build-items.py

Build items.db from 5etools-src item JSON files plus Eberron homebrew.

Sources:
  ~/Developer/5etools-src/data/items.json         (magic items)
  ~/Developer/5etools-src/data/items-base.json    (base equipment)
  ~/Developer/5etools-homebrew/collection/Keith Baker; Exploring Eberron - 2024.json
  ~/Developer/5etools-homebrew/collection/Keith Baker; Frontiers of Eberron Quickstone.json

Output: ~/Developer/dnd-reference/databases/items.db

Usage:
  python3 scripts/build-items.py
"""

import argparse
import csv
import json
import os
import re
import sqlite3
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
HOME      = Path.home()

_FIVETOOLS_SRC = os.environ.get("FIVETOOLS_SRC")
_FIVETOOLS_HB  = os.environ.get("FIVETOOLS_HOMEBREW")

TOOLS_DATA = Path(_FIVETOOLS_SRC) / "data" if _FIVETOOLS_SRC \
             else REPO_ROOT.parent / "5etools-src/data"
HOMEBREW   = Path(_FIVETOOLS_HB)  / "collection" if _FIVETOOLS_HB \
             else REPO_ROOT.parent / "5etools-homebrew/collection"
DB_PATH    = REPO_ROOT / "databases/items.db"
CSV_PATH   = REPO_ROOT / "reference/srd/items.csv"

COLUMNS = [
    "name", "slug", "source", "page",
    "type", "type_code", "rarity", "tier",
    "attunement", "attunement_req", "wondrous", "weight", "value_gp",
    "has_spells", "entries_json", "srd",
    # Weapon columns (null for non-weapons)
    "dmg1", "dmg2", "dmg_type", "properties", "mastery",
    "range_normal", "range_long", "weapon_category",
    # Armor columns (null for non-armor)
    "ac_base", "str_req", "stealth_disadv",
]
INT_COLS   = {"page", "attunement", "wondrous", "has_spells", "srd",
              "range_normal", "range_long", "ac_base", "str_req", "stealth_disadv"}
FLOAT_COLS = {"weight", "value_gp"}

# ── Weapon property code → display name ───────────────────────────────────────
PROPERTY_NAMES = {
    "A":   "Ammunition",
    "AF":  "Ammunition (Firearm)",
    "F":   "Finesse",
    "H":   "Heavy",
    "L":   "Light",
    "LD":  "Loading",
    "R":   "Reach",
    "RLD": "Reload",
    "T":   "Thrown",
    "V":   "Versatile",
    "2H":  "Two-Handed",
    "BF":  "Burst Fire",
}

# ── Item type code → human-readable name ─────────────────────────────────────
# Strip source suffixes (e.g. "$A|XDMG" → "$A") before lookup.

TYPE_NAMES = {
    "M":   "Melee Weapon",
    "R":   "Ranged Weapon",
    "A":   "Ammunition",
    "AF":  "Ammunition (Firearm)",
    "AIR": "Airship",
    "AT":  "Artisan's Tools",
    "EXP": "Explosive",
    "FD":  "Food and Drink",
    "G":   "Adventuring Gear",
    "GS":  "Gaming Set",
    "HA":  "Heavy Armor",
    "INS": "Instrument",
    "LA":  "Light Armor",
    "MA":  "Medium Armor",
    "MNT": "Mount",
    "OTH": "Other",
    "P":   "Potion",
    "RD":  "Rod",
    "RG":  "Ring",
    "S":   "Shield",
    "SC":  "Scroll",
    "SCF": "Spellcasting Focus",
    "SHP": "Ship",
    "T":   "Tools",
    "TAH": "Tack and Harness",
    "TG":  "Trade Good",
    "VEH": "Vehicle (Land)",
    "VES": "Vehicle (Water)",
    "WD":  "Wand",
    "$A":  "Art Object",
    "$C":  "Coinage",
    "$G":  "Gemstone",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def strip_type_source(code: str | None) -> str | None:
    """'$A|XDMG' → '$A', 'AT|XPHB' → 'AT'"""
    if not code:
        return None
    return code.split("|")[0]

def parse_value_gp(item: dict) -> float | None:
    """Convert value (in copper pieces) to gold pieces."""
    v = item.get("value")
    if v is None:
        return None
    return round(v / 100, 4)  # 5etools stores value in copper pieces

def parse_attunement(item: dict) -> tuple[int, str | None]:
    """Returns (attunement_bool, attunement_req_or_None)."""
    req = item.get("reqAttune")
    if not req:
        return 0, None
    if req is True or req == "true":
        return 1, None
    if isinstance(req, str) and req.lower() not in ("true", "optional"):
        return 1, req
    return 1, None

def build_row(item: dict, srd: int = 0) -> tuple | None:
    name   = item.get("name", "").strip()
    source = item.get("source", "").strip()
    if not name or not source:
        return None

    raw_type   = item.get("type")
    type_code  = strip_type_source(raw_type)
    type_name  = TYPE_NAMES.get(type_code, type_code) if type_code else None

    # Wondrous items may have no type code
    if not type_name and item.get("wondrous"):
        type_name = "Wondrous Item"
        type_code = "WON"

    rarity  = item.get("rarity", "none") or "none"
    tier    = item.get("tier")
    attune, attune_req = parse_attunement(item)
    wondrous = int(bool(item.get("wondrous")))
    weight   = item.get("weight")
    value_gp = parse_value_gp(item)
    has_spells = int(bool(item.get("attachedSpells")))
    page    = item.get("page")

    # Store raw entries JSON — 5etools tags preserved intact for rendering.
    entries_json = json.dumps(item.get("entries", []))

    # ── Weapon fields ──────────────────────────────────────────────────────────
    dmg1 = item.get("dmg1")
    dmg2 = item.get("dmg2")
    dmg_type = item.get("dmgType")  # "B", "P", or "S"

    # Properties: ["F|XPHB", "L|XPHB"] → "Finesse|Light"
    raw_props = item.get("property") or []
    prop_names = []
    for p in raw_props:
        code = p.split("|")[0] if isinstance(p, str) else None
        if code and code in PROPERTY_NAMES:
            prop_names.append(PROPERTY_NAMES[code])
    properties = "|".join(prop_names) if prop_names else None

    # Mastery: ["Topple|XPHB"] → "Topple" (skip dict entries from non-SRD sources)
    raw_mastery = item.get("mastery") or []
    mastery = None
    for m in raw_mastery:
        if isinstance(m, str):
            mastery = m.split("|")[0]
            break

    # Range: "20/60" → range_normal=20, range_long=60
    range_normal = range_long = None
    raw_range = item.get("range")
    if raw_range and isinstance(raw_range, str) and "/" in raw_range:
        parts = raw_range.split("/")
        try:
            range_normal, range_long = int(parts[0]), int(parts[1])
        except (ValueError, IndexError):
            pass

    weapon_category = item.get("weaponCategory")  # "simple" or "martial"
    if weapon_category:
        weapon_category = weapon_category.capitalize()

    # ── Armor fields ───────────────────────────────────────────────────────────
    ac_base = item.get("ac") if isinstance(item.get("ac"), int) else None
    str_req = item.get("strength")
    stealth_disadv = int(bool(item.get("stealth"))) if item.get("stealth") is not None else None

    return (
        name, slugify(name), source, page,
        type_name, type_code,
        rarity, tier,
        attune, attune_req,
        wondrous, weight, value_gp,
        has_spells,
        entries_json,
        srd,
        dmg1, dmg2, dmg_type, properties, mastery,
        range_normal, range_long, weapon_category,
        ac_base, str_req, stealth_disadv,
    )

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
                elif col in FLOAT_COLS:
                    try:
                        typed.append(float(v))
                    except (ValueError, TypeError):
                        typed.append(None)
                else:
                    typed.append(v)
            rows.append(tuple(typed))
    return rows


def load_5etools_items(srd_filter: bool | None) -> list[tuple]:
    """Load items from 5etools JSON, optionally filtering by SRD status."""
    raw: list[dict] = []

    def _load(path: Path, key: str, label: str) -> None:
        if not path.exists():
            print(f"  MISSING: {path}")
            return
        with open(path) as f:
            data = json.load(f)
        items = data.get(key, [])
        raw.extend(items)
        print(f"  {label:45} {len(items):5} items")

    _load(TOOLS_DATA / "items.json",      "item",     "items.json (magic items)")
    _load(TOOLS_DATA / "items-base.json", "baseitem", "items-base.json (equipment)")

    for fname, label in [
        ("Keith Baker; Exploring Eberron - 2024.json",        "ExploringEberron24 (homebrew)"),
        ("Keith Baker; Frontiers of Eberron Quickstone.json", "FoEQuickstone (homebrew)"),
    ]:
        path = HOMEBREW / fname
        if path.exists():
            with open(path) as f:
                data = json.load(f)
            items = data.get("item", []) + data.get("baseitem", [])
            raw.extend(items)
            print(f"  {label:45} {len(items):5} items")

    rows = []
    for item in raw:
        is_srd = bool(item.get("srd52"))
        if srd_filter is True and not is_srd:
            continue
        if srd_filter is False and is_srd:
            continue
        r = build_row(item, srd=1 if is_srd else 0)
        if r:
            rows.append(r)
    return rows


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", action="store_true",
                    help="Export SRD-only CSV (maintainer tool); do not build DB")
    args = ap.parse_args()

    has_5etools = TOOLS_DATA.exists()

    if args.csv:
        if not has_5etools:
            print(f"ERROR: FIVETOOLS_SRC not found at {TOOLS_DATA} — cannot generate CSV")
            raise SystemExit(1)
        rows = load_5etools_items(srd_filter=True)
        write_csv(rows)
        return

    # Normal mode: SRD from CSV + non-SRD from 5etools JSON (if available)
    srd_rows = []
    if CSV_PATH.exists():
        srd_rows = read_csv_rows()
        print(f"  SRD CSV               {len(srd_rows):5} items")
    elif has_5etools:
        print(f"  WARNING: {CSV_PATH} not found — building SRD rows from JSON")
        srd_rows = load_5etools_items(srd_filter=True)
    else:
        print(f"  ERROR: No SRD CSV and no 5etools-src — nothing to build from")
        raise SystemExit(1)

    if has_5etools:
        non_srd_rows = load_5etools_items(srd_filter=False)
        print(f"  Non-SRD (5etools)     {len(non_srd_rows):5} items")
    else:
        non_srd_rows = []
        print(f"  Non-SRD              skipped (FIVETOOLS_SRC not set — SRD-only build)")

    all_rows = srd_rows + non_srd_rows
    print(f"\n  Total: {len(all_rows)} items")

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()

    con = sqlite3.connect(DB_PATH)
    con.execute("""
        CREATE TABLE items (
            name           TEXT NOT NULL,
            slug           TEXT NOT NULL,
            source         TEXT NOT NULL,
            page           INTEGER,
            type           TEXT,
            type_code      TEXT,
            rarity         TEXT,
            tier           TEXT,
            attunement     INTEGER NOT NULL,
            attunement_req TEXT,
            wondrous       INTEGER NOT NULL,
            weight         REAL,
            value_gp       REAL,
            has_spells     INTEGER NOT NULL,
            entries_json   TEXT,
            srd            INTEGER NOT NULL DEFAULT 0,
            dmg1           TEXT,
            dmg2           TEXT,
            dmg_type       TEXT,
            properties     TEXT,
            mastery        TEXT,
            range_normal   INTEGER,
            range_long     INTEGER,
            weapon_category TEXT,
            ac_base        INTEGER,
            str_req        INTEGER,
            stealth_disadv INTEGER
        )
    """)
    placeholders = ",".join("?" * len(COLUMNS))
    con.executemany(f"INSERT INTO items VALUES ({placeholders})", all_rows)
    con.execute("CREATE INDEX idx_items_name   ON items(name)")
    con.execute("CREATE INDEX idx_items_source ON items(source)")
    con.execute("CREATE INDEX idx_items_rarity ON items(rarity)")
    con.execute("CREATE INDEX idx_items_type   ON items(type)")
    con.commit()

    print(f"\nWrote {len(all_rows)} rows → {DB_PATH}")

    print("\nMagic items by rarity:")
    cur = con.execute("""
        SELECT rarity, COUNT(*) as n FROM items
        GROUP BY rarity ORDER BY
          CASE rarity
            WHEN 'common'    THEN 1 WHEN 'uncommon'  THEN 2 WHEN 'rare'      THEN 3
            WHEN 'very rare' THEN 4 WHEN 'legendary' THEN 5 WHEN 'artifact'  THEN 6
            ELSE 7 END
    """)
    for row in cur:
        print(f"  {row[0]:20} {row[1]:5}")

    con.close()


if __name__ == "__main__":
    main()
