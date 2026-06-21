# dm-skills

Claude Code skills for tabletop RPG Dungeon Masters. Query spell databases, look up
magic items, find encounter creatures, and search sourcebook lore — all from within
your campaign prep sessions.

Built for D&D 5e (2024 rules). Skills use structured data from the
[5etools](https://github.com/5etools-mirror-3/5etools-src) ecosystem — content that
you provide by cloning those repos locally. No copyrighted content is bundled here.

---

## Skills

| Skill | What it does |
|-------|-------------|
| `/dnd-spells` | Filter 940 spells by level, school, casting time, damage type, etc. Render full spell text with `render-entry.mjs` |
| `/dnd-items` | Filter 2,790 magic items by rarity, type, attunement, source. Includes Eberron homebrew items |
| `/dnd-monsters` | Filter 4,200+ monsters by CR, type, habitat, traits. Read individual statblock files for full mechanics |
| `/eberron-lore` | Search pre-exported Eberron sourcebook chapters (ERLW, EE 2024, EFOTA, FoEQuickstone) |

Compact reference tables loaded automatically into every skill session (no setup required):
- Conditions — all 14 conditions with full mechanical effects
- Damage types — all 13 types with resistance/immunity patterns
- Encounter math — XP thresholds, CR/XP table, multipliers

These live in `.claude/skills/_shared/references/` and stay small by design —
skills load the full `reference/srd/` library on demand when they need
spell text, stat blocks, or rules definitions.

---

## Install

### Option A — Plugin marketplace (SRD content only, no setup required)

Add this repo as a plugin marketplace in Claude Code, then install the skills
you want:

```sh
/plugin marketplace add k5cents/dm-skills

# Install all D&D SRD skills (monsters, spells, items)
/plugin install dnd@dm-skills

# Install Eberron lore skill (requires sourcebook setup — see SETUP.md)
/plugin install eberron@dm-skills
```

After installing, set `DM_SKILLS_DIR` to the plugin's installed path and build
the SRD databases from the committed CSVs (no external repos needed):

```sh
export DM_SKILLS_DIR=~/.claude/plugins/dm-skills   # adjust to actual install path
python3 $DM_SKILLS_DIR/scripts/build-monsters.py
python3 $DM_SKILLS_DIR/scripts/build-spells.py
python3 $DM_SKILLS_DIR/scripts/build-items.py
```

### Option B — Clone (full library including non-SRD content)

```sh
# 1. Clone this repo
git clone https://github.com/k5cents/dm-skills ~/Developer/dm-skills

# 2. Run setup — clones 5etools repos, builds full databases, exports sourcebooks
cd ~/Developer/dm-skills && bash scripts/setup.sh

# 3. Symlink skills into your campaign project
ln -s ~/Developer/dm-skills/skills /path/to/your/campaign/.claude/skills
```

See **[SETUP.md](SETUP.md)** for options (custom book list, manual steps, troubleshooting).

### Environment variables

Add these to your shell profile (`~/.zshrc`, `~/.bashrc`):

```sh
export DM_SKILLS_DIR=~/Developer/dm-skills        # where this repo lives (Option B)
export FIVETOOLS_SRC=~/Developer/5etools-src       # 5etools source clone (Option B only)
export FIVETOOLS_HOMEBREW=~/Developer/5etools-homebrew  # homebrew (Option B only)
```

---

## Requirements

- Node.js 24+
- Python 3.10+ (stdlib `sqlite3` used — no extra packages needed)
- Two external repo clones (see SETUP.md)

---

## What's included

The `reference/srd/` directory is committed to this repo. It contains
1,337 markdown files derived from the [SRD 5.2.1](https://www.dndbeyond.com/srd)
(CC BY 4.0) — no setup required to use them.

| Directory | Files | Contents |
|-----------|------:|---------|
| `monsters/` | 335 | Stat blocks for all SRD 5.2.1 creatures |
| `spells/` | 339 | Full spell descriptions |
| `magic-items/` | 474 | Magic item descriptions |
| `rules-glossary/` | 115 | Rules glossary entries and definitions |
| `classes/` | 12 | Class and subclass rules |
| `playing-the-game/` | 14 | Core rules (d20 tests, combat, conditions) |
| `character-creation/` | 7 | Character creation steps and advancement |
| `origins/` | 14 | Backgrounds (4) and species (9) with intro |
| `feats/` | 17 | Origin feats, general feats, epic boons |
| `equipment/` | 5 | Weapons, armor, tools, ammunition |
| `gameplay-toolbox/` | 4 | Optional rules (poisons, traps, fear, curses) |

Skills that read statblock or spell files check `reference/srd/` **first**,
then fall back to the locally-built `statblocks/` or `sourcebooks/` directories.
This avoids duplication — SRD monsters rendered into `statblocks/` via
`render-monsters.mjs` are skipped automatically (use `--non-srd` flag).

---

## What's not included

The `databases/`, `sourcebooks/`, and `statblocks/` directories are gitignored —
they contain content compiled from WotC sourcebooks and must be built locally
using the scripts in `scripts/`. See SETUP.md.

The bundled `reference/srd/` files are derived from the
[Systems Reference Document 5.2.1](https://www.dndbeyond.com/srd),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
See [reference/srd/LEGAL.md](reference/srd/LEGAL.md) for the full attribution notice.

---

## License

MIT for code and skill instructions.
Bundled reference files: CC BY 4.0 (derived from SRD v5.2.1, Wizards of the Coast).
