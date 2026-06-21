---
name: dnd-spells
description: >
  Query the spells database to find, compare, or select spells for NPCs, encounters,
  or player reference. Use this skill whenever the task involves spell selection —
  building an NPC's spell list, finding all concentration spells of a given level,
  identifying save-based crowd control options, picking cantrips for a spellcaster,
  or answering "what spells would this character have?" Use it even when the request
  doesn't say "spell" explicitly — if you're designing a spellcasting NPC or encounter,
  invoke this skill to ground the selection in the actual spell database.
---

# Spell Lookup

Query `$DM_SKILLS_DIR/databases/spells.db` via SQLite.
See `$DM_SKILLS_DIR/databases/spells-README.md` for the full schema.

## Schema (key columns)

```
name, slug, source, page, level (0–9), school, casting_time, range, range_feet,
verbal, somatic, material, ritual (0/1), concentration (0/1), duration,
damage_types, conditions_inflict, save, spell_attack, area_tags, srd
```

School values: Abjuration, Conjuration, Divination, Enchantment, Evocation,
               Illusion, Necromancy, Transmutation

Casting time values: "action" | "bonus action" | "reaction" | "1 minute" | "10 minutes" | "1 hour" | "8 hours"

**Note:** Class associations aren't in the DB. Filter by source as a proxy:
- All classes: XPHB
- Artificer-specific: EFA, ExploringEberron24
- Expanded options: XGE, TCE

For 5.5e campaigns, prefer XPHB over PHB (2024 supersedes 2014).

## Workflow

If `$DM_SKILLS_DIR` is unset (`echo $DM_SKILLS_DIR` is blank), derive it from the
"Base directory for this skill" path shown at the top of this context — go 4 levels up
from `.../plugins/dnd/skills/dnd-spells/`:
```sh
export DM_SKILLS_DIR=$(cd "<base-dir-from-above>/../../../.." && pwd)
```

**Finding spells** — SQL filter query:
```sh
python3 $DM_SKILLS_DIR/scripts/query.py spells.db "SELECT ..."
```

**Reading a spell's full text** — render to markdown:
```sh
# Clean prose (default) — for NPC design, encounter planning, player-facing use
node --experimental-sqlite $DM_SKILLS_DIR/scripts/render-entry.mjs --spell "Fireball"
node --experimental-sqlite $DM_SKILLS_DIR/scripts/render-entry.mjs --spell "Fireball" --source XPHB

# Tagged mode — for rules adjudication, cross-referencing conditions/spells/scaling
node --experimental-sqlite $DM_SKILLS_DIR/scripts/render-entry.mjs --spell "Hold Person" --tags
```

`--tags` preserves cross-reference tags while stripping noise:
- **Kept:** `{@condition}`, `{@spell}`, `{@item}`, `{@scaledamage}`, `{@creature}`, `{@action}`
- **Stripped to text:** `{@damage}`, `{@variantrule}`, `{@hazard}`, `{@b}`, `{@i}`, etc.

`{@scaledamage 8d6|3-9|1d6}` is the clearest example of why `--tags` matters: the clean render
outputs only the increment ("1d6 per level above 3"), losing the base damage entirely.
`{@condition Paralyzed|XPHB}` signals a mechanically-defined term to look up — not just a word.

Use the SQL filter first to identify candidates, then render specific spells for full details.

## Common Query Patterns

**NPC spell list by level range and role:**
```sql
SELECT name, level, school, range, duration, damage_types, save
FROM spells
WHERE level BETWEEN 1 AND 5
  AND source IN ('XPHB', 'XGE', 'TCE')
  AND school = 'Enchantment'
ORDER BY level, name;
```

**Reaction spells for a reactive NPC:**
```sql
SELECT name, level, school, range, duration
FROM spells
WHERE casting_time = 'reaction'
ORDER BY level, name;
```

**Cantrips that deal damage:**
```sql
SELECT name, source, school, range, damage_types, spell_attack, save
FROM spells
WHERE level = 0 AND damage_types IS NOT NULL
  AND source IN ('XPHB', 'EFA', 'ExploringEberron24')
ORDER BY school, name;
```

**All Eberron-native spells:**
```sql
SELECT name, level, school, casting_time, range, damage_types
FROM spells
WHERE source IN ('EFA', 'ExploringEberron24')
ORDER BY level, name;
```

**Concentration crowd-control spells (for a caster who controls the battlefield):**
```sql
SELECT name, level, school, range, duration, conditions_inflict, save
FROM spells
WHERE concentration = 1
  AND conditions_inflict IS NOT NULL
  AND source IN ('XPHB', 'XGE', 'TCE')
ORDER BY level, name;
```

## Output Format

Present results as a compact markdown table. For NPC spell selection, group by level
and note which spells fit the character's role and Eberron's tone. Prefer XPHB sources
over PHB for 5.5e. Flag anything Eberron-specific that adds flavor.
