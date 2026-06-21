# dm-skills

Claude Code skills plugin for tabletop RPG Dungeon Masters. Users install it as a
Claude plugin or clone it for a full local library. See README.md for user-facing
install instructions; this file is for AI-assisted development of the repo itself.

---

## Repository structure

```
dm-skills/
├── .claude-plugin/
│   └── marketplace.json       # Marketplace catalog: lists "dnd" and "eberron" plugins
├── plugins/                   # Plugin install units (one per installable group)
│   ├── dnd/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json    # dnd plugin manifest (name, version, skills path)
│   │   └── skills/            # Symlinks → ../../skills/{dnd-monsters,dnd-spells,dnd-items,_shared}
│   └── eberron/
│       ├── .claude-plugin/
│       │   └── plugin.json    # eberron plugin manifest
│       └── skills/            # Symlinks → ../../skills/{eberron-lore,_shared}
├── skills/                    # Canonical skill source — used directly by symlink install (Option B)
│   ├── _shared/references/    # Compact tables auto-loaded into every skill session
│   │   ├── conditions.md      # All 15 conditions with mechanical summaries
│   │   ├── damage-types.md    # All 13 damage types with resistance/immunity rules
│   │   └── encounter-math.md  # XP thresholds, CR/XP table, encounter multipliers
│   ├── dnd-items/SKILL.md
│   ├── dnd-monsters/SKILL.md
│   ├── dnd-spells/SKILL.md
│   └── eberron-lore/SKILL.md
├── reference/
│   ├── srd/              # SRD 5.2.1 content rendered from 5etools JSON (CC BY 4.0)
│   │   ├── LEGAL.md           # Required CC-BY-4.0 attribution notice
│   │   ├── monsters.csv       # SRD monster index — committed, drives DB build
│   │   ├── spells.csv         # SRD spell index — committed, drives DB build
│   │   ├── items.csv          # SRD item index — committed, drives DB build
│   │   ├── monsters/          # 335 stat block markdown files (Homebrewery format)
│   │   ├── spells/            # 339 spell markdown files
│   │   ├── magic-items/       # 474 magic item markdown files (PENDING AUDIT — see below)
│   │   ├── classes/           # 12 class files
│   │   ├── origins/           # Backgrounds (4) + species (9) + README intro
│   │   ├── feats/             # 17 feats
│   │   ├── equipment/         # 5 equipment files
│   │   ├── playing-the-game/  # 14 core rules files
│   │   ├── character-creation/ # 7 character creation files
│   │   ├── gameplay-toolbox/  # 4 optional rules files
│   │   └── rules-glossary/    # 115 glossary entries
│                              # (srd-pdf/ deleted after audit — srd/ is the clean canonical copy)
│                              # Will be deleted or renamed after srd audit completes
├── scripts/
│   ├── query.py               # SQLite query wrapper — replaces sqlite3 CLI, outputs MD tables
│   ├── build-csv.py           # Maintainer tool: regenerates committed SRD CSVs from 5etools
│   ├── build-monsters.py      # Builds databases/monsters.db (CSV + non-SRD from 5etools)
│   ├── build-spells.py        # Builds databases/spells.db
│   ├── build-items.py         # Builds databases/items.db
│   ├── render-monsters.mjs    # Renders SRD stat blocks to srd/monsters/ via 5etools renderer
│   ├── render-*.mjs           # Other render scripts for spells, items, classes, etc.
│   └── export-book.mjs        # Exports full sourcebook chapters to sourcebooks/
├── databases/                 # Gitignored — built locally by build-*.py scripts
├── statblocks/                # Gitignored — non-SRD stat blocks built by render-monsters.mjs
└── sourcebooks/               # Gitignored — exported book chapters for eberron-lore skill
```

---

## Content constraints

**`reference/` must contain only CC-BY-4.0 SRD 5.2.1 content.** No non-SRD prose,
flavor text, or content from non-SRD sourcebooks (ERLW, XDMG non-SRD sections, etc.).

The SRD filter in 5etools JSON is the `srd52: true` flag. This is distinct from
`srd: true` (the 2014 5.1 SRD). Always filter to `srd52` for committed content.

`databases/`, `statblocks/`, and `sourcebooks/` may contain non-SRD content — they
are gitignored and locally derived.

---

## Two-tier install model

**Plugin install** (no clone): User runs `/plugin marketplace add k5cents/dm-skills`,
sets `$DM_SKILLS_DIR` to the plugin cache path, runs `build-*.py` scripts which
produce SRD-only databases from the committed CSVs (no `FIVETOOLS_SRC` needed).

**Clone install** (full library): User clones the repo, sets `FIVETOOLS_SRC` and
`FIVETOOLS_HOMEBREW`, runs `build-*.py` to get full databases including non-SRD
monsters (4,212 total vs 335 SRD-only).

Build scripts check `BESTIARY_DIR.exists()` / `TOOLS_DIR.exists()` before loading
non-SRD content — they degrade to SRD-only if 5etools is absent.

