# Setup Guide

This guide covers the **clone path** (Option B from the README) — full setup
including non-SRD content from 5etools. For the simpler plugin install path,
see the README.

`dm-skills` requires two external repos — the 5etools source data and the 5etools
homebrew collection. These are **read-only references**; the skills query them but
never modify them. All built artifacts (databases, rendered sourcebooks) stay inside
this repo and are excluded from version control.

---

## Quick setup (recommended)

```sh
bash scripts/setup.sh
```

This clones the two 5etools repos (as siblings of this repo), builds `spells.db`
and `items.db`, and exports XPHB, XDMG, and XMM sourcebooks. Then follow the
printed instructions to set `DM_SKILLS_DIR` in your shell profile.

Options:
```sh
bash scripts/setup.sh --books "XPHB XDMG XMM ERLW EFA ExploringEberron24"
bash scripts/setup.sh --no-clone   # skip cloning, repos already exist
bash scripts/setup.sh --force      # rebuild even if artifacts exist
```

The rest of this document explains each step manually, if you prefer.

---

## 1. Clone the external repos

By default, scripts expect these to be **siblings** of `dm-skills/`:

```sh
# Wherever you keep your repos — just keep them next to dm-skills/
git clone --depth=1 https://github.com/5etools-mirror-3/5etools-src
git clone --depth=1 https://github.com/TheGiddyLimit/homebrew 5etools-homebrew
```

If you put them elsewhere, set environment variables:

```sh
export FIVETOOLS_SRC=/path/to/5etools-src
export FIVETOOLS_HOMEBREW=/path/to/5etools-homebrew
```

Add these to your shell profile (`~/.zshrc`, `~/.bashrc`) to persist them.

---

## 2. Set DM_SKILLS_DIR

Skills need to know where this repo lives to find the databases and sourcebooks:

```sh
export DM_SKILLS_DIR=/path/to/dm-skills
```

Add this to your shell profile. For the default sibling layout:

```sh
export DM_SKILLS_DIR=~/Developer/dm-skills
```

---

## 3. Check Node.js version

`render-entry.mjs` and `export-book.mjs` require Node.js 24+:

```sh
node --version   # should be v24.0.0 or higher
```

Install or update at https://nodejs.org if needed.

---

## 4. Build the databases

The SRD baseline is pre-built as committed CSVs in `reference/srd/`. The
build scripts read those CSVs and append non-SRD content from your 5etools clone:

```sh
python3 scripts/build-spells.py    # spells.db  — SRD CSV + all 5etools spells
python3 scripts/build-items.py     # items.db   — SRD CSV + magic items + Eberron homebrew
python3 scripts/build-monsters.py  # monsters.db — SRD CSV + all 5etools monsters
```

Skills query the databases via `scripts/query.py`, which uses Python's built-in
`sqlite3` module — no `sqlite3` CLI required.

SRD stat blocks (CC BY 4.0) are pre-rendered in `reference/srd/monsters/` and
committed to the repo. Non-SRD stat blocks go to `statblocks/` (gitignored):
```sh
node scripts/render-monsters.mjs --non-srd --out statblocks/
```
The `--non-srd` flag skips the 335 SRD monsters already committed in
`reference/srd/monsters/`, avoiding duplicates.

---

## 5. Export sourcebook chapters (optional but recommended)

The `eberron-lore` skill and the `/dnd-spells` render workflow require sourcebook
markdown files. Export the books you want:

```sh
# Eberron sourcebooks (required for eberron-lore skill)
node scripts/export-book.mjs ERLW
node scripts/export-book.mjs EFA
node scripts/export-book.mjs ExploringEberron24
node scripts/export-book.mjs FoEQuickstone

# Core rulebooks (optional — large files)
node scripts/export-book.mjs XPHB
node scripts/export-book.mjs XDMG
node scripts/export-book.mjs XMM
node scripts/export-book.mjs TCE
node scripts/export-book.mjs XGE
node scripts/export-book.mjs XSAC
```

Output goes to `sourcebooks/<slug>/`. Skips Credits chapters by default.

---

## 6. Verify setup

```sh
# Should return a row
python3 scripts/query.py spells.db "SELECT name, level, school FROM spells WHERE name='Fireball' AND source='XPHB'"

# Should render markdown
node --experimental-sqlite scripts/render-entry.mjs --spell "Fireball"
```

---

## Updating

Pull the latest content from the external repos when WotC/5etools updates:

```sh
git -C $FIVETOOLS_SRC pull
git -C $FIVETOOLS_HOMEBREW pull

# Rebuild databases after an update
python3 scripts/build-spells.py
python3 scripts/build-items.py

# Re-export any sourcebooks that changed
node scripts/export-book.mjs XPHB
```
