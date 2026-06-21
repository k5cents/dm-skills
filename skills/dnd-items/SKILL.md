---
name: dnd-items
description: >
  Query the items database to find magic items for treasure, NPC gear, shop inventory,
  or player rewards. Use this skill whenever a task involves magic item selection —
  building a loot table, equipping an NPC, populating a Sharn shop, deciding what
  a villain carries, or answering "what Eberron-flavored items could work here?"
  Invoke it for both specific lookups ("is there a Cannith item that does X?") and
  browsing queries ("uncommon wondrous items that don't require attunement").
---

# Item Lookup

Query `$DM_SKILLS_DIR/databases/items.db` via SQLite.
See `$DM_SKILLS_DIR/databases/items-README.md` for the full schema.

## Schema (key columns)

```
name, slug, source, page,
type        -- "Wondrous Item" | "Melee Weapon" | "Potion" | "Ring" | "Wand" | "Rod" | "Scroll" | ...
type_code   -- "WD" | "RG" | "P" | "SCF" | "M" | "R" | "G" | "AT" | ...
rarity      -- "none" | "common" | "uncommon" | "rare" | "very rare" | "legendary" | "artifact" | "varies"
tier        -- "minor" | "major" | NULL
attunement  -- 0/1
attunement_req  -- "by a wizard" | "by a spellcaster" | NULL
wondrous    -- 0/1
weight, value_gp,
has_spells  -- 0/1 (item can cast attached spells)
```

**Eberron sources:** `ERLW`, `EFA`, `ExploringEberron24`, `FoEQuickstone`
For 5.5e campaigns, prefer `XDMG` over `DMG` (2024 supersedes 2014).

## Workflow

**Finding items** — SQL filter query:
```sh
python3 $DM_SKILLS_DIR/scripts/query.py items.db "SELECT ..."
```

**Reading an item's full description** — render to markdown:
```sh
# Clean prose (default) — for loot tables, shop descriptions, player-facing handouts
node --experimental-sqlite $DM_SKILLS_DIR/scripts/render-entry.mjs --item "Sending Stones"
node --experimental-sqlite $DM_SKILLS_DIR/scripts/render-entry.mjs --item "Blast Disk (Common)" --source ExploringEberron24

# Tagged mode — for rules adjudication, when item text references spells/conditions
node --experimental-sqlite $DM_SKILLS_DIR/scripts/render-entry.mjs --item "Staff of Power" --tags
```

`--tags` preserves `{@spell}`, `{@condition}`, `{@action}`, `{@scaledamage}` and similar
cross-reference tags in the output. Useful when an item's description references specific
spells it can cast or conditions it inflicts — signals the DM or a rules skill to follow up.

Prefers XDMG over DMG (2024 over 2014) unless `--source` is specified.

Use SQL to browse and filter, then render specific items for full description text.

## Rarity ORDER BY helper

Use this CASE expression whenever sorting by rarity matters:
```sql
ORDER BY CASE rarity
  WHEN 'common'    THEN 1 WHEN 'uncommon'  THEN 2 WHEN 'rare'      THEN 3
  WHEN 'very rare' THEN 4 WHEN 'legendary' THEN 5 WHEN 'artifact'  THEN 6
  ELSE 7 END
```

## Common Query Patterns

**Eberron-flavored loot table by rarity:**
```sql
SELECT name, source, rarity, type, attunement
FROM items
WHERE source IN ('ERLW', 'EFA', 'ExploringEberron24', 'FoEQuickstone')
  AND rarity NOT IN ('none', 'unknown', '')
ORDER BY CASE rarity
  WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3
  WHEN 'very rare' THEN 4 WHEN 'legendary' THEN 5 ELSE 6 END, name;
```

**Session reward: uncommon items, no attunement (easy to hand out):**
```sql
SELECT name, source, type, has_spells
FROM items
WHERE rarity = 'uncommon' AND attunement = 0
  AND source IN ('XDMG', 'ERLW', 'ExploringEberron24')
ORDER BY type, name;
```

**NPC equipment: rare+ items with attunement for a major villain:**
```sql
SELECT name, source, rarity, type, attunement_req
FROM items
WHERE rarity IN ('rare', 'very rare', 'legendary')
  AND attunement = 1
  AND source IN ('XDMG', 'ERLW', 'EFA', 'ExploringEberron24')
ORDER BY CASE rarity
  WHEN 'rare' THEN 1 WHEN 'very rare' THEN 2 WHEN 'legendary' THEN 3 END, name;
```

**Shop stock: potions by rarity and price:**
```sql
SELECT name, source, rarity, value_gp
FROM items
WHERE type = 'Potion' AND source IN ('XDMG', 'DMG')
ORDER BY CASE rarity
  WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3
  WHEN 'very rare' THEN 4 ELSE 5 END, name;
```

**Find a specific item by keyword:**
```sql
SELECT name, source, rarity, type, attunement, attunement_req
FROM items
WHERE name LIKE '%sending%' OR name LIKE '%docent%' OR name LIKE '%cannith%'
ORDER BY rarity, name;
```

## Output Format

Present results as a compact markdown table. Group by rarity when building loot tables.
For Eberron-native items, note any flavor that ties them to specific Houses, districts,
or campaign themes. When an item is from multiple sources (reprinted), note the 5.5e
version (XDMG) over the 2014 version (DMG).