---

## Database design

Three committed CSVs in `reference/srd/` serve as the SRD baseline:
- `monsters.csv` — 335 rows, 41 columns including `srd=1`
- `spells.csv` — 339 rows, 23 columns including `srd` flag
- `items.csv` — 566 rows (321 magic + 245 base equipment), 16 columns including `srd=1`

Build scripts read the CSV first (SRD rows, `srd=1`), then append non-SRD rows from
5etools JSON (`srd=0`). Monster deduplication: when a 2014 MM monster shares a name
with an XMM SRD monster, the SRD (CSV) version wins.

`query.py` uses Python's stdlib `sqlite3` — no `sqlite3` CLI required. Skills call:
```sh
python3 $DM_SKILLS_DIR/scripts/query.py monsters.db "SELECT ..."
```
`query.py` resolves `$DM_SKILLS_DIR` from the env var, falling back to `__file__`-
relative path discovery so it works when invoked from a plugin install path.

---

## 5etools dependency

`~/Developer/5etools-src` (or `$FIVETOOLS_SRC`) — read-only reference. Never modify.
The `RendererMarkdown.monster` class (in `js/render-markdown.js`) is used by
`render-monsters.mjs` to produce the Homebrewery blockquote stat block format.

Key 5etools internals used in render scripts:
- `srd52: true` flag on monster/spell/item objects — the SRD filter
- `legendarygroups.json` — lair actions and regional effects for boss monsters (these
  ARE included; 5etools marks legendary group content as part of the stat block)
- `fluff-bestiary-*.json` — NOT used; 5etools marks zero fluff entries as srd52, so
  all monster lore/habitat/prose is non-SRD and must not appear in `reference/`
- `VetoolsConfig.set("styleSwitcher", "style", "one")` — forces 2024 format
- `meta._typeStack = []` must be pre-initialized before calling `_recursiveRender`

Browser stubs required in Node.js: `globalThis.UiUtil.intToBonus()` and
`globalThis.DataLoader.getFromCache()` (pre-populated from legendarygroups.json).

---

## Pending work

**Rename `srd/` → `srd/` (unblocked):**
The SRD legality audit is complete. Findings:
- Monster fluff prose (`fluff-bestiary-*.json`) is non-SRD — stripped from all 118
  affected files; `render-monsters.mjs` updated to never include it going forward
- All 474 `magic-items/` files are SRD — the count vs CSV difference (566 CSV items
  vs 474 rendered) is because 92 SRD base equipment items were never rendered as
  markdown (not a problem; the CSV covers them for DB purposes)
- Classes, spells, feats, equipment, origins, rules-glossary — all clean


**Glossary gaps now resolved** — the following are rendered to
`reference/srd/rules-glossary/rules-definitions/` by dedicated scripts:
- **Conditions + statuses** (18 files) via `render-conditions.mjs` — blinded.md through
  unconscious.md plus bloodied.md, concentration.md, surprised.md (all XPHB srd52).
  `skills/_shared/references/conditions.md` updated to 2024 mechanics throughout.
- **Game actions** (15 files) via `render-actions.mjs` — attack, dash, dodge, help,
  hide, ready, etc. (all XPHB srd52).
- **Special senses** (4 files) via `render-senses.mjs` — blindsight, darkvision,
  tremorsense, truesight (all XPHB srd52).
- **Hazards** (5 files) via `render-hazards.mjs` — burning, dehydration, falling,
  malnutrition, suffocation (XPHB; lack srd52 flag in 5etools but confirmed in PDF).

**Still unrendered SRD52 content** (lower priority — not yet needed by any skill):
- `trapshazards.json` [trap] — 8 SRD traps from XDMG (Collapsing Roof, Hidden Pit, etc.)
  `gameplay-toolbox/traps.md` already lists names; individual files would add mechanics.
- `items-base.json` [itemMastery] — 8 weapon mastery properties (all srd52)
- `conditionsdiseases.json` [disease] — 3 XDMG diseases (Cackle Fever, Sewer Plague, Sight Rot)
- `languages.json` [language] — 19 srd52 languages
- `optionalfeatures.json` [optionalfeature] — 29 srd52 (fighting styles, invocations, etc.)

---

## Plugin structure

`.claude-plugin/marketplace.json` defines two plugin groups:
- `dnd` — dnd-monsters, dnd-spells, dnd-items (SRD skills, work after CSV DB build)
- `eberron` — eberron-lore (requires sourcebook export via `export-book.mjs`)

Skills live in `skills/` (plugin-canonical location). There is no `.claude/` directory
in this repo — skills are consumed by users who symlink `skills/` into their campaign
project's `.claude/skills/`.

`skills/_shared/references/` contains small always-loaded tables (conditions,
damage types, encounter math). These are ambient context for all skills, not on-demand
reads. Keep them small — large content goes in `reference/srd/` and is read by
skills explicitly.
