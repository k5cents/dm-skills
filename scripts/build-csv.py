#!/usr/bin/env python3
"""
build-csv.py

Regenerate the SRD baseline CSVs committed to reference/srd/.
Run this only when the SRD content changes (new release) or after schema changes.

Normal users never need to run this — the CSVs are committed to the repo.
The setup scripts (build-spells.py, build-items.py, build-monsters.py) read
the committed CSVs and append non-SRD content from 5etools automatically.

Requires: $FIVETOOLS_SRC clone (default: ../5etools-src sibling of this repo)

Usage:
  python3 scripts/build-csv.py               # all three
  python3 scripts/build-csv.py --spells      # just spells
  python3 scripts/build-csv.py --items --monsters
"""

import argparse
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent


def run(script: str, label: str) -> None:
    print(f"\n── {label} ──────────────────────────────────")
    subprocess.run([sys.executable, str(SCRIPTS / script), "--csv"], check=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="Regenerate committed SRD baseline CSVs")
    ap.add_argument("--spells",   action="store_true")
    ap.add_argument("--items",    action="store_true")
    ap.add_argument("--monsters", action="store_true")
    args = ap.parse_args()

    all_types = not (args.spells or args.items or args.monsters)

    if all_types or args.spells:
        run("build-spells.py",   "Spells   → reference/srd/spells.csv")
    if all_types or args.items:
        run("build-items.py",    "Items    → reference/srd/items.csv")
    if all_types or args.monsters:
        run("build-monsters.py", "Monsters → reference/srd/monsters.csv")

    print("\nDone. Commit the updated CSVs in reference/srd/.")


if __name__ == "__main__":
    main()
