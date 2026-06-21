---
name: dnd-gear
description: >
  Look up mundane equipment stats using SRD reference files — weapons, armor, tools,
  ammunition, and spellcasting focuses. Use this skill when a DM needs weapon damage
  dice or properties for an NPC, armor AC and cost for a shop or encounter, weapon
  mastery property mechanics during combat, or tool proficiency descriptions. Invoke
  for: "what damage does a longsword do", "how much does plate armor cost", "what's
  the AC of chain mail", "which weapons have the Thrown property", "what does Topple
  mastery do", "what tools does a Thieves' Kit include", equipping NPCs or populating
  a shop inventory. Not for magic item properties (dnd-items), class weapon
  proficiencies (dnd-characters), or weapon attack rules (dnd-rules).
---

# Equipment Reference

Always read the relevant SRD file — the tables are small and a single read answers
most questions. Don't guess damage dice or costs from training data.

## Setup

If `$DM_SKILLS_DIR` is unset (`echo $DM_SKILLS_DIR` is blank), derive it 4 levels up
from the "Base directory for this skill" path shown at the top of context:
```sh
export DM_SKILLS_DIR=$(cd "<base-dir-from-above>/../../../.." && pwd)
```

## Content Map

All paths resolve from `$DM_SKILLS_DIR/reference/srd/equipment/`

### Weapons
`weapons.md` — two tables (Simple and Martial), each with:
Name | Cost | Damage | Weight | Properties | Mastery

Read this for any weapon stat lookup or "which weapons have property X" question.
The whole file is ~50 lines — read it in full rather than guessing.

### Armor
`armor.md` — four sections (Light, Medium, Heavy, Shields), each with:
Name | Cost | AC | Strength requirement | Stealth penalty | Weight

### Tools
`tools.md` — artisan tools, gaming sets, musical instruments, and other tool kits
with cost and weight. Includes descriptions of tool proficiency uses where available.

### Ammunition
`ammunition.md` — arrows, bolts, sling bullets, blowgun needles (cost and quantity).

### Spellcasting Focuses
`spellcasting-focuses.md` — arcane, druidic, and holy focuses with costs.

### Weapon Mastery Properties
`mastery/<property>.md` — individual files for each of the 8 mastery properties:

| Property | Effect summary |
|---|---|
| `cleave` | Extra attack against adjacent creature on hit (no ability mod to damage) |
| `graze` | Miss still deals ability-modifier damage of the weapon's type |
| `nick` | Light property's extra attack is part of Attack action, not Bonus Action |
| `push` | Push target up to 10 feet on hit (Large or smaller) |
| `sap` | Target has Disadvantage on its next attack roll on hit |
| `slow` | Reduce target Speed by 10 feet until your next turn on hit |
| `topple` | Target makes Con save (DC 8 + attack ability mod + PB) or falls Prone |
| `vex` | You have Advantage on your next attack roll against the target |

For the full text of a mastery property, read `mastery/<property>.md`.

## Workflow

**Single item lookup** → read `weapons.md` or `armor.md` in full (small tables).

**"Which weapons have property X?"** → read `weapons.md`; the Properties column
lists all properties for each weapon. Scan the table and list matching weapons.

**"What does [Mastery] do?"** → read `mastery/<property>.md`.

**Equipping an NPC** → read `weapons.md` for damage/properties, note the mastery
property, then read the mastery file if the DM needs those mechanics explained.

**If the item isn't in the SRD** (specific trade goods, mounts, vehicles, most
adventuring gear): note it's outside SRD 5.2.1 and answer from general 5e knowledge.

## Output Format

1. Quote the table row directly — include name, cost, damage/AC, weight, properties
2. For mastery properties, quote the full mechanical text from the file
3. Keep it compact — weapon stats are most useful as a quick reference
