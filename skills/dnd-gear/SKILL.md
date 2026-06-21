---
name: dnd-gear
description: >
  Look up mundane equipment stats using the items database and SRD reference files —
  weapons, armor, tools, ammunition, and spellcasting focuses. Use this skill when a
  DM needs weapon damage dice or properties for an NPC, armor AC and cost for a shop
  or encounter, weapon mastery property mechanics during combat, or tool proficiency
  descriptions. Invoke for: "what damage does a longsword do", "how much does plate
  armor cost", "what's the AC of chain mail", "which weapons have the Thrown property",
  "what does Topple mastery do", "what tools does a Thieves' Kit include", equipping
  NPCs or populating a shop inventory. Not for magic item properties (dnd-items),
  class weapon proficiencies (dnd-characters), or weapon attack rules (dnd-rules).
---

# Equipment Reference

Query `$DM_SKILLS_DIR/databases/items.db` for stats, then read the relevant
`equipment/` file for context or mastery property mechanics.

## Setup

If `$DM_SKILLS_DIR` is unset (`echo $DM_SKILLS_DIR` is blank), derive it 4 levels up
from the "Base directory for this skill" path shown at the top of context:
```sh
export DM_SKILLS_DIR=$(cd "<base-dir-from-above>/../../../.." && pwd)
```

```sh
python3 $DM_SKILLS_DIR/scripts/query.py items.db "SELECT ..."
```

## Schema (key columns)

```
name, slug, source, type, type_code, value_gp, weight, srd,
-- Weapons (null for non-weapons):
dmg1, dmg2, dmg_type,       -- e.g. "1d8", "1d10", "S"
properties,                  -- pipe-separated: "Finesse|Light|Thrown"
mastery,                     -- e.g. "Nick"
range_normal, range_long,    -- feet, e.g. 20, 60
weapon_category,             -- "Simple" or "Martial"
-- Armor (null for non-armor):
ac_base, str_req, stealth_disadv
```

`dmg_type` values: `B` (Bludgeoning), `P` (Piercing), `S` (Slashing)

Filter to SRD-only base equipment: `srd = 1 AND rarity = 'none'`

## Common Queries

**Specific weapon lookup:**
```sql
SELECT name, dmg1, dmg2, dmg_type, properties, mastery, range_normal, range_long, value_gp, weight
FROM items WHERE name = 'Longsword' AND srd = 1;
```

**All Thrown weapons (SRD):**
```sql
SELECT name, dmg1, dmg_type, range_normal, range_long, mastery, value_gp
FROM items WHERE properties LIKE '%Thrown%' AND srd = 1 AND rarity = 'none'
ORDER BY weapon_category, name;
```

**Martial weapons with Reach:**
```sql
SELECT name, dmg1, dmg_type, mastery, value_gp
FROM items WHERE weapon_category = 'Martial' AND properties LIKE '%Reach%'
  AND srd = 1 AND rarity = 'none'
ORDER BY name;
```

**All armor, cheapest first:**
```sql
SELECT name, type, ac_base, str_req, stealth_disadv, value_gp
FROM items WHERE type_code IN ('LA','MA','HA','S') AND srd = 1 AND rarity = 'none'
ORDER BY value_gp;
```

**Medium armor without stealth penalty:**
```sql
SELECT name, ac_base, value_gp, weight
FROM items WHERE type_code = 'MA' AND srd = 1 AND rarity = 'none'
  AND (stealth_disadv IS NULL OR stealth_disadv = 0)
ORDER BY ac_base DESC;
```

## After the Query

**Mastery property mechanics** — read the individual file:
`$DM_SKILLS_DIR/reference/srd/equipment/mastery/<mastery-lowercase>.md`
e.g. `mastery/topple.md`, `mastery/nick.md`

**Tool descriptions and uses** — read `equipment/tools.md`

**Armor/weapon context** (e.g. what "Versatile" means) — read `equipment/weapons.md`
or `equipment/armor.md`; both are small (~50 lines) and have property definitions.

## Output Format

1. Present weapon results as a table: name, damage, type, properties, mastery, cost
2. Present armor results as a table: name, AC, strength req, stealth, cost
3. For mastery mechanics, quote the full text from the mastery file
4. Filter results to `srd = 1` unless the DM asks for non-SRD options
