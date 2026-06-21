---
name: dnd-dm-tools
description: >
  Look up DM toolbox content — traps, poisons, curses, and fear/mental stress rules —
  using SRD reference files. Use this skill when a DM needs to place a trap in a
  dungeon, give a villain a poison to use, apply a curse effect, or run optional
  fear/stress mechanics. Invoke for: "what are the stats for a hidden pit trap",
  "what poison could an assassin NPC use", "how does injury poison work", "what's
  the DC for a trap at this level", "how do curse effects work", "what's the fear
  save rule", designing a trapped room, selecting a poison for an encounter, or
  building a trap from scratch using the Building a Trap table. Not for general
  hazard rules like falling or suffocation (dnd-rules), or magic item poison effects
  (dnd-items).
---

# DM Toolbox Reference

Always read the relevant file — don't guess trap DCs or poison effects from memory.

## Setup

If `$DM_SKILLS_DIR` is unset (`echo $DM_SKILLS_DIR` is blank), derive it 4 levels up
from the "Base directory for this skill" path shown at the top of context:
```sh
export DM_SKILLS_DIR=$(cd "<base-dir-from-above>/../../../.." && pwd)
```

## Content Map

All paths resolve from `$DM_SKILLS_DIR/reference/srd/gameplay-toolbox/`

### Traps — `traps.md`
Contains:
- **Parts of a Trap** — severity (nuisance/deadly), trigger, duration
- **Building a Trap table** — attack bonus, save DC, and damage by level tier (1–4, 5–10, 11–16, 17–20) for nuisance and deadly traps
- **8 example traps** (alphabetical): Collapsing Roof, Falling Net, Fire-Casting Statue, Hidden Pit, Poisoned Darts, Poisoned Needle, Rolling Stone, Spiked Pit — each with trigger, effect, and save/damage stats

Read this for: any specific trap lookup, building a custom trap, or understanding trap severity.

### Poison — `poison.md`
Contains:
- **4 delivery types**: Contact, Ingested, Inhaled, Injury — with how each works
- **Purchasing and harvesting** rules (DC 20 Int check with Poisoner's Kit)
- **Sample poisons table**: names, types, prices, and effects with save DCs

Read this for: selecting a poison for an NPC, understanding how a poison delivery method works, or knowing save DCs and damage.

### Curses & Magical Contagions — `curses-and-magical-contagions.md`
Contains rules for:
- How curses work (removal methods, Bestow Curse)
- Magical contagions (how they spread and are cured)
- Example contagions with infection DCs and effects

### Fear & Mental Stress — `fear-and-mental-stress.md`
Optional rules for:
- Fear saves and the Frightened condition in specific contexts
- Mental stress checks and their effects
- Recovery from stress effects

## Workflow

**Placing a trap** → read `traps.md`; use the Building a Trap table to calibrate to
party level, then pick or adapt one of the 8 examples.

**Selecting a poison** → read `poison.md`; choose delivery type based on how the
NPC can administer it, then pick from the sample poisons table by effect or price.

**Applying a curse** → read `curses-and-magical-contagions.md` for how curse
removal works and whether an example contagion fits the scene.

**Fear/stress mechanics** → read `fear-and-mental-stress.md`; these are optional
rules — confirm with context whether the DM is using them before applying.

## Output Format

1. Quote the relevant stat block, table row, or rule text directly
2. For traps: include trigger, save/attack info, damage, and duration
3. For poisons: include type, price, save DC, and effect
4. Note severity/level range for traps so the DM can calibrate to their party
