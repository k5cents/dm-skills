---
name: dnd-monsters
description: >
  Query the monsters database to find creatures for encounters, populate a location
  with appropriate inhabitants, or look up a specific monster's stat block. Use this
  skill whenever encounter design is involved — finding creatures by CR, type, habitat,
  or special trait; building a balanced encounter; stocking an Eberron location like the
  Cogs, Lower Dura, or the Mournland; or answering "what constructs or undead fit this
  scene?" Always invoke this skill before selecting monsters for an encounter rather than
  working from memory.
---

# Monster Lookup

Query `$DM_SKILLS_DIR/databases/monsters.db` via SQLite, then read individual
statblock files for full mechanics and lore.
See `$DM_SKILLS_DIR/databases/monsters-README.md` for full schema and sample queries.

## Schema (key columns)

```
name, source, slug, cr, cr_num (float for sorting), xp,
type, subtype, size, alignment,
ac, hp, hp_formula,
walk, fly, swim, burrow, climb, hover (0/1),
str, dex, con, int, wis, cha, passive_perception,
darkvision, blindsight, truesight, tremorsense,
damage_resistances, damage_immunities, condition_immunities (pipe-separated),
legendary (0/1), mythic (0/1), spellcasting (0/1), lair (0/1),
trait_names (pipe-separated),
habitat, page
```

**Eberron sources:** `ERLW`, `EFA`, `ExploringEberron24`
**CR fractions:** `1/8`=0.125, `1/4`=0.25, `1/2`=0.5 — use `cr_num` for range queries.

## Workflow

**Step 1 — Filter with SQL:**
```sh
python3 $DM_SKILLS_DIR/scripts/query.py monsters.db "SELECT ..."
```

**Step 2 — Read the statblock:**
Once you have candidates, read the full stat block for any monster you intend to use.
Use the `slug` column from the DB to get the exact filename, then check paths in order:

1. `$DM_SKILLS_DIR/reference/srd/monsters/<slug>.md` — SRD monsters (always present)
2. `$DM_SKILLS_DIR/statblocks/<slug>.md` — non-SRD monsters (locally built, may not exist)

Do NOT rely on the SQL results alone for mechanics — always read the statblock before presenting
a monster to the DM. CR, AC, and HP are in the DB; traits, actions, and lore are in the file.

## Common Query Patterns

**Encounter by CR range and type (most common use):**
```sql
SELECT name, cr, type, ac, hp, habitat, source
FROM monsters
WHERE cr_num BETWEEN 2 AND 5
  AND type = 'construct'
ORDER BY cr_num, name;
```

**Eberron-specific creatures:**
```sql
SELECT name, cr, type, source, legendary
FROM monsters
WHERE source IN ('ERLW', 'EFA', 'ExploringEberron24')
ORDER BY cr_num;
```

**Urban ambush candidates (Sharn / Cogs):**
```sql
SELECT name, cr, type, ac, hp, darkvision, spellcasting
FROM monsters
WHERE habitat LIKE '%Urban%'
  AND cr_num BETWEEN 1 AND 6
ORDER BY cr_num, name;
```

**Warforged / construct options:**
```sql
SELECT name, cr, ac, hp, source, trait_names
FROM monsters
WHERE type = 'construct' OR subtype LIKE '%warforged%'
ORDER BY cr_num;
```

**Undead for the Mournland:**
```sql
SELECT name, cr, type, subtype, ac, hp, legendary
FROM monsters
WHERE type = 'undead'
  AND cr_num BETWEEN 3 AND 10
ORDER BY cr_num;
```

**Legendary or mythic creatures for a boss encounter:**
```sql
SELECT name, cr, type, ac, hp, lair, source
FROM monsters
WHERE (legendary = 1 OR mythic = 1)
  AND cr_num BETWEEN 8 AND 15
ORDER BY cr_num;
```

**Spellcasting monsters for a rival mage scene:**
```sql
SELECT name, cr, type, int, spellcasting, source
FROM monsters
WHERE spellcasting = 1
  AND cr_num BETWEEN 3 AND 8
ORDER BY cr_num;
```

## Output Format

1. Present SQL results as a compact table (name, CR, type, AC, HP, notable traits)
2. For each monster the DM wants to use, read and summarize the statblock
3. Note any Eberron-source monsters that add setting flavor
4. For encounter design, consider action economy — suggest groupings (1 boss + 3 minions, etc.)
