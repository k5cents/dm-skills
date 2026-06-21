---
name: dnd-characters
description: >
  Look up 5e character creation content using SRD reference files. Invoke for:
  class features at a given level, what a background or species gives, how a feat
  works, what an Eldritch Invocation or Metamagic option does, how multiclassing
  works, what the XP table looks like, point buy or standard array rules, starting
  equipment, or building an NPC with class levels. Covers Chapter 2 (Creating a
  Character) and all 12 SRD classes, 4 backgrounds, 9 species, and 17 feats.
  Not for spell descriptions (dnd-spells), item properties (dnd-items),
  monster stats (dnd-monsters), or general combat/rules (dnd-rules).
---

# Character Creation Reference

Always read the relevant SRD file before answering — don't rely on training data alone.

## Setup

If `$DM_SKILLS_DIR` is unset (`echo $DM_SKILLS_DIR` is blank), derive it 4 levels up
from the "Base directory for this skill" path shown at the top of context:
```sh
export DM_SKILLS_DIR=$(cd "<base-dir-from-above>/../../../.." && pwd)
```

## Content Map

All paths resolve from: `$DM_SKILLS_DIR/reference/srd/`

### Classes
`classes/<class>.md`

| File | Primary Ability |
|---|---|
| `barbarian.md` | Str |
| `bard.md` | Cha |
| `cleric.md` | Wis |
| `druid.md` | Wis |
| `fighter.md` | Str or Dex |
| `monk.md` | Str or Dex |
| `paladin.md` | Str or Cha |
| `ranger.md` | Dex or Wis |
| `rogue.md` | Dex |
| `sorcerer.md` | Cha |
| `warlock.md` | Cha |
| `wizard.md` | Int |

Each file contains: class table (all levels 1–20), starting equipment, multiclassing
entry proficiencies, and the full text of every class feature.

### Backgrounds
`origins/backgrounds/<name>.md`
Files: `acolyte`, `criminal`, `sage`, `soldier`

Structure overview (ability score grants, feat, skills, tool, equipment):
`origins/README.md`

### Species
`origins/species/<name>.md`
Files: `dragonborn`, `dwarf`, `elf`, `gnome`, `goliath`, `halfling`, `human`, `orc`, `tiefling`

### Feats
`feats/<feat-slug>.md`

Origin feats (granted by backgrounds): `alert`, `magic-initiate`, `savage-attacker`, `skilled`
Fighting Style feats: `archery`, `defense`, `great-weapon-fighting`, `two-weapon-fighting`
General feats: `ability-score-improvement`, `grappler`
Epic Boons (level 19+): `boon-of-combat-prowess`, `boon-of-dimensional-travel`,
  `boon-of-fate`, `boon-of-irresistible-offense`, `boon-of-spell-recall`,
  `boon-of-the-night-spirit`, `boon-of-truesight`

### Eldritch Invocations (Warlock)
`classes/optional-features/<invocation-slug>.md`

`agonizing-blast`, `armor-of-shadows`, `ascendant-step`, `devils-sight`,
`eldritch-spear`, `fiendish-vigor`, `gaze-of-two-minds`, `lifedrinker`,
`mask-of-many-faces`, `master-of-myriad-forms`, `misty-visions`, `one-with-shadows`,
`otherworldly-leap`, `pact-of-the-blade`, `pact-of-the-chain`, `pact-of-the-tome`,
`repelling-blast`, `thirsting-blade`, `visions-of-distant-realms`,
`whispers-of-the-grave`, `witch-sight`

Each file includes type, class, prerequisites, and full text.

### Metamagic (Sorcerer)
`classes/optional-features/<metamagic-slug>.md`

`careful-spell`, `distant-spell`, `empowered-spell`, `extended-spell`,
`heightened-spell`, `quickened-spell`, `subtle-spell`, `twinned-spell`

### Character Creation Process
Step-by-step guide (choose class → origin → ability scores → alignment → fill details):
`character-creation/create-your-character.md`

Contains: standard array, point buy costs table, languages, starting HP by class,
alignment descriptions, ability score tables, trinkets.

Level advancement and tiers of play: `character-creation/level-advancement.md`
Multiclassing rules (prerequisites, proficiencies, spell slots): `character-creation/multiclassing.md`
Starting at higher levels: `character-creation/starting-at-higher-levels.md`

## Workflow

**Named class feature or invocation?** → read the class or optional-feature file directly.

**"What does X class get at level N?"** → read `classes/<class>.md`; the class table
is near the top; features are in order of level below it.

**"What does Background/Species/Feat X give?"** → read the relevant file from the
map above.

**"How does [creation step] work?"** → read `character-creation/create-your-character.md`;
use the headings (Step 1–5) to find the relevant section.

**Building an NPC?** → read their class file for features, their species for traits,
then consult dnd-spells or dnd-items for spell lists or gear as needed.

## Output Format

1. Quote the relevant table or feature text directly — accuracy matters more than brevity
2. For class features: include level, name, and mechanical effect
3. For feats: include prerequisites (if any) and full benefit
4. Note the source file so the DM can verify or read further
